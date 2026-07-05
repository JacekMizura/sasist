"""Production material need lifecycle — closure after warehouse receipt (§4)."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.product_material_substitute import ProductionMaterialNeed
from ..reservations.availability_service import warehouse_net_available
from .constants import NEED_STATUS_CANCELLED, NEED_STATUS_FULFILLED, NEED_STATUS_LINKED, NEED_STATUS_OPEN, NEED_STATUS_PARTIAL

EVENT_CREATED = "created"
EVENT_PARTIAL = "partially_covered"
EVENT_CLOSED = "closed"
EVENT_CANCELLED = "cancelled"
EVENT_RECEIPT = "receipt_sync"


def _append_event(need: ProductionMaterialNeed, event_type: str, *, detail: dict[str, Any] | None = None) -> None:
    history: list[dict[str, Any]] = []
    raw = getattr(need, "history_json", None)
    if raw:
        try:
            history = json.loads(str(raw))
        except json.JSONDecodeError:
            history = []
    history.append(
        {
            "event": event_type,
            "at": datetime.utcnow().isoformat(),
            "status": str(need.status),
            "covered_qty": float(getattr(need, "covered_qty", 0) or 0),
            "detail": detail or {},
        }
    )
    need.history_json = json.dumps(history[-50:], ensure_ascii=False)
    need.updated_at = datetime.utcnow()


def reconcile_material_need(db: Session, need: ProductionMaterialNeed) -> str:
    """Re-evaluate single need from current warehouse stock. Returns new status."""
    if str(need.status) in (NEED_STATUS_FULFILLED, NEED_STATUS_CANCELLED):
        return str(need.status)

    avail = warehouse_net_available(
        db,
        tenant_id=int(need.tenant_id),
        warehouse_id=int(need.warehouse_id),
        product_id=int(need.component_product_id),
    )
    required = float(need.shortage_qty or 0)
    prev_status = str(need.status)
    prev_covered = float(getattr(need, "covered_qty", 0) or 0)

    if avail >= required - 1e-6:
        need.covered_qty = round(required, 4)
        need.status = NEED_STATUS_FULFILLED
        if prev_status != NEED_STATUS_FULFILLED:
            _append_event(need, EVENT_CLOSED, detail={"available_qty": avail, "required_qty": required})
    elif avail > 1e-6:
        need.covered_qty = round(min(avail, required), 4)
        need.status = NEED_STATUS_PARTIAL
        if prev_status != NEED_STATUS_PARTIAL or abs(prev_covered - need.covered_qty) > 1e-6:
            _append_event(
                need,
                EVENT_PARTIAL,
                detail={"available_qty": avail, "required_qty": required, "covered_qty": need.covered_qty},
            )
    else:
        need.covered_qty = 0.0
        need.status = NEED_STATUS_OPEN if prev_status == NEED_STATUS_OPEN else NEED_STATUS_LINKED

    need.updated_at = datetime.utcnow()
    return str(need.status)


def reconcile_material_needs_for_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    component_product_id: int,
) -> int:
    rows = (
        db.query(ProductionMaterialNeed)
        .filter(
            ProductionMaterialNeed.tenant_id == int(tenant_id),
            ProductionMaterialNeed.warehouse_id == int(warehouse_id),
            ProductionMaterialNeed.component_product_id == int(component_product_id),
            ProductionMaterialNeed.status.in_((NEED_STATUS_OPEN, NEED_STATUS_LINKED, NEED_STATUS_PARTIAL)),
        )
        .all()
    )
    for row in rows:
        reconcile_material_need(db, row)
    return len(rows)


def reconcile_material_needs_for_purchase_order(
    db: Session,
    *,
    tenant_id: int,
    purchase_order_id: int,
) -> int:
    rows = (
        db.query(ProductionMaterialNeed)
        .filter(
            ProductionMaterialNeed.tenant_id == int(tenant_id),
            ProductionMaterialNeed.purchase_order_id == int(purchase_order_id),
            ProductionMaterialNeed.status.in_((NEED_STATUS_OPEN, NEED_STATUS_LINKED, NEED_STATUS_PARTIAL)),
        )
        .all()
    )
    touched = 0
    for row in rows:
        reconcile_material_need(db, row)
        touched += 1
    if touched:
        for row in rows:
            _append_event(row, EVENT_RECEIPT, detail={"purchase_order_id": int(purchase_order_id)})
    return touched


def record_need_created(need: ProductionMaterialNeed) -> None:
    _append_event(need, EVENT_CREATED, detail={"shortage_qty": float(need.shortage_qty or 0)})


def list_material_needs(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None = None,
    status: str | None = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    q = (
        db.query(ProductionMaterialNeed)
        .filter(ProductionMaterialNeed.tenant_id == int(tenant_id))
        .order_by(ProductionMaterialNeed.updated_at.desc())
    )
    if warehouse_id is not None:
        q = q.filter(ProductionMaterialNeed.warehouse_id == int(warehouse_id))
    if status:
        q = q.filter(ProductionMaterialNeed.status == str(status).strip().lower())
    rows = q.limit(max(1, min(int(limit), 500))).all()

    from ...models.product import Product

    product_ids = {int(r.component_product_id) for r in rows}
    products = (
        {p.id: p for p in db.query(Product).filter(Product.id.in_(product_ids)).all()} if product_ids else {}
    )

    out: list[dict[str, Any]] = []
    for row in rows:
        p = products.get(int(row.component_product_id))
        history: list[dict[str, Any]] = []
        raw = getattr(row, "history_json", None)
        if raw:
            try:
                history = json.loads(str(raw))
            except json.JSONDecodeError:
                history = []
        out.append(
            {
                "id": int(row.id),
                "warehouse_id": int(row.warehouse_id),
                "component_product_id": int(row.component_product_id),
                "product_name": str(getattr(p, "name", None) or f"Produkt"),
                "product_sku": getattr(p, "sku", None) or getattr(p, "symbol", None),
                "product_image_url": getattr(p, "image_url", None),
                "shortage_qty": float(row.shortage_qty or 0),
                "covered_qty": float(getattr(row, "covered_qty", 0) or 0),
                "status": str(row.status),
                "purchase_order_id": int(row.purchase_order_id) if row.purchase_order_id else None,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
                "history": history,
            }
        )
    return out
