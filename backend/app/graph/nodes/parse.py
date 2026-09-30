"""parse 节点：按统一解析模型解析上传文件，拼接为全文。"""
from __future__ import annotations

from pathlib import Path

from app.graph.state import ReviewState
from app.services.parsers import parse_file


def parse_node(state: ReviewState) -> dict:
    parts: list[str] = []
    for info in state.get("files", []):
        path = Path(info["path"])
        if not path.exists():
            return {"error": f"文件不存在: {path}"}
        doc = parse_file(path)
        parts.append(f"===== {doc.filename} ({doc.file_type}) =====\n{doc.text}")
    return {"parsed_text": "\n\n".join(parts), "error": None}
