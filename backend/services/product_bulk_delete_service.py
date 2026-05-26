"""
Usuwanie / archiwizacja produktów: najpierw klasyfikacja (historia zamówień / dokumentów mag.),
potem soft (deleted_at) albo twarde usunięcie rekordów zależnych.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import delete, exists, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models.bundle import BundleItem
from ..models.customer import CustomerProductDiscount
from ..models.inbound_delivery import DeliveryItem
from ..models.inventory import Inventory
from ..models.inventory_movement import InventoryMovement
from ..models.inventory_unit import InventoryUnit
from ..models.order_item import OrderItem
from ..models.pick import Pick
from ..models.pick_task import PickTask
from ..models.pick_wave import PickWaveItem, PickWaveTask
from ..models.product import Product
from ..models.product_barcode import ProductBarcode
from ..models.stock import Stock
from ..models.stock_document import StockDocumentItem
from ..models.stock_movement import StockMovement
from ..models.stock_reservation import StockReservation
from ..models.supplier_product import SupplierProduct
from ..models.wms_picking_shortage_report import WmsPickingShortageReport

logger = logging.getLogger(__name__)


def bulk_delete_products_transaction(db: Session, tenant_id: int, id_list: list[int]) -> dict[str, Any]:
    """
    Caller zarządza commit/rollback.

    Zwraca m.in. success_count, soft_deleted_count, errors, messages, deleted (łącznie).
    """
    errors: list[str] = []
    messages: list[str] = []
    raw_ids: list[int] = []
    for x in id_list:
        try:
            n = int(x)
            if n > 0:
                raw_ids.append(n)
        except (TypeError, ValueError):
            continue
    if not raw_ids:
        return _empty_result()

    unique_ids = list(dict.fromkeys(raw_ids))

    scoped = list(
        db.scalars(
            select(Product.id).where(Product.tenant_id == tenant_id, Product.id.in_(unique_ids))
        ).all()
    )
    scoped_set = set(scoped)
    skipped_not_found = len([i for i in unique_ids if i not in scoped_set])
    if not scoped:
        return {**_empty_result(), "skipped_not_found": skipped_not_found}

    already_archived = list(
        db.scalars(select(Product.id).where(Product.tenant_id == tenant_id, Product.id.in_(scoped), Product.deleted_at.isnot(None))).all()
    )
    archived_set = set(already_archived)
    work = [pid for pid in scoped if pid not in archived_set]
    skipped_archived = len(archived_set)

    if not work:
        out = _empty_result()
        out["skipped_not_found"] = skipped_not_found
        if skipped_archived:
            out["messages"] = [f"Pominięto już zarchiwizowane produkty: {skipped_archived}."]
        return out

    soft_reason: dict[int, str] = {}
    for pid in work:
        if db.scalar(select(exists().where(OrderItem.product_id == pid))):
            soft_reason[pid] = "Powiązane pozycje zamówień (order_items)."
        elif db.scalar(select(exists().where(StockDocumentItem.product_id == pid))):
            soft_reason[pid] = "Powiązane linie dokumentów magazynowych (stock_document_items)."
        elif db.scalar(select(exists().where(DeliveryItem.product_id == pid))):
            soft_reason[pid] = "Powiązane linie dostaw (delivery_items)."

    soft_ids = [p for p in work if p in soft_reason]
    hard_ids = [p for p in work if p not in soft_reason]

    now = datetime.utcnow()
    success_count = 0
    soft_deleted_count = 0

    try:
        if soft_ids:
            db.execute(delete(StockReservation).where(StockReservation.product_id.in_(soft_ids)))
            db.execute(delete(InventoryUnit).where(InventoryUnit.product_id.in_(soft_ids)))
            db.execute(delete(Inventory).where(Inventory.product_id.in_(soft_ids)))
            db.execute(update(Product).where(Product.tenant_id == tenant_id, Product.id.in_(soft_ids)).values(deleted_at=now))
            soft_deleted_count = len(soft_ids)
            messages.append(
                f"Zarchiwizowano (soft delete) {soft_deleted_count} produktów powiązanych z historią — "
                "nie są widoczne na liście domyślnej. Powiązany stan magazynowy (inventory) został usunięty."
            )

        if hard_ids:
            pick_ids = list(db.scalars(select(Pick.id).where(Pick.product_id.in_(hard_ids))).all())
            if pick_ids:
                db.execute(delete(PickWaveItem).where(PickWaveItem.pick_id.in_(pick_ids)))
            pick_task_ids = list(db.scalars(select(PickTask.id).where(PickTask.product_id.in_(hard_ids))).all())
            if pick_task_ids:
                db.execute(delete(PickWaveTask).where(PickWaveTask.pick_task_id.in_(pick_task_ids)))
            db.execute(delete(PickTask).where(PickTask.product_id.in_(hard_ids)))
            db.execute(delete(Pick).where(Pick.product_id.in_(hard_ids)))
            db.execute(delete(WmsPickingShortageReport).where(WmsPickingShortageReport.product_id.in_(hard_ids)))
            db.execute(delete(StockReservation).where(StockReservation.product_id.in_(hard_ids)))
            db.execute(delete(InventoryMovement).where(InventoryMovement.product_id.in_(hard_ids)))
            db.execute(delete(InventoryUnit).where(InventoryUnit.product_id.in_(hard_ids)))
            db.execute(delete(Inventory).where(Inventory.product_id.in_(hard_ids)))
            db.execute(delete(StockMovement).where(StockMovement.product_id.in_(hard_ids)))
            db.execute(delete(Stock).where(Stock.product_id.in_(hard_ids)))
            db.execute(delete(BundleItem).where(BundleItem.product_id.in_(hard_ids)))
            db.execute(delete(SupplierProduct).where(SupplierProduct.product_id.in_(hard_ids)))
            db.execute(delete(ProductBarcode).where(ProductBarcode.product_id.in_(hard_ids)))
            db.execute(delete(CustomerProductDiscount).where(CustomerProductDiscount.product_id.in_(hard_ids)))

            res = db.execute(delete(Product).where(Product.tenant_id == tenant_id, Product.id.in_(hard_ids)))
            rc = res.rowcount
            success_count = int(rc) if rc is not None and rc >= 0 else len(hard_ids)
            if success_count:
                messages.append(f"Trwale usunięto {success_count} produktów (brak blokującej historii).")

        if soft_ids and len(soft_ids) <= 5:
            for pid in soft_ids:
                messages.append(f"Produkt id={pid}: {soft_reason[pid]} — zarchiwizowano zamiast usunięto.")
        elif soft_ids:
            messages.append(f"{len(soft_ids)} produktów zarchiwizowanych z powodu powiązań z zamówieniami / dokumentami / dostawami.")

        deleted_total = success_count + soft_deleted_count
        return {
            "success_count": success_count,
            "soft_deleted_count": soft_deleted_count,
            "blocked_count": 0,
            "blocked": [],
            "errors": errors,
            "skipped_not_found": skipped_not_found,
            "messages": messages,
            "deleted": deleted_total,
            "skipped_already_archived": skipped_archived,
        }
    except IntegrityError as e:
        logger.warning("product bulk delete IntegrityError: %s", e)
        return {
            "success_count": 0,
            "soft_deleted_count": 0,
            "blocked_count": 0,
            "blocked": [],
            "errors": [f"Naruszenie klucza obcego: {getattr(e, 'orig', e)!s}"],
            "skipped_not_found": skipped_not_found,
            "messages": [],
            "deleted": 0,
            "skipped_already_archived": skipped_archived,
        }


def _empty_result() -> dict[str, Any]:
    return {
        "success_count": 0,
        "soft_deleted_count": 0,
        "blocked_count": 0,
        "blocked": [],
        "errors": [],
        "skipped_not_found": 0,
        "messages": [],
        "deleted": 0,
        "skipped_already_archived": 0,
    }
