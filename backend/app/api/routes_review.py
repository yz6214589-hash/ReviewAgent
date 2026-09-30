"""评审主链路：classify / confirm(resume①) / stream(SSE) / finalize(resume②) / artifacts。"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from langgraph.types import Command
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.graph.builder import get_graph
from app.models.tables import ArtifactVersion, ReviewResult, ReviewTask
from app.schemas.api import ConfirmRequest, FinalizeRequest
from app.settings import get_settings

router = APIRouter(prefix="/api", tags=["review"])


def _config(task_id: str) -> dict:
    return {"configurable": {"thread_id": task_id}}  # thread_id = task_id


def _task_or_404(db: Session, task_id: str) -> ReviewTask:
    task = db.get(ReviewTask, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"任务不存在: {task_id}")
    return task


def _list_task_files(task_id: str) -> list[dict]:
    task_dir = get_settings().upload_dir_path / task_id
    files = []
    for p in sorted(task_dir.glob("*")):
        if p.is_file():
            files.append(
                {
                    "name": p.name,
                    "path": str(p),
                    "type": p.suffix.lower().lstrip("."),
                    "size": p.stat().st_size,
                }
            )
    return files


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post("/review/{task_id}/classify")
async def classify(task_id: str, db: Session = Depends(get_db)):
    """触发识别：跑 parse → classify → 停在 interrupt①（幂等：已识别则直接返回）。"""
    _task_or_404(db, task_id)
    graph = await get_graph()
    config = _config(task_id)

    snapshot = await graph.aget_state(config)
    if snapshot.values.get("classification"):
        return {"task_id": task_id, "classification": snapshot.values["classification"],
                "interrupted": True, "already": True}

    files = _list_task_files(task_id)
    if not files:
        raise HTTPException(status_code=400, detail="任务无上传文件")

    result = await graph.ainvoke(
        {"task_id": task_id, "files": files, "confirmed": False,
         "confirmed_final": False, "error": None},
        config,
    )
    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])
    interrupted = bool(result.get("__interrupt__"))
    return {"task_id": task_id, "classification": result.get("classification"),
            "interrupted": interrupted, "already": False}


@router.post("/review/{task_id}/confirm")
async def confirm(task_id: str, body: ConfirmRequest, db: Session = Depends(get_db)):
    """确认①：Command(resume) 恢复 interrupt①，执行模板匹配+范文检索，停在 generate 前。"""
    _task_or_404(db, task_id)
    graph = await get_graph()
    config = _config(task_id)

    snapshot = await graph.aget_state(config)
    if "confirm_classification" not in snapshot.next:
        raise HTTPException(
            status_code=409,
            detail=f"任务当前不在信息确认环节（next={list(snapshot.next)}）",
        )

    resume = {k: v for k, v in body.model_dump().items() if v is not None}
    result = await graph.ainvoke(Command(resume=resume), config)
    return {
        "task_id": task_id,
        "confirmed": result.get("confirmed", True),
        "classification": result.get("classification"),
        "templates": [
            {"id": t["id"], "name": t["name"], "stage": t["stage"],
             "dimensions": t["dimensions"]}
            for t in result.get("templates", [])
        ],
        "fewshot_count": len(result.get("fewshot", [])),
        "next": "generate",
    }


@router.get("/review/{task_id}/stream")
async def stream(task_id: str, db: Session = Depends(get_db)):
    """SSE 流式生成：progress/chunk/complete；草稿已存在时回放（断线重连）。"""
    _task_or_404(db, task_id)
    graph = await get_graph()
    config = _config(task_id)
    snapshot = await graph.aget_state(config)

    async def event_source():
        try:
            if "generate" in snapshot.next:
                # 从断点继续执行 generate，自定义事件经 stream writer 流出
                async for mode, payload in graph.astream(
                    None, config, stream_mode=["custom", "updates"]
                ):
                    if mode == "custom":
                        yield _sse(payload)
                final = await graph.aget_state(config)
                yield _sse(
                    {
                        "type": "complete",
                        "task_id": task_id,
                        "word_files": final.values.get("word_files", []),
                    }
                )
            elif "confirm_result" in snapshot.next:
                # 草稿已生成（如断线重连）：从库里回放 chunk
                rows = db.execute(
                    select(ReviewResult).where(ReviewResult.task_id == task_id)
                ).scalars().all()
                for row in rows:
                    for line in (row.content or "").splitlines(keepends=True):
                        yield _sse({"type": "chunk", "step": row.stage, "text": line})
                        await asyncio.sleep(0.005)
                yield _sse({"type": "complete", "task_id": task_id, "word_files": []})
            else:
                yield _sse(
                    {"type": "error",
                     "detail": f"任务当前不在生成环节（next={list(snapshot.next)}）"}
                )
        except Exception as exc:  # pragma: no cover
            yield _sse({"type": "error", "detail": str(exc)})

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/review/{task_id}/finalize")
async def finalize(task_id: str, body: FinalizeRequest, db: Session = Depends(get_db)):
    """确认②：Command(resume) 恢复 interrupt②，执行 fill_word → archive。"""
    _task_or_404(db, task_id)
    graph = await get_graph()
    config = _config(task_id)

    snapshot = await graph.aget_state(config)
    if "confirm_result" not in snapshot.next:
        raise HTTPException(
            status_code=409,
            detail=f"任务当前不在终稿确认环节（next={list(snapshot.next)}）",
        )

    resume = {k: v for k, v in body.model_dump().items() if v is not None}
    result = await graph.ainvoke(Command(resume=resume), config)
    return {
        "task_id": task_id,
        "confirmed_final": result.get("confirmed_final", True),
        "edit_source": result.get("edit_source", "ai_draft"),
        "word_files": result.get("word_files", []),
        "status": "done",
    }


@router.get("/review/{task_id}/artifacts")
async def list_artifacts(task_id: str, db: Session = Depends(get_db)):
    """产物列表（文件级版本线）。"""
    _task_or_404(db, task_id)
    rows = db.execute(
        select(ArtifactVersion)
        .where(ArtifactVersion.task_id == task_id)
        .order_by(ArtifactVersion.file_type, ArtifactVersion.version)
    ).scalars().all()
    return {
        "task_id": task_id,
        "artifacts": [
            {
                "file_id": r.id,
                "file_type": r.file_type,
                "version": r.version,
                "source": r.source,
                "file_name": Path(r.file_path).name,
                "created_at": r.created_at,
            }
            for r in rows
        ],
    }


@router.get("/review/{task_id}/artifacts/{file_id}/download")
async def download_artifact(task_id: str, file_id: str, db: Session = Depends(get_db)):
    """下载指定版本产物。"""
    row = db.get(ArtifactVersion, file_id)
    if row is None or row.task_id != task_id:
        raise HTTPException(status_code=404, detail="产物不存在")
    path = Path(row.file_path)
    if not path.exists():
        raise HTTPException(status_code=410, detail="产物文件已被移除")
    return FileResponse(str(path), filename=path.name)
