"""Universal ReservationService — production, orders, transfers share one engine."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session, joinedload

from ...models.app_user import AppUser
from ...models.location import Location
from ...models.product import Product
from ...models.product_composition import ProductionBatch
from ...models.production import ProductionOrder
from ...models.stock_reservation import StockReservation
from ..inventory_lot_keys import normalize_batch_number
from ..warehouse_inventory_movement_service import BUCKET_RESERVED, MOVEMENT_RESERVATION, record_inventory_movement
from dataclasses import dataclass

from .allocation_service import AllocationSlice, allocate_product_quantity
from .constants import (
    DEFAULT_ALLOCATION_STRATEGY,
    RESERVATION_KIND_PRODUCTION_BATCH,
    RESERVATION_KIND_PRODUCTION_ORDER,
)
from .lifecycle_service import mark_reservation_consumed, release_reservation

logger = logging.getLogger(__name__)


class ReservationError(ValueError):
    def __init__(self, message: str, *, code: str = "reservation_error"):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class ProductionReservationConfig:
    allocation_strategy: str
    allow_sales_locations: bool


def _load_production_reservation_config(
    db: Session, *, tenant_id: int, warehouse_id: int
) -> ProductionReservationConfig:
    from ...models.wms_settings import WmsSettings

    row = (
        db.query(WmsSettings)
        .filter(WmsSettings.tenant_id == int(tenant_id), WmsSettings.warehouse_id == int(warehouse_id))
        .first()
    )
    if row is None:
        return ProductionReservationConfig(
            allocation_strategy=DEFAULT_ALLOCATION_STRATEGY,
            allow_sales_locations=False,
        )
    raw = getattr(row, "production_reservation_json", None) or ""
    if not raw:
        return ProductionReservationConfig(
            allocation_strategy=DEFAULT_ALLOCATION_STRATEGY,
            allow_sales_locations=False,
        )
    try:
        import json

        data = json.loads(str(raw))
        strat = str(data.get("allocation_strategy") or DEFAULT_ALLOCATION_STRATEGY).upper()
        strat = strat if strat in ("FIFO", "FEFO", "LIFO") else DEFAULT_ALLOCATION_STRATEGY
        return ProductionReservationConfig(
            allocation_strategy=strat,
            allow_sales_locations=bool(data.get("allow_sales_locations", False)),
        )
    except Exception:
        return ProductionReservationConfig(
            allocation_strategy=DEFAULT_ALLOCATION_STRATEGY,
            allow_sales_locations=False,
        )


def _load_allocation_strategy(db: Session, *, tenant_id: int, warehouse_id: int) -> str:
    return _load_production_reservation_config(db, tenant_id=tenant_id, warehouse_id=warehouse_id).allocation_strategy


def _active_production_reservations_q(
    db: Session,
    *,
    tenant_id: int,
    production_batch_id: int | None = None,
    production_order_id: int | None = None,
):
    q = db.query(StockReservation).filter(
        StockReservation.tenant_id == int(tenant_id),
        StockReservation.status == "reserved",
    )
    if production_batch_id is not None:
        q = q.filter(StockReservation.production_batch_id == int(production_batch_id))
    if production_order_id is not None:
        q = q.filter(StockReservation.production_order_id == int(production_order_id))
    return q


def _assert_unlocked(rows: list[StockReservation]) -> None:
    if any(getattr(r, "locked_at", None) is not None for r in rows):
        raise ReservationError("Rezerwacje są zablokowane — produkcja rozpoczęła zbieranie.", code="locked")


def _persist_slice(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    sl: AllocationSlice,
    reservation_kind: str,
    production_batch_id: int | None,
    production_order_id: int | None,
    created_by_user_id: int | None,
) -> StockReservation:
    res = StockReservation(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=None,
        product_id=int(product_id),
        location_id=int(sl.location_id),
        quantity=float(sl.quantity),
        status="reserved",
        batch_number=normalize_batch_number(sl.batch_number),
        expiry_date=sl.expiry_date,
        serial_number=(sl.serial_number or "").strip() or None,
        reservation_kind=reservation_kind,
        production_batch_id=production_batch_id,
        production_order_id=production_order_id,
        inventory_id=sl.inventory_id,
        created_by_user_id=created_by_user_id,
    )
    db.add(res)
    db.flush()
    record_inventory_movement(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        product_id=int(product_id),
        movement_type=MOVEMENT_RESERVATION,
        quantity=float(sl.quantity),
        inventory_bucket=BUCKET_RESERVED,
        operator_admin_id=created_by_user_id,
        from_location_id=int(sl.location_id),
        metadata={
            "reservation_id": int(res.id),
            "production_batch_id": production_batch_id,
            "production_order_id": production_order_id,
        },
    )
    return res


def create_production_batch_reservations(
    db: Session,
    *,
    tenant_id: int,
    batch_id: int,
    component_totals: dict[int, float],
    created_by_user_id: int | None = None,
    strategy: str | None = None,
) -> list[StockReservation]:
    batch = db.query(ProductionBatch).filter(
        ProductionBatch.id == int(batch_id), ProductionBatch.tenant_id == int(tenant_id)
    ).first()
    if batch is None:
        raise ReservationError("Partia nie istnieje.", code="not_found")
    if str(batch.status) in ("completed", "cancelled"):
        raise ReservationError("Nie można rezerwować dla zamkniętej partii.", code="terminal_status")
    if getattr(batch, "reservations_locked_at", None):
        raise ReservationError("Rezerwacje są zablokowane.", code="locked")
    existing = _active_production_reservations_q(
        db, tenant_id=tenant_id, production_batch_id=int(batch_id)
    ).count()
    if existing:
        raise ReservationError("Partia ma już aktywne rezerwacje.", code="already_reserved")
    cfg = _load_production_reservation_config(db, tenant_id=tenant_id, warehouse_id=int(batch.warehouse_id))
    strat = strategy or cfg.allocation_strategy
    created: list[StockReservation] = []
    for pid, qty in component_totals.items():
        if float(qty) <= 1e-9:
            continue
        slices = allocate_product_quantity(
            db,
            tenant_id=tenant_id,
            warehouse_id=int(batch.warehouse_id),
            product_id=int(pid),
            quantity=float(qty),
            strategy=strat,
            exclude_batch_id=int(batch.id),
            allow_sales_locations=cfg.allow_sales_locations,
        )
        for sl in slices:
            created.append(
                _persist_slice(
                    db,
                    tenant_id=tenant_id,
                    warehouse_id=int(batch.warehouse_id),
                    product_id=int(pid),
                    sl=sl,
                    reservation_kind=RESERVATION_KIND_PRODUCTION_BATCH,
                    production_batch_id=int(batch.id),
                    production_order_id=None,
                    created_by_user_id=created_by_user_id,
                )
            )
    batch.materials_reserved = True
    batch.updated_at = datetime.utcnow()
    db.flush()
    logger.info("[reservation.create] batch_id=%s rows=%s", batch.id, len(created))
    return created


def create_production_order_reservations(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    component_totals: dict[int, float],
    created_by_user_id: int | None = None,
    strategy: str | None = None,
) -> list[StockReservation]:
    order = db.query(ProductionOrder).filter(
        ProductionOrder.id == int(order_id), ProductionOrder.tenant_id == int(tenant_id)
    ).first()
    if order is None:
        raise ReservationError("Zlecenie nie istnieje.", code="not_found")
    if str(order.status) in ("completed", "cancelled"):
        raise ReservationError("Nie można rezerwować dla zamkniętego zlecenia.", code="terminal_status")
    if getattr(order, "reservations_locked_at", None):
        raise ReservationError("Rezerwacje są zablokowane.", code="locked")
    existing = _active_production_reservations_q(
        db, tenant_id=tenant_id, production_order_id=int(order_id)
    ).count()
    if existing:
        raise ReservationError("Zlecenie ma już aktywne rezerwacje.", code="already_reserved")
    cfg = _load_production_reservation_config(db, tenant_id=tenant_id, warehouse_id=int(order.warehouse_id))
    strat = strategy or cfg.allocation_strategy
    created: list[StockReservation] = []
    for pid, qty in component_totals.items():
        if float(qty) <= 1e-9:
            continue
        slices = allocate_product_quantity(
            db,
            tenant_id=tenant_id,
            warehouse_id=int(order.warehouse_id),
            product_id=int(pid),
            quantity=float(qty),
            strategy=strat,
            exclude_order_id=int(order.id),
            allow_sales_locations=cfg.allow_sales_locations,
        )
        for sl in slices:
            created.append(
                _persist_slice(
                    db,
                    tenant_id=tenant_id,
                    warehouse_id=int(order.warehouse_id),
                    product_id=int(pid),
                    sl=sl,
                    reservation_kind=RESERVATION_KIND_PRODUCTION_ORDER,
                    production_batch_id=None,
                    production_order_id=int(order.id),
                    created_by_user_id=created_by_user_id,
                )
            )
    order.materials_reserved = True
    order.updated_at = datetime.utcnow()
    db.flush()
    logger.info("[reservation.create] order_id=%s rows=%s", order.id, len(created))
    return created


def release_production_reservations(
    db: Session,
    *,
    tenant_id: int,
    production_batch_id: int | None = None,
    production_order_id: int | None = None,
    reason: str = "cancelled",
    performed_by_user_id: int | None = None,
) -> int:
    rows = _active_production_reservations_q(
        db,
        tenant_id=tenant_id,
        production_batch_id=production_batch_id,
        production_order_id=production_order_id,
    ).all()
    for r in rows:
        release_reservation(db, r, reason=reason, performed_by_user_id=performed_by_user_id)
    if production_batch_id:
        batch = db.query(ProductionBatch).filter(ProductionBatch.id == int(production_batch_id)).first()
        if batch:
            batch.materials_reserved = False
            batch.updated_at = datetime.utcnow()
    if production_order_id:
        order = db.query(ProductionOrder).filter(ProductionOrder.id == int(production_order_id)).first()
        if order:
            order.materials_reserved = False
            order.updated_at = datetime.utcnow()
    db.flush()
    return len(rows)


def lock_production_reservations(
    db: Session,
    *,
    tenant_id: int,
    production_batch_id: int | None = None,
    production_order_id: int | None = None,
) -> int:
    now = datetime.utcnow()
    rows = _active_production_reservations_q(
        db,
        tenant_id=tenant_id,
        production_batch_id=production_batch_id,
        production_order_id=production_order_id,
    ).all()
    for r in rows:
        r.locked_at = now
    if production_batch_id:
        batch = db.query(ProductionBatch).filter(ProductionBatch.id == int(production_batch_id)).first()
        if batch:
            batch.reservations_locked_at = now
    if production_order_id:
        order = db.query(ProductionOrder).filter(ProductionOrder.id == int(production_order_id)).first()
        if order:
            order.reservations_locked_at = now
    db.flush()
    return len(rows)


def consume_production_reservations(
    db: Session,
    *,
    tenant_id: int,
    production_batch_id: int | None = None,
    production_order_id: int | None = None,
) -> int:
    rows = _active_production_reservations_q(
        db,
        tenant_id=tenant_id,
        production_batch_id=production_batch_id,
        production_order_id=production_order_id,
    ).all()
    for r in rows:
        mark_reservation_consumed(db, r)
        r.status = "picked"
    if production_batch_id:
        batch = db.query(ProductionBatch).filter(ProductionBatch.id == int(production_batch_id)).first()
        if batch:
            batch.materials_reserved = False
    if production_order_id:
        order = db.query(ProductionOrder).filter(ProductionOrder.id == int(production_order_id)).first()
        if order:
            order.materials_reserved = False
    db.flush()
    return len(rows)


def update_production_reservation(
    db: Session,
    *,
    tenant_id: int,
    reservation_id: int,
    location_id: int | None = None,
    quantity: float | None = None,
    batch_number: str | None = None,
    serial_number: str | None = None,
    performed_by_user_id: int | None = None,
    ignore_locked: bool = False,
) -> StockReservation:
    res = (
        db.query(StockReservation)
        .filter(StockReservation.id == int(reservation_id), StockReservation.tenant_id == int(tenant_id))
        .first()
    )
    if res is None or str(res.status) != "reserved":
        raise ReservationError("Rezerwacja nie istnieje.", code="not_found")
    if getattr(res, "locked_at", None) and not ignore_locked:
        raise ReservationError("Rezerwacja jest zablokowana.", code="locked")
    release_reservation(db, res, reason="reallocated", performed_by_user_id=performed_by_user_id)
    wh_id = int(res.warehouse_id or 0)
    pid = int(res.product_id)
    qty = float(quantity if quantity is not None else res.quantity)
    loc_id = int(location_id if location_id is not None else res.location_id)
    cfg = _load_production_reservation_config(db, tenant_id=tenant_id, warehouse_id=wh_id)
    exclude_batch = int(res.production_batch_id) if res.production_batch_id else None
    exclude_order = int(res.production_order_id) if res.production_order_id else None
    slices = allocate_product_quantity(
        db,
        tenant_id=tenant_id,
        warehouse_id=wh_id,
        product_id=pid,
        quantity=qty,
        strategy=cfg.allocation_strategy,
        exclude_batch_id=exclude_batch,
        exclude_order_id=exclude_order,
        allow_sales_locations=cfg.allow_sales_locations,
    )
    if len(slices) != 1:
        raise ReservationError("Zmiana wymaga pojedynczej alokacji — zmniejsz ilość lub zwolnij i utwórz ponownie.", code="split_required")
    sl = slices[0]
    if batch_number:
        sl = AllocationSlice(
            location_id=sl.location_id,
            quantity=sl.quantity,
            batch_number=normalize_batch_number(batch_number),
            expiry_date=sl.expiry_date,
            inventory_id=sl.inventory_id,
            serial_number=serial_number,
        )
    return _persist_slice(
        db,
        tenant_id=tenant_id,
        warehouse_id=wh_id,
        product_id=pid,
        sl=sl,
        reservation_kind=str(res.reservation_kind or RESERVATION_KIND_PRODUCTION_BATCH),
        production_batch_id=int(res.production_batch_id) if res.production_batch_id else None,
        production_order_id=int(res.production_order_id) if res.production_order_id else None,
        created_by_user_id=performed_by_user_id or res.created_by_user_id,
    )


def list_material_reservations(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None = None,
    production_batch_id: int | None = None,
    production_order_id: int | None = None,
    active_only: bool = True,
) -> list[dict[str, Any]]:
    q = db.query(StockReservation).filter(StockReservation.tenant_id == int(tenant_id))
    if active_only:
        q = q.filter(StockReservation.status == "reserved")
    if warehouse_id is not None:
        q = q.filter(StockReservation.warehouse_id == int(warehouse_id))
    if production_batch_id is not None:
        q = q.filter(StockReservation.production_batch_id == int(production_batch_id))
    if production_order_id is not None:
        q = q.filter(StockReservation.production_order_id == int(production_order_id))
    rows = q.order_by(StockReservation.created_at.desc()).all()
    if not rows:
        return []
    pids = {int(r.product_id) for r in rows}
    lids = {int(r.location_id) for r in rows}
    uids = {int(r.created_by_user_id) for r in rows if r.created_by_user_id}
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(pids)).all()}
    locations = {l.id: l for l in db.query(Location).filter(Location.id.in_(lids)).all()}
    users = {u.id: u for u in db.query(AppUser).filter(AppUser.id.in_(uids)).all()} if uids else {}
    batch_ids = {int(r.production_batch_id) for r in rows if r.production_batch_id}
    order_ids = {int(r.production_order_id) for r in rows if r.production_order_id}
    batches = (
        {b.id: b for b in db.query(ProductionBatch).filter(ProductionBatch.id.in_(batch_ids)).all()}
        if batch_ids
        else {}
    )
    orders = (
        {o.id: o for o in db.query(ProductionOrder).filter(ProductionOrder.id.in_(order_ids)).all()}
        if order_ids
        else {}
    )
    out: list[dict[str, Any]] = []
    for r in rows:
        p = products.get(int(r.product_id))
        loc = locations.get(int(r.location_id))
        u = users.get(int(r.created_by_user_id)) if r.created_by_user_id else None
        doc_label = None
        doc_kind = None
        if r.production_batch_id:
            b = batches.get(int(r.production_batch_id))
            doc_kind = "batch"
            doc_label = str(b.number if b else f"Partia #{r.production_batch_id}")
        elif r.production_order_id:
            o = orders.get(int(r.production_order_id))
            doc_kind = "order"
            doc_label = str(o.number if o else f"MO #{r.production_order_id}")
        out.append(
            {
                "id": int(r.id),
                "product_id": int(r.product_id),
                "product_name": str(p.name if p else f"Produkt #{r.product_id}"),
                "product_sku": (p.sku or p.symbol if p else None),
                "location_id": int(r.location_id),
                "location_code": str(loc.name if loc else f"#{r.location_id}"),
                "quantity": round(float(r.quantity or 0), 4),
                "batch_number": (r.batch_number or "").strip() or None,
                "lot": (r.batch_number or "").strip() or None,
                "serial_number": (r.serial_number or "").strip() or None,
                "expiry_date": r.expiry_date.isoformat() if r.expiry_date else None,
                "status": str(r.status),
                "reservation_kind": r.reservation_kind,
                "document_kind": doc_kind,
                "document_label": doc_label,
                "production_batch_id": r.production_batch_id,
                "production_order_id": r.production_order_id,
                "warehouse_id": r.warehouse_id,
                "locked_at": r.locked_at.isoformat() if getattr(r, "locked_at", None) else None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "operator_name": (
                    str(getattr(u, "display_name", None) or getattr(u, "username", None) or "").strip() or None
                ),
            }
        )
    return out


def sync_production_reservation_from_collection_task(
    db: Session,
    *,
    tenant_id: int,
    production_batch_id: int | None = None,
    production_order_id: int | None = None,
    component_product_id: int,
    location_id: int | None = None,
    batch_number: str | None = None,
    serial_number: str | None = None,
    quantity: float | None = None,
    ignore_locked: bool = False,
    performed_by_user_id: int | None = None,
) -> None:
    """Paper mode: keep StockReservation aligned when operator changes pick location."""
    q = _active_production_reservations_q(
        db,
        tenant_id=tenant_id,
        production_batch_id=production_batch_id,
        production_order_id=production_order_id,
    ).filter(StockReservation.product_id == int(component_product_id))
    rows = q.order_by(StockReservation.id.asc()).all()
    if not rows:
        return
    res = rows[0]
    loc_changed = location_id is not None and int(location_id) > 0 and int(location_id) != int(res.location_id)
    batch_changed = batch_number is not None and str(batch_number).strip() != str(res.batch_number or "").strip()
    serial_changed = serial_number is not None and str(serial_number).strip() != str(res.serial_number or "").strip()
    qty_changed = quantity is not None and abs(float(quantity) - float(res.quantity)) > 1e-6
    if not (loc_changed or batch_changed or serial_changed or qty_changed):
        return
    update_production_reservation(
        db,
        tenant_id=tenant_id,
        reservation_id=int(res.id),
        location_id=int(location_id) if loc_changed and location_id else None,
        quantity=float(quantity) if qty_changed and quantity is not None else None,
        batch_number=str(batch_number).strip() if batch_changed and batch_number else None,
        serial_number=str(serial_number).strip() if serial_changed and serial_number else None,
        performed_by_user_id=performed_by_user_id,
        ignore_locked=ignore_locked,
    )


def reservations_to_collection_hints(
    db: Session,
    *,
    tenant_id: int,
    production_batch_id: int | None = None,
    production_order_id: int | None = None,
) -> dict[int, list[dict[str, Any]]]:
    """component_product_id -> preferred reservation rows for WMS / paper UI."""
    rows = list_material_reservations(
        db,
        tenant_id=tenant_id,
        production_batch_id=production_batch_id,
        production_order_id=production_order_id,
        active_only=True,
    )
    by_pid: dict[int, list[dict[str, Any]]] = {}
    for r in rows:
        pid = int(r["product_id"])
        by_pid.setdefault(pid, []).append(r)
    return by_pid
