"""Warehouse-level business reservations for classic sales orders + RZ documents."""

from __future__ import annotations

import logging
import threading
from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import text
from sqlalchemy.orm import Session

from ...models.inventory import Inventory
from ...models.order_warehouse_reservation import OrderWarehouseReservation
from ...models.stock_document import StockDocument
from ...models.warehouse import Warehouse
from ..activity_log.domain_activity import record_domain_activity
from ..activity_log.domain_event_codes import (
    ORDER_WAREHOUSE_RESERVATION_CONSUMED,
    ORDER_WAREHOUSE_RESERVATION_CREATED,
    ORDER_WAREHOUSE_RESERVATION_RELEASED,
)
from ..pg_advisory_lock import stable_advisory_lock_key
from ..stock_disposition import DEFAULT_STOCK_DISPOSITION, normalize_stock_disposition
from .availability import warehouse_business_available_qty
from .constants import (
    OWR_ACTIVE_STATUSES,
    OWR_STATUS_CANCELLED,
    OWR_STATUS_CONSUMED,
    OWR_STATUS_PARTIALLY_CONSUMED,
    OWR_STATUS_RELEASED,
    OWR_STATUS_RESERVED,
)
from .rz_document_service import sync_rz_document_status

logger = logging.getLogger(__name__)

_fallback_locks: dict[int, threading.RLock] = {}
_fallback_guard = threading.Lock()


class OrderWarehouseReservationError(ValueError):
    def __init__(self, message: str, *, code: str = "order_warehouse_reservation_error"):
        super().__init__(message)
        self.code = code


@contextmanager
def _product_reserve_lock(
    db: Session, *, tenant_id: int, warehouse_id: int, product_id: int
) -> Iterator[None]:
    """PG transaction advisory lock; same-process RLock fallback (SQLite/tests)."""
    key = int(
        stable_advisory_lock_key(
            "order_wh_reserve", int(tenant_id), int(warehouse_id), int(product_id)
        )
    )
    fallback: threading.RLock | None = None
    bind = db.get_bind()
    dialect = (getattr(getattr(bind, "dialect", None), "name", None) or "").lower()
    if dialect.startswith("postgres"):
        try:
            db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": key})
        except Exception:
            logger.debug("advisory lock failed key=%s — using thread lock", key, exc_info=True)
            with _fallback_guard:
                fallback = _fallback_locks.setdefault(key, threading.RLock())
            fallback.acquire()
    else:
        with _fallback_guard:
            fallback = _fallback_locks.setdefault(key, threading.RLock())
        fallback.acquire()
    try:
        yield
    finally:
        if fallback is not None:
            fallback.release()


def _wh_name(db: Session, warehouse_id: int) -> str:
    wh = db.query(Warehouse).filter(Warehouse.id == int(warehouse_id)).first()
    return (wh.name if wh else None) or f"#{warehouse_id}"


def _refresh_status(row: OrderWarehouseReservation) -> None:
    rem = float(row.quantity or 0)
    orig = float(row.quantity_original or 0)
    if rem <= 1e-9:
        if str(row.status) in (OWR_STATUS_CANCELLED, OWR_STATUS_RELEASED):
            return
        row.status = OWR_STATUS_CONSUMED
        return
    if orig > rem + 1e-9:
        row.status = OWR_STATUS_PARTIALLY_CONSUMED
    else:
        row.status = OWR_STATUS_RESERVED


def get_active_reservation(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    product_id: int,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
    for_update: bool = False,
) -> OrderWarehouseReservation | None:
    sd = normalize_stock_disposition(stock_disposition)
    q = db.query(OrderWarehouseReservation).filter(
        OrderWarehouseReservation.tenant_id == int(tenant_id),
        OrderWarehouseReservation.warehouse_id == int(warehouse_id),
        OrderWarehouseReservation.order_id == int(order_id),
        OrderWarehouseReservation.product_id == int(product_id),
        OrderWarehouseReservation.stock_disposition == sd,
        OrderWarehouseReservation.status.in_(tuple(OWR_ACTIVE_STATUSES)),
    )
    if for_update:
        q = q.with_for_update()
    return q.first()


def reserved_qty_for_order_product(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    product_id: int,
    warehouse_id: int | None = None,
    stock_disposition: str | None = None,
) -> float:
    sd = normalize_stock_disposition(stock_disposition or DEFAULT_STOCK_DISPOSITION)
    q = db.query(OrderWarehouseReservation).filter(
        OrderWarehouseReservation.tenant_id == int(tenant_id),
        OrderWarehouseReservation.order_id == int(order_id),
        OrderWarehouseReservation.product_id == int(product_id),
        OrderWarehouseReservation.status.in_(tuple(OWR_ACTIVE_STATUSES)),
        OrderWarehouseReservation.stock_disposition == sd,
    )
    if warehouse_id is not None:
        q = q.filter(OrderWarehouseReservation.warehouse_id == int(warehouse_id))
    return round(sum(float(r.quantity or 0) for r in q.all()), 6)


def ensure_order_warehouse_reservation(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    product_id: int,
    quantity: float,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
    created_by_user_id: int | None = None,
    emit_activity: bool = True,
) -> OrderWarehouseReservation:
    """Increase/create business reservation. Physical unchanged. No location_id."""
    need = float(quantity or 0)
    if need <= 1e-9:
        existing = get_active_reservation(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            order_id=order_id,
            product_id=product_id,
            stock_disposition=stock_disposition,
        )
        if existing is not None:
            return existing
        raise OrderWarehouseReservationError("Zerowa ilość rezerwacji.", code="zero_qty")

    tid, wid, oid, pid = int(tenant_id), int(warehouse_id), int(order_id), int(product_id)
    sd = normalize_stock_disposition(stock_disposition)
    with _product_reserve_lock(db, tenant_id=tid, warehouse_id=wid, product_id=pid):
        (
            db.query(Inventory)
            .filter(
                Inventory.tenant_id == tid,
                Inventory.warehouse_id == wid,
                Inventory.product_id == pid,
                Inventory.stock_disposition == sd,
            )
            .with_for_update()
            .all()
        )

        free = warehouse_business_available_qty(
            db,
            tenant_id=tid,
            warehouse_id=wid,
            product_id=pid,
            stock_disposition=sd,
            exclude_order_id=None,
        )
        if free + 1e-9 < need:
            raise OrderWarehouseReservationError(
                f"Brak dostępnego stanu do rezerwacji: potrzeba {need}, dostępne {free}.",
                code="insufficient_atp",
            )

        row = (
            db.query(OrderWarehouseReservation)
            .filter(
                OrderWarehouseReservation.tenant_id == tid,
                OrderWarehouseReservation.warehouse_id == wid,
                OrderWarehouseReservation.order_id == oid,
                OrderWarehouseReservation.product_id == pid,
                OrderWarehouseReservation.stock_disposition == sd,
            )
            .with_for_update()
            .first()
        )
        if row is None:
            row = OrderWarehouseReservation(
                tenant_id=tid,
                warehouse_id=wid,
                order_id=oid,
                product_id=pid,
                quantity=round(need, 6),
                quantity_original=round(need, 6),
                status=OWR_STATUS_RESERVED,
                stock_disposition=sd,
                created_by_user_id=created_by_user_id,
            )
            db.add(row)
        elif str(row.status) not in OWR_ACTIVE_STATUSES:
            row.quantity = round(need, 6)
            row.quantity_original = round(need, 6)
            row.status = OWR_STATUS_RESERVED
        else:
            row.quantity = round(float(row.quantity or 0) + need, 6)
            row.quantity_original = round(float(row.quantity_original or 0) + need, 6)
            _refresh_status(row)
        db.flush()
        sync_rz_document_status(db, tenant_id=tid, warehouse_id=wid, order_id=oid)
        if emit_activity:
            wh_name = _wh_name(db, wid)
            record_domain_activity(
                db,
                tenant_id=tid,
                event_type=ORDER_WAREHOUSE_RESERVATION_CREATED,
                description=f"Zarezerwowano {need:g} szt. produktu #{pid} w magazynie {wh_name}.",
                order_id=oid,
                product_id=pid,
                warehouse_id=wid,
                stock_document_id=int(row.stock_document_id) if row.stock_document_id else None,
                correlation_id=f"owr-res:{oid}:{pid}:{row.id}:{float(row.quantity or 0)}",
                metadata={"quantity": need, "remaining": float(row.quantity or 0)},
            )
        return row


def sync_order_warehouse_reservation_to_target(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    product_id: int,
    target_qty: float,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
    performed_by_user_id: int | None = None,
) -> float:
    target = max(0.0, float(target_qty or 0))
    tid, wid, oid, pid = int(tenant_id), int(warehouse_id), int(order_id), int(product_id)
    sd = normalize_stock_disposition(stock_disposition)
    with _product_reserve_lock(db, tenant_id=tid, warehouse_id=wid, product_id=pid):
        row = (
            db.query(OrderWarehouseReservation)
            .filter(
                OrderWarehouseReservation.tenant_id == tid,
                OrderWarehouseReservation.warehouse_id == wid,
                OrderWarehouseReservation.order_id == oid,
                OrderWarehouseReservation.product_id == pid,
                OrderWarehouseReservation.stock_disposition == sd,
            )
            .with_for_update()
            .first()
        )
        current = float(row.quantity or 0) if row and str(row.status) in OWR_ACTIVE_STATUSES else 0.0
        if abs(current - target) <= 1e-9:
            return current
        if target > current + 1e-9:
            ensure_order_warehouse_reservation(
                db,
                tenant_id=tid,
                warehouse_id=wid,
                order_id=oid,
                product_id=pid,
                quantity=round(target - current, 6),
                stock_disposition=sd,
                created_by_user_id=performed_by_user_id,
            )
            return reserved_qty_for_order_product(
                db, tenant_id=tid, order_id=oid, product_id=pid, warehouse_id=wid, stock_disposition=sd
            )

        if row is None:
            return 0.0
        released = round(current - target, 6)
        row.quantity = round(target, 6)
        if target <= 1e-9:
            row.status = OWR_STATUS_RELEASED
            row.quantity = 0.0
        else:
            _refresh_status(row)
        db.flush()
        sync_rz_document_status(db, tenant_id=tid, warehouse_id=wid, order_id=oid)
        record_domain_activity(
            db,
            tenant_id=tid,
            event_type=ORDER_WAREHOUSE_RESERVATION_RELEASED,
            description=f"Zwolniono {released:g} szt. rezerwacji.",
            order_id=oid,
            product_id=pid,
            warehouse_id=wid,
            correlation_id=f"owr-rel:{oid}:{pid}:{released}:{row.id}",
            metadata={"released": released, "remaining": float(row.quantity or 0)},
        )
        return float(row.quantity or 0)


def release_order_warehouse_reservations(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    warehouse_id: int | None = None,
    product_id: int | None = None,
    reason: str = "order_cancelled",
    performed_by_user_id: int | None = None,
) -> int:
    q = db.query(OrderWarehouseReservation).filter(
        OrderWarehouseReservation.tenant_id == int(tenant_id),
        OrderWarehouseReservation.order_id == int(order_id),
        OrderWarehouseReservation.status.in_(tuple(OWR_ACTIVE_STATUSES)),
    )
    if warehouse_id is not None:
        q = q.filter(OrderWarehouseReservation.warehouse_id == int(warehouse_id))
    if product_id is not None:
        q = q.filter(OrderWarehouseReservation.product_id == int(product_id))
    rows = list(q.with_for_update().all())
    wh_ids: set[int] = set()
    for r in rows:
        released = float(r.quantity or 0)
        r.quantity = 0.0
        r.status = OWR_STATUS_CANCELLED if "cancel" in reason else OWR_STATUS_RELEASED
        wh_ids.add(int(r.warehouse_id))
        record_domain_activity(
            db,
            tenant_id=int(tenant_id),
            event_type=ORDER_WAREHOUSE_RESERVATION_RELEASED,
            description=f"Zwolniono {released:g} szt. rezerwacji.",
            order_id=int(order_id),
            product_id=int(r.product_id),
            warehouse_id=int(r.warehouse_id),
            correlation_id=f"owr-cancel:{order_id}:{r.id}:{reason}",
            metadata={"reason": reason, "released": released},
        )
    db.flush()
    for wid in wh_ids:
        sync_rz_document_status(
            db, tenant_id=int(tenant_id), warehouse_id=wid, order_id=int(order_id)
        )
    return len(rows)


def consume_order_warehouse_reservation(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    product_id: int,
    quantity: float,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
) -> float:
    need = float(quantity or 0)
    if need <= 1e-9:
        return 0.0
    tid, wid, oid, pid = int(tenant_id), int(warehouse_id), int(order_id), int(product_id)
    sd = normalize_stock_disposition(stock_disposition)
    row = get_active_reservation(
        db,
        tenant_id=tid,
        warehouse_id=wid,
        order_id=oid,
        product_id=pid,
        stock_disposition=sd,
        for_update=True,
    )
    if row is None:
        return 0.0
    cur = float(row.quantity or 0)
    take = min(cur, need)
    row.quantity = round(cur - take, 6)
    _refresh_status(row)
    db.flush()
    sync_rz_document_status(db, tenant_id=tid, warehouse_id=wid, order_id=oid)
    if str(row.status) == OWR_STATUS_CONSUMED:
        doc_id = row.stock_document_id
        num = None
        if doc_id:
            d = db.query(StockDocument).filter(StockDocument.id == int(doc_id)).first()
            num = d.document_number if d else None
        record_domain_activity(
            db,
            tenant_id=tid,
            event_type=ORDER_WAREHOUSE_RESERVATION_CONSUMED,
            description=(
                f"Rezerwacja {num} została zrealizowana."
                if num
                else "Rezerwacja została zrealizowana."
            ),
            order_id=oid,
            product_id=pid,
            warehouse_id=wid,
            stock_document_id=int(doc_id) if doc_id else None,
            correlation_id=f"owr-done:{oid}:{pid}:{row.id}",
        )
    return take


def assert_pick_within_business_reservation(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    product_id: int,
    quantity: float,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
) -> None:
    row = get_active_reservation(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_id=order_id,
        product_id=product_id,
        stock_disposition=stock_disposition,
    )
    if row is None:
        # Legacy / no business claim — do not block pick.
        return
    rem = float(row.quantity or 0)
    if float(quantity or 0) > rem + 1e-6:
        raise OrderWarehouseReservationError(
            f"Alokacja WMS ({quantity}) przekracza rezerwację biznesową ({rem}).",
            code="allocation_exceeds_reservation",
        )
