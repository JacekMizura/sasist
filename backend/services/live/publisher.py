"""Persist + fan-out live operational events (enhancement layer — never required for core WMS)."""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from ...models.operational_live_event import OperationalLiveEvent
from ..operational_features_context import resolve_operational_features_context

logger = logging.getLogger(__name__)


def _revision_for(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def publish_live_event(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    event_type: str,
    payload: dict[str, Any] | None = None,
    channel: str = "warehouse",
    features=None,
) -> OperationalLiveEvent | None:
    """
    Write event when ``FEATURE_OPERATIONAL_RUNTIME`` active.
    Returns None when runtime disabled — callers must not depend on this.
    """
    ctx = resolve_operational_features_context(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, features=features
    )
    if not ctx.operational_runtime_active:
        return None

    body = dict(payload or {})
    body.setdefault("occurred_at", datetime.now(timezone.utc).replace(microsecond=0).isoformat())
    rev = _revision_for({"event_type": event_type, **body})

    row = OperationalLiveEvent(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        event_type=str(event_type),
        channel=str(channel),
        revision=rev,
        payload_json=json.dumps(body, ensure_ascii=False, separators=(",", ":")),
        created_at=datetime.utcnow(),
    )
    db.add(row)
    db.flush()

    logger.info(
        "[live.stock] event=%s tenant_id=%s warehouse_id=%s id=%s",
        event_type,
        tenant_id,
        warehouse_id,
        row.id,
    )
    return row


def fetch_events_since(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    since_id: int = 0,
    limit: int = 50,
) -> list[OperationalLiveEvent]:
    q = (
        db.query(OperationalLiveEvent)
        .filter(
            OperationalLiveEvent.tenant_id == int(tenant_id),
            OperationalLiveEvent.warehouse_id == int(warehouse_id),
            OperationalLiveEvent.id > int(since_id),
        )
        .order_by(OperationalLiveEvent.id.asc())
        .limit(int(limit))
    )
    return list(q.all())
