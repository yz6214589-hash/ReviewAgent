"""F1 上传解析：POST /api/upload（多文件 + 类型白名单 + 落库 + 关联任务）。"""
from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.tables import ReviewTask
from app.services.parsers import ALLOWED_EXTENSIONS, parse_file
from app.settings import get_settings

router = APIRouter(prefix="/api", tags=["upload"])


@router.post("/upload")
async def upload_files(
    files: list[UploadFile], db: Session = Depends(get_db)
):
    if not files:
        raise HTTPException(status_code=400, detail="未收到文件")

    # 类型白名单校验（任一非法即整体拒绝，不入库）
    for f in files:
        ext = "." + (f.filename or "").rsplit(".", 1)[-1].lower() if "." in (f.filename or "") else ""
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的文件类型: {f.filename}（仅支持 {sorted(ALLOWED_EXTENSIONS)}）",
            )

    settings = get_settings()
    task_id = uuid.uuid4().hex
    task_dir = settings.upload_dir_path / task_id
    task_dir.mkdir(parents=True, exist_ok=True)

    saved: list[dict] = []
    for f in files:
        content = await f.read()
        path = task_dir / (f.filename or "unnamed")
        path.write_bytes(content)
        parsed = parse_file(path)
        saved.append(
            {
                "name": parsed.filename,
                "type": parsed.file_type,
                "size": len(content),
                "path": str(path),
                "preview": parsed.text[:200],
                "meta": parsed.meta,
            }
        )

    now = datetime.now().isoformat(timespec="seconds")
    project_name = (files[0].filename or task_id).rsplit(".", 1)[0]
    db.add(
        ReviewTask(
            id=task_id,
            project_name=project_name,
            status="draft",
            current_step=1,
            created_at=now,
            updated_at=now,
        )
    )
    db.commit()

    return {"task_id": task_id, "project_name": project_name, "files": saved}
