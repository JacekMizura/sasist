"""Versioned operational sales / stock events — persisted audit stream."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from ..models.operational_commerce_event import OperationalCommerceEvent

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
    """Immutable versioned envelope — index fields at top level + nested payload."""
    metadata: dict[str, Any] = {}
    if source:
        metadata["source"] = str(source)
    if performed_by_user_id is not None:
        metadata["performed_by_user_id"] = int(performed_by_user_id)
    if device_id is not None:
        metadata["device_id"] = int(device_id)
        metadata["workstation_id"] = int(device_id)

    body: dict[str, Any] = dict(extra or {})
    if location_id is not None:
        body.setdefault("location_id", int(location_id))
    if product_id is not None:
        body.setdefault("product_id", int(product_id))
    if qty is not None:
        body.setdefault("qty", float(qty))

    envelope: dict[str, Any] = {
        "event": str(event),
        "version": EVENT_VERSION,
        "occurred_at": _utc_now_iso(),
        "tenant_id": int(tenant_id),
        "metadata": metadata,
        "payload": body,
    }
    if warehouse_id is not None:
        envelope["warehouse_id"] = int(warehouse_id)
    if order_id is not None:
        envelope["order_id"] = int(order_id)
    if session_id is not None:
        envelope["session_id"] = int(session_id)
    if location_id is not None:
        envelope["location_id"] = int(location_id)
    if product_id is not None:
        envelope["product_id"] = int(product_id)
    if qty is not None:
        envelope["qty"] = float(qty)
    if source:
        envelope["source"] = str(source)
    if performed_by_user_id is not None:
        envelope["performed_by_user_id"] = int(performed_by_user_id)
    if device_id is not None:
        envelope["device_id"] = int(device_id)
    return envelope


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
    try:
        row = OperationalCommerceEvent(
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id) if warehouse_id is not None else None,
            event=str(event),
            version=EVENT_VERSION,
            occurred_at=datetime.utcnow(),
            order_id=int(order_id) if order_id is not None else None,
            session_id=int(session_id) if session_id is not None else None,
            product_id=int(product_id) if product_id is not None else None,
            location_id=int(location_id) if location_id is not None else None,
            qty=float(qty) if qty is not None else None,
            source=str(source) if source else None,
            performed_by_user_id=int(performed_by_user_id) if performed_by_user_id is not None else None,
            device_id=int(device_id) if device_id is not None else None,
            payload_json=json.dumps(payload, ensure_ascii=False, default=str),
        )
        db.add(row)
        db.flush()
    except Exception:
        logger.exception("operational_commerce_event persist failed event=%s", event)
    return payload
