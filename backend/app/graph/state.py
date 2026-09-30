"""ReviewState（SSD 3.2）。total=False 允许节点返回部分更新。"""
from __future__ import annotations

from typing import Any, TypedDict


class FileInfo(TypedDict, total=False):
    name: str
    path: str
    type: str
    size: int


class ReviewState(TypedDict, total=False):
    task_id: str
    files: list[FileInfo]            # 上传文件列表
    parsed_text: str                 # 解析后全文
    classification: dict[str, Any]   # 识别结果（类型/阶段/子领域/年份/组合标志/应用基础标志）
    confirmed: bool                  # 人工确认①
    template_override: list[str]     # 任务级模板覆盖（BR-1）
    templates: list[dict[str, Any]]  # 匹配模板（组合评审为两套）
    fewshot: list[dict[str, Any]]    # 范文检索结果
    draft_summary: str               # 总结意见草稿
    draft_proposal: str              # 立项意见草稿
    dimension_opinions: dict[str, dict[str, str]]  # {stage: {维度名: 意见}}
    confirmed_final: bool            # 人工确认②
    edit_source: str                 # ai_draft / manual_edit
    word_files: list[str]            # 产物路径
    error: str | None
