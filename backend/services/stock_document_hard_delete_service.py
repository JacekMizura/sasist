"""Hard-delete stock documents: revert inventory when stock_operations exist, then remove rows."""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import List

from sqlalchemy.orm import Session

from ..models.inbound_delivery import DeliveryItem, InboundDelivery
from ..models.inventory import Inventory
from ..models.location import Location
from ..models.product import Product
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.stock_operation import STOCK_OP_PUTAWAY, StockOperation
from ..services.inventory_lot_keys import NO_EXPIRY_SENTINEL, normalize_batch_number
from ..services.stock_document_service import (
    _doc_status_lower,
    _item_storage_lot_inventory_key,
    _normalize_location_uuid,
    is_stock_document_item_wm_material,
)
from ..services.wm_catalog_stock_service import revert_wm_catalog_receive_delta

_logger = logging.getLogger(__name__)
_EPS = 1e-6


def _subtract_inventory_qty(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    location_id: int,
    batch_number: str,
    expiry_date: object,
    qty: float,
    *,
    context: str,
) -> None:
    inv = (
        db.query(Inventory)
        .filter(
            Inventory.tenant_id == tenant_id,
            Inventory.product_id == product_id,
            Inventory.warehouse_id == warehouse_id,
            Inventory.location_id == location_id,
            Inventory.batch_number == batch_number,
            Inventory.expiry_date == expiry_date,
        )
        .first()
    )
    if not inv:
        raise ValueError(
            f"Brak wiersza magazynowego do odwrócenia ({context}) — przerwano usuwanie dokumentu."
        )
    new_q = float(inv.quantity or 0) - float(qty)
    if new_q < -_EPS:
        raise ValueError(
            f"Niewystarczający stan magazynowy do odwrócenia ({context})."
        )
    if new_q <= _EPS:
        db.delete(inv)
    else:
        inv.quantity = new_q


def _revert_putaway_operations(
    db: Session,
    tenant_id: int,
    doc: StockDocument,
    items_by_id: dict[int, StockDocumentItem],
    prod_by_id: dict[int, Product | None],
) -> None:
    ops = (
        db.query(StockOperation)
        .filter(StockOperation.document_id == doc.id, StockOperation.type == STOCK_OP_PUTAWAY)
        .order_by(StockOperation.id.desc())
        .all()
    )
    wh = doc.warehouse_id
    if wh is None:
        if ops:
            raise ValueError("Brak magazynu na dokumencie — nie można odwrócić rozlokowania.")
        return

    for op in ops:
        line = items_by_id.get(int(op.document_line_id))
        if not line:
            continue
        if is_stock_document_item_wm_material(line):
            continue
        if op.location_id is None:
            continue
        p = prod_by_id.get(line.product_id) if line.product_id is not None else None
        _, bn, ed_store = _item_storage_lot_inventory_key(line, p)
        _subtract_inventory_qty(
            db,
            tenant_id,
            int(wh),
            int(line.product_id),
            int(op.location_id),
            bn,
            ed_store,
            float(op.qty or 0),
            context=f"rozlokowanie, lokalizacja #{op.location_id}",
        )


def _revert_posted_accept_inventory_and_delivery(
    db: Session,
    tenant_id: int,
    doc: StockDocument,
    items: List[StockDocumentItem],
) -> None:
    """Undo accept_stock_document: dock inventory + delivery line quantities."""
    d = (
        db.query(InboundDelivery)
        .filter(InboundDelivery.id == doc.delivery_id, InboundDelivery.tenant_id == tenant_id)
        .first()
    )
    if not d:
        raise ValueError("Powiązana dostawa nie została znaleziona — przerwano usuwanie.")

    if doc.location_id is None or doc.warehouse_id is None:
        raise ValueError("Brak lokalizacji lub magazynu na dokumencie — przerwano usuwanie.")

    loc = db.query(Location).filter(Location.id == doc.location_id).first()
    if not loc:
        raise ValueError("Lokalizacja przyjęcia nie znaleziona.")

    loc_uuid = _normalize_location_uuid(getattr(loc, "location_uuid", None))

    rec_by_delivery_item: dict[int, float] = defaultdict(float)
    for sdi in items:
        rec = float(sdi.received_quantity or 0)
        if rec <= 1e-9:
            continue
        if sdi.delivery_item_id is not None:
            rec_by_delivery_item[int(sdi.delivery_item_id)] += rec

    for di_id, rec_sum in rec_by_delivery_item.items():
        di = (
            db.query(DeliveryItem)
            .filter(DeliveryItem.id == di_id, DeliveryItem.delivery_id == d.id)
            .first()
        )
        if di:
            cur = float(di.quantity_received or 0)
            di.quantity_received = max(0.0, cur - rec_sum)

    for sdi in items:
        rec = float(sdi.received_quantity or 0)
        if rec <= 1e-9:
            continue
        put = float(getattr(sdi, "quantity_putaway", 0) or 0)
        to_dock = max(0.0, rec - put)
        if to_dock <= 1e-9:
            continue

        if is_stock_document_item_wm_material(sdi):
            revert_wm_catalog_receive_delta(
                db,
                tenant_id,
                str(getattr(sdi, "wm_kind", "") or ""),
                str(getattr(sdi, "wm_id", "") or ""),
                to_dock,
            )
            continue

        prod = db.query(Product).filter(Product.id == sdi.product_id).first()
        tb = bool(getattr(prod, "track_batch", False)) if prod else False
        te = bool(getattr(prod, "track_expiry", False)) if prod else False
        bn = "" if not tb else normalize_batch_number(getattr(sdi, "batch_number", None))
        if not te:
            ed_store = NO_EXPIRY_SENTINEL
        else:
            ed_raw = getattr(sdi, "expiry_date", None)
            if ed_raw is None or ed_raw >= NO_EXPIRY_SENTINEL:
                raise ValueError("Nie można odwrócić przyjęcia — brak danych partii / ważności na linii.")
            ed_store = ed_raw

        inv = (
            db.query(Inventory)
            .filter(
                Inventory.tenant_id == tenant_id,
                Inventory.product_id == sdi.product_id,
                Inventory.warehouse_id == doc.warehouse_id,
                Inventory.location_id == doc.location_id,
                Inventory.batch_number == bn,
                Inventory.expiry_date == ed_store,
            )
            .first()
        )
        if not inv:
            raise ValueError(
                "Brak stanu na lokalizacji przyjęcia do odwrócenia — przerwano usuwanie dokumentu."
            )
        new_q = float(inv.quantity or 0) - to_dock
        if new_q < -_EPS:
            raise ValueError("Niewystarczający stan na lokalizacji przyjęcia do odwrócenia.")
        if new_q <= _EPS:
            db.delete(inv)
        else:
            inv.quantity = new_q
            if loc_uuid and not _normalize_location_uuid(getattr(inv, "location_uuid", None)):
                inv.location_uuid = loc_uuid


def hard_delete_stock_document(db: Session, tenant_id: int, document_id: int) -> None:
    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == document_id, StockDocument.tenant_id == tenant_id)
        .first()
    )
    if not doc:
        raise ValueError("Document not found")

    items: List[StockDocumentItem] = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == document_id)
        .order_by(StockDocumentItem.id)
        .all()
    )
    items_by_id = {r.id: r for r in items}

    pids = list({r.product_id for r in items if r.product_id is not None})
    prod_by_id: dict[int, Product | None] = {}
    if pids:
        for p in db.query(Product).filter(Product.id.in_(pids)).all():
            prod_by_id[int(p.id)] = p

    has_ops = (
        db.query(StockOperation.id).filter(StockOperation.document_id == document_id).first() is not None
    )

    try:
        if has_ops:
            _revert_putaway_operations(db, tenant_id, doc, items_by_id, prod_by_id)
            if _doc_status_lower(doc) == "posted":
                _revert_posted_accept_inventory_and_delivery(db, tenant_id, doc, items)

        db.delete(doc)
        db.commit()
        _logger.info("hard_delete_stock_document tenant_id=%s document_id=%s", tenant_id, document_id)
    except Exception:
        db.rollback()
        raise
