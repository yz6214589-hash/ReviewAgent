from pathlib import Path

from pypdf import PdfReader

from app.services.parsers.base import BaseParser, ParsedDocument


class PdfParser(BaseParser):
    file_type = "pdf"

    def parse(self, path: Path) -> ParsedDocument:
        reader = PdfReader(str(path))
        parts = []
        for page in reader.pages:
            text = (page.extract_text() or "").strip()
            if text:
                parts.append(text)
        return ParsedDocument(
            filename=path.name,
            file_type=self.file_type,
            text="\n".join(parts),
            meta={"pages": len(reader.pages)},
        )
