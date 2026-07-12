"""Build metadata shipped next to the installed agent executable."""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class BuildInfo:
    version: str
    git_commit: str
    built_at: str
    agent_sha256: str
    service_sha256: str = ""
    updater_sha256: str = ""

    @property
    def built_at_display(self) -> str:
        raw = (self.built_at or "").strip()
        if not raw:
            return "—"
        try:
            normalized = raw.replace("Z", "+00:00")
            parsed = datetime.fromisoformat(normalized)
            return parsed.strftime("%Y-%m-%d %H:%M:%S UTC")
        except ValueError:
            return raw

    @property
    def git_commit_short(self) -> str:
        value = (self.git_commit or "").strip()
        return value[:12] if len(value) > 12 else value or "—"


def _executable_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


def _build_info_path() -> Path:
    return _executable_dir() / "build_info.json"


def load_build_info() -> BuildInfo | None:
    path = _build_info_path()
    if not path.exists():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(raw, dict):
        return None
    return BuildInfo(
        version=str(raw.get("version") or "").strip(),
        git_commit=str(raw.get("git_commit") or "").strip(),
        built_at=str(raw.get("built_at") or "").strip(),
        agent_sha256=str(raw.get("agent_sha256") or "").strip(),
        service_sha256=str(raw.get("service_sha256") or "").strip(),
        updater_sha256=str(raw.get("updater_sha256") or "").strip(),
    )


def format_about_text(*, config_version: str | None = None) -> str:
    info = load_build_info()
    if info is None:
        version = (config_version or "").strip() or "development"
        return "\n".join(
            [
                "Sasist Printer Agent",
                "",
                f"Wersja: {version}",
                "Git commit: —",
                "Data buildu: —",
                "SHA256: —",
            ]
        )

    return "\n".join(
        [
            "Sasist Printer Agent",
            "",
            f"Wersja: {info.version or config_version or '—'}",
            f"Git commit: {info.git_commit_short}",
            f"Data buildu: {info.built_at_display}",
            f"SHA256: {info.agent_sha256 or '—'}",
        ]
    )
