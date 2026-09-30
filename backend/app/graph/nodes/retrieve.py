"""retrieve_fewshot 节点：规则过滤范文；无命中返回空不阻塞。"""
from __future__ import annotations

from app.core.db import get_session_local
from app.graph.state import ReviewState
from app.services.retrieval import rule_filter_samples


def retrieve_fewshot_node(state: ReviewState) -> dict:
    SessionLocal = get_session_local()
    with SessionLocal() as db:
        samples = rule_filter_samples(db, state["classification"])
    return {"fewshot": samples}
