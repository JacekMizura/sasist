"""Return Activity Log presentation — dynamic titles from event metadata."""

from __future__ import annotations

from typing import Any, Optional

from .domain_event_codes import (
    DOMAIN_EVENT_TITLES_PL,
    RETURN_COMPONENT_RECOVERY,
    RETURN_COMPONENT_SCRAP,
    RETURN_STOCK_INTAKE_SELECTED,
)


def _meta_str(meta: dict[str, Any], *keys: str) -> str:
    for k in keys:
        v = meta.get(k)
        if v is None:
            continue
        s = str(v).strip()
        if s:
            return s
    return ""


def resolve_return_event_title(event_code: str, metadata: Optional[dict[str, Any]] = None) -> Optional[str]:
    """
    Dynamic Zdarzenie label for returns. Returns None when code is not return-specific.
    Falls back to DOMAIN_EVENT_TITLES_PL for unknown shapes.
    """
    code = str(event_code or "").strip().upper().replace("-", "_")
    meta = metadata if isinstance(metadata, dict) else {}

    if code == RETURN_STOCK_INTAKE_SELECTED:
        mode = _meta_str(meta, "stock_intake_mode").upper()
        is_bundle = bool(meta.get("is_bundle")) or _meta_str(meta, "source").lower() == "bundle"
        if mode in ("DISASSEMBLE", "MIXED"):
            return "Rozmontowano zestaw" if is_bundle else "Rozmontowano produkt"
        if mode == "FG":
            return "Przyjęto zestaw w całości" if is_bundle else "Przyjęto gotowy produkt"
        return DOMAIN_EVENT_TITLES_PL.get(RETURN_STOCK_INTAKE_SELECTED)

    if code == RETURN_COMPONENT_RECOVERY:
        source = _meta_str(meta, "source").lower()
        if source == "bundle" or bool(meta.get("is_bundle")):
            return "Rozliczono element zestawu"
        return "Rozliczono komponent"

    if code == RETURN_COMPONENT_SCRAP:
        # Legacy rows only — new writes no longer emit this to Activity Log.
        source = _meta_str(meta, "source").lower()
        if source == "bundle" or bool(meta.get("is_bundle")):
            return "Rozliczono element zestawu"
        return "Rozliczono komponent"

    return None
