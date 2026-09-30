"""五类解析器注册表 + 统一入口。"""
from __future__ import annotations

from pathlib import Path

from app.services.parsers.base import BaseParser, ParsedDocument
from app.services.parsers.docx_parser import DocxParser
from app.services.parsers.pdf_parser import PdfParser
from app.services.parsers.pptx_parser import PptxParser
from app.services.parsers.txt_parser import TxtParser
from app.services.parsers.xlsx_parser import XlsxParser

# 上传类型白名单（扩展名 -> 解析器）
PARSERS: dict[str, BaseParser] = {
    ".docx": DocxParser(),
    ".pdf": PdfParser(),
    ".xlsx": XlsxParser(),
    ".pptx": PptxParser(),
    ".txt": TxtParser(),
}

ALLOWED_EXTENSIONS = set(PARSERS.keys())


def parse_file(path: Path) -> ParsedDocument:
    ext = path.suffix.lower()
    parser = PARSERS.get(ext)
    if parser is None:
        raise ValueError(f"不支持的文件类型: {ext}，仅支持 {sorted(ALLOWED_EXTENSIONS)}")
    return parser.parse(path)
