"""API 请求/响应 Pydantic 模型。"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class ConfirmRequest(BaseModel):
    """确认①：人工确认/修正确认识别结果，可携带任务级模板覆盖。"""

    project_type: str | None = None
    stage: str | None = None  # summary/proposal/combined
    sub_domain: str | None = None
    year: int | None = None
    is_applied_basic: bool | None = None
    template_ids: list[str] | None = None  # 任务级模板覆盖（BR-1）
    confirmed_by: str | None = None


class FinalizeRequest(BaseModel):
    """确认②：终稿确认，可携带人工编辑后的最终文本。"""

    summary: str | None = None
    proposal: str | None = None
    confirmed_by: str | None = None


class TemplatesPutRequest(BaseModel):
    templates: list[dict[str, Any]]
    changed_by: str | None = None


class RulesPutRequest(BaseModel):
    rules: dict[str, Any]
    changed_by: str | None = None


class FewshotCreateRequest(BaseModel):
    project_name: str
    project_type: str
    stage: str
    sub_domain: str | None = None
    content: str
    is_active: bool = True
