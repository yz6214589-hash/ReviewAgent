"""F10 历史：任务列表（筛选/分页）与任务详情（断点恢复）。"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.graph.builder import get_graph
from app.models.tables import Classification, ReviewTask

router = APIRouter(prefix="/api", tags=["history"])


@router.get("/tasks")
def list_tasks(
    status: str | None = None,
    project_type: str | None = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    stmt = select(ReviewTask).order_by(ReviewTask.created_at.desc())
    count_stmt = select(func.count(ReviewTask.id))
    if status:
        stmt = stmt.where(ReviewTask.status == status)
        count_stmt = count_stmt.where(ReviewTask.status == status)
    if project_type:
        join_cond = Classification.task_id == ReviewTask.id
        stmt = stmt.join(Classification, join_cond).where(
            Classification.project_type == project_type
        )
        count_stmt = count_stmt.join(Classification, join_cond).where(
            Classification.project_type == project_type
        )

    total = db.execute(count_stmt).scalar() or 0
    rows = db.execute(stmt.offset((page - 1) * page_size).limit(page_size)).scalars().all()

    type_map = {
        r.task_id: r.project_type
        for r in db.execute(
            select(Classification).where(
                Classification.task_id.in_([t.id for t in rows]) if rows else "1=0"
            )
        ).scalars().all()
    }
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "task_id": t.id,
                "project_name": t.project_name,
                "status": t.status,
                "current_step": t.current_step,
                "project_type": type_map.get(t.id),
                "created_at": t.created_at,
                "updated_at": t.updated_at,
            }
            for t in rows
        ],
    }


@router.get("/tasks/{task_id}")
async def task_detail(task_id: str, db: Session = Depends(get_db)):
    """任务详情 + 图断点信息（前端据此恢复到对应步骤）。"""
    task = db.get(ReviewTask, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"任务不存在: {task_id}")

    classification = None
    row = db.get(Classification, task_id)
    if row is not None:
        classification = {
            "project_type": row.project_type,
            "stage": row.stage,
            "sub_domain": row.sub_domain,
            "year": row.year,
            "is_applied_basic": row.is_applied_basic,
            "is_combined": row.is_combined,
            "confidence": json.loads(row.confidence or "{}"),
            "confirmed": row.confirmed,
            "corrected_by": row.corrected_by,
            "corrected_at": row.corrected_at,
        }

    graph = await get_graph()
    snapshot = await graph.aget_state({"configurable": {"thread_id": task_id}})
    next_nodes = list(snapshot.next)

    # 断点 → 前端步骤映射：confirm_classification→信息确认, generate→AI处理中,
    # confirm_result→专家评审, 空→已完成
    if not next_nodes:
        resume_step = 4 if task.status == "done" else (task.current_step or 1)
    elif "confirm_classification" in next_nodes:
        resume_step = 2
    elif "generate" in next_nodes:
        resume_step = 3
    else:
        resume_step = 4

    return {
        "task_id": task.id,
        "project_name": task.project_name,
        "status": task.status,
        "current_step": task.current_step,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "classification": classification,
        "graph": {"next": next_nodes, "resume_step": resume_step},
    }
