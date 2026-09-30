"""classify 节点：关键词引擎识别并落库 classifications。"""
from __future__ import annotations

import json

from app.core.db import get_session_local
from app.graph.nodes.common import now_str, update_task
from app.graph.state import ReviewState
from app.models.tables import Classification
from app.services.classifier import classify_text


def classify_node(state: ReviewState) -> dict:
    classification = classify_text(state.get("parsed_text", ""))

    SessionLocal = get_session_local()
    with SessionLocal() as db:
        row = db.get(Classification, state["task_id"]) or Classification(
            task_id=state["task_id"]
        )
        row.project_type = classification["project_type"]
        row.stage = classification["stage"]
        row.sub_domain = classification["sub_domain"]
        row.year = classification["year"]
        row.is_applied_basic = classification["is_applied_basic"]
        row.is_combined = classification["is_combined"]
        row.confidence = json.dumps(classification["confidence"], ensure_ascii=False)
        row.confirmed = False
        db.merge(row)
        db.commit()

    update_task(state["task_id"], status="classified", current_step=2)
    return {"classification": classification}
