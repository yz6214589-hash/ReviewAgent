"""范文检索（F12）：规则过滤优先（年度+类别），bge-m3 向量检索阶段一仅占位。"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config_loader import get_config_loader
from app.models.tables import FewshotSample


def rule_filter_samples(
    db: Session, classification: dict[str, Any]
) -> list[dict[str, Any]]:
    """按年度范围 + 类别/阶段/子领域过滤范文。

    - k / min_projects 来自 retrieval.yaml；年度范围来自 classification_rules.yaml。
    - 任务年度超出配置年度范围时直接返回空（视为无关联范文）。
    - 命中不同项目数不足 min_projects 时返回空，不阻塞生成。
    """
    rules = get_config_loader().load("classification_rules")
    retrieval_cfg = get_config_loader().load("retrieval")
    year_min, year_max = rules.get("recognition", {}).get("year_range", [2024, 2029])
    k = int(retrieval_cfg.get("fewshot", {}).get("k", 6))
    min_projects = int(retrieval_cfg.get("fewshot", {}).get("min_projects", 2))

    year = classification.get("year")
    if year is not None and not (year_min <= int(year) <= year_max):
        return []

    stmt = select(FewshotSample).where(FewshotSample.is_active.is_(True))
    project_type = classification.get("project_type")
    if project_type and project_type != "未识别":
        stmt = stmt.where(FewshotSample.project_type == project_type)
    stage = classification.get("stage")
    if stage and stage != "combined":
        stmt = stmt.where(FewshotSample.stage == stage)

    rows = list(db.execute(stmt).scalars().all())

    # 子领域优先排序（同子领域范文关联性更高）
    sub_domain = classification.get("sub_domain")
    if sub_domain:
        rows.sort(key=lambda r: 0 if r.sub_domain == sub_domain else 1)

    samples = [
        {
            "id": r.id,
            "project_name": r.project_name,
            "project_type": r.project_type,
            "stage": r.stage,
            "sub_domain": r.sub_domain,
            "content": r.content,
        }
        for r in rows[:k]
    ]
    distinct_projects = {s["project_name"] for s in samples}
    if len(distinct_projects) < min_projects:
        return []
    return samples


def embed_texts(texts: list[str], model: str | None = None) -> list[list[float]]:
    """bge-m3 向量化占位接口（阶段一不接真实向量库，仅定义签名）。"""
    raise NotImplementedError("bge-m3 向量检索为阶段二能力，当前仅占位")


def vector_search(task_id: str, top_k: int | None = None) -> list[dict[str, Any]]:
    """sqlite-vec 向量检索占位接口（阶段一不接真实向量库，仅定义签名）。"""
    raise NotImplementedError("sqlite-vec 向量检索为阶段二能力，当前仅占位")
