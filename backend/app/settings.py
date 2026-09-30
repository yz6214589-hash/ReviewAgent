"""Pydantic Settings：密钥与环境差异仅经 .env 注入，代码零硬编码密钥/路径。"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent  # backend/


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    llm_base_url: str = "http://internal-gateway/v1"
    llm_api_key: str = ""
    llm_model: str = "qwen2.5-72b-instruct"
    llm_mock: bool = True

    database_url: str = "sqlite:///./data/review.db"
    checkpoint_db: str = "./data/checkpoints.db"
    upload_dir: str = "./data/uploads"
    artifacts_dir: str = "./data/artifacts"
    template_word_path: str = "./data/templates/blank_score_sheet.docx"
    config_dir: str = "../config"

    def _resolve(self, p: str) -> Path:
        path = Path(p)
        return path if path.is_absolute() else (BACKEND_DIR / path).resolve()

    @property
    def resolved_database_url(self) -> str:
        prefix = "sqlite:///"
        if self.database_url.startswith(prefix):
            p = self.database_url[len(prefix):]
            if p != ":memory:" and not os.path.isabs(p):
                p = (BACKEND_DIR / p).resolve().as_posix()
            return prefix + p
        return self.database_url

    @property
    def checkpoint_db_path(self) -> Path:
        return self._resolve(self.checkpoint_db)

    @property
    def upload_dir_path(self) -> Path:
        return self._resolve(self.upload_dir)

    @property
    def artifacts_dir_path(self) -> Path:
        return self._resolve(self.artifacts_dir)

    @property
    def template_word_file(self) -> Path:
        return self._resolve(self.template_word_path)

    @property
    def config_dir_path(self) -> Path:
        return self._resolve(self.config_dir)


@lru_cache
def get_settings() -> Settings:
    return Settings()
