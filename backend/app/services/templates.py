"""模板匹配（F4/BR-1）：模板维度/权重全部来自 scoring_templates.yaml。"""
from __future__ import annotations

from typing import Any

from app.core.config_loader import get_config_loader


def load_templates(cfg: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    if cfg is None:
        cfg = get_config_loader().load("scoring_templates")
    return list(cfg.get("templates", []))


def match_templates(
    classification: dict[str, Any],
    override_ids: list[str] | None = None,
    cfg: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """按类别（是否应用基础）+ 阶段匹配模板；组合评审返回两套；支持任务级覆盖。"""
    templates = load_templates(cfg)

    if override_ids:
        by_id = {t["id"]: t for t in templates}
        return [by_id[i] for i in override_ids if i in by_id]

    category = (
        "applied_basic" if classification.get("is_applied_basic") else "non_applied_basic"
    )
    stage = classification.get("stage") or "summary"
    stages = ["summary", "proposal"] if stage == "combined" else [stage]

    matched = [
        t for t in templates if t.get("category") == category and t.get("stage") in stages
    ]
    return matched
