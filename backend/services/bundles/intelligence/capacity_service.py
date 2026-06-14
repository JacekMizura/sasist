"""P4.18D — Bundle capacity impact on carts, carriers, consolidation racks."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ....models.cart import Cart
from ....models.consolidation_rack import ConsolidationRack, RackSegment
from ....models.order import Order
from ....models.order_item import OrderItem


@dataclass
class BundleCapacityCartRow:
    cart_id: int
    cart_code: Optional[str]
    total_volume_dm3: float
    used_volume_dm3: float
    utilization_percent: float
    bundle_orders_count: int
    recommendation: str


@dataclass
class BundleCapacityRackRow:
    rack_id: int
    rack_name: str
    segment_label: Optional[str]
    fill_percent: float
    order_id: Optional[int]
    has_bundle: bool
    recommendation: str


@dataclass
class BundleCapacityReport:
    cart_rows: list[BundleCapacityCartRow]
    rack_rows: list[BundleCapacityRackRow]
    overloaded_carts: int
    overloaded_rack_segments: int




def build_bundle_capacity_report(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    cart_utilization_threshold: float = 85.0,
    rack_fill_threshold: float = 90.0,
) -> BundleCapacityReport:
    cart_rows: list[BundleCapacityCartRow] = []
    carts = (
        db.query(Cart)
        .filter(Cart.tenant_id == int(tenant_id), Cart.warehouse_id == int(warehouse_id))
        .all()
    )
    for cart in carts:
        total = float(cart.total_volume or 0)
        used = float(cart.used_volume or 0)
        util = (used / total * 100.0) if total > 1e-9 else 0.0
        bundle_orders = (
            db.query(func.count(func.distinct(Order.id)))
            .join(OrderItem, OrderItem.order_id == Order.id)
            .filter(
                Order.cart_id == int(cart.id),
                OrderItem.is_bundle_parent.is_(True),
            )
            .scalar()
        )
        rec = "OK"
        if util >= cart_utilization_threshold:
            rec = f"Przeciążenie wózka/koszyka ({util:.0f}%) — rozważ podział bundle na mniejsze partie."
        elif int(bundle_orders or 0) > 0 and util >= 70:
            rec = "Bundle obciąża wózek — monitoruj kolejne zestawy wieloskładnikowe."
        cart_rows.append(
            BundleCapacityCartRow(
                cart_id=int(cart.id),
                cart_code=(getattr(cart, "code", None) or getattr(cart, "barcode", None)),
                total_volume_dm3=round(total, 2),
                used_volume_dm3=round(used, 2),
                utilization_percent=round(util, 1),
                bundle_orders_count=int(bundle_orders or 0),
                recommendation=rec,
            )
        )

    rack_rows: list[BundleCapacityRackRow] = []
    racks = (
        db.query(ConsolidationRack)
        .filter(ConsolidationRack.tenant_id == int(tenant_id), ConsolidationRack.warehouse_id == int(warehouse_id))
        .all()
    )
    for rack in racks:
        for level in rack.levels or []:
            for seg in level.segments or []:
                oid = int(seg.order_id) if seg.order_id else None
                has_bundle = False
                if oid:
                    has_bundle = (
                        db.query(OrderItem.id)
                        .filter(OrderItem.order_id == oid, OrderItem.is_bundle_parent.is_(True))
                        .first()
                        is not None
                    )
                fill = float(seg.fill_percent or 0)
                label = (seg.slot_label or "").strip() or f"L{level.level_index}-S{seg.segment_index}"
                rec = "OK"
                if fill >= rack_fill_threshold:
                    rec = f"Półka RK {label} — wysokie wypełnienie ({fill:.0f}%). Rozłóż składniki bundle etapami."
                elif has_bundle and fill >= 70:
                    rec = "Bundle na półce RK — zarezerwuj sąsiedni segment na dalsze składniki."
                rack_rows.append(
                    BundleCapacityRackRow(
                        rack_id=int(rack.id),
                        rack_name=str(rack.name or f"RK-{rack.id}"),
                        segment_label=label,
                        fill_percent=round(fill, 1),
                        order_id=oid,
                        has_bundle=has_bundle,
                        recommendation=rec,
                    )
                )

    overloaded_carts = sum(1 for r in cart_rows if r.utilization_percent >= cart_utilization_threshold)
    overloaded_racks = sum(1 for r in rack_rows if r.fill_percent >= rack_fill_threshold)
    return BundleCapacityReport(
        cart_rows=sorted(cart_rows, key=lambda r: -r.utilization_percent),
        rack_rows=sorted(rack_rows, key=lambda r: -r.fill_percent),
        overloaded_carts=overloaded_carts,
        overloaded_rack_segments=overloaded_racks,
    )
