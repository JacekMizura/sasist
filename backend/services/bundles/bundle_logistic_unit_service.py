"""P4.17 — Bundle logistic unit placement service."""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from ...models.bundle_logistic_unit import (
    BUNDLE_LOGISTIC_UNIT_STATUS,
    PLACEMENT_CART,
    PLACEMENT_CARRIER,
    PLACEMENT_LOCATION,
    PLACEMENT_PALLET,
    BundleLogisticUnit,
)


def place_bundle_logistic_unit(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    bundle_id: int,
    linked_product_id: int,
    quantity: float,
    placement_type: str,
    cart_id: int | None = None,
    carrier_id: int | None = None,
    location_id: int | None = None,
    order_id: int | None = None,
) -> BundleLogisticUnit:
    row = BundleLogisticUnit(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        bundle_id=int(bundle_id),
        linked_product_id=int(linked_product_id),
        order_id=int(order_id) if order_id else None,
        status=BUNDLE_LOGISTIC_UNIT_STATUS,
        placement_type=str(placement_type),
        cart_id=int(cart_id) if cart_id else None,
        carrier_id=int(carrier_id) if carrier_id else None,
        location_id=int(location_id) if location_id else None,
        quantity=float(quantity),
    )
    db.add(row)
    db.flush()
    return row


def list_logistic_units_for_warehouse(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    bundle_id: int | None = None,
) -> list[BundleLogisticUnit]:
    q = db.query(BundleLogisticUnit).filter(
        BundleLogisticUnit.tenant_id == int(tenant_id),
        BundleLogisticUnit.warehouse_id == int(warehouse_id),
        BundleLogisticUnit.status == BUNDLE_LOGISTIC_UNIT_STATUS,
    )
    if bundle_id is not None:
        q = q.filter(BundleLogisticUnit.bundle_id == int(bundle_id))
    return q.order_by(BundleLogisticUnit.id.desc()).all()
