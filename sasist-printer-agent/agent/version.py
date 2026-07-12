"""Agent release version — loaded from VERSION (SSOT: sasist-printer-agent/VERSION)."""

from __future__ import annotations

import sys
from pathlib import Path


def _candidate_version_paths() -> list[Path]:
    candidates: list[Path] = []
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            candidates.append(Path(meipass) / "VERSION")
        candidates.append(Path(sys.executable).resolve().parent / "VERSION")
    candidates.append(Path(__file__).resolve().parent.parent / "VERSION")
    return candidates


def read_version() -> str:
    for path in _candidate_version_paths():
        try:
            value = path.read_text(encoding="utf-8").strip()
        except OSError:
            continue
        if value:
            return value
    return "0.0.0-dev"


__version__ = read_version()
