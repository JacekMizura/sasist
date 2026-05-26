"""Resolve panel UI status colors (legacy ``color`` + optional Sellasist-style tokens)."""

from __future__ import annotations

from typing import Any, Optional

from .ui_status_color import normalize_stored_color


def normalized_subgroup_key(raw: object | None) -> str:
    s = (str(raw).strip() if raw is not None else "")[:128]
    return s


def resolve_panel_status_tokens(row: Any) -> tuple[str, str, str, str]:
    """
    Returns (legacy_accent, badge_hex, background_hex, text_hex).
    Missing tokens fall back to legacy ``color`` for stripe/background; text defaults to dark slate.
    """
    base = normalize_stored_color(getattr(row, "color", None))
    badge = getattr(row, "badge_color", None)
    bg = getattr(row, "background_color", None)
    tx = getattr(row, "text_color", None)
    badge_s = normalize_stored_color(badge) if badge else base
    bg_s = normalize_stored_color(bg) if bg else base
    tx_s = normalize_stored_color(tx) if tx else "#0f172a"
    return base, badge_s, bg_s, tx_s


def resolve_group_display_name(rows: list[Any]) -> Optional[str]:
    """Deprecated: panel summary nie używa już nadpisywania nazwy grupy z ``group_name``."""
    for r in rows:
        gn = getattr(r, "group_name", None)
        if gn is not None and str(gn).strip():
            return str(gn).strip()[:128]
    return None
