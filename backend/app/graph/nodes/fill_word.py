"""fill_word 节点：OOXML 直写打分表 + 产物版本化（artifact_versions）。"""
from __future__ import annotations

import uuid

from sqlalchemy import func, select

from app.core.db import get_session_local
from app.graph.nodes.common import now_str
from app.graph.state import ReviewState
from app.models.tables import ArtifactVersion, ReviewResult, ReviewTask
from app.services.word_fill import build_score_sheet


def _next_version(db, task_id: str, file_type: str) -> int:
    current = db.execute(
        select(func.max(ArtifactVersion.version)).where(
            ArtifactVersion.task_id == task_id,
            ArtifactVersion.file_type == file_type,
        )
    ).scalar()
    return (current or 0) + 1


def fill_word_node(state: ReviewState) -> dict:
    task_id = state["task_id"]
    source = state.get("edit_source", "ai_draft")

    SessionLocal = get_session_local()
    word_files: list[str] = []
    with SessionLocal() as db:
        task = db.get(ReviewTask, task_id)
        project_name = (task.project_name if task else None) or task_id

        for template in state.get("templates", []):
            stage = template["stage"]
            result = db.get(ReviewResult, f"{task_id}:{stage}")
            content = result.content if result else ""
            if not content:
                continue
            opinions = state.get("dimension_opinions", {}).get(stage, {})
            file_type = f"word_{stage}"
            version = _next_version(db, task_id, file_type)
            path = build_score_sheet(
                task_id=task_id,
                project_name=project_name,
                stage=stage,
                template=template,
                opinions=opinions,
                version=version,
            )
            db.add(
                ArtifactVersion(
                    id=uuid.uuid4().hex,
                    task_id=task_id,
                    file_type=file_type,
                    version=version,
                    file_path=str(path),
                    source=source,
                    created_at=now_str(),
                )
            )
            word_files.append(str(path))

        # 同步留档 markdown 版意见全文
        md_parts = [
            c for c in (state.get("draft_summary"), state.get("draft_proposal")) if c
        ]
        if md_parts:
            version = _next_version(db, task_id, "md")
            from app.settings import get_settings

            md_dir = get_settings().artifacts_dir_path / task_id
            md_dir.mkdir(parents=True, exist_ok=True)
            md_path = md_dir / f"review_opinion_v{version}.md"
            md_path.write_text("\n\n---\n\n".join(md_parts), encoding="utf-8")
            db.add(
                ArtifactVersion(
                    id=uuid.uuid4().hex,
                    task_id=task_id,
                    file_type="md",
                    version=version,
                    file_path=str(md_path),
                    source=source,
                    created_at=now_str(),
                )
            )
            word_files.append(str(md_path))

        db.commit()

    return {"word_files": word_files}
