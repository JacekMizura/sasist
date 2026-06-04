"""Typy i etykiety usunięcia linii zamówienia (OMS / braki / zamiana)."""

from __future__ import annotations

import json
from typing import Any

from ..models.order_item import OrderItem

REMOVAL_TYPE_SHORTAGE = "shortage"
REMOVAL_TYPE_MANUAL_OMS = "manual_oms"
REMOVAL_TYPE_OMS_SYNC = "oms_sync"
REMOVAL_TYPE_REPLACEMENT = "replacement"
REMOVAL_TYPE_CANCELLED = "cancelled"

REMOVAL_TYPES: frozenset[str] = frozenset(
    {
        REMOVAL_TYPE_SHORTAGE,
        REMOVAL_TYPE_MANUAL_OMS,
        REMOVAL_TYPE_OMS_SYNC,
        REMOVAL_TYPE_REPLACEMENT,
        REMOVAL_TYPE_CANCELLED,
    }
)


def order_item_meta_dict(item: OrderItem) -> dict[str, Any]:
    raw = getattr(item, "metadata_json", None)
    if not raw or not str(raw).strip():
        return {}
    try:
        m = json.loads(raw)
        return m if isinstance(m, dict) else {}
    except json.JSONDecodeError:
        return {}


def normalize_removal_type(raw: str | None) -> str:
    v = str(raw or "").strip().lower()
    if v in REMOVAL_TYPES:
        return v
    if "brak" in v or "shortage" in v:
        return REMOVAL_TYPE_SHORTAGE
    if "zamian" in v or "replacement" in v or "zamiennik" in v:
        return REMOVAL_TYPE_REPLACEMENT
    if "anul" in v or "cancel" in v:
        return REMOVAL_TYPE_CANCELLED
    if "oms" in v or "ręczn" in v or "operator" in v or "manual" in v:
        return REMOVAL_TYPE_MANUAL_OMS
    return REMOVAL_TYPE_MANUAL_OMS


def removal_type_from_reason_text(reason: str) -> str:
    r = str(reason or "").strip().lower()
    if not r:
        return REMOVAL_TYPE_MANUAL_OMS
    if "brak magazyn" in r or "shortage" in r or "rozwiązano brak" in r:
        return REMOVAL_TYPE_SHORTAGE
    if "zamiennik" in r or "zamian" in r:
        return REMOVAL_TYPE_REPLACEMENT
    if "anul" in r:
        return REMOVAL_TYPE_CANCELLED
    if "oms" in r or "linię z zamówienia" in r or "operator" in r:
        return REMOVAL_TYPE_MANUAL_OMS
    return REMOVAL_TYPE_MANUAL_OMS


def removal_type_for_order_item(item: OrderItem, *, default: str = REMOVAL_TYPE_MANUAL_OMS) -> str:
    meta = order_item_meta_dict(item)
    raw = meta.get("removal_type") or meta.get("removal_reason")
    if raw:
        return normalize_removal_type(str(raw))
    if meta.get("oms_line_removed"):
        rr = str(meta.get("removed_reason") or "")
        return removal_type_from_reason_text(rr) if rr else default
    return default


def removal_ui_labels(removal_type: str) -> dict[str, str]:
    t = normalize_removal_type(removal_type)
    if t == REMOVAL_TYPE_SHORTAGE:
        return {
            "badge": "USUNIĘTO Z POWODU BRAKÓW MAGAZYNOWYCH",
            "headline": "Usunięto podczas obsługi braków magazynowych.",
            "footer": "Pozycja usunięta z kompletacji z powodu braków magazynowych.",
            "reason_default": "brak magazynowy",
        }
    if t == REMOVAL_TYPE_REPLACEMENT:
        return {
            "badge": "USUNIĘTO (ZAMIANA PRODUKTU)",
            "headline": "Linia zarchiwizowana po zamianie produktu.",
            "footer": "Pozycja zastąpiona innym produktem w zamówieniu.",
            "reason_default": "zamiana produktu",
        }
    if t == REMOVAL_TYPE_CANCELLED:
        return {
            "badge": "USUNIĘTO (ANULOWANO)",
            "headline": "Pozycja anulowana w zamówieniu.",
            "footer": "Pozycja usunięta — zamówienie anulowane lub zmienione.",
            "reason_default": "anulowano",
        }
    if t == REMOVAL_TYPE_OMS_SYNC:
        return {
            "badge": "USUNIĘTO (SYNCHRONIZACJA OMS)",
            "headline": "Pozycja usunięta podczas synchronizacji z OMS.",
            "footer": "Pozycja usunięta z zamówienia (import OMS).",
            "reason_default": "synchronizacja OMS",
        }
    return {
        "badge": "USUNIĘTO Z ZAMÓWIENIA (OMS)",
        "headline": "Pozycja usunięta ręcznie z zamówienia (OMS).",
        "footer": "Pozycja usunięta z zamówienia przez operatora / OMS.",
        "reason_default": "usunięto z zamówienia (OMS)",
    }
