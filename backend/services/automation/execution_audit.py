"""Normalize condition evaluation details into a durable audit snapshot."""

from __future__ import annotations

import json
from typing import Any


_FIELD_LABELS_PL: dict[str, str] = {
    "order_status": "Status zamówienia",
    "return_status": "Status zwrotu",
    "complaint_status": "Status reklamacji",
    "warehouse_id": "Magazyn",
    "order_number": "Numer zamówienia",
    "order_source": "Źródło",
    "payment_status": "Status płatności",
    "payment_method": "Metoda płatności",
    "shipment_courier": "Przewoźnik",
    "shipment_status": "Status przesyłki",
    "custom_field": "Pole dodatkowe",
}

_OPERATOR_LABELS_PL: dict[str, str] = {
    "in": "jest jednym z",
    "not_in": "nie jest jednym z",
    "eq": "równa się",
    "neq": "różne od",
    "contains": "zawiera",
}


def condition_field_label(field_key: str) -> str:
    key = str(field_key or "").strip()
    return _FIELD_LABELS_PL.get(key, key or "Warunek")


def condition_operator_label(op: str) -> str:
    return _OPERATOR_LABELS_PL.get(str(op or "").strip().lower(), str(op or ""))


def snapshot_conditions_evaluation(details: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """
    Convert runtime evaluate_conditions().details into a historical JSON-safe snapshot.

    Shape (per item):
      condition_type, operator, configured_value, actual_value, matched,
      classification?, error?, label?
    """
    out: list[dict[str, Any]] = []
    for d in details or []:
        if not isinstance(d, dict):
            continue
        field_key = str(d.get("fieldKey") or d.get("condition_type") or "").strip()
        op = str(d.get("operator") or "").strip() or None
        configured = d.get("expected")
        if configured is None:
            configured = d.get("configured_value")
        actual = d.get("actual")
        if actual is None:
            actual = d.get("actual_value")
        item: dict[str, Any] = {
            "condition_type": field_key,
            "operator": op,
            "configured_value": configured,
            "actual_value": actual,
            "matched": bool(d.get("matched")),
            "label": condition_field_label(field_key),
            "operator_label": condition_operator_label(op or ""),
        }
        if d.get("classification"):
            item["classification"] = d.get("classification")
        if d.get("error"):
            item["error"] = d.get("error")
        if d.get("message"):
            item["message"] = d.get("message")
        out.append(item)
    return out


def dump_conditions_evaluation(details: list[dict[str, Any]] | None) -> str | None:
    snap = snapshot_conditions_evaluation(details)
    if not snap:
        return None
    try:
        return json.dumps(snap, ensure_ascii=False, default=str)
    except Exception:
        return None


_EFFECT_TYPE_LABELS_PL: dict[str, str] = {
    "change_status": "Zmień status",
    "send_email": "Wyślij e-mail",
    "generate_sale_correction": "Wystaw korektę",
    "warehouse_commit": "Zatwierdzenie magazynowe",
}


def effect_type_summary(effect_type: str, result: dict[str, Any] | None = None) -> str:
    et = str(effect_type or "").strip()
    base = _EFFECT_TYPE_LABELS_PL.get(et, et or "Efekt")
    result = result or {}
    if et == "change_status":
        name = result.get("new_status_name") or result.get("status_name")
        sid = result.get("order_ui_status_id") or result.get("new_status_id")
        if name:
            return f"{base} → {name}"
        if sid is not None:
            return f"{base} → #{sid}"
    if et == "send_email":
        tpl = result.get("template_name") or result.get("template_id")
        if tpl:
            return f"{base} → {tpl}"
    return base
