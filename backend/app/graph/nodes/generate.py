"""generate 节点：按模板维度流式生成评审意见草稿，经 stream writer 推送 SSE 事件。"""
from __future__ import annotations

from langgraph.config import get_stream_writer

from app.core.db import get_session_local
from app.graph.nodes.common import now_str, update_task
from app.graph.state import ReviewState
from app.models.tables import ReviewResult, ReviewTask
from app.services.llm import stream_dimension_opinion


def _score_range(weight: int) -> str:
    return f"{int(weight * 0.75)}~{weight}"


async def generate_node(state: ReviewState) -> dict:
    writer = get_stream_writer()
    task_id = state["task_id"]
    update_task(task_id, status="generating", current_step=3)

    SessionLocal = get_session_local()
    with SessionLocal() as db:
        task = db.get(ReviewTask, task_id)
        project_name = task.project_name if task else task_id

    context = state.get("parsed_text", "")
    fewshot_texts = [s.get("content", "") for s in state.get("fewshot", [])]

    drafts: dict[str, str] = {}
    dimension_opinions: dict[str, dict[str, str]] = {}
    template_ids: dict[str, str] = {}

    for template in state.get("templates", []):
        stage = template["stage"]
        template_ids[stage] = template["id"]
        opinions: dict[str, str] = {}
        blocks: list[str] = []
        for dim in template["dimensions"]:
            writer({"type": "progress", "step": dim["name"], "status": "running"})
            buf: list[str] = []
            async for chunk in stream_dimension_opinion(
                project_name=project_name or "",
                stage=stage,
                dimension=dim,
                context_text=context,
                fewshot_texts=fewshot_texts,
            ):
                buf.append(chunk)
                writer({"type": "chunk", "step": dim["name"], "text": chunk})
            opinion = "".join(buf)
            opinions[dim["name"]] = opinion
            score = _score_range(dim["weight"])
            writer(
                {
                    "type": "progress",
                    "step": dim["name"],
                    "status": "done",
                    "score": score,
                }
            )
            blocks.append(f"## {dim['name']}（权重 {dim['weight']}，建议 {score}）\n{opinion}")
        dimension_opinions[stage] = opinions
        drafts[stage] = (
            f"# {project_name} · {template['name']} 评审意见草稿\n\n" + "\n\n".join(blocks)
        )

    # 草稿落库 review_results
    with SessionLocal() as db:
        for stage, content in drafts.items():
            total_weight = sum(
                d["weight"] for t in state["templates"] if t["stage"] == stage for d in t["dimensions"]
            )
            row = db.get(ReviewResult, f"{task_id}:{stage}") or ReviewResult(
                id=f"{task_id}:{stage}", task_id=task_id, created_at=now_str()
            )
            row.stage = stage
            row.template_id = template_ids.get(stage)
            row.content = content
            row.total_score_range = f"0~{total_weight}"
            db.merge(row)
        db.commit()

    update_task(task_id, status="reviewing", current_step=4)
    return {
        "draft_summary": drafts.get("summary", ""),
        "draft_proposal": drafts.get("proposal", ""),
        "dimension_opinions": dimension_opinions,
    }
