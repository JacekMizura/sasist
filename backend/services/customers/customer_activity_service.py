"""Timeline aktywności klienta — projekcja z zamówień i notatek."""

from __future__ import annotations

from typing import Any, List

from sqlalchemy.orm import Session, joinedload

from ...models.customer_crm import CustomerCrmEvent, CustomerNote
from ...models.order import Order
from .customer_note_service import _author_name, _assert_customer
from .purchase_history_service import _document_number, _status_badge


def build_customer_activity_timeline(
    db: Session,
    *,
    customer_id: int,
    tenant_id: int,
    limit: int = 80,
) -> List[dict[str, Any]]:
    _assert_customer(db, customer_id=customer_id, tenant_id=tenant_id)
    items: list[dict[str, Any]] = []

    orders = (
        db.query(Order)
        .options(joinedload(Order.order_ui_status))
        .filter(
            Order.customer_id == int(customer_id),
            Order.tenant_id == int(tenant_id),
            Order.deleted_at.is_(None),
        )
        .order_by(Order.order_date.desc(), Order.id.desc())
        .limit(limit)
        .all()
    )
    for order in orders:
        odt = order.order_date or order.created_at
        badge = _status_badge(order)
        doc_no = _document_number(order)
        items.append(
            {
                "id": f"order-{order.id}",
                "event_type": "ORDER",
                "event_label": "Zamówienie",
                "occurred_at": odt.isoformat() if odt else "",
                "operator_name": None,
                "summary": f"{doc_no} · {badge['name']}",
                "detail_path": f"/orders/{order.id}",
                "_sort": odt,
            }
        )

    crm_events = (
        db.query(CustomerCrmEvent)
        .filter(
            CustomerCrmEvent.customer_id == int(customer_id),
            CustomerCrmEvent.tenant_id == int(tenant_id),
        )
        .order_by(CustomerCrmEvent.created_at.desc())
        .limit(60)
        .all()
    )
    for ev in crm_events:
        items.append(
            {
                "id": f"crm-{ev.id}",
                "event_type": str(ev.event_type or "CRM"),
                "event_label": str(ev.event_label or "CRM"),
                "occurred_at": ev.created_at.isoformat() if ev.created_at else "",
                "operator_name": _author_name(db, ev.performed_by_user_id),
                "summary": str(ev.summary or ev.event_label or ""),
                "detail_path": None,
                "_sort": ev.created_at,
            }
        )

    notes = (
        db.query(CustomerNote)
        .filter(
            CustomerNote.customer_id == int(customer_id),
            CustomerNote.tenant_id == int(tenant_id),
            CustomerNote.deleted_at.is_(None),
        )
        .order_by(CustomerNote.created_at.desc())
        .limit(40)
        .all()
    )
    for note in notes:
        preview = (note.body or "").strip().replace("\n", " ")
        if len(preview) > 120:
            preview = preview[:117] + "…"
        items.append(
            {
                "id": f"note-{note.id}",
                "event_type": "NOTE",
                "event_label": "Notatka",
                "occurred_at": note.created_at.isoformat() if note.created_at else "",
                "operator_name": _author_name(db, note.created_by_user_id),
                "summary": preview or "Notatka",
                "detail_path": None,
                "_sort": note.created_at,
            }
        )

    items.sort(key=lambda x: x.get("_sort") or "", reverse=True)
    for row in items:
        row.pop("_sort", None)
    return items[:limit]
