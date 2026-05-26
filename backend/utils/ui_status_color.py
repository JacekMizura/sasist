"""Panel UI status colors: strict #RRGGBB storage and legacy name migration."""

from __future__ import annotations

import re
from typing import Final

_HEX6: Final = re.compile(r"^#[0-9A-Fa-f]{6}$")

# Default = slate-500 (neutral panel chip)
DEFAULT_PANEL_STATUS_HEX: Final = "#64748b"

# Legacy palette (Tailwind 500) — migrate old DB rows from color names
COLOR_NAME_TO_HEX: Final[dict[str, str]] = {
    "green": "#22c55e",
    "blue": "#3b82f6",
    "gray": "#6b7280",
    "grey": "#6b7280",
    "slate": "#64748b",
    "red": "#ef4444",
    "amber": "#f59e0b",
    "emerald": "#10b981",
    "rose": "#f43f5e",
    "violet": "#8b5cf6",
    "orange": "#f97316",
    "cyan": "#06b6d4",
    "lime": "#84cc16",
    "fuchsia": "#d946ef",
    "yellow": "#eab308",
    "teal": "#14b8a6",
    "sky": "#0ea5e9",
    "indigo": "#6366f1",
    "pink": "#ec4899",
    "zinc": "#71717a",
    "stone": "#78716c",
    "neutral": "#737373",
}


def is_valid_hex6(value: str) -> bool:
    return bool(value and _HEX6.match(value.strip()))


def parse_hex_color_strict(value: str) -> str:
    """Validate API input: exactly #RRGGBB."""
    if not value or not isinstance(value, str):
        raise ValueError("color is required")
    s = value.strip()
    if not _HEX6.match(s):
        raise ValueError("color must be #RRGGBB (6 hexadecimal digits)")
    return s.lower()


def normalize_stored_color(raw: str | None) -> str:
    """Map legacy names → hex; accept existing hex; else default. For API responses."""
    if raw is None or not str(raw).strip():
        return DEFAULT_PANEL_STATUS_HEX
    s = str(raw).strip()
    if _HEX6.match(s):
        return s.lower()
    key = s.lower()
    return COLOR_NAME_TO_HEX.get(key, DEFAULT_PANEL_STATUS_HEX)
