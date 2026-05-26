"""
Masowe usuwanie / archiwizacja zamówień.

- Twarde usunięcie tylko gdy brak „śladu” blokującego FK (np. wiersz RMZ z ``order_id``,
  wystawiony dokument sprzedaży, aktywna reklamacja).
- Gdy ślad istnieje (także przy zarchiwizowanym RMZ) — ``orders.deleted_at`` (ukrycie z listy),
  wiersz zamówienia pozostaje w bazie.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models.cart_basket import CartBasket
from ..models.complaint import Complaint
from ..models.complaint_line import ComplaintLine
from ..models.consolidation_rack import RackSegment
from ..models.fulfillment_event import FulfillmentEvent
from ..models.order import Order
from ..models.order_issue_task import OrderIssueTask
from ..models.order_item import OrderItem
from ..models.pick import Pick
from ..models.pick_task import PickTask
from ..models.pick_wave import PickWaveItem, PickWaveTask
from ..models.picking_zone import order_zone_association
from ..models.sale_document import SaleDocument
from ..models.stock_reservation import StockReservation
from ..models.wms_order_return import WmsOrderReturn
from ..models.wms_recovery_pick_task import WmsRecoveryPickTask
from ..models.wms_rmz_line import RMZLine

logger = logging.getLogger(__name__)

_FK_TOAST_PL = (
    "Niektóre zamówienia mają powiązaną historię (zwroty/reklamacje), "
    "więc zostały zarchiwizowane zamiast usunięte."
)


def _order_ids_requiring_soft_archive(db: Session, order_ids: list[int]) -> set[int]:
    """Zamówienia, których nie wolno fizycznie kasować przy zachowaniu FK / historii panelu."""
    if not order_ids:
        return set()
    allowed = set(order_ids)
    need: set[int] = set()

    r1 = db.scalars(select(WmsOrderReturn.order_id).where(WmsOrderReturn.order_id.in_(order_ids)).distinct()).all()
    need.update(int(x) for x in r1 if x is not None)

    r2 = db.scalars(select(SaleDocument.order_id).where(SaleDocument.order_id.in_(order_ids)).distinct()).all()
    need.update(int(x) for x in r2 if x is not None)

    r3 = db.scalars(
        select(Complaint.order_id)
        .where(
            Complaint.order_id.in_(order_ids),
            Complaint.order_id.isnot(None),
            Complaint.deleted_at.is_(None),
        )
        .distinct()
    ).all()
    need.update(int(x) for x in r3 if x is not None)

    return need & allowed


def _normalize_integrity_errors(errors: list[str]) -> list[str]:
    out: list[str] = []
    for e in errors:
        s = str(e)
        low = s.lower()
        if "naruszenie klucza obcego" in low or "foreign key" in low or "integrity" in low:
            if _FK_TOAST_PL not in out:
                out.append(_FK_TOAST_PL)
        else:
            out.append(s)
    return out


def bulk_delete_orders_transaction(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    id_list: list[int],
) -> dict[str, Any]:
    """
    Usuwa lub archiwizuje zamówienia w jednej transakcji (caller robi commit/rollback).

    Zwraca m.in. ``deleted_count``, ``soft_deleted_count`` (zarchiwizowane), ``errors``.
    """
    errors: list[str] = []
    blocked: list[dict[str, Any]] = []

    raw_ids: list[int] = []
    for x in id_list:
        try:
            n = int(x)
            if n > 0:
                raw_ids.append(n)
        except (TypeError, ValueError):
            continue

    if not raw_ids:
        return {
            "deleted": 0,
            "deleted_count": 0,
            "soft_deleted_count": 0,
            "blocked_count": 0,
            "blocked": [],
            "errors": [],
            "skipped_not_found": 0,
        }

    unique_requested = list(dict.fromkeys(raw_ids))

    scoped = list(
        db.scalars(
            select(Order.id).where(
                Order.tenant_id == tenant_id,
                Order.warehouse_id == warehouse_id,
                Order.id.in_(unique_requested),
                Order.deleted_at.is_(None),
            )
        ).all()
    )
    scoped_ints = [int(x) for x in scoped]
    scoped_set = set(scoped_ints)
    skipped_not_found = len([i for i in unique_requested if i not in scoped_set])

    if not scoped_ints:
        return {
            "deleted": 0,
            "deleted_count": 0,
            "soft_deleted_count": 0,
            "blocked_count": 0,
            "blocked": [],
            "errors": errors,
            "skipped_not_found": skipped_not_found,
        }

    need_archive = _order_ids_requiring_soft_archive(db, scoped_ints)
    archive_ids = sorted(need_archive)
    hard_ids = [oid for oid in scoped_ints if oid not in need_archive]

    soft_deleted_count = 0
    deleted_n = 0

    if archive_ids:
        now = datetime.utcnow()
        res = db.execute(
            update(Order)
            .where(
                Order.tenant_id == tenant_id,
                Order.warehouse_id == warehouse_id,
                Order.id.in_(archive_ids),
                Order.deleted_at.is_(None),
            )
            .values(deleted_at=now)
        )
        try:
            rc = int(res.rowcount or 0)
        except (TypeError, ValueError):
            rc = 0
        soft_deleted_count = rc if rc > 0 else len(archive_ids)
        if archive_ids:
            db.execute(delete(OrderIssueTask).where(OrderIssueTask.order_id.in_(archive_ids)))

    if hard_ids:
        try:
            with db.begin_nested():
                pick_ids = list(db.scalars(select(Pick.id).where(Pick.order_id.in_(hard_ids))).all())
                if pick_ids:
                    db.execute(delete(PickWaveItem).where(PickWaveItem.pick_id.in_(pick_ids)))

                pick_task_ids = list(db.scalars(select(PickTask.id).where(PickTask.order_id.in_(hard_ids))).all())
                if pick_task_ids:
                    db.execute(delete(PickWaveTask).where(PickWaveTask.pick_task_id.in_(pick_task_ids)))

                db.execute(delete(PickTask).where(PickTask.order_id.in_(hard_ids)))
                db.execute(delete(Pick).where(Pick.order_id.in_(hard_ids)))

                oi_ids = list(db.scalars(select(OrderItem.id).where(OrderItem.order_id.in_(hard_ids))).all())
                if oi_ids:
                    db.execute(delete(FulfillmentEvent).where(FulfillmentEvent.order_item_id.in_(oi_ids)))
                    db.execute(delete(ComplaintLine).where(ComplaintLine.order_item_id.in_(oi_ids)))
                    db.execute(delete(RMZLine).where(RMZLine.order_item_id.in_(oi_ids)))

                db.execute(delete(StockReservation).where(StockReservation.order_id.in_(hard_ids)))
                db.execute(delete(WmsRecoveryPickTask).where(WmsRecoveryPickTask.order_id.in_(hard_ids)))
                db.execute(delete(OrderIssueTask).where(OrderIssueTask.order_id.in_(hard_ids)))
                db.execute(delete(SaleDocument).where(SaleDocument.order_id.in_(hard_ids)))

                db.execute(update(CartBasket).where(CartBasket.order_id.in_(hard_ids)).values(order_id=None))
                db.execute(update(RackSegment).where(RackSegment.order_id.in_(hard_ids)).values(order_id=None))

                db.execute(update(Complaint).where(Complaint.order_id.in_(hard_ids)).values(order_id=None))
                db.execute(update(Order).where(Order.original_order_id.in_(hard_ids)).values(original_order_id=None))

                db.execute(delete(order_zone_association).where(order_zone_association.c.order_id.in_(hard_ids)))
                db.execute(delete(OrderItem).where(OrderItem.order_id.in_(hard_ids)))

                res = db.execute(
                    delete(Order).where(
                        Order.tenant_id == tenant_id,
                        Order.warehouse_id == warehouse_id,
                        Order.id.in_(hard_ids),
                    )
                )
                deleted_n = res.rowcount
                if deleted_n is None or deleted_n < 0:
                    deleted_n = len(hard_ids)
                deleted_n = int(deleted_n)
        except IntegrityError as e:
            logger.warning("order bulk delete IntegrityError: %s", e)
            return {
                "deleted": 0,
                "deleted_count": 0,
                "soft_deleted_count": soft_deleted_count,
                "blocked_count": 0,
                "blocked": blocked,
                "errors": _normalize_integrity_errors([str(getattr(e, "orig", e))]),
                "skipped_not_found": skipped_not_found,
            }

    return {
        "deleted": deleted_n,
        "deleted_count": deleted_n,
        "soft_deleted_count": soft_deleted_count,
        "blocked_count": 0,
        "blocked": blocked,
        "errors": errors,
        "skipped_not_found": skipped_not_found,
    }
