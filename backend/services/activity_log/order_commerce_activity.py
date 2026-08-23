"""Phase 2 order Activity Log writers — custom fields, payments, methods, import."""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from .domain_activity import find_activity_by_correlation, record_domain_activity
from .order_event_codes import (
    ORDER_CUSTOM_FIELD_CHANGED,
    ORDER_CUSTOM_FIELD_FILE_ATTACHED,
    ORDER_CUSTOM_FIELD_FILE_REMOVED,
    ORDER_CREATED,
    ORDER_EVENT_CATEGORY,
    ORDER_IMPORTED,
    ORDER_PAYMENT_METHOD_CHANGED,
    ORDER_PAYMENT_REGISTERED,
    ORDER_PAYMENT_STATUS_CHANGED,
    ORDER_SHIPPING_METHOD_CHANGED,
    ActorKind,
)

logger = logging.getLogger(__name__)


def _hash_key(*parts: Any) -> str:
    raw = "|".join("" if p is None else str(p) for p in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def _actor_meta(actor_kind: ActorKind) -> dict[str, Any]:
    meta: dict[str, Any] = {"actor_kind": actor_kind}
    if actor_kind == "AUTOMATION":
        meta["actor_label"] = "Automatyzacja"
    elif actor_kind == "SYSTEM":
        meta["actor_label"] = "System"
    elif actor_kind == "INTEGRATION":
        meta["actor_label"] = "Integracja"
    return meta


def _display_scalar(value: Any, *, max_len: int = 120) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        s = f"{value:.4f}".rstrip("0").rstrip(".")
        return s
    if isinstance(value, (list, dict)):
        try:
            s = json.dumps(value, ensure_ascii=False, default=str)
        except Exception:
            s = str(value)
    else:
        s = str(value)
    s = s.strip()
    if len(s) > max_len:
        return s[: max_len - 1] + "…"
    return s


def custom_field_value_repr(
    *,
    field_type: str,
    value_string: Optional[str],
    value_number: Optional[float],
    value_json: Optional[str],
) -> str:
    ft = (field_type or "").strip().upper()
    if ft in ("FILES", "SALES_DOCUMENT", "SHIPPING_LABEL"):
        try:
            data = json.loads(value_json) if value_json else []
        except Exception:
            data = []
        if isinstance(data, dict):
            data = [data]
        if not isinstance(data, list) or not data:
            return ""
        names: list[str] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            n = str(item.get("original_filename") or item.get("stored_filename") or "").strip()
            if n:
                names.append(n)
        if not names:
            return f"{len(data)} plik(ów)"
        if len(names) == 1:
            return names[0]
        return f"{names[0]} (+{len(names) - 1})"
    if value_number is not None and (value_string is None or value_string == ""):
        return _display_scalar(value_number)
    if value_json and ft in ("JSON", "MULTISELECT", "CHECKBOX"):
        return _display_scalar(value_json, max_len=80)
    return _display_scalar(value_string)


def emit_order_custom_field_changed_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    field_id: int,
    field_name: str,
    field_type: str,
    old_value: str,
    new_value: str,
    actor_user_id: Optional[int] = None,
    mutation_token: Optional[str] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    if str(old_value) == str(new_value):
        return None
    # mutation_token: prior value row id/updated_at so A→B→A→B stays distinct.
    cid = f"ocf-chg:{int(order_id)}:{int(field_id)}:{_hash_key(old_value, new_value, mutation_token)}"[:64]
    if find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id)):
        return None
    name = str(field_name or f"Pole #{field_id}").strip()
    summary = f"Zmieniono pole dodatkowe „{name}” z „{old_value}” na „{new_value}”."
    actor_kind: ActorKind = "USER" if actor_user_id else "SYSTEM"
    meta = {
        **_actor_meta(actor_kind),
        "ref_type": "order_custom_field",
        "ref_id": int(field_id),
        "field_id": int(field_id),
        "field_name": name[:255],
        "field_type": str(field_type or "")[:64],
        "old_value": old_value[:500],
        "new_value": new_value[:500],
    }
    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=ORDER_CUSTOM_FIELD_CHANGED,
        description=summary,
        actor_user_id=actor_user_id,
        order_id=int(order_id),
        metadata=meta,
        correlation_id=cid,
        severity="INFO",
        category=ORDER_EVENT_CATEGORY[ORDER_CUSTOM_FIELD_CHANGED],
        source_module="order_custom_fields",
        occurred_at=occurred_at,
    )


def emit_order_custom_field_file_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    field_id: int,
    field_name: str,
    filename: str,
    attached: bool,
    order_document_id: Optional[int] = None,
    mime_type: Optional[str] = None,
    size_bytes: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    fname = str(filename or "plik").strip() or "plik"
    name = str(field_name or f"Pole #{field_id}").strip()
    if attached:
        code = ORDER_CUSTOM_FIELD_FILE_ATTACHED
        summary = f"Do pola „{name}” dodano plik „{fname}”."
        if order_document_id:
            cid = f"ocf-file-add:{int(order_document_id)}"[:64]
        else:
            cid = f"ocf-file-add:{int(order_id)}:{int(field_id)}:{_hash_key(fname)}"[:64]
    else:
        code = ORDER_CUSTOM_FIELD_FILE_REMOVED
        summary = f"Z pola „{name}” usunięto plik „{fname}”."
        cid = (
            f"ocf-file-rm:{int(order_id)}:{int(field_id)}:"
            f"{int(order_document_id) if order_document_id else _hash_key(fname)}"
        )[:64]
    if find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id)):
        return None
    actor_kind: ActorKind = "USER" if actor_user_id else "SYSTEM"
    meta: dict[str, Any] = {
        **_actor_meta(actor_kind),
        "ref_type": "order_document" if order_document_id else "order_custom_field",
        "ref_id": int(order_document_id) if order_document_id else int(field_id),
        "field_id": int(field_id),
        "field_name": name[:255],
        "filename": fname[:255],
    }
    if order_document_id:
        meta["order_document_id"] = int(order_document_id)
    if mime_type:
        meta["mime_type"] = str(mime_type)[:128]
    if size_bytes is not None:
        meta["size_bytes"] = int(size_bytes)
    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=code,
        description=summary,
        actor_user_id=actor_user_id,
        order_id=int(order_id),
        metadata=meta,
        correlation_id=cid,
        severity="INFO",
        category=ORDER_EVENT_CATEGORY[code],
        source_module="order_custom_fields",
        occurred_at=occurred_at,
    )


def emit_order_payment_registered_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    payment_id: int,
    amount: float,
    currency: str,
    method: Optional[str] = None,
    status: Optional[str] = None,
    actor_user_id: Optional[int] = None,
    source: str = "direct_sales",
    occurred_at: Optional[datetime] = None,
) -> Any:
    cid = f"pay-reg:{int(payment_id)}"[:64]
    if find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id)):
        return None
    cur = (currency or "PLN").strip().upper() or "PLN"
    amt = f"{float(amount):,.2f}".replace(",", " ").replace(".", ",")
    summary = f"Zarejestrowano płatność {amt} {cur}."
    actor_kind: ActorKind = "USER" if actor_user_id else "SYSTEM"
    meta: dict[str, Any] = {
        **_actor_meta(actor_kind),
        "ref_type": "payment",
        "ref_id": int(payment_id),
        "payment_id": int(payment_id),
        "amount": float(amount),
        "currency": cur,
        "source": source,
    }
    if method:
        meta["method"] = str(method).strip().upper()[:64]
    if status:
        meta["status"] = str(status).strip().upper()[:64]
    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=ORDER_PAYMENT_REGISTERED,
        description=summary,
        actor_user_id=actor_user_id,
        order_id=int(order_id),
        metadata=meta,
        correlation_id=cid,
        severity="SUCCESS",
        category=ORDER_EVENT_CATEGORY[ORDER_PAYMENT_REGISTERED],
        source_module="payments",
        occurred_at=occurred_at,
    )


def emit_order_payment_status_changed_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    old_status: str,
    new_status: str,
    payment_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    source: str = "order_panel",
    mutation_token: Optional[str] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    old_s = str(old_status or "").strip()
    new_s = str(new_status or "").strip()
    if old_s == new_s:
        return None
    if payment_id:
        cid = f"pay-st:{int(payment_id)}:{_hash_key(old_s, new_s, mutation_token)}"[:64]
    else:
        cid = f"pay-panel-st:{int(order_id)}:{_hash_key(old_s, new_s, mutation_token)}"[:64]
    if find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id)):
        return None
    summary = f"Status płatności zmieniono z „{old_s or '—'}” na „{new_s or '—'}”."
    actor_kind: ActorKind = "USER" if actor_user_id else "SYSTEM"
    meta: dict[str, Any] = {
        **_actor_meta(actor_kind),
        "ref_type": "payment" if payment_id else "order",
        "ref_id": int(payment_id) if payment_id else int(order_id),
        "old_status": old_s[:128],
        "new_status": new_s[:128],
        "source": source,
    }
    if payment_id:
        meta["payment_id"] = int(payment_id)
    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=ORDER_PAYMENT_STATUS_CHANGED,
        description=summary,
        actor_user_id=actor_user_id,
        order_id=int(order_id),
        metadata=meta,
        correlation_id=cid,
        severity="INFO",
        category=ORDER_EVENT_CATEGORY[ORDER_PAYMENT_STATUS_CHANGED],
        source_module="payments",
        occurred_at=occurred_at,
    )


def emit_order_payment_method_changed_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    old_method: str,
    new_method: str,
    actor_user_id: Optional[int] = None,
    mutation_token: Optional[str] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    old_m = str(old_method or "").strip()
    new_m = str(new_method or "").strip()
    if old_m == new_m:
        return None
    cid = f"pay-method:{int(order_id)}:{_hash_key(old_m, new_m, mutation_token)}"[:64]
    if find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id)):
        return None
    summary = f"Zmieniono metodę płatności z „{old_m or '—'}” na „{new_m or '—'}”."
    actor_kind: ActorKind = "USER" if actor_user_id else "SYSTEM"
    meta = {
        **_actor_meta(actor_kind),
        "ref_type": "order",
        "ref_id": int(order_id),
        "old_value": old_m[:128],
        "new_value": new_m[:128],
    }
    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=ORDER_PAYMENT_METHOD_CHANGED,
        description=summary,
        actor_user_id=actor_user_id,
        order_id=int(order_id),
        metadata=meta,
        correlation_id=cid,
        severity="INFO",
        category=ORDER_EVENT_CATEGORY[ORDER_PAYMENT_METHOD_CHANGED],
        source_module="order_panel",
        occurred_at=occurred_at,
    )


def emit_order_shipping_method_changed_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    old_method_id: Optional[str],
    old_method_name: Optional[str],
    new_method_id: Optional[str],
    new_method_name: Optional[str],
    actor_user_id: Optional[int] = None,
    mutation_token: Optional[str] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    old_id = str(old_method_id or "").strip()
    new_id = str(new_method_id or "").strip()
    if old_id == new_id and str(old_method_name or "") == str(new_method_name or ""):
        return None
    cid = f"ship-method:{int(order_id)}:{_hash_key(old_id, new_id, mutation_token)}"[:64]
    if find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id)):
        return None
    old_label = str(old_method_name or "").strip() or old_id or "—"
    new_label = str(new_method_name or "").strip() or new_id or "—"
    summary = f"Zmieniono metodę dostawy z „{old_label}” na „{new_label}”."
    actor_kind: ActorKind = "USER" if actor_user_id else "SYSTEM"
    meta = {
        **_actor_meta(actor_kind),
        "ref_type": "order",
        "ref_id": int(order_id),
        "old_shipping_method_id": old_id or None,
        "new_shipping_method_id": new_id or None,
        "old_value": old_label[:128],
        "new_value": new_label[:128],
    }
    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=ORDER_SHIPPING_METHOD_CHANGED,
        description=summary,
        actor_user_id=actor_user_id,
        order_id=int(order_id),
        metadata=meta,
        correlation_id=cid,
        severity="INFO",
        category=ORDER_EVENT_CATEGORY[ORDER_SHIPPING_METHOD_CHANGED],
        source_module="order_panel",
        occurred_at=occurred_at,
    )


def emit_order_created_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    order_number: Optional[str] = None,
    actor_user_id: Optional[int] = None,
    actor_kind: Optional[ActorKind] = None,
    source: str = "MANUAL",
    external_order_id: Optional[str] = None,
    integration_account_id: Optional[str] = None,
    original_order_id: Optional[int] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    """One business creation event per order. Marketplace/CSV uses ``emit_order_imported_activity``."""
    cid = f"order-created:{int(order_id)}"[:64]
    if find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id)):
        return None

    src = str(source or "MANUAL").strip().upper() or "MANUAL"
    num = str(order_number or "").strip() or str(order_id)
    display_num = num if num.startswith("#") else f"#{num}"

    if actor_kind is not None:
        resolved_kind: ActorKind = actor_kind
    elif actor_user_id:
        resolved_kind = "USER"
    else:
        resolved_kind = "SYSTEM"

    if src == "DIRECT_SALE":
        summary = f"Utworzono zamówienie {display_num} (sprzedaż bezpośrednia)."
    else:
        summary = f"Utworzono zamówienie {display_num}."

    meta: dict[str, Any] = {
        **_actor_meta(resolved_kind),
        "ref_type": "order",
        "ref_id": int(order_id),
        "order_id": int(order_id),
        "order_number": str(num)[:128],
        "source": src[:64],
    }
    if external_order_id:
        meta["external_order_id"] = str(external_order_id)[:128]
    if integration_account_id:
        meta["integration_account_id"] = str(integration_account_id)[:128]
    if original_order_id is not None:
        meta["original_order_id"] = int(original_order_id)

    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=ORDER_CREATED,
        description=summary,
        actor_user_id=int(actor_user_id) if resolved_kind == "USER" and actor_user_id else None,
        order_id=int(order_id),
        metadata=meta,
        correlation_id=cid,
        severity="SUCCESS",
        category=ORDER_EVENT_CATEGORY[ORDER_CREATED],
        source_module="order_create",
        occurred_at=occurred_at,
    )


def emit_order_imported_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    order_number: Optional[str] = None,
    source: Optional[str] = None,
    external_order_id: Optional[str] = None,
    import_batch_id: Optional[str] = None,
    integration_account_id: Optional[str] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    """Marketplace/CSV import creation narrative — mutually exclusive with ORDER_CREATED."""
    cid_created = f"order-created:{int(order_id)}"[:64]
    cid_import = f"order-import:{int(order_id)}"[:64]
    if find_activity_by_correlation(db, correlation_id=cid_import, tenant_id=int(tenant_id)):
        return None
    if find_activity_by_correlation(db, correlation_id=cid_created, tenant_id=int(tenant_id)):
        return None
    src = str(source or "").strip() or "import"
    num = str(order_number or "").strip()
    display = f" #{num}" if num else ""
    summary = f"Pobrano zamówienie{display} z {src}.".replace("  ", " ")
    meta: dict[str, Any] = {
        **_actor_meta("INTEGRATION"),
        "ref_type": "order",
        "ref_id": int(order_id),
        "order_id": int(order_id),
        "marketplace": src[:128],
        "source": "MARKETPLACE" if src.lower() not in ("import", "csv", "manual") else "IMPORT",
        "source_label": src[:128],
    }
    if num:
        meta["order_number"] = num[:128]
    if external_order_id:
        meta["external_order_id"] = str(external_order_id)[:128]
    if import_batch_id:
        meta["import_batch_id"] = str(import_batch_id)[:128]
    if integration_account_id:
        meta["integration_account_id"] = str(integration_account_id)[:128]
    # Use shared creation correlation so ORDER_CREATED cannot double-fire later.
    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=ORDER_IMPORTED,
        description=summary,
        actor_user_id=None,
        order_id=int(order_id),
        metadata=meta,
        correlation_id=cid_created,
        severity="INFO",
        category=ORDER_EVENT_CATEGORY[ORDER_IMPORTED],
        source_module="order_import",
        occurred_at=occurred_at,
    )
