"""P4.17 — Bundle scan orchestration (pick / pack / returns / complaints)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Optional

from sqlalchemy.orm import Session, joinedload

from ...models.order import Order
from ...models.order_item import OrderItem
from ..bundle_operational_mode import ON_DEMAND_ASSEMBLY, STOCK_PRODUCTION
from ..bundle_order_item_ops import order_item_skip_bundle_commercial_header_for_ops
from .bundle_barcode_resolver import BundleBarcodeMatch, resolve_bundle_barcode
from .bundle_line_resolver import bundle_line_resolver
from .bundle_operational_ux_service import build_bundle_ux_index_for_order
from .bundle_traceability_service import bundle_lot_tree_for_order

ScanDomain = Literal["picking", "packing", "returns", "complaints"]


@dataclass
class BundleComponentPickStatus:
    order_item_id: int
    product_id: int
    product_name: str
    quantity_required: float
    quantity_picked: float
    quantity_to_pick: float
    bundle_component_index: Optional[int] = None
    pick_done: bool = False


@dataclass
class BundleScanResult:
    found: bool
    domain: ScanDomain
    barcode: str
    match_kind: Optional[str] = None
    bundle_id: Optional[int] = None
    bundle_name: Optional[str] = None
    bundle_fulfillment_mode: Optional[str] = None
    action: Optional[str] = None
    product_id: Optional[int] = None
    order_id: Optional[int] = None
    order_item_id: Optional[int] = None
    quantity: float = 1.0
    missing_components: list[BundleComponentPickStatus] = field(default_factory=list)
    bundle_verified: bool = False
    message: Optional[str] = None
    traceability_links: dict = field(default_factory=dict)
    return_tree_order_ids: list[int] = field(default_factory=list)


def _traceability_links(*, tenant_id: int, order_id: int, bundle_id: int, lot_number: str | None = None) -> dict:
    base = f"/bundles/traceability/orders/{order_id}/bundle-lots?tenant_id={tenant_id}"
    recall = f"/bundles/traceability/recall?tenant_id={tenant_id}&lot_number={lot_number or ''}"
    return {
        "bundle_lots": base,
        "recall_report": recall if lot_number else None,
        "returns_tree": f"/wms/returns/orders/{order_id}/bundle-return-tree",
        "complaint_search": f"/complaints?bundle_id={bundle_id}",
    }


def _missing_components_for_order(
    db: Session,
    *,
    order_id: int,
    bundle_parent_line_id: int,
    product_id_filter: int | None,
    cart_id: int | None,
    sum_pick_fn,
) -> list[BundleComponentPickStatus]:
    from ...models.product import Product

    order = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == int(order_id))
        .first()
    )
    if order is None:
        return []
    ux = build_bundle_ux_index_for_order(db, int(order_id))
    out: list[BundleComponentPickStatus] = []
    for oi in sorted(order.items or [], key=lambda x: int(x.id)):
        if order_item_skip_bundle_commercial_header_for_ops(oi):
            continue
        meta = ux.get(int(oi.id))
        if meta is None or meta.parent_bundle_order_line_id != int(bundle_parent_line_id):
            continue
        if product_id_filter is not None and int(oi.product_id) != int(product_id_filter):
            continue
        qty = float(oi.quantity or 0)
        pq = float(sum_pick_fn(db, int(oi.id), cart_id)) if cart_id else 0.0
        miss = float(oi.wms_picking_line_missing_qty or 0)
        to_pick = max(0.0, qty - pq - miss)
        pname = str(getattr(oi.product, "name", None) or f"P{oi.product_id}")
        out.append(
            BundleComponentPickStatus(
                order_item_id=int(oi.id),
                product_id=int(oi.product_id),
                product_name=pname,
                quantity_required=qty,
                quantity_picked=round(min(pq, max(0.0, qty - miss)), 6),
                quantity_to_pick=round(to_pick, 6),
                bundle_component_index=meta.bundle_component_index,
                pick_done=to_pick <= 1e-9 and qty > 0,
            )
        )
    return sorted(out, key=lambda x: int(x.bundle_component_index or 0))


def handle_picking_bundle_scan(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    barcode: str,
    cart_id: int,
    source_status_id: int,
    order_type: str,
    location_id: int | None,
    sum_pick_fn,
    order_ids: list[int] | None = None,
) -> BundleScanResult:
    match = resolve_bundle_barcode(db, tenant_id=int(tenant_id), barcode=barcode)
    if match is None:
        return BundleScanResult(found=False, domain="picking", barcode=barcode, message="Nie rozpoznano kodu.")

    mode = match.bundle_fulfillment_mode or ON_DEMAND_ASSEMBLY
    if mode == STOCK_PRODUCTION and match.product_id is not None:
        return BundleScanResult(
            found=True,
            domain="picking",
            barcode=match.barcode,
            match_kind=match.match_kind,
            bundle_id=match.bundle_id,
            bundle_name=match.bundle_name,
            bundle_fulfillment_mode=mode,
            action="pick_stock_line",
            product_id=int(match.product_id),
            quantity=1.0,
            message="STOCK — zalicz linię bundle SKU (1 szt.).",
        )

    if match.bundle_id is None:
        return BundleScanResult(found=False, domain="picking", barcode=barcode, message="Brak kontekstu bundle.")

    missing_all: list[BundleComponentPickStatus] = []
    target_order_id: Optional[int] = None
    from ..wms_picking_product_list_service import resolve_wms_picking_order_ids

    ot = order_type if order_type in ("single", "multi", "all") else "all"
    cohort = order_ids or resolve_wms_picking_order_ids(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        source_status_id=int(source_status_id),
        order_type=ot,
        cart_id=int(cart_id),
    )
    for oid in cohort:
        for ctx in bundle_line_resolver.resolve_for_order(db, int(oid)):
            if int(ctx.bundle_id) != int(match.bundle_id):
                continue
            comps = _missing_components_for_order(
                db,
                order_id=int(oid),
                bundle_parent_line_id=int(ctx.order_line_id),
                product_id_filter=None,
                cart_id=int(cart_id),
                sum_pick_fn=sum_pick_fn,
            )
            not_done = [c for c in comps if not c.pick_done]
            if not_done:
                missing_all = not_done
                target_order_id = int(oid)
                break
        if missing_all:
            break

    return BundleScanResult(
        found=True,
        domain="picking",
        barcode=match.barcode,
        match_kind=match.match_kind,
        bundle_id=match.bundle_id,
        bundle_name=match.bundle_name,
        bundle_fulfillment_mode=ON_DEMAND_ASSEMBLY,
        action="show_missing_components",
        order_id=target_order_id,
        missing_components=missing_all,
        message="ON_DEMAND — pokaż brakujące składniki (bez auto-zaliczania).",
        traceability_links=_traceability_links(
            tenant_id=int(tenant_id),
            order_id=int(target_order_id or 0),
            bundle_id=int(match.bundle_id),
        )
        if target_order_id
        else {},
    )


def handle_packing_bundle_scan(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    barcode: str,
) -> BundleScanResult:
    match = resolve_bundle_barcode(db, tenant_id=int(tenant_id), barcode=barcode)
    if match is None:
        return BundleScanResult(found=False, domain="packing", barcode=barcode)

    mode = match.bundle_fulfillment_mode or ON_DEMAND_ASSEMBLY
    if mode == STOCK_PRODUCTION and match.product_id is not None:
        oi = (
            db.query(OrderItem)
            .filter(
                OrderItem.order_id == int(order_id),
                OrderItem.product_id == int(match.product_id),
            )
            .first()
        )
        return BundleScanResult(
            found=True,
            domain="packing",
            barcode=match.barcode,
            match_kind=match.match_kind,
            bundle_id=match.bundle_id,
            bundle_name=match.bundle_name,
            bundle_fulfillment_mode=mode,
            action="pack_stock_line",
            product_id=int(match.product_id),
            order_id=int(order_id),
            order_item_id=int(oi.id) if oi else None,
            quantity=1.0,
            message="STOCK — spakuj linię bundle SKU.",
        )

    trees = bundle_lot_tree_for_order(db, int(order_id))
    node = next((t for t in trees if match.bundle_id and int(t.bundle_id) == int(match.bundle_id)), None)
    all_picked = True
    if node:
        order = db.query(Order).options(joinedload(Order.items)).filter(Order.id == int(order_id)).first()
        ux_parent = int(node.parent_order_line_id)
        if order:
            for oi in order.items or []:
                meta_parent = getattr(oi, "parent_bundle_order_item_id", None)
                if meta_parent is None or int(meta_parent) != ux_parent:
                    continue
                st = (getattr(oi, "wms_picking_line_status", None) or "").strip().lower()
                if st not in ("picked", "missing"):
                    all_picked = False
                    break
    else:
        all_picked = False
    return BundleScanResult(
        found=True,
        domain="packing",
        barcode=match.barcode,
        match_kind=match.match_kind,
        bundle_id=match.bundle_id,
        bundle_name=match.bundle_name,
        bundle_fulfillment_mode=ON_DEMAND_ASSEMBLY,
        action="verify_bundle" if all_picked else "components_incomplete",
        order_id=int(order_id),
        bundle_verified=all_picked,
        message="Bundle zweryfikowany." if all_picked else "Nie wszystkie składniki zebrane.",
        traceability_links=_traceability_links(
            tenant_id=int(tenant_id),
            order_id=int(order_id),
            bundle_id=int(match.bundle_id or 0),
        ),
    )


def handle_returns_bundle_scan(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    barcode: str,
) -> BundleScanResult:
    match = resolve_bundle_barcode(db, tenant_id=int(tenant_id), barcode=barcode)
    if match is None or match.bundle_id is None:
        return BundleScanResult(found=False, domain="returns", barcode=barcode)

    rows = (
        db.query(Order.id)
        .join(OrderItem, OrderItem.order_id == Order.id)
        .filter(
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
            OrderItem.is_bundle_parent.is_(True),
            OrderItem.source_bundle_id == int(match.bundle_id),
        )
        .distinct()
        .limit(20)
        .all()
    )
    order_ids = [int(r[0]) for r in rows]
    return BundleScanResult(
        found=True,
        domain="returns",
        barcode=match.barcode,
        match_kind=match.match_kind,
        bundle_id=match.bundle_id,
        bundle_name=match.bundle_name,
        action="open_rmz_tree",
        return_tree_order_ids=order_ids,
        message="Otwórz drzewo RMZ i zaznacz zwrócone składniki.",
    )


def handle_complaint_bundle_scan(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    barcode: str,
) -> BundleScanResult:
    match = resolve_bundle_barcode(db, tenant_id=int(tenant_id), barcode=barcode)
    if match is None or match.bundle_id is None:
        return BundleScanResult(found=False, domain="complaints", barcode=barcode)

    rows = (
        db.query(Order.id)
        .join(OrderItem, OrderItem.order_id == Order.id)
        .filter(
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
            OrderItem.source_bundle_id == int(match.bundle_id),
        )
        .distinct()
        .limit(20)
        .all()
    )
    order_ids = [int(r[0]) for r in rows]
    lot_sample = None
    if order_ids:
        trees = bundle_lot_tree_for_order(db, order_ids[0])
        for t in trees:
            if int(t.bundle_id) == int(match.bundle_id):
                for c in t.components:
                    if c.lots:
                        lot_sample = c.lots[0].get("lot_number")
                        break
    links = _traceability_links(
        tenant_id=int(tenant_id),
        order_id=order_ids[0] if order_ids else 0,
        bundle_id=int(match.bundle_id),
        lot_number=lot_sample,
    )
    return BundleScanResult(
        found=True,
        domain="complaints",
        barcode=match.barcode,
        match_kind=match.match_kind,
        bundle_id=match.bundle_id,
        bundle_name=match.bundle_name,
        action="open_complaint_traceability",
        return_tree_order_ids=order_ids,
        traceability_links=links,
        message="Historia partii i traceability dla bundle.",
    )


def bulk_stock_pick_scan_result(
    *,
    scan_index: int,
    total_scans: int,
    match: BundleBarcodeMatch,
) -> BundleScanResult:
    """STOCK bulk: each scan completes one bundle line."""
    complete = scan_index >= total_scans
    return BundleScanResult(
        found=True,
        domain="picking",
        barcode=match.barcode,
        match_kind=match.match_kind,
        bundle_id=match.bundle_id,
        bundle_name=match.bundle_name,
        bundle_fulfillment_mode=STOCK_PRODUCTION,
        action="pick_stock_line",
        product_id=match.product_id,
        quantity=1.0,
        message=f"Bulk STOCK {scan_index}/{total_scans}" + (" — complete" if complete else ""),
    )
