"""match_template 节点：按确认后的类别匹配打分模板（BR-1，支持任务级覆盖）。"""
from __future__ import annotations

from app.graph.state import ReviewState
from app.services.templates import match_templates


def match_template_node(state: ReviewState) -> dict:
    templates = match_templates(
        state["classification"], override_ids=state.get("template_override")
    )
    return {"templates": templates}
