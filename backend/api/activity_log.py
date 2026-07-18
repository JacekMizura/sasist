"""Panel Activity Log API — shared object history."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.activity_log import ActivityListFilters, list_activity_for_object
from ..services.activity_log.presentation import enrich_activity_item

router = APIRouter(prefix="/activity-log", tags=["activity-log"])

_ALLOWED_OBJECT_TYPES = {
    "cart",
    "order",
    "basket",
    "rack",
    "carrier",
    "product",
    "operator",
    "document",
    "return",
    "production",
}


class ActivityLinkOut(BaseModel):
    object_type: str
    object_id: int
    role: str | None = None
    object_label: str | None = None
    href: str | None = None


class ActivityDetailRowOut(BaseModel):
    label: str
    value: str


class ActivityEventOut(BaseModel):
    """Ready-to-display Activity Log entry — FE must not translate."""

    id: int
    event_code: str
    description: str
    action: str = ""
    severity: str
    category: str
    occurred_at: str | None = None
    occurred_at_display: str = "—"
    actor_user_id: int | None = None
    actor_name: str | None = None
    operator_display: str = "System"
    source_module: str | None = None
    metadata: dict = Field(default_factory=dict)
    details: list[ActivityDetailRowOut] = Field(default_factory=list)
    order_numbers: list[str] = Field(default_factory=list)
    links: list[ActivityLinkOut] = Field(default_factory=list)


class ActivityLogListOut(BaseModel):
    object_type: str
    object_id: int
    items: list[ActivityEventOut]


@router.get("", response_model=ActivityLogListOut)
def get_activity_log(
    object_type: str = Query(..., min_length=2, max_length=32),
    object_id: int = Query(..., ge=1),
    limit: int = Query(100, ge=1, le=500),
    severity: str | None = Query(None, description="Comma-separated: INFO,SUCCESS,WARNING,ERROR,AUDIT"),
    category: str | None = Query(None, description="Comma-separated: picking,packing,status,…"),
    actor_user_id: int | None = Query(None, ge=1),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    db: Session = Depends(get_db),
):
    ot = object_type.strip().lower()
    if ot not in _ALLOWED_OBJECT_TYPES:
        raise HTTPException(status_code=400, detail="Nieobsługiwany typ obiektu.")

    severities = [s.strip().upper() for s in (severity or "").split(",") if s.strip()] or None
    categories = [c.strip().lower() for c in (category or "").split(",") if c.strip()] or None

    items = list_activity_for_object(
        db,
        object_type=ot,
        object_id=int(object_id),
        filters=ActivityListFilters(
            severities=severities,
            categories=categories,
            actor_user_id=actor_user_id,
            date_from=date_from,
            date_to=date_to,
            limit=limit,
        ),
    )

    # Legacy fallback for carts / orders until fully dual-written
    if not items and ot == "cart":
        items = _legacy_cart_events(db, cart_id=int(object_id), limit=limit)
    elif not items and ot == "order":
        items = _legacy_order_events(db, order_id=int(object_id), limit=limit)

    return ActivityLogListOut(
        object_type=ot,
        object_id=int(object_id),
        items=[ActivityEventOut(**it) for it in items],
    )


def _legacy_cart_events(db: Session, *, cart_id: int, limit: int) -> list[dict]:
    from ..models.cart_lifecycle_event import CartLifecycleEvent
    from ..models.app_user import AppUser
    from ..services.activity_log.catalog import CART_EVENT_CATEGORY
    from ..services.activity_log.service import _href_for

    rows = (
        db.query(CartLifecycleEvent)
        .filter(CartLifecycleEvent.cart_id == int(cart_id))
        .order_by(CartLifecycleEvent.occurred_at.desc(), CartLifecycleEvent.id.desc())
        .limit(limit)
        .all()
    )
    actor_ids = {int(r.operator_user_id) for r in rows if r.operator_user_id}
    actors = {}
    if actor_ids:
        for u in db.query(AppUser).filter(AppUser.id.in_(list(actor_ids))).all():
            actors[int(u.id)] = u
    out = []
    for r in rows:
        actor = actors.get(int(r.operator_user_id)) if r.operator_user_id else None
        name = None
        if actor is not None:
            name = (
                getattr(actor, "display_name", None)
                or getattr(actor, "full_name", None)
                or getattr(actor, "email", None)
            )
        meta = {}
        raw_meta = getattr(r, "metadata_json", None)
        if raw_meta:
            try:
                import json

                parsed = json.loads(raw_meta) if isinstance(raw_meta, str) else raw_meta
                if isinstance(parsed, dict):
                    meta = parsed
            except Exception:
                meta = {}
        links = [
            {
                "object_type": "cart",
                "object_id": int(cart_id),
                "role": "primary",
                "object_label": None,
                "href": _href_for("cart", int(cart_id)),
            }
        ]
        if r.order_id:
            links.append(
                {
                    "object_type": "order",
                    "object_id": int(r.order_id),
                    "role": "related",
                    "object_label": f"#{int(r.order_id)}",
                    "href": _href_for("order", int(r.order_id)),
                }
            )
        out.append(
            enrich_activity_item(
                {
                    "id": int(r.id),
                    "event_code": r.event_code,
                    "description": r.description,
                    "severity": r.severity,
                    "category": CART_EVENT_CATEGORY.get(r.event_code, "system"),
                    "occurred_at": r.occurred_at.isoformat(sep=" ", timespec="seconds")
                    if r.occurred_at
                    else None,
                    "actor_user_id": int(r.operator_user_id) if r.operator_user_id else None,
                    "actor_name": name,
                    "source_module": "cart_lifecycle",
                    "metadata": meta,
                    "links": links,
                }
            )
        )
    return out


def _legacy_order_events(db: Session, *, order_id: int, limit: int) -> list[dict]:
    from ..models.order_activity_log import OrderActivityLog
    from ..services.activity_log.service import _href_for

    rows = (
        db.query(OrderActivityLog)
        .filter(OrderActivityLog.order_id == int(order_id))
        .order_by(OrderActivityLog.created_at.desc(), OrderActivityLog.id.desc())
        .limit(limit)
        .all()
    )
    out = []
    for r in rows:
        raw = getattr(r, "message", None) or "Zdarzenie zamówienia"
        desc = str(raw)[:512]
        out.append(
            enrich_activity_item(
                {
                    "id": int(r.id),
                    "event_code": str(getattr(r, "event_type", None) or "order_activity")[:64],
                    "description": desc,
                    "severity": "INFO",
                    "category": "status",
                    "occurred_at": r.created_at.isoformat(sep=" ", timespec="seconds")
                    if getattr(r, "created_at", None)
                    else None,
                    "actor_user_id": None,
                    "actor_name": None,
                    "source_module": "order_activity",
                    "metadata": {},
                    "links": [
                        {
                            "object_type": "order",
                            "object_id": int(order_id),
                            "role": "primary",
                            "object_label": f"#{int(order_id)}",
                            "href": _href_for("order", int(order_id)),
                        }
                    ],
                }
            )
        )
    return out
