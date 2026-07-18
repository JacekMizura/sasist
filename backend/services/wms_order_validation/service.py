"""
Walidacja wykonalności zamówienia dla WMS picking — reuse PickingRoutingService + Inventory locks.

Nie duplikuje Inventory SSOT: shortfalls routingu = brak legalnego allocatable stock
(z uwzględnieniem InventoryLocationLock w routingu).
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Callable, Iterable, Optional, Sequence

from sqlalchemy.orm import Session, joinedload

from ...models.inventory import Inventory
from ...models.order import Order
from ...models.order_item import OrderItem, order_item_is_replaced_line
from ...models.product import Product
from ...services.bundle_order_item_ops import order_item_skip_bundle_commercial_header_for_ops
from ...services.picking_routing_service import PickingRoutingService
from .reasons import (
    REASON_INSUFFICIENT_PICKABLE_STOCK,
    REASON_LOCATION_BLOCKED,
    REASON_MISSING_PICKING_LOCATION,
    REASON_PRODUCT_NOT_PICKABLE,
    reason_label,
)
from .types import (
    ERROR_ORDER_NOT_FOUND,
    WmsOrderValidationIssue,
    WmsOrderValidationResult,
)

logger = logging.getLogger(__name__)


def validate_order_for_picking(
    db: Session,
    *,
    order_id: int,
    tenant_id: int,
    warehouse_id: Optional[int] = None,
) -> WmsOrderValidationResult:
    """Walidacja jednego zamówienia (order-level FAIL przy dowolnym issue)."""
    results = validate_orders_for_picking(
        db,
        order_ids=[int(order_id)],
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
    )
    if results:
        return results[0]
    return WmsOrderValidationResult(
        order_id=int(order_id),
        validation_status="ERROR",
        error_code=ERROR_ORDER_NOT_FOUND,
        error_message="Zamówienie nie znalezione lub poza tenantem",
    )


def validate_orders_for_picking(
    db: Session,
    *,
    order_ids: Sequence[int],
    tenant_id: int,
    warehouse_id: Optional[int] = None,
) -> list[WmsOrderValidationResult]:
    """
    Batch: jeden przebieg routingu dla kohorty.

    PASS gdy brak shortfalls dla order_id i istnieją operacyjne linie.
    """
    uniq = list(dict.fromkeys(int(x) for x in order_ids if int(x) > 0))
    if not uniq:
        return []

    q = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id.in_(uniq), Order.tenant_id == int(tenant_id))
    )
    if warehouse_id is not None:
        q = q.filter(Order.warehouse_id == int(warehouse_id))
    orders = {int(o.id): o for o in q.all()}

    routing = PickingRoutingService(db).build_location_pick_list(uniq, tenant_id=int(tenant_id))
    shortfalls_by_order: dict[int, list] = defaultdict(list)
    for sf in routing.shortfalls:
        shortfalls_by_order[int(sf.order_id)].append(sf)

    # Inventory presence (pre-lock) — rozróżnienie MISSING vs LOCATION_BLOCKED
    product_ids: set[int] = set()
    for o in orders.values():
        for oi in o.items or []:
            if order_item_is_replaced_line(oi):
                continue
            if order_item_skip_bundle_commercial_header_for_ops(oi):
                continue
            product_ids.add(int(oi.product_id))

    inv_any_by_wh_product = _inventory_presence_by_warehouse_product(
        db, tenant_id=int(tenant_id), pairs={(int(o.warehouse_id), pid) for o in orders.values() for pid in product_ids}
    )

    out: list[WmsOrderValidationResult] = []
    for oid in uniq:
        order = orders.get(oid)
        if order is None:
            out.append(
                WmsOrderValidationResult(
                    order_id=oid,
                    validation_status="ERROR",
                    error_code=ERROR_ORDER_NOT_FOUND,
                    error_message="Zamówienie nie znalezione lub poza tenantem / magazynem",
                )
            )
            continue
        issues = _issues_for_order(
            db,
            order=order,
            shortfalls=shortfalls_by_order.get(oid, []),
            inv_any_by_wh_product=inv_any_by_wh_product,
        )
        out.append(
            WmsOrderValidationResult(
                order_id=oid,
                validation_status="FAIL" if issues else "PASS",
                issues=issues,
            )
        )
    return out


def filter_orders_passing_wms_validation(
    db: Session,
    *,
    orders: Sequence[Order],
    tenant_id: int,
    on_fail: Optional[Callable] = None,
) -> list[Order]:
    """
    Zwraca tylko zamówienia PASS.
    ``on_fail(order, result)`` — opcjonalny hook (np. apply FAIL status) dla każdego FAIL.
    """
    if not orders:
        return []
    ids = [int(o.id) for o in orders]
    results = {
        r.order_id: r
        for r in validate_orders_for_picking(db, order_ids=ids, tenant_id=int(tenant_id))
    }
    passed: list[Order] = []
    for o in orders:
        res = results.get(int(o.id))
        if res is None or not res.ok:
            # ERROR (order not found) — nie emituj WMS_VALIDATION_FAILED jako „produkt”.
            if on_fail is not None and res is not None and not res.is_technical_error:
                on_fail(o, res)
            continue
        passed.append(o)
    return passed


def _issues_for_order(
    db: Session,
    *,
    order: Order,
    shortfalls: list,
    inv_any_by_wh_product: dict[tuple[int, int], float],
) -> list[WmsOrderValidationIssue]:
    wid = int(order.warehouse_id)
    issues: list[WmsOrderValidationIssue] = []
    operational_lines = 0

    # Indeks linii per product (pierwsza operacyjna) — do order_item_id / EAN
    line_by_product: dict[int, OrderItem] = {}
    for oi in sorted(order.items or [], key=lambda x: int(x.id)):
        if order_item_is_replaced_line(oi):
            continue
        if order_item_skip_bundle_commercial_header_for_ops(oi):
            continue
        qty = float(oi.quantity or 0)
        if qty <= 1e-9:
            continue
        operational_lines += 1
        pid = int(oi.product_id)
        if pid not in line_by_product:
            line_by_product[pid] = oi
        pr = oi.product
        if pr is None:
            pr = db.query(Product).filter(Product.id == pid).first()
        if pr is None:
            issues.append(
                WmsOrderValidationIssue(
                    reason_code=REASON_PRODUCT_NOT_PICKABLE,
                    reason_label=reason_label(REASON_PRODUCT_NOT_PICKABLE),
                    product_id=pid,
                    order_item_id=int(oi.id),
                    required_qty=qty,
                    product_name=f"Produkt #{pid}",
                )
            )

    if operational_lines <= 0:
        issues.append(
            WmsOrderValidationIssue(
                reason_code=REASON_PRODUCT_NOT_PICKABLE,
                reason_label=reason_label(REASON_PRODUCT_NOT_PICKABLE),
                product_name="Brak operacyjnych pozycji do kompletacji",
            )
        )
        return issues

    for sf in shortfalls:
        pid = int(sf.product_id)
        req = float(sf.requested or 0)
        alloc = float(sf.allocated or 0)
        oi = line_by_product.get(pid)
        pr = oi.product if oi is not None and getattr(oi, "product", None) is not None else None
        if pr is None and pid:
            pr = db.query(Product).filter(Product.id == pid).first()
        ean = (pr.ean if pr else None) or None
        sku = None
        if pr is not None:
            sku = (getattr(pr, "sku", None) or getattr(pr, "symbol", None) or None)
            if sku is not None:
                sku = str(sku).strip() or None
        pname = (pr.name if pr and pr.name else None) or f"Produkt #{pid}"

        raw_on_hand = float(inv_any_by_wh_product.get((wid, pid), 0.0))
        if alloc <= 1e-9:
            if raw_on_hand > 1e-9:
                code = REASON_LOCATION_BLOCKED
            else:
                code = REASON_MISSING_PICKING_LOCATION
        else:
            code = REASON_INSUFFICIENT_PICKABLE_STOCK

        issues.append(
            WmsOrderValidationIssue(
                reason_code=code,
                reason_label=reason_label(code),
                product_id=pid,
                order_item_id=int(oi.id) if oi is not None else None,
                ean=ean,
                sku=sku,
                product_name=pname,
                required_qty=req,
                available_qty=raw_on_hand,
                allocatable_qty=alloc,
            )
        )

    # Dedup per (product_id, reason_code)
    seen: set[tuple[Optional[int], str]] = set()
    deduped: list[WmsOrderValidationIssue] = []
    for iss in issues:
        key = (iss.product_id, iss.reason_code)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(iss)
    return deduped


def _inventory_presence_by_warehouse_product(
    db: Session,
    *,
    tenant_id: int,
    pairs: Iterable[tuple[int, int]],
) -> dict[tuple[int, int], float]:
    """Suma Inventory.quantity bez filtrowania locków — tylko do etykiety LOCATION_BLOCKED vs MISSING."""
    pair_list = list({(int(w), int(p)) for w, p in pairs})
    if not pair_list:
        return {}
    wh_ids = {w for w, _ in pair_list}
    pids = {p for _, p in pair_list}
    rows = (
        db.query(Inventory.warehouse_id, Inventory.product_id, Inventory.quantity)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id.in_(list(wh_ids)),
            Inventory.product_id.in_(list(pids)),
        )
        .all()
    )
    out: dict[tuple[int, int], float] = defaultdict(float)
    want = set(pair_list)
    for wid, pid, qty in rows:
        key = (int(wid), int(pid))
        if key not in want:
            continue
        out[key] += float(qty or 0)
    return dict(out)
