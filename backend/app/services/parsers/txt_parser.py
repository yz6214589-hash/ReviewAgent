from pathlib import Path

from app.services.parsers.base import BaseParser, ParsedDocument


class TxtParser(BaseParser):
    file_type = "txt"

    def parse(self, path: Path) -> ParsedDocument:
        raw = path.read_bytes()
        encoding = "utf-8"
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            text = raw.decode("gbk", errors="ignore")
            encoding = "gbk"
        return ParsedDocument(
            filename=path.name,
            file_type=self.file_type,
            text=text,
            meta={"encoding": encoding, "bytes": len(raw)},
        )
