"""Thin domain wrapper over Activity Log SSOT (one event, many links)."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from ...models.activity_event import ActivityEvent
from .domain_event_codes import DOMAIN_EVENT_TITLES_PL
from .service import ActivityLinkSpec, record_activity

logger = logging.getLogger(__name__)


def _safe_int(v: Any) -> Optional[int]:
    if v is None:
        return None
    try:
        i = int(v)
    except (TypeError, ValueError):
        return None
    return i if i > 0 else None


def find_activity_by_correlation(
    db: Session,
    *,
    correlation_id: str,
    tenant_id: Optional[int] = None,
) -> Optional[ActivityEvent]:
    cid = str(correlation_id or "").strip()[:64]
    if not cid:
        return None
    q = db.query(ActivityEvent).filter(ActivityEvent.correlation_id == cid)
    tid = _safe_int(tenant_id)
    if tid is not None:
        q = q.filter(ActivityEvent.tenant_id == tid)
    return q.order_by(ActivityEvent.id.desc()).first()


def record_domain_activity(
    db: Session,
    *,
    tenant_id: int,
    event_type: str,
    description: Optional[str] = None,
    actor_user_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    order_id: Optional[int] = None,
    rmz_id: Optional[int] = None,
    complaint_id: Optional[int] = None,
    product_id: Optional[int] = None,
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    stock_document_id: Optional[int] = None,
    metadata: Optional[dict[str, Any]] = None,
    correlation_id: Optional[str] = None,
    severity: str = "INFO",
    category: str = "system",
    source_module: str = "domain",
    order_label: Optional[str] = None,
    rmz_label: Optional[str] = None,
    complaint_label: Optional[str] = None,
    product_label: Optional[str] = None,
    document_label: Optional[str] = None,
    production_label: Optional[str] = None,
    occurred_at: Optional[datetime] = None,
) -> Optional[ActivityEvent]:
    """
    Record one ActivityEvent and link to order / return / complaint / product / document / production.

    Idempotent when ``correlation_id`` is set — returns existing event on retry.
    Failures are swallowed (SAVEPOINT) so domain flows never break on audit.
    """
    code = str(event_type or "").strip()[:64]
    if not code:
        return None

    cid = str(correlation_id or "").strip()[:64] or None
    tid = int(tenant_id)

    try:
        nested = db.begin_nested()
    except Exception:
        nested = None

    try:
        if cid:
            existing = find_activity_by_correlation(db, correlation_id=cid, tenant_id=tid)
            if existing is not None:
                if nested is not None:
                    nested.commit()
                return existing

        links: list[ActivityLinkSpec] = []
        oid = _safe_int(order_id)
        rid = _safe_int(rmz_id)
        comp_id = _safe_int(complaint_id)
        pid = _safe_int(product_id)
        doc_id = _safe_int(stock_document_id)
        mo_id = _safe_int(production_order_id)
        bat_id = _safe_int(batch_id)

        if rid is not None:
            links.append(
                ActivityLinkSpec(
                    object_type="return",
                    object_id=rid,
                    role="primary",
                    object_label=rmz_label or f"RMZ #{rid}",
                )
            )
        if comp_id is not None:
            links.append(
                ActivityLinkSpec(
                    object_type="complaint",
                    object_id=comp_id,
                    role="primary",
                    object_label=complaint_label or f"#{comp_id}",
                )
            )
        if oid is not None:
            links.append(
                ActivityLinkSpec(
                    object_type="order",
                    object_id=oid,
                    role="related" if (rid is not None or comp_id is not None) else "primary",
                    object_label=order_label or f"#{oid}",
                )
            )
        if pid is not None:
            links.append(
                ActivityLinkSpec(
                    object_type="product",
                    object_id=pid,
                    role="related",
                    object_label=product_label,
                )
            )
        if doc_id is not None:
            links.append(
                ActivityLinkSpec(
                    object_type="document",
                    object_id=doc_id,
                    role="related",
                    object_label=document_label,
                )
            )
        prod_oid = mo_id or bat_id
        if prod_oid is not None:
            links.append(
                ActivityLinkSpec(
                    object_type="production",
                    object_id=prod_oid,
                    role="related" if (rid or oid or comp_id) else "primary",
                    object_label=production_label,
                )
            )

        if not links:
            if nested is not None:
                nested.rollback()
            logger.warning("domain_activity skipped — no links event=%s", code)
            return None

        meta = dict(metadata or {})
        if actor_user_id is None:
            meta.setdefault("actor_type", "SYSTEM")
        if rid is not None:
            meta.setdefault("rmz_id", rid)
        if comp_id is not None:
            meta.setdefault("complaint_id", comp_id)
        if oid is not None:
            meta.setdefault("order_id", oid)
        if pid is not None:
            meta.setdefault("product_id", pid)
        if doc_id is not None:
            meta.setdefault("stock_document_id", doc_id)
        if mo_id is not None:
            meta.setdefault("production_order_id", mo_id)
        if bat_id is not None:
            meta.setdefault("batch_id", bat_id)

        title = (description or DOMAIN_EVENT_TITLES_PL.get(code) or code).strip()
        ev = record_activity(
            db,
            event_code=code,
            description=title,
            links=links,
            severity=severity,
            category=category,
            tenant_id=tid,
            warehouse_id=_safe_int(warehouse_id),
            actor_user_id=_safe_int(actor_user_id),
            occurred_at=occurred_at,
            source_module=source_module[:64],
            correlation_id=cid,
            metadata=meta,
        )
        if nested is not None:
            nested.commit()
        return ev
    except Exception:
        if nested is not None:
            try:
                nested.rollback()
            except Exception:
                pass
        logger.exception(
            "domain_activity failed event=%s correlation=%s tenant=%s",
            code,
            cid,
            tid,
        )
        return None
