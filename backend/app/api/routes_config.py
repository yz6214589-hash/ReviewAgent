"""F14 配置读写 + 留痕：模板/识别规则/范文库/变更历史。"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import log_config_change
from app.core.config_loader import get_config_loader
from app.core.db import get_db
from app.models.tables import ConfigHistory, FewshotSample
from app.schemas.api import FewshotCreateRequest, RulesPutRequest, TemplatesPutRequest

router = APIRouter(prefix="/api/config", tags=["config"])

_REQUIRED_DIM_KEYS = {"name", "weight"}


def _validate_templates(data: dict) -> None:
    templates = data.get("templates")
    if not isinstance(templates, list) or not templates:
        raise HTTPException(status_code=400, detail="templates 必须为非空列表")
    for t in templates:
        for key in ("id", "name", "category", "stage", "dimensions"):
            if key not in t:
                raise HTTPException(status_code=400, detail=f"模板缺少字段: {key}")
        if t["category"] not in ("applied_basic", "non_applied_basic"):
            raise HTTPException(status_code=400, detail=f"非法 category: {t['category']}")
        if t["stage"] not in ("summary", "proposal"):
            raise HTTPException(status_code=400, detail=f"非法 stage: {t['stage']}")
        for dim in t["dimensions"]:
            if not _REQUIRED_DIM_KEYS.issubset(dim):
                raise HTTPException(status_code=400, detail="维度缺少 name/weight")
        total = sum(int(d["weight"]) for d in t["dimensions"])
        if total != 100:
            raise HTTPException(
                status_code=400, detail=f"模板 {t['id']} 权重之和须为 100，当前 {total}"
            )


@router.get("/templates")
def get_templates():
    return get_config_loader().load("scoring_templates")


@router.put("/templates")
def put_templates(body: TemplatesPutRequest, db: Session = Depends(get_db)):
    loader = get_config_loader()
    old = loader.load("scoring_templates")
    new = {"templates": body.templates}
    _validate_templates(new)
    loader.save("scoring_templates", new)
    log_config_change(
        db, "scoring_templates", old, new, body.changed_by or "system"
    )
    return {"ok": True, "count": len(body.templates)}


@router.get("/rules")
def get_rules():
    return get_config_loader().load("classification_rules")


@router.put("/rules")
def put_rules(body: RulesPutRequest, db: Session = Depends(get_db)):
    loader = get_config_loader()
    old = loader.load("classification_rules")
    loader.save("classification_rules", body.rules)
    log_config_change(
        db, "classification_rules", old, body.rules, body.changed_by or "system"
    )
    return {"ok": True}


@router.get("/fewshot")
def list_fewshot(
    page: int = 1, page_size: int = 20, db: Session = Depends(get_db)
):
    total = db.execute(select(func.count(FewshotSample.id))).scalar() or 0
    rows = db.execute(
        select(FewshotSample).offset((page - 1) * page_size).limit(page_size)
    ).scalars().all()
    return {
        "total": total,
        "items": [
            {
                "id": r.id,
                "project_name": r.project_name,
                "project_type": r.project_type,
                "stage": r.stage,
                "sub_domain": r.sub_domain,
                "is_active": r.is_active,
                "content_preview": (r.content or "")[:120],
            }
            for r in rows
        ],
    }


@router.post("/fewshot")
def add_fewshot(body: FewshotCreateRequest, db: Session = Depends(get_db)):
    row = FewshotSample(id=uuid.uuid4().hex, **body.model_dump())
    db.add(row)
    db.commit()
    return {"id": row.id}


@router.get("/history")
def config_history(page: int = 1, page_size: int = 50, db: Session = Depends(get_db)):
    rows = db.execute(
        select(ConfigHistory)
        .order_by(ConfigHistory.changed_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).scalars().all()
    return {
        "items": [
            {
                "id": r.id,
                "config_key": r.config_key,
                "old_value": r.old_value,
                "new_value": r.new_value,
                "changed_by": r.changed_by,
                "changed_at": r.changed_at,
            }
            for r in rows
        ]
    }
