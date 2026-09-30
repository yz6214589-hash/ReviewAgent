"""统一解析模型（F1）：五类解析器输出统一为 ParsedDocument。"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class ParsedDocument:
    filename: str
    file_type: str  # docx/pdf/xlsx/pptx/txt
    text: str
    meta: dict = field(default_factory=dict)


class BaseParser:
    file_type: str = ""

    def parse(self, path: Path) -> ParsedDocument:  # pragma: no cover - 抽象
        raise NotImplementedError
