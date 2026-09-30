"""节点公共工具：任务状态落库。"""
from __future__ import annotations

from datetime import datetime

from app.core.db import get_session_local
from app.models.tables import ReviewTask


def now_str() -> str:
    return datetime.now().isoformat(timespec="seconds")


def update_task(task_id: str, **fields) -> None:
    SessionLocal = get_session_local()
    with SessionLocal() as db:
        task = db.get(ReviewTask, task_id)
        if task is not None:
            for k, v in fields.items():
                setattr(task, k, v)
            task.updated_at = now_str()
            db.commit()
