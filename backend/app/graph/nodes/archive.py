"""archive 节点：结构化归档，任务置为完成。"""
from __future__ import annotations

from app.graph.nodes.common import update_task
from app.graph.state import ReviewState


def archive_node(state: ReviewState) -> dict:
    update_task(state["task_id"], status="done", current_step=4)
    return {"error": None}
