"""配置变更留痕（F14）。"""
from __future__ import annotations

import json
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.tables import ConfigHistory


def log_config_change(
    db: Session, config_key: str, old_value, new_value, changed_by: str = "system"
) -> None:
    db.add(
        ConfigHistory(
            id=uuid.uuid4().hex,
            config_key=config_key,
            old_value=json.dumps(old_value, ensure_ascii=False),
            new_value=json.dumps(new_value, ensure_ascii=False),
            changed_by=changed_by,
            changed_at=datetime.now().isoformat(timespec="seconds"),
        )
    )
    db.commit()
