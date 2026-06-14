"""P4.16 — Persist bundle component lot snapshots at pick finalize / WZ issue."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy.orm import Session

from ...models.order_item import OrderItem
from ...models.order_item_pick_allocation import OrderItemPickAllocation
from ...models.order_line_bundle_component_lot import OrderLineBundleComponentLot
from ...models.pick import Pick
from ...models.pick_task import PickTask
from ..bundle_operational_mode import STOCK_PRODUCTION
from .bundle_line_resolver import bundle_line_resolver

SENTINEL_EXPIRY = date(9999, 12, 31)


@dataclass(frozen=True)
class BundleSnapshotMapping:
    order_id: int
    parent_order_line_id: int
    bundle_component_snapshot_id: int
    product_id: int


def synthetic_lot_id(
    *,
    warehouse_id: int,
    product_id: int,
    lot_number: str,
    expiry_date: date | None,
) -> int | None:
    ln = (lot_number or "").strip()
    if not ln:
        return None
    exp = expiry_date or SENTINEL_EXPIRY
    key = f"{int(warehouse_id)}:{int(product_id)}:{ln}:{exp.isoformat()}"
    return abs(hash(key)) % (2**31 - 1)


def resolve_bundle_snapshot_for_order_item(
    db: Session,
    order_item_id: int | None,
    product_id: int,
) -> BundleSnapshotMapping | None:
    if order_item_id is None:
        return None
    oi = db.query(OrderItem).filter(OrderItem.id == int(order_item_id)).first()
    if oi is None:
        return None

    parent_line_id: int | None = None
    parent_id = getattr(oi, "parent_bundle_order_item_id", None)
    if parent_id is not None:
        parent_line_id = int(parent_id)
    elif bool(getattr(oi, "is_bundle_parent", False)):
        parent_line_id = int(oi.id)

    if parent_line_id is None:
        return None

    ctx = bundle_line_resolver.resolve_parent_line(db, parent_line_id)
    if ctx is None:
        return None

    pid = int(product_id)
    for comp in ctx.components:
        if int(comp.component_product_id) == pid:
            return BundleSnapshotMapping(
                order_id=int(oi.order_id),
                parent_order_line_id=int(parent_line_id),
                bundle_component_snapshot_id=int(comp.snapshot_id),
                product_id=pid,
            )

    if str(ctx.fulfillment_mode) == STOCK_PRODUCTION:
        linked = int(ctx.linked_product_id or oi.product_id)
        if linked == pid and ctx.components:
            comp = ctx.components[0]
            return BundleSnapshotMapping(
                order_id=int(oi.order_id),
                parent_order_line_id=int(parent_line_id),
                bundle_component_snapshot_id=int(comp.snapshot_id),
                product_id=pid,
            )
    return None


def _resolve_pick_task_id(db: Session, pick: Pick) -> int | None:
    if pick.order_item_id is None:
        return None
    batch = (pick.batch_number or "").strip()
    q = (
        db.query(PickTask.id)
        .filter(
            PickTask.order_id == int(pick.order_id),
            PickTask.product_id == int(pick.product_id),
            PickTask.location_id == int(pick.location_id),
            PickTask.status == "picked",
        )
        .order_by(PickTask.id.desc())
    )
    if batch:
        q = q.filter(PickTask.batch_number == batch)
    row = q.first()
    return int(row[0]) if row else None


def _lot_row_exists(
    db: Session,
    *,
    snapshot_id: int,
    lot_number: str,
    picked_at: datetime,
    picked_qty: float,
) -> bool:
    return (
        db.query(OrderLineBundleComponentLot.id)
        .filter(
            OrderLineBundleComponentLot.bundle_component_snapshot_id == int(snapshot_id),
            OrderLineBundleComponentLot.lot_number == str(lot_number),
            OrderLineBundleComponentLot.picked_at == picked_at,
            OrderLineBundleComponentLot.picked_qty == float(picked_qty),
        )
        .first()
        is not None
    )


def persist_lot_row_from_pick(db: Session, pick: Pick) -> OrderLineBundleComponentLot | None:
    if pick.picked_at is None or float(pick.quantity or 0) <= 1e-12:
        return None
    mapping = resolve_bundle_snapshot_for_order_item(
        db,
        int(pick.order_item_id) if pick.order_item_id is not None else None,
        int(pick.product_id),
    )
    if mapping is None:
        return None

    lot_number = (pick.batch_number or "").strip()
    exp = getattr(pick, "expiry_date", None)
    if exp is not None and exp >= SENTINEL_EXPIRY:
        exp = None
    picked_at = pick.picked_at
    picked_qty = float(pick.quantity or 0)
    if _lot_row_exists(
        db,
        snapshot_id=mapping.bundle_component_snapshot_id,
        lot_number=lot_number,
        picked_at=picked_at,
        picked_qty=picked_qty,
    ):
        return None

    wid = int(pick.warehouse_id or 0)
    row = OrderLineBundleComponentLot(
        order_id=int(mapping.order_id),
        order_line_id=int(mapping.parent_order_line_id),
        bundle_component_snapshot_id=int(mapping.bundle_component_snapshot_id),
        product_id=int(mapping.product_id),
        lot_id=synthetic_lot_id(
            warehouse_id=wid,
            product_id=int(mapping.product_id),
            lot_number=lot_number,
            expiry_date=exp,
        ),
        lot_number=lot_number,
        expiry_date=exp,
        picked_qty=picked_qty,
        picked_at=picked_at,
        pick_task_id=_resolve_pick_task_id(db, pick),
        warehouse_id=wid,
    )
    db.add(row)
    db.flush()
    return row


def persist_bundle_lot_snapshots_for_picks(db: Session, pick_ids: list[int]) -> int:
    if not pick_ids:
        return 0
    picks = (
        db.query(Pick)
        .filter(Pick.id.in_([int(x) for x in pick_ids]), Pick.picked_at.isnot(None))
        .order_by(Pick.id.asc())
        .all()
    )
    created = 0
    for pick in picks:
        if persist_lot_row_from_pick(db, pick) is not None:
            created += 1
    return created


def persist_bundle_lot_snapshots_for_order_allocations(db: Session, order_id: int) -> int:
    """Backfill from OrderItemPickAllocation when issue path skipped pick hook."""
    allocs = (
        db.query(OrderItemPickAllocation)
        .filter(OrderItemPickAllocation.order_id == int(order_id))
        .order_by(OrderItemPickAllocation.id.asc())
        .all()
    )
    created = 0
    for alloc in allocs:
        mapping = resolve_bundle_snapshot_for_order_item(
            db,
            int(alloc.order_item_id),
            int(alloc.product_id),
        )
        if mapping is None:
            continue
        lot_number = (alloc.batch_number or "").strip()
        exp = alloc.expiry_date if alloc.expiry_date and alloc.expiry_date < SENTINEL_EXPIRY else None
        picked_at = alloc.picked_at or datetime.utcnow()
        picked_qty = float(alloc.quantity or 0)
        if _lot_row_exists(
            db,
            snapshot_id=mapping.bundle_component_snapshot_id,
            lot_number=lot_number,
            picked_at=picked_at,
            picked_qty=picked_qty,
        ):
            continue
        wid = int(alloc.warehouse_id or 0)
        db.add(
            OrderLineBundleComponentLot(
                order_id=int(mapping.order_id),
                order_line_id=int(mapping.parent_order_line_id),
                bundle_component_snapshot_id=int(mapping.bundle_component_snapshot_id),
                product_id=int(mapping.product_id),
                lot_id=synthetic_lot_id(
                    warehouse_id=wid,
                    product_id=int(mapping.product_id),
                    lot_number=lot_number,
                    expiry_date=exp,
                ),
                lot_number=lot_number,
                expiry_date=exp,
                picked_qty=picked_qty,
                picked_at=picked_at,
                pick_task_id=None,
                warehouse_id=wid,
            )
        )
        created += 1
    if created:
        db.flush()
    return created


def lots_for_snapshot(db: Session, snapshot_id: int) -> list[OrderLineBundleComponentLot]:
    return (
        db.query(OrderLineBundleComponentLot)
        .filter(OrderLineBundleComponentLot.bundle_component_snapshot_id == int(snapshot_id))
        .order_by(OrderLineBundleComponentLot.picked_at.asc(), OrderLineBundleComponentLot.id.asc())
        .all()
    )


def lots_for_order_bundle_parent(db: Session, order_id: int, parent_order_line_id: int) -> list[OrderLineBundleComponentLot]:
    return (
        db.query(OrderLineBundleComponentLot)
        .filter(
            OrderLineBundleComponentLot.order_id == int(order_id),
            OrderLineBundleComponentLot.order_line_id == int(parent_order_line_id),
        )
        .order_by(OrderLineBundleComponentLot.product_id.asc(), OrderLineBundleComponentLot.picked_at.asc())
        .all()
    )
