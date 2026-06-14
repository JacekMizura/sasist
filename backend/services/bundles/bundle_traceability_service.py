"""P4.16 — Bundle lot traceability queries (A–D)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session, joinedload

from ...models.bundle import Bundle
from ...models.order import Order
from ...models.order_line_bundle_component import OrderLineBundleComponent
from ...models.order_line_bundle_component_lot import OrderLineBundleComponentLot
from ...models.product import Product
from .bundle_lot_snapshot_service import lots_for_snapshot
from .bundle_line_resolver import bundle_line_resolver


@dataclass(frozen=True)
class LotTraceBundleHit:
    bundle_id: int
    bundle_name: str
    order_id: int
    order_number: str
    parent_order_line_id: int
    product_id: int
    product_name: str
    picked_qty: float
    lot_number: str
    expiry_date: Optional[str]


@dataclass(frozen=True)
class LotTraceCustomerHit:
    order_id: int
    order_number: str
    customer_name: str
    customer_email: Optional[str]
    customer_phone: Optional[str]
    lot_number: str
    bundle_name: str
    product_name: str
    picked_qty: float


@dataclass(frozen=True)
class BundleLotComponentNode:
    snapshot_id: int
    product_id: int
    product_name: str
    lots: tuple[dict, ...]


@dataclass(frozen=True)
class BundleLotTreeNode:
    bundle_id: int
    bundle_name: str
    parent_order_line_id: int
    fulfillment_mode: str
    components: tuple[BundleLotComponentNode, ...]


def _customer_from_order(order: Order) -> tuple[str, Optional[str], Optional[str]]:
    name = ""
    email: Optional[str] = None
    phone: Optional[str] = None
    if order.customer is not None:
        c = order.customer
        name = str(getattr(c, "name", None) or getattr(c, "company_name", None) or "").strip()
        email = str(getattr(c, "email", None) or "").strip() or None
        phone = str(getattr(c, "phone", None) or "").strip() or None
    if not name:
        raw = getattr(order, "addresses_json", None)
        if raw:
            try:
                data = json.loads(raw) if isinstance(raw, str) else raw
                ship = data.get("shipping") if isinstance(data, dict) else None
                if isinstance(ship, dict):
                    name = str(ship.get("name") or ship.get("company") or "").strip()
                    email = email or (str(ship.get("email") or "").strip() or None)
                    phone = phone or (str(ship.get("phone") or "").strip() or None)
            except (json.JSONDecodeError, TypeError):
                pass
    return name or f"Zamówienie #{order.number or order.id}", email, phone


def _lot_rows_for_number(db: Session, lot_number: str, *, tenant_id: int | None = None) -> list[OrderLineBundleComponentLot]:
    ln = (lot_number or "").strip()
    if not ln:
        return []
    q = (
        db.query(OrderLineBundleComponentLot)
        .filter(OrderLineBundleComponentLot.lot_number == ln)
        .options(
            joinedload(OrderLineBundleComponentLot.snapshot),
            joinedload(OrderLineBundleComponentLot.order),
            joinedload(OrderLineBundleComponentLot.product),
        )
    )
    if tenant_id is not None:
        q = q.join(Order, Order.id == OrderLineBundleComponentLot.order_id).filter(Order.tenant_id == int(tenant_id))
    return q.order_by(OrderLineBundleComponentLot.picked_at.desc()).all()


def lot_to_bundles(db: Session, lot_number: str, *, tenant_id: int | None = None) -> list[LotTraceBundleHit]:
    """A) Partia → jakie bundle zawierały tę partię."""
    hits: list[LotTraceBundleHit] = []
    seen: set[tuple[int, int, int]] = set()
    for row in _lot_rows_for_number(db, lot_number, tenant_id=tenant_id):
        snap = row.snapshot
        if snap is None or snap.bundle_id is None:
            continue
        bundle = db.query(Bundle).filter(Bundle.id == int(snap.bundle_id)).first()
        bundle_name = str(bundle.name if bundle else "Zestaw")
        order = row.order
        order_number = str(order.number if order else f"#{row.order_id}")
        key = (int(snap.bundle_id), int(row.order_id), int(row.product_id or 0))
        if key in seen:
            continue
        seen.add(key)
        pname = str(row.product.name if row.product else f"P{row.product_id}")
        hits.append(
            LotTraceBundleHit(
                bundle_id=int(snap.bundle_id),
                bundle_name=bundle_name,
                order_id=int(row.order_id),
                order_number=order_number,
                parent_order_line_id=int(row.order_line_id),
                product_id=int(row.product_id or 0),
                product_name=pname,
                picked_qty=float(row.picked_qty or 0),
                lot_number=str(row.lot_number or ""),
                expiry_date=row.expiry_date.isoformat() if row.expiry_date else None,
            )
        )
    return hits


def lot_to_orders(db: Session, lot_number: str, *, tenant_id: int | None = None) -> list[dict]:
    """B) Partia → jakie zamówienia."""
    order_ids: set[int] = set()
    out: list[dict] = []
    for row in _lot_rows_for_number(db, lot_number, tenant_id=tenant_id):
        oid = int(row.order_id)
        if oid in order_ids:
            continue
        order_ids.add(oid)
        order = row.order or db.query(Order).filter(Order.id == oid).first()
        out.append(
            {
                "order_id": oid,
                "order_number": str(order.number if order else f"#{oid}"),
                "picked_qty_total": sum(
                    float(r.picked_qty or 0)
                    for r in _lot_rows_for_number(db, lot_number, tenant_id=tenant_id)
                    if int(r.order_id) == oid
                ),
            }
        )
    return out


def lot_to_customers(db: Session, lot_number: str, *, tenant_id: int | None = None) -> list[LotTraceCustomerHit]:
    """C) Partia → którzy klienci."""
    hits: list[LotTraceCustomerHit] = []
    seen_orders: set[int] = set()
    for row in _lot_rows_for_number(db, lot_number, tenant_id=tenant_id):
        oid = int(row.order_id)
        if oid in seen_orders:
            continue
        seen_orders.add(oid)
        order = (
            db.query(Order)
            .options(joinedload(Order.customer))
            .filter(Order.id == oid)
            .first()
        )
        if order is None:
            continue
        cname, cemail, cphone = _customer_from_order(order)
        snap = row.snapshot
        bundle_name = "Zestaw"
        if snap and snap.bundle_id:
            b = db.query(Bundle).filter(Bundle.id == int(snap.bundle_id)).first()
            if b:
                bundle_name = str(b.name)
        pname = str(row.product.name if row.product else f"P{row.product_id}")
        hits.append(
            LotTraceCustomerHit(
                order_id=oid,
                order_number=str(order.number or f"#{oid}"),
                customer_name=cname,
                customer_email=cemail,
                customer_phone=cphone,
                lot_number=str(row.lot_number or ""),
                bundle_name=bundle_name,
                product_name=pname,
                picked_qty=float(row.picked_qty or 0),
            )
        )
    return hits


def bundle_lot_tree_for_order(db: Session, order_id: int) -> list[BundleLotTreeNode]:
    """D) Bundle → z jakich partii został zbudowany."""
    nodes: list[BundleLotTreeNode] = []
    for ctx in bundle_line_resolver.resolve_for_order(db, int(order_id)):
        comp_nodes: list[BundleLotComponentNode] = []
        for comp in ctx.components:
            lot_rows = lots_for_snapshot(db, int(comp.snapshot_id))
            lot_dicts = tuple(
                {
                    "lot_number": str(l.lot_number or ""),
                    "lot_id": l.lot_id,
                    "expiry_date": l.expiry_date.isoformat() if l.expiry_date else None,
                    "picked_qty": float(l.picked_qty or 0),
                    "picked_at": l.picked_at.isoformat() if l.picked_at else None,
                }
                for l in lot_rows
            )
            comp_nodes.append(
                BundleLotComponentNode(
                    snapshot_id=int(comp.snapshot_id),
                    product_id=int(comp.component_product_id),
                    product_name=str(comp.component_name or f"P{comp.component_product_id}"),
                    lots=lot_dicts,
                )
            )
        nodes.append(
            BundleLotTreeNode(
                bundle_id=int(ctx.bundle_id),
                bundle_name=str(ctx.bundle_name),
                parent_order_line_id=int(ctx.order_line_id),
                fulfillment_mode=str(ctx.fulfillment_mode),
                components=tuple(comp_nodes),
            )
        )
    return nodes
