"""Detailed material shortage analysis — locations, ETA, substitute proposals."""

from __future__ import annotations

import math
from datetime import date, datetime
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...models.product import Product
from ...models.product_composition import ProductComposition
from ...models.purchase_order import PurchaseOrder, PurchaseOrderItem
from ...services.composition_engine_service import effective_line_qty
from ...services.location_stock_service import build_location_stock
from ...services.purchasing_order_service import PO_CANCELLED, PO_CLOSED
from ..reservations.availability_service import warehouse_net_available
from .constants import STATUS_BLOCKED, STATUS_OK, STATUS_PARTIAL, MaterialProductionStatus
from .substitute_service import list_substitutes_for_product

OPEN_PO_STATUSES = ("Draft", "Sent", "Confirmed", "PartiallyReceived")


def _product_label(p: Product | None, pid: int) -> tuple[str, str | None]:
    if p is None:
        return f"Produkt #{pid}", None
    return str(p.name or f"Produkt #{pid}"), (p.sku or p.symbol)


def expected_availability_date(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
) -> str | None:
    row = (
        db.query(func.min(PurchaseOrder.expected_date))
        .join(PurchaseOrderItem, PurchaseOrderItem.purchase_order_id == PurchaseOrder.id)
        .filter(
            PurchaseOrder.tenant_id == int(tenant_id),
            PurchaseOrder.status.in_(OPEN_PO_STATUSES),
            PurchaseOrderItem.product_id == int(product_id),
            PurchaseOrderItem.qty > PurchaseOrderItem.received_qty,
        )
        .filter(
            (PurchaseOrder.warehouse_id == int(warehouse_id)) | (PurchaseOrder.warehouse_id.is_(None))
        )
        .scalar()
    )
    if row is None:
        return None
    if isinstance(row, datetime):
        return row.date().isoformat()
    if isinstance(row, date):
        return row.isoformat()
    return str(row)[:10]


def location_hints(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    limit: int = 5,
) -> list[dict[str, Any]]:
    snap = build_location_stock(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        product_id=int(product_id),
        available_only=True,
        pick_eligible_only=True,
    )
    rows: list[dict[str, Any]] = []
    for loc in snap.get("locations") or []:
        qty = float(loc.get("available") or 0)
        if qty <= 1e-9:
            continue
        rows.append(
            {
                "location_id": int(loc.get("location_id") or 0),
                "location_code": str(loc.get("code") or ""),
                "available_qty": round(qty, 4),
            }
        )
    rows.sort(key=lambda r: -float(r["available_qty"]))
    return rows[:limit]


def _substitute_proposals(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    missing_qty: float,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for sub in list_substitutes_for_product(db, tenant_id=tenant_id, product_id=product_id, active_only=True):
        sp = sub.substitute_product
        avail = warehouse_net_available(
            db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=int(sub.substitute_product_id)
        )
        ratio = float(sub.conversion_ratio or 1.0)
        if ratio <= 1e-9:
            continue
        effective = avail / ratio
        name, sku = _product_label(sp, int(sub.substitute_product_id))
        can_cover = effective >= missing_qty - 1e-6
        out.append(
            {
                "substitute_product_id": int(sub.substitute_product_id),
                "substitute_product_name": name,
                "substitute_product_sku": sku,
                "priority": int(sub.priority),
                "conversion_ratio": round(ratio, 6),
                "available_qty": round(avail, 4),
                "effective_qty": round(effective, 4),
                "can_cover_shortage": can_cover,
            }
        )
    return out


def analyze_component_requirements(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    component_totals: dict[int, float],
    exclude_batch_id: int | None = None,
    exclude_order_id: int | None = None,
) -> list[dict[str, Any]]:
    if not component_totals:
        return []
    pids = list(component_totals.keys())
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(pids)).all()}
    rows: list[dict[str, Any]] = []
    for pid, required in sorted(component_totals.items(), key=lambda x: x[0]):
        pid = int(pid)
        req = float(required)
        avail = warehouse_net_available(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            product_id=pid,
            exclude_batch_id=exclude_batch_id,
            exclude_order_id=exclude_order_id,
        )
        missing = max(0.0, req - avail)
        p = products.get(pid)
        name, sku = _product_label(p, pid)
        rows.append(
            {
                "component_product_id": pid,
                "product_name": name,
                "product_sku": sku,
                "required_qty": round(req, 4),
                "available_qty": round(avail, 4),
                "missing_qty": round(missing, 4),
                "locations": location_hints(db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=pid),
                "expected_availability_date": expected_availability_date(
                    db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=pid
                ),
                "substitute_proposals": _substitute_proposals(
                    db,
                    tenant_id=tenant_id,
                    warehouse_id=warehouse_id,
                    product_id=pid,
                    missing_qty=missing,
                )
                if missing > 1e-6
                else [],
            }
        )
    return rows


def analyze_composition_quantity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    composition: ProductComposition,
    planned_quantity: float,
    exclude_batch_id: int | None = None,
    exclude_order_id: int | None = None,
) -> dict[str, Any]:
    yld = float(composition.yield_quantity or 1) or 1.0
    totals: dict[int, float] = {}
    per_unit: dict[int, float] = {}
    for ln in composition.lines or []:
        per = effective_line_qty(ln, yield_qty=yld)
        if per <= 1e-9:
            continue
        pid = int(ln.component_product_id)
        per_unit[pid] = per
        totals[pid] = totals.get(pid, 0.0) + per * float(planned_quantity)

    components = analyze_component_requirements(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        component_totals=totals,
        exclude_batch_id=exclude_batch_id,
        exclude_order_id=exclude_order_id,
    )
    partial = compute_partial_production(
        planned_quantity=float(planned_quantity),
        per_unit=per_unit,
        components=components,
    )
    return {
        "planned_quantity": float(planned_quantity),
        "components": components,
        **partial,
    }


def compute_partial_production(
    *,
    planned_quantity: float,
    per_unit: dict[int, float],
    components: list[dict[str, Any]],
) -> dict[str, Any]:
    planned = max(0.0, float(planned_quantity))
    if planned <= 1e-9 or not per_unit:
        return {
            "material_status": STATUS_OK,
            "producible_now_qty": 0.0,
            "waiting_qty": 0.0,
            "has_shortages": False,
        }

    limits: list[float] = []
    has_any_shortage = False
    for comp in components:
        pid = int(comp["component_product_id"])
        per = per_unit.get(pid, 0.0)
        if per <= 1e-9:
            continue
        avail = float(comp["available_qty"])
        limits.append(avail / per)
        if float(comp["missing_qty"]) > 1e-6:
            has_any_shortage = True

    if not limits:
        return {
            "material_status": STATUS_OK,
            "producible_now_qty": planned,
            "waiting_qty": 0.0,
            "has_shortages": False,
        }

    max_full = float(math.floor(min(limits)))
    if max_full >= planned - 1e-6:
        status: MaterialProductionStatus = STATUS_OK
        producible = planned
        waiting = 0.0
    elif max_full > 0:
        status = STATUS_PARTIAL
        producible = float(max_full)
        waiting = max(0.0, planned - producible)
    else:
        status = STATUS_BLOCKED
        producible = 0.0
        waiting = planned

    return {
        "material_status": status,
        "producible_now_qty": round(producible, 4),
        "waiting_qty": round(waiting, 4),
        "has_shortages": has_any_shortage or status != STATUS_OK,
    }


def material_status_for_max_producible(*, planned: float, max_producible: float) -> MaterialProductionStatus:
    if max_producible <= 1e-6:
        return STATUS_BLOCKED
    if max_producible >= planned - 1e-6:
        return STATUS_OK
    return STATUS_PARTIAL
