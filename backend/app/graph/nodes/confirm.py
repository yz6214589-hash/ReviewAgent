"""两道人工确认门（F3/F7）：interrupt① 信息确认、interrupt② 终稿确认。"""
from __future__ import annotations

import json

from langgraph.types import interrupt

from app.core.db import get_session_local
from app.graph.nodes.common import now_str
from app.graph.state import ReviewState
from app.models.tables import Classification, ReviewResult

_EDITABLE_FIELDS = ("project_type", "stage", "sub_domain", "year", "is_applied_basic")


def confirm_classification_node(state: ReviewState) -> dict:
    # interrupt①：把识别结果交给人工确认；Command(resume=...) 携带用户修改恢复
    payload = interrupt(
        {"kind": "classification_confirmation", "classification": state["classification"]}
    )
    resume = payload if isinstance(payload, dict) else {}

    classification = dict(state["classification"])
    for field in _EDITABLE_FIELDS:
        if resume.get(field) is not None:
            classification[field] = resume[field]
    classification["is_combined"] = classification.get("stage") == "combined"

    SessionLocal = get_session_local()
    with SessionLocal() as db:
        row = db.get(Classification, state["task_id"])
        if row is not None:
            row.project_type = classification["project_type"]
            row.stage = classification["stage"]
            row.sub_domain = classification["sub_domain"]
            row.year = classification["year"]
            row.is_applied_basic = classification["is_applied_basic"]
            row.is_combined = classification["is_combined"]
            row.confidence = json.dumps(
                classification.get("confidence", {}), ensure_ascii=False
            )
            row.confirmed = True
            row.corrected_by = resume.get("confirmed_by") or "expert"
            row.corrected_at = now_str()
            db.commit()

    return {
        "classification": classification,
        "confirmed": True,
        "template_override": resume.get("template_ids"),
    }


def confirm_result_node(state: ReviewState) -> dict:
    # interrupt②：草稿交人工确认；resume 可携带人工编辑后的最终文本
    payload = interrupt(
        {
            "kind": "result_confirmation",
            "draft_summary": state.get("draft_summary", ""),
            "draft_proposal": state.get("draft_proposal", ""),
        }
    )
    resume = payload if isinstance(payload, dict) else {}

    summary = resume.get("summary") or state.get("draft_summary", "")
    proposal = resume.get("proposal") or state.get("draft_proposal", "")
    edited = bool(resume.get("summary") or resume.get("proposal"))
    source = "manual_edit" if edited else "ai_draft"

    # 人工编辑覆盖落库
    if edited:
        SessionLocal = get_session_local()
        with SessionLocal() as db:
            for stage, content in (("summary", summary), ("proposal", proposal)):
                row = db.get(ReviewResult, f"{state['task_id']}:{stage}")
                if row is not None and content:
                    row.content = content
            db.commit()

    return {
        "draft_summary": summary,
        "draft_proposal": proposal,
        "confirmed_final": True,
        "edit_source": source,
    }
