"""统一 YAML 配置加载器：业务规则唯一来源。

按文件 mtime 缓存，配置文件变更后下次读取自动生效（无需改代码）。
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from app.settings import get_settings


class YamlConfigLoader:
    def __init__(self, config_dir: Path):
        self.config_dir = config_dir
        self._cache: dict[str, tuple[float, Any]] = {}

    def _path(self, name: str) -> Path:
        path = self.config_dir / f"{name}.yaml"
        if not path.exists():
            raise FileNotFoundError(f"配置文件不存在: {path}")
        return path

    def load(self, name: str) -> dict:
        path = self._path(name)
        mtime = path.stat().st_mtime
        cached = self._cache.get(name)
        if cached and cached[0] == mtime:
            return cached[1]
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        self._cache[name] = (mtime, data)
        return data

    def save(self, name: str, data: dict) -> None:
        path = self._path(name)
        with open(path, "w", encoding="utf-8") as f:
            yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)
        self._cache.pop(name, None)


_loader: YamlConfigLoader | None = None


def get_config_loader() -> YamlConfigLoader:
    global _loader
    if _loader is None or _loader.config_dir != get_settings().config_dir_path:
        _loader = YamlConfigLoader(get_settings().config_dir_path)
    return _loader
