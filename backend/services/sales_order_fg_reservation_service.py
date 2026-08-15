"""
SALES_ORDER FG reservations — bridge to WMS picking ATP.

No TTL (unlike direct-sale SOFT_HOLD). Physical ``Inventory.quantity`` is unchanged
on reserve/release; pick finalize decrements inventory once and marks reservation picked.
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from ..models.inventory import Inventory
from ..models.stock_reservation import StockReservation
from .inventory_lot_keys import NO_EXPIRY_SENTINEL, normalize_batch_number
from .reservations.constants import (
    RESERVATION_KIND_SALES_ORDER,
    RESERVATION_STATUS_PICKED,
    RESERVATION_STATUS_RELEASED,
    RESERVATION_STATUS_RESERVED,
)
from .stock_disposition import DEFAULT_STOCK_DISPOSITION, normalize_stock_disposition
from .wms_picking_atp import (
    advisory_lock_sales_order_product,
    pickable_available_by_location,
    pickable_available_qty,
)

logger = logging.getLogger(__name__)


class SalesOrderReservationError(ValueError):
    def __init__(self, message: str, *, code: str = "sales_order_reservation_error"):
        super().__init__(message)
        self.code = code


def _release_row_quiet(res: StockReservation, *, reason: str) -> None:
    """
    Release without commerce-event side effects that require operational tables.

    Classic WMS FG hold is inventory-claim metadata; physical qty unchanged until pick.
    """
    res.status = RESERVATION_STATUS_RELEASED
    logger.info(
        "[sales_order_fg.released] id=%s order_id=%s product_id=%s qty=%s reason=%s",
        getattr(res, "id", None),
        getattr(res, "order_id", None),
        getattr(res, "product_id", None),
        getattr(res, "quantity", None),
        reason,
    )


def _consume_row_quiet(res: StockReservation) -> None:
    res.status = RESERVATION_STATUS_PICKED
    logger.info(
        "[sales_order_fg.consumed] id=%s order_id=%s product_id=%s qty=%s",
        getattr(res, "id", None),
        getattr(res, "order_id", None),
        getattr(res, "product_id", None),
        getattr(res, "quantity", None),
    )


def active_sales_order_reservations(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    product_id: int | None = None,
) -> list[StockReservation]:
    q = db.query(StockReservation).filter(
        StockReservation.tenant_id == int(tenant_id),
        StockReservation.order_id == int(order_id),
        StockReservation.reservation_kind == RESERVATION_KIND_SALES_ORDER,
        StockReservation.status == RESERVATION_STATUS_RESERVED,
    )
    if product_id is not None:
        q = q.filter(StockReservation.product_id == int(product_id))
    return list(q.order_by(StockReservation.id.asc()).all())


def reserved_qty_for_order_product(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    product_id: int,
) -> float:
    rows = active_sales_order_reservations(
        db, tenant_id=tenant_id, order_id=order_id, product_id=product_id
    )
    return round(sum(float(r.quantity or 0) for r in rows), 6)


def reserve_sales_order_fg(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    product_id: int,
    quantity: float,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
    created_by_user_id: int | None = None,
) -> list[StockReservation]:
    """
    Atomically reserve pickable FG for a sales order (advisory lock + FOR UPDATE).

    Raises ``SalesOrderReservationError`` when ATP is insufficient.
    """
    need = float(quantity or 0)
    if need <= 1e-9:
        return []

    tid = int(tenant_id)
    wid = int(warehouse_id)
    oid = int(order_id)
    pid = int(product_id)
    sd = normalize_stock_disposition(stock_disposition)

    advisory_lock_sales_order_product(db, tenant_id=tid, warehouse_id=wid, product_id=pid)

    # Lock physical inventory rows for this product/warehouse.
    (
        db.query(Inventory)
        .filter(
            Inventory.tenant_id == tid,
            Inventory.warehouse_id == wid,
            Inventory.product_id == pid,
            Inventory.stock_disposition == sd,
            Inventory.quantity > 0,
        )
        .order_by(Inventory.id.asc())
        .with_for_update()
        .all()
    )

    atp = pickable_available_qty(
        db,
        tenant_id=tid,
        warehouse_id=wid,
        product_id=pid,
        exclude_order_id=oid,
        stock_disposition=sd,
    )
    if atp + 1e-9 < need:
        raise SalesOrderReservationError(
            f"Brak ATP do rezerwacji SALES_ORDER: potrzeba {need}, dostępne {atp}.",
            code="insufficient_atp",
        )

    loc_rows = pickable_available_by_location(
        db,
        tenant_id=tid,
        warehouse_id=wid,
        product_id=pid,
        exclude_order_id=oid,
        stock_disposition=sd,
    )
    created: list[StockReservation] = []
    remain = need
    for loc_id, avail, _name in loc_rows:
        if remain <= 1e-9:
            break
        take = min(remain, float(avail))
        if take <= 1e-9:
            continue
        # Prefer a concrete inventory lot at this location for batch/expiry metadata.
        inv = (
            db.query(Inventory)
            .filter(
                Inventory.tenant_id == tid,
                Inventory.warehouse_id == wid,
                Inventory.product_id == pid,
                Inventory.location_id == int(loc_id),
                Inventory.stock_disposition == sd,
                Inventory.quantity > 0,
            )
            .order_by(Inventory.expiry_date.asc(), Inventory.id.asc())
            .first()
        )
        bn = normalize_batch_number(getattr(inv, "batch_number", None) if inv else "")
        ed = (getattr(inv, "expiry_date", None) if inv else None) or NO_EXPIRY_SENTINEL
        res = StockReservation(
            tenant_id=tid,
            warehouse_id=wid,
            order_id=oid,
            product_id=pid,
            location_id=int(loc_id),
            quantity=round(take, 6),
            status=RESERVATION_STATUS_RESERVED,
            batch_number=bn,
            expiry_date=ed,
            reservation_kind=RESERVATION_KIND_SALES_ORDER,
            expires_at=None,
            inventory_id=int(inv.id) if inv is not None else None,
            created_by_user_id=created_by_user_id,
            stock_disposition=sd,
        )
        db.add(res)
        created.append(res)
        remain -= take
    db.flush()
    if remain > 1e-6:
        raise SalesOrderReservationError(
            f"Alokacja lokalizacji nie pokryła rezerwacji: brakuje {remain}.",
            code="allocation_shortfall",
        )
    logger.info(
        "[sales_order_fg.reserve] order_id=%s product_id=%s qty=%s rows=%s",
        oid,
        pid,
        need,
        len(created),
    )
    return created


def release_sales_order_reservations_for_order(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    reason: str = "order_cancelled",
    performed_by_user_id: int | None = None,
    product_id: int | None = None,
) -> int:
    """Release all active SALES_ORDER holds for an order (cancel / leave flow)."""
    rows = active_sales_order_reservations(
        db, tenant_id=tenant_id, order_id=order_id, product_id=product_id
    )
    by_wh: dict[int, set[int]] = {}
    for r in rows:
        wid = int(getattr(r, "warehouse_id", 0) or 0)
        pid = int(getattr(r, "product_id", 0) or 0)
        if wid > 0 and pid > 0:
            by_wh.setdefault(wid, set()).add(pid)
        _release_row_quiet(r, reason=reason)
    if by_wh:
        try:
            from .production_order_trigger.availability_retry_service import (
                coalesce_component_availability_events,
                notify_component_availability_increased,
            )

            with coalesce_component_availability_events(
                db, reason=f"sales_order_release:{reason}"
            ):
                for wid, pids in by_wh.items():
                    notify_component_availability_increased(
                        db,
                        tenant_id=int(tenant_id),
                        warehouse_id=wid,
                        component_product_ids=pids,
                        reason=f"sales_order_release:{reason}",
                        operator_user_id=performed_by_user_id,
                    )
        except Exception:
            logger.exception(
                "availability notify after SALES_ORDER release failed order_id=%s",
                order_id,
            )
    return len(rows)


def partial_release_sales_order_qty(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    product_id: int,
    release_qty: float,
    reason: str = "qty_decrease",
    performed_by_user_id: int | None = None,
) -> float:
    """
    Release up to ``release_qty`` from active SALES_ORDER holds for product.
    Returns quantity actually released.
    """
    want = float(release_qty or 0)
    if want <= 1e-9:
        return 0.0
    rows = active_sales_order_reservations(
        db, tenant_id=tenant_id, order_id=order_id, product_id=product_id
    )
    # Release newest first so older FEFO slices stay.
    rows = list(reversed(rows))
    released = 0.0
    remain = want
    notify_wh: int | None = None
    for r in rows:
        if remain <= 1e-9:
            break
        cur = float(r.quantity or 0)
        if cur <= 1e-9:
            continue
        if notify_wh is None:
            w = int(getattr(r, "warehouse_id", 0) or 0)
            if w > 0:
                notify_wh = w
        if cur <= remain + 1e-9:
            _release_row_quiet(r, reason=reason)
            released += cur
            remain -= cur
        else:
            take = remain
            r.quantity = round(cur - take, 6)
            db.flush()
            released += take
            remain = 0.0
            logger.info(
                "[sales_order_fg.partial_release_shrink] order_id=%s product_id=%s take=%s left=%s",
                order_id,
                product_id,
                take,
                r.quantity,
            )
    logger.info(
        "[sales_order_fg.partial_release] order_id=%s product_id=%s released=%s",
        order_id,
        product_id,
        released,
    )
    if released > 1e-9 and notify_wh is not None:
        try:
            from .production_order_trigger.availability_retry_service import (
                notify_component_availability_increased,
            )

            notify_component_availability_increased(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(notify_wh),
                component_product_ids=[int(product_id)],
                reason=f"sales_order_release:{reason}",
                operator_user_id=performed_by_user_id,
            )
        except Exception:
            logger.exception(
                "availability notify after SALES_ORDER partial release failed order_id=%s",
                order_id,
            )
    return round(released, 6)


def sync_sales_order_reservation_to_line_qty(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    product_id: int,
    target_qty: float,
    performed_by_user_id: int | None = None,
) -> float:
    """If reserved > target, partial-release the excess. Does not create new holds."""
    current = reserved_qty_for_order_product(
        db, tenant_id=tenant_id, order_id=order_id, product_id=product_id
    )
    target = max(0.0, float(target_qty or 0))
    excess = current - target
    if excess <= 1e-9:
        return 0.0
    return partial_release_sales_order_qty(
        db,
        tenant_id=tenant_id,
        order_id=order_id,
        product_id=product_id,
        release_qty=excess,
        reason="qty_decrease",
        performed_by_user_id=performed_by_user_id,
    )


def consume_sales_order_reservations_for_pick(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    product_id: int,
    location_id: int,
    quantity: float,
) -> float:
    """
    Mark matching SALES_ORDER reservations as picked/consumed for the pick qty.

    Does not touch ``Inventory.quantity`` (already decremented by pick finalize).
    """
    need = float(quantity or 0)
    if need <= 1e-9:
        return 0.0
    rows = (
        db.query(StockReservation)
        .filter(
            StockReservation.tenant_id == int(tenant_id),
            StockReservation.order_id == int(order_id),
            StockReservation.product_id == int(product_id),
            StockReservation.location_id == int(location_id),
            StockReservation.reservation_kind == RESERVATION_KIND_SALES_ORDER,
            StockReservation.status == RESERVATION_STATUS_RESERVED,
        )
        .order_by(StockReservation.id.asc())
        .with_for_update()
        .all()
    )
    consumed = 0.0
    remain = need
    for r in rows:
        if remain <= 1e-9:
            break
        cur = float(r.quantity or 0)
        if cur <= 1e-9:
            continue
        if cur <= remain + 1e-9:
            _consume_row_quiet(r)
            consumed += cur
            remain -= cur
        else:
            take = remain
            r.quantity = round(cur - take, 6)
            splinter = StockReservation(
                tenant_id=int(r.tenant_id),
                warehouse_id=getattr(r, "warehouse_id", None),
                order_id=int(r.order_id) if r.order_id else None,
                product_id=int(r.product_id),
                location_id=int(r.location_id),
                quantity=round(take, 6),
                status=RESERVATION_STATUS_RESERVED,
                batch_number=r.batch_number or "",
                expiry_date=r.expiry_date or NO_EXPIRY_SENTINEL,
                reservation_kind=RESERVATION_KIND_SALES_ORDER,
                expires_at=None,
                inventory_id=getattr(r, "inventory_id", None),
                stock_disposition=normalize_stock_disposition(
                    getattr(r, "stock_disposition", None) or DEFAULT_STOCK_DISPOSITION
                ),
            )
            db.add(splinter)
            db.flush()
            _consume_row_quiet(splinter)
            consumed += take
            remain = 0.0
    if consumed > 1e-9:
        logger.info(
            "[sales_order_fg.consume] order_id=%s product_id=%s loc=%s qty=%s",
            order_id,
            product_id,
            location_id,
            consumed,
        )
    return round(consumed, 6)
