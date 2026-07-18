"""
Activity Log SSOT — record once, link to many panel objects.

Writers call ``record_activity``; panel UI lists via ``list_activity_for_object``.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Sequence

from sqlalchemy.orm import Session

from ...models.activity_event import ActivityEvent, ActivityEventLink
from ...models.app_user import AppUser
from .catalog import CART_EVENT_CATEGORY, Category, ObjectType, Severity

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ActivityLinkSpec:
    object_type: ObjectType | str
    object_id: int
    role: str = "related"
    object_label: str | None = None


def _dump(meta: dict[str, Any] | None) -> str | None:
    if not meta:
        return None
    try:
        return json.dumps(meta, ensure_ascii=False, default=str)
    except Exception:
        return None


def _parse_meta(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def record_activity(
    db: Session,
    *,
    event_code: str,
    description: str,
    links: Sequence[ActivityLinkSpec],
    severity: Severity | str = "INFO",
    category: Category | str | None = None,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
    actor_user_id: int | None = None,
    occurred_at: datetime | None = None,
    source_module: str | None = None,
    correlation_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> ActivityEvent:
    """
    Persist one activity event with one or more object links.
    Dedupes links by (object_type, object_id).
    """
    if not links:
        raise ValueError("record_activity requires at least one object link")

    code = str(event_code or "").strip()[:64]
    cat = (category or CART_EVENT_CATEGORY.get(code) or "system")
    cat = str(cat).strip().lower()[:32]
    sev = str(severity or "INFO").strip().upper()[:16]
    desc = (description or code).strip()[:512]

    ev = ActivityEvent(
        tenant_id=int(tenant_id) if tenant_id is not None else None,
        warehouse_id=int(warehouse_id) if warehouse_id is not None else None,
        event_code=code,
        description=desc,
        severity=sev,
        category=cat,
        actor_user_id=int(actor_user_id) if actor_user_id and int(actor_user_id) > 0 else None,
        occurred_at=occurred_at or datetime.utcnow(),
        source_module=(str(source_module).strip()[:64] if source_module else None),
        correlation_id=(str(correlation_id).strip()[:64] if correlation_id else None),
        metadata_json=_dump(metadata),
    )
    db.add(ev)
    db.flush()

    seen: set[tuple[str, int]] = set()
    for link in links:
        ot = str(link.object_type).strip().lower()[:32]
        oid = int(link.object_id)
        if oid <= 0 or not ot:
            continue
        key = (ot, oid)
        if key in seen:
            continue
        seen.add(key)
        db.add(
            ActivityEventLink(
                event_id=int(ev.id),
                object_type=ot,
                object_id=oid,
                role=str(link.role or "related")[:24],
                object_label=(str(link.object_label).strip()[:128] if link.object_label else None),
            )
        )
    db.flush()
    logger.debug(
        "activity_log.recorded id=%s code=%s links=%s",
        int(ev.id),
        code,
        len(seen),
    )
    return ev


def record_from_cart_lifecycle(
    db: Session,
    *,
    cart_id: int,
    tenant_id: int,
    warehouse_id: int,
    event_code: str,
    description: str,
    severity: str,
    operator_user_id: int | None,
    occurred_at: datetime | None,
    order_id: int | None = None,
    basket_id: int | None = None,
    session_id: int | None = None,
    batch_id: int | None = None,
    metadata: dict[str, Any] | None = None,
    cart_label: str | None = None,
    order_label: str | None = None,
    basket_label: str | None = None,
) -> ActivityEvent | None:
    """Bridge CartLifecycleService → shared Activity Log (multi-link)."""
    links: list[ActivityLinkSpec] = [
        ActivityLinkSpec(
            object_type="cart",
            object_id=int(cart_id),
            role="primary",
            object_label=cart_label,
        )
    ]
    if order_id is not None and int(order_id) > 0:
        links.append(
            ActivityLinkSpec(
                object_type="order",
                object_id=int(order_id),
                role="related",
                object_label=order_label or f"#{int(order_id)}",
            )
        )
    if basket_id is not None and int(basket_id) > 0:
        links.append(
            ActivityLinkSpec(
                object_type="basket",
                object_id=int(basket_id),
                role="related",
                object_label=basket_label,
            )
        )
    meta = dict(metadata or {})
    if session_id is not None:
        meta.setdefault("session_id", int(session_id))
    if batch_id is not None:
        meta.setdefault("batch_id", int(batch_id))
    meta["source"] = "cart_lifecycle"
    return record_activity(
        db,
        event_code=event_code,
        description=description,
        links=links,
        severity=severity,
        category=CART_EVENT_CATEGORY.get(str(event_code), "system"),
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        actor_user_id=operator_user_id,
        occurred_at=occurred_at,
        source_module="cart_lifecycle",
        metadata=meta,
    )


@dataclass
class ActivityListFilters:
    severities: Sequence[str] | None = None
    categories: Sequence[str] | None = None
    event_codes: Sequence[str] | None = None
    actor_user_id: int | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    limit: int = 100


def list_activity_for_object(
    db: Session,
    *,
    object_type: str,
    object_id: int,
    filters: ActivityListFilters | None = None,
) -> list[dict[str, Any]]:
    """
    Timeline for one panel object. Supports filter architecture (severity/category/…).
    """
    f = filters or ActivityListFilters()
    ot = str(object_type).strip().lower()
    oid = int(object_id)

    q = (
        db.query(ActivityEvent, ActivityEventLink)
        .join(ActivityEventLink, ActivityEventLink.event_id == ActivityEvent.id)
        .filter(
            ActivityEventLink.object_type == ot,
            ActivityEventLink.object_id == oid,
        )
    )
    if f.severities:
        q = q.filter(ActivityEvent.severity.in_([str(s).upper() for s in f.severities]))
    if f.categories:
        q = q.filter(ActivityEvent.category.in_([str(c).lower() for c in f.categories]))
    if f.event_codes:
        q = q.filter(ActivityEvent.event_code.in_([str(c) for c in f.event_codes]))
    if f.actor_user_id is not None:
        q = q.filter(ActivityEvent.actor_user_id == int(f.actor_user_id))
    if f.date_from is not None:
        q = q.filter(ActivityEvent.occurred_at >= f.date_from)
    if f.date_to is not None:
        q = q.filter(ActivityEvent.occurred_at <= f.date_to)

    rows = (
        q.order_by(ActivityEvent.occurred_at.desc(), ActivityEvent.id.desc())
        .limit(max(1, min(int(f.limit or 100), 500)))
        .all()
    )
    if not rows:
        return []

    event_ids = [int(ev.id) for ev, _ in rows]
    all_links = (
        db.query(ActivityEventLink)
        .filter(ActivityEventLink.event_id.in_(event_ids))
        .all()
    )
    links_by_event: dict[int, list[ActivityEventLink]] = {}
    for ln in all_links:
        links_by_event.setdefault(int(ln.event_id), []).append(ln)

    actor_ids = {int(ev.actor_user_id) for ev, _ in rows if ev.actor_user_id}
    actors: dict[int, AppUser] = {}
    if actor_ids:
        for u in db.query(AppUser).filter(AppUser.id.in_(list(actor_ids))).all():
            actors[int(u.id)] = u

    out: list[dict[str, Any]] = []
    for ev, _focus in rows:
        actor = actors.get(int(ev.actor_user_id)) if ev.actor_user_id else None
        name = None
        if actor is not None:
            name = (
                getattr(actor, "display_name", None)
                or getattr(actor, "full_name", None)
                or getattr(actor, "name", None)
                or getattr(actor, "email", None)
            )
        meta = _parse_meta(getattr(ev, "metadata_json", None))
        link_items = []
        for ln in links_by_event.get(int(ev.id), []):
            link_items.append(
                {
                    "object_type": ln.object_type,
                    "object_id": int(ln.object_id),
                    "role": ln.role,
                    "object_label": ln.object_label,
                    "href": _href_for(ln.object_type, int(ln.object_id)),
                }
            )
        out.append(
            {
                "id": int(ev.id),
                "event_code": ev.event_code,
                "description": ev.description,
                "severity": ev.severity,
                "category": ev.category,
                "occurred_at": ev.occurred_at.isoformat(sep=" ", timespec="seconds")
                if ev.occurred_at
                else None,
                "actor_user_id": int(ev.actor_user_id) if ev.actor_user_id else None,
                "actor_name": name,
                "source_module": ev.source_module,
                "metadata": meta,
                "links": link_items,
            }
        )
    return out


def _href_for(object_type: str, object_id: int) -> str | None:
    ot = str(object_type).lower()
    if ot == "order":
        return f"/orders/{object_id}"
    if ot == "cart":
        return f"/carts/{object_id}"
    if ot == "rack":
        return f"/carts/racks/{object_id}"
    if ot == "carrier":
        return f"/carts/carriers/{object_id}"
    if ot == "product":
        return f"/products/{object_id}"
    return None
