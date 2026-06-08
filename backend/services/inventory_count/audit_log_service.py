"""List immutable inventory audit events for compliance viewer."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session, aliased

from ...models.app_user import AppUser
from ...models.inventory_count.approval import InventoryApproval
from ...models.inventory_count.audit_event import InventoryAuditEvent
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.inventory_count.recount import InventoryRecount
from ...models.location import Location
from ...models.product import Product
from .errors import InventoryDocumentNotFoundError


def _operator_name(user: AppUser | None) -> str | None:
    if user is None:
        return None
    parts = [str(getattr(user, "first_name", "") or "").strip(), str(getattr(user, "last_name", "") or "").strip()]
    name = " ".join(p for p in parts if p)
    return name or str(getattr(user, "login", "") or "") or None


def _line_context(line: InventoryDocumentLine | None, product: Product | None, loc: Location | None) -> dict[str, Any] | None:
    if line is None:
        return None
    return {
        "line_id": int(line.id),
        "product_id": line.product_id,
        "product_name": getattr(product, "name", None) if product else None,
        "sku": getattr(product, "sku", None) if product else None,
        "ean": getattr(product, "ean", None) if product else None,
        "product_image_url": getattr(product, "image_url", None) if product else None,
        "location_id": line.location_id,
        "location_name": (loc.name or "").strip() if loc else None,
    }


def _load_audit_enrichment(db: Session, rows: list[InventoryAuditEvent]) -> tuple[dict[int, str], dict[int, dict[str, Any]], dict[int, str]]:
    user_ids: set[int] = set()
    line_ids: set[int] = set()
    location_ids: set[int] = set()

    for row in rows:
        if row.user_id is not None:
            user_ids.add(int(row.user_id))
        if row.inventory_document_line_id is not None:
            line_ids.add(int(row.inventory_document_line_id))
        if row.entity_type == "location" and row.entity_id is not None:
            location_ids.add(int(row.entity_id))

    users: dict[int, str] = {}
    if user_ids:
        for user in db.query(AppUser).filter(AppUser.id.in_(user_ids)).all():
            name = _operator_name(user)
            if name:
                users[int(user.id)] = name

    lines: dict[int, dict[str, Any]] = {}
    if line_ids:
        q = (
            db.query(InventoryDocumentLine, Product, Location)
            .outerjoin(Product, Product.id == InventoryDocumentLine.product_id)
            .outerjoin(Location, Location.id == InventoryDocumentLine.location_id)
            .filter(InventoryDocumentLine.id.in_(line_ids))
        )
        for line, product, loc in q.all():
            ctx = _line_context(line, product, loc)
            if ctx:
                lines[int(line.id)] = ctx

    locations: dict[int, str] = {}
    if location_ids:
        for loc in db.query(Location).filter(Location.id.in_(location_ids)).all():
            code = (loc.name or "").strip() or f"#{loc.id}"
            locations[int(loc.id)] = code

    return users, lines, locations


def list_document_audit_log(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
    offset: int = 0,
    limit: int = 200,
) -> dict[str, Any]:
    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(document_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise InventoryDocumentNotFoundError(f"Document {document_id} not found")

    q = db.query(InventoryAuditEvent).filter(
        InventoryAuditEvent.inventory_document_id == int(document_id),
        InventoryAuditEvent.tenant_id == int(tenant_id),
    )
    total = q.count()
    rows = q.order_by(InventoryAuditEvent.id.asc()).offset(max(0, offset)).limit(min(limit, 1000)).all()
    users, lines, locations = _load_audit_enrichment(db, rows)
    items = [_audit_row_dict(r, users=users, lines=lines, locations=locations) for r in rows]
    return {"items": items, "total": total, "offset": offset, "limit": limit}


def get_document_timelines(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
) -> dict[str, Any]:
    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(document_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise InventoryDocumentNotFoundError(f"Document {document_id} not found")

    ApprovalUser = aliased(AppUser)
    Assignee = aliased(AppUser)
    Completer = aliased(AppUser)

    approvals = (
        db.query(InventoryApproval, ApprovalUser)
        .outerjoin(ApprovalUser, ApprovalUser.id == InventoryApproval.user_id)
        .filter(InventoryApproval.inventory_document_id == int(document_id))
        .order_by(InventoryApproval.id.asc())
        .all()
    )
    recounts = (
        db.query(InventoryRecount, InventoryDocumentLine, Product, Location, Assignee, Completer)
        .join(InventoryDocumentLine, InventoryDocumentLine.id == InventoryRecount.inventory_document_line_id)
        .outerjoin(Product, Product.id == InventoryDocumentLine.product_id)
        .outerjoin(Location, Location.id == InventoryDocumentLine.location_id)
        .outerjoin(Assignee, Assignee.id == InventoryRecount.assigned_user_id)
        .outerjoin(Completer, Completer.id == InventoryRecount.completed_by_user_id)
        .filter(InventoryRecount.inventory_document_id == int(document_id))
        .order_by(InventoryRecount.id.asc())
        .all()
    )
    posting_events = (
        db.query(InventoryAuditEvent)
        .filter(
            InventoryAuditEvent.inventory_document_id == int(document_id),
            InventoryAuditEvent.action.in_(("document.posted", "adjustment.generated")),
        )
        .order_by(InventoryAuditEvent.id.asc())
        .limit(500)
        .all()
    )
    users, lines, locations = _load_audit_enrichment(db, posting_events)
    return {
        "document_id": document_id,
        "approval_timeline": [
            {
                "id": a.id,
                "action": a.action,
                "user_id": a.user_id,
                "user_name": _operator_name(user),
                "notes": a.notes,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a, user in approvals
        ],
        "recount_timeline": [
            {
                "id": r.id,
                "status": r.status,
                "line_id": r.inventory_document_line_id,
                "assigned_user_id": r.assigned_user_id,
                "assigned_user_name": _operator_name(assignee),
                "completed_by_user_name": _operator_name(completer),
                "reason": r.reason,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
                "line_context": _line_context(line, product, loc),
            }
            for r, line, product, loc, assignee, completer in recounts
        ],
        "posting_timeline": [
            _audit_row_dict(e, users=users, lines=lines, locations=locations) for e in posting_events
        ],
    }


def _parse_json_field(raw: str | None) -> dict[str, Any] | list[Any] | str | None:
    if not raw:
        return None
    try:
        return json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        return None


def _audit_row_dict(
    row: InventoryAuditEvent,
    *,
    users: dict[int, str] | None = None,
    lines: dict[int, dict[str, Any]] | None = None,
    locations: dict[int, str] | None = None,
) -> dict[str, Any]:
    users = users or {}
    lines = lines or {}
    locations = locations or {}

    detail = _parse_json_field(row.detail_json)
    prev = _parse_json_field(row.previous_state_json)
    nxt = _parse_json_field(row.next_state_json)

    line_ctx = None
    if row.inventory_document_line_id is not None:
        line_ctx = lines.get(int(row.inventory_document_line_id))

    location_name = None
    if row.entity_type == "location" and row.entity_id is not None:
        location_name = locations.get(int(row.entity_id))

    user_name = users.get(int(row.user_id)) if row.user_id is not None else None

    return {
        "id": row.id,
        "action": row.action,
        "user_id": row.user_id,
        "user_name": user_name,
        "inventory_document_line_id": row.inventory_document_line_id,
        "session_id": row.session_id,
        "device_id": row.device_id,
        "ip_address": row.ip_address,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "detail": detail if isinstance(detail, dict) else ({"value": detail} if detail is not None else None),
        "previous_state": prev if isinstance(prev, dict) else None,
        "next_state": nxt if isinstance(nxt, dict) else None,
        "line_context": line_ctx,
        "location_name": location_name,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
