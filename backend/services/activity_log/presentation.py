"""
Activity Log presentation — ready-to-display fields for the panel UI.

No event-code → label maps. Descriptions must already be stored as Polish sentences.
This module only formats timestamps, resolves operator display, and projects
stored metadata into labeled detail rows for expand.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

# Detail labels for known metadata keys stored by writers (not event-type translations).
_DETAIL_KEY_LABELS: dict[str, str] = {
    "reason": "Powód",
    "powod": "Powód",
    "cart_code": "Wózek",
    "cart_label": "Wózek",
    "target_cart": "Wózek",
    "session_id": "Sesja",
    "batch_id": "Sesja batch",
    "basket": "Koszyk",
    "basket_id": "Koszyk",
    "basket_label": "Koszyk",
    "location": "Lokalizacja",
    "location_code": "Lokalizacja",
    "source_location": "Lokalizacja",
    "product": "Produkty",
    "product_name": "Produkty",
    "product_sku": "SKU",
    "quantity": "Ilość",
    "orders_count": "Liczba zamówień",
    "orders_detached": "Liczba zamówień",
    "remaining_orders": "Pozostało na wózku",
    "assigned_volume": "Objętość (dm³)",
    "volume_from": "Objętość od (dm³)",
    "volume_to": "Objętość do (dm³)",
    "weight_kg": "Waga (kg)",
    "total_weight_kg": "Waga (kg)",
    "capacity_usage_percent": "Pojemność (%)",
    "usage_from": "Pojemność od (%)",
    "usage_to": "Pojemność do (%)",
}


def format_occurred_at_display(occurred_at: datetime | str | None) -> str:
    if occurred_at is None:
        return "—"
    if isinstance(occurred_at, datetime):
        return occurred_at.strftime("%d.%m.%Y %H:%M")
    raw = str(occurred_at).strip()
    if not raw:
        return "—"
    try:
        normalized = raw.replace(" ", "T", 1) if "T" not in raw else raw
        dt = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
        return dt.strftime("%d.%m.%Y %H:%M")
    except Exception:
        return raw[:16]


def resolve_operator_display(
    *,
    actor_name: str | None,
    actor_user_id: int | None = None,
    metadata: dict[str, Any] | None = None,
) -> str:
    meta = metadata or {}
    integration = meta.get("integration_name") or meta.get("actor_label")
    if isinstance(integration, str) and integration.strip():
        return integration.strip()
    if actor_name and str(actor_name).strip():
        return str(actor_name).strip()
    if actor_user_id is not None and int(actor_user_id) > 0:
        return f"Operator #{int(actor_user_id)}"
    source = str(meta.get("actor_source") or meta.get("source") or "").lower()
    if "api" in source:
        return "API"
    if "integration" in source or "allegro" in source:
        return str(meta.get("integration_name") or "Integracja")
    return "System"


def order_numbers_from_meta(metadata: dict[str, Any] | None) -> list[str]:
    meta = metadata or {}
    raw = meta.get("order_numbers")
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for n in raw:
        s = str(n or "").strip()
        if not s:
            continue
        out.append(s if s.startswith("#") else f"#{s}")
    return out


def build_detail_rows(
    *,
    occurred_at_display: str,
    operator_display: str,
    action: str,
    metadata: dict[str, Any] | None = None,
    order_numbers: list[str] | None = None,
) -> list[dict[str, str]]:
    """Ready detail rows for expand — only fields that apply."""
    rows: list[dict[str, str]] = [
        {"label": "Data", "value": occurred_at_display},
        {"label": "Operator", "value": operator_display},
        {"label": "Akcja", "value": action},
    ]
    meta = dict(metadata or {})
    nums = order_numbers if order_numbers is not None else order_numbers_from_meta(meta)
    if nums:
        preview = ", ".join(nums[:40])
        if len(nums) > 40:
            preview = f"{preview} … (+{len(nums) - 40})"
        rows.append({"label": "Zamówienia", "value": preview})

    skip = {
        "order_ids",
        "order_numbers",
        "order_numbers_truncated",
        "source",
        "cart_lifecycle_event_id",
        "actor_source",
        "actor_label",
        "integration_name",
        "assigned_volume_from",
        "assigned_volume_to",
        "capacity_usage_from",
        "capacity_usage_to",
        "confirmed_picks_before",
        "pick_tasks_detached",
        "draft_picks_removed",
        "picks_detached",
        "orders_restored",
        "picking_cancelled",
        "cart_released",
    }
    seen_labels: set[str] = {"Data", "Operator", "Akcja", "Zamówienia"}

    for key, label in _DETAIL_KEY_LABELS.items():
        if key in skip or key not in meta:
            continue
        if label in seen_labels and label not in ("Powód", "Wózek", "Sesja", "Lokalizacja", "Produkty"):
            continue
        val = meta.get(key)
        if val is None or val == "" or isinstance(val, (list, dict)):
            continue
        if label in seen_labels:
            # Prefer first meaningful value for duplicate labels
            continue
        rows.append({"label": label, "value": str(val)})
        seen_labels.add(label)

    # Volume range
    vol_from = meta.get("volume_from", meta.get("assigned_volume_from"))
    vol_to = meta.get("volume_to", meta.get("assigned_volume_to", meta.get("assigned_volume")))
    if "Objętość (dm³)" not in seen_labels and (vol_from is not None or vol_to is not None):
        if vol_from is not None and vol_to is not None and vol_from != vol_to:
            rows.append({"label": "Objętość", "value": f"{vol_from} → {vol_to} dm³"})
        elif vol_to is not None:
            rows.append({"label": "Objętość", "value": f"{vol_to} dm³"})
        elif vol_from is not None:
            rows.append({"label": "Objętość", "value": f"{vol_from} dm³"})

    extras: list[str] = []
    for k, v in meta.items():
        if k in skip or k in _DETAIL_KEY_LABELS or v is None or isinstance(v, (list, dict)):
            continue
        if k.startswith("_"):
            continue
        extras.append(f"{k}: {v}")
    if extras:
        rows.append({"label": "Dodatkowe informacje", "value": "; ".join(extras[:12])})

    return rows


def enrich_activity_item(item: dict[str, Any]) -> dict[str, Any]:
    """Attach ready-to-display fields onto a list_activity item dict."""
    from backend.services.cart_lifecycle_event_catalog import (
        compose_informative_message,
        title_pl,
    )

    meta = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
    occurred_raw = item.get("occurred_at")
    occurred_display = format_occurred_at_display(occurred_raw)
    operator = resolve_operator_display(
        actor_name=item.get("actor_name"),
        actor_user_id=item.get("actor_user_id"),
        metadata=meta,
    )
    event_code = str(item.get("event_code") or "").strip()
    stored_desc = str(item.get("description") or "").strip()
    action = compose_informative_message(
        event_code,
        stored_description=stored_desc,
        metadata=meta,
    )
    event_display_label = title_pl(event_code)
    # Order # list only when writer opted in (assign / detach) — never for start/stop session noise.
    show_nums = bool(meta.get("show_order_numbers"))
    order_nums = order_numbers_from_meta(meta) if show_nums else []
    out = dict(item)
    out["occurred_at_display"] = occurred_display
    out["operator_display"] = operator
    out["action"] = action
    out["event_display_label"] = event_display_label
    out["details"] = []  # UI standard: no expandable metadata
    out["order_numbers"] = order_nums
    return out
