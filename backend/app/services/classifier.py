"""申报类别识别（F2/BR-2/BR-3）：关键词引擎，规则全部来自 classification_rules.yaml。"""
from __future__ import annotations

import re
from typing import Any

from app.core.config_loader import get_config_loader

_YEAR_RE = re.compile(r"(20\d{2})")


def _hits(text: str, keywords: list[str]) -> list[str]:
    return [kw for kw in keywords if kw and kw in text]


def _best(scores: dict[str, int], default: str) -> str:
    if not scores or max(scores.values()) == 0:
        return default
    return max(scores.items(), key=lambda kv: kv[1])[0]


def _confidence(scores: dict[str, int]) -> float:
    total = sum(scores.values())
    if total == 0:
        return 0.0
    return round(max(scores.values()) / total, 4)


def classify_text(text: str, rules: dict[str, Any] | None = None) -> dict[str, Any]:
    """输出类别+置信度+命中词；阈值/关键词/年度范围均读 YAML。"""
    if rules is None:
        rules = get_config_loader().load("classification_rules")

    recog = rules.get("recognition", {})
    truncate = int(recog.get("text_truncate", 8000))
    year_min, year_max = recog.get("year_range", [2024, 2029])
    combined_min = int(recog.get("combined_min_hits", 2))
    text = (text or "")[:truncate]

    type_hit_map = {
        t: _hits(text, kws) for t, kws in rules.get("type_keywords", {}).items()
    }
    type_scores = {t: len(h) for t, h in type_hit_map.items()}
    project_type = _best(type_scores, "未识别")

    stage_hit_map = {
        s: _hits(text, kws) for s, kws in rules.get("stage_keywords", {}).items()
    }
    stage_scores = {s: len(h) for s, h in stage_hit_map.items()}
    # BR-3 多标签组合判定：summary/proposal 双标签均达到阈值 → combined
    is_combined = (
        stage_scores.get("summary", 0) >= combined_min
        and stage_scores.get("proposal", 0) >= combined_min
    )
    if is_combined:
        stage = "combined"
    else:
        stage = _best(stage_scores, "summary")

    domain_hit_map = {
        d: _hits(text, kws) for d, kws in rules.get("sub_domain_keywords", {}).items()
    }
    domain_scores = {d: len(h) for d, h in domain_hit_map.items()}
    sub_domain = _best(domain_scores, "综合")

    years = [int(y) for y in _YEAR_RE.findall(text) if year_min <= int(y) <= year_max]
    year = max(years) if years else None

    applied_hits = _hits(text, rules.get("applied_basic_keywords", []))
    is_applied_basic = len(applied_hits) > 0

    confidence = {
        "type": _confidence(type_scores),
        "stage": _confidence(stage_scores),
        "sub_domain": _confidence(domain_scores),
    }
    return {
        "project_type": project_type,
        "stage": stage,
        "sub_domain": sub_domain,
        "year": year,
        "is_applied_basic": is_applied_basic,
        "is_combined": is_combined,
        "confidence": confidence,
        "matched_keywords": {
            "type": type_hit_map.get(project_type, []),
            "stage": stage_hit_map,
            "sub_domain": domain_hit_map.get(sub_domain, []),
            "applied_basic": applied_hits,
        },
        "text_length_used": len(text),
    }
