"""Versioned operational sales / stock events — immutable payloads for async hooks."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

EVENT_VERSION = 1


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def build_event_payload(
    event: str,
    *,
    tenant_id: int,
    warehouse_id: int | None = None,
    order_id: int | None = None,
    session_id: int | None = None,
    location_id: int | None = None,
    product_id: int | None = None,
    qty: float | None = None,
    source: str | None = None,
    performed_by_user_id: int | None = None,
    device_id: int | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "event": str(event),
        "version": EVENT_VERSION,
        "occurred_at": _utc_now_iso(),
        "tenant_id": int(tenant_id),
    }
    if warehouse_id is not None:
        payload["warehouse_id"] = int(warehouse_id)
    if order_id is not None:
        payload["order_id"] = int(order_id)
    if session_id is not None:
        payload["session_id"] = int(session_id)
    if location_id is not None:
        payload["location_id"] = int(location_id)
    if product_id is not None:
        payload["product_id"] = int(product_id)
    if qty is not None:
        payload["qty"] = float(qty)
    if source:
        payload["source"] = str(source)
    if performed_by_user_id is not None:
        payload["performed_by_user_id"] = int(performed_by_user_id)
    if device_id is not None:
        payload["device_id"] = int(device_id)
    if extra:
        payload.update(extra)
    return payload


def emit_operational_sales_event(
    db: Session,
    event: str,
    *,
    tenant_id: int,
    warehouse_id: int | None = None,
    order_id: int | None = None,
    session_id: int | None = None,
    location_id: int | None = None,
    product_id: int | None = None,
    qty: float | None = None,
    source: str | None = None,
    performed_by_user_id: int | None = None,
    device_id: int | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Phase 1: structured log + optional persistence hook.

    Later: fan-out to fiscal printers, KSeF, ERP webhooks without changing callers.
    """
    payload = build_event_payload(
        event,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_id=order_id,
        session_id=session_id,
        location_id=location_id,
        product_id=product_id,
        qty=qty,
        source=source,
        performed_by_user_id=performed_by_user_id,
        device_id=device_id,
        extra=extra,
    )
    logger.info("operational_sales_event %s", json.dumps(payload, ensure_ascii=False, default=str))
    return payload
