"""FastAPI 入口：路由挂载 + 启动初始化（目录就绪、模板表种子同步）。"""
from __future__ import annotations

import json
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_config import router as config_router
from app.api.routes_history import router as history_router
from app.api.routes_review import router as review_router
from app.api.routes_upload import router as upload_router
from app.core.config_loader import get_config_loader
from app.core.db import get_session_local
from app.models.tables import ScoringTemplate
from app.settings import get_settings


def _ensure_dirs() -> None:
    settings = get_settings()
    for p in (
        settings.upload_dir_path,
        settings.artifacts_dir_path,
        settings.checkpoint_db_path.parent,
    ):
        p.mkdir(parents=True, exist_ok=True)
    db_path = settings.resolved_database_url.removeprefix("sqlite:///")
    if db_path != ":memory:":
        from pathlib import Path

        Path(db_path).parent.mkdir(parents=True, exist_ok=True)


def _seed_scoring_templates() -> None:
    """将 YAML 模板同步进 scoring_templates 表（幂等：按 id upsert）。"""
    templates = get_config_loader().load("scoring_templates").get("templates", [])
    SessionLocal = get_session_local()
    with SessionLocal() as db:
        for t in templates:
            row = db.get(ScoringTemplate, t["id"]) or ScoringTemplate(id=t["id"])
            row.name = t["name"]
            row.category = t["category"]
            row.stage = t["stage"]
            row.dimensions = json.dumps(t["dimensions"], ensure_ascii=False)
            row.is_active = True
            db.merge(row)
        db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _ensure_dirs()
    _seed_scoring_templates()
    yield


app = FastAPI(title="智能评审 Agent 后端", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload_router)
app.include_router(review_router)
app.include_router(history_router)
app.include_router(config_router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
