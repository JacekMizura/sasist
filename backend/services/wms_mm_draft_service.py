"""WMS MM draft document: accumulate lines without inventory movement; rozlokowanie completes moves."""

from __future__ import annotations

import math
from datetime import datetime
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.inventory import Inventory
from ..models.location import Location
from ..models.product import Product
from ..models.stock_document import StockDocument, StockDocumentItem
from ..schemas.stock_document import StockDocumentRead
from ..schemas.wms_mm_transfer import WmsMmDraftAppendBody
from ..schemas.wms_receiving import WmsReceivingPzListRow
from .document_creator_service import batch_load_app_users
from .inventory_lot_keys import NO_EXPIRY_SENTINEL
from .stock_document_service import build_stock_document_read, get_stock_document_read, recompute_putaway_status_for_document
from .wms_receiving_service import build_wms_pz_list_row
from .tenant_default_warehouse import list_tenant_warehouse_ids
from .document_number_service import assign_series_number_to_stock_document
from .relocation_document_series_service import assert_relocation_document_series_configured
from .wms_mm_internal_placeholder import get_or_create_mm_placeholder_fks


def _assert_warehouse_for_tenant(db: Session, tenant_id: int, warehouse_id: int) -> None:
    allowed = set(list_tenant_warehouse_ids(db, tenant_id))
    if int(warehouse_id) not in allowed:
        raise ValueError("Magazyn nie jest przypisany do tenanta")


def _available_qty_at_location(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    location_id: int,
    product_id: int,
) -> float:
    v = (
        db.query(func.coalesce(func.sum(Inventory.quantity), 0.0))
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.location_id == int(location_id),
            Inventory.product_id == int(product_id),
        )
        .scalar()
    )
    return float(v or 0)


def _already_staged_on_draft(
    db: Session,
    document_id: int,
    from_location_id: int,
    product_id: int,
) -> float:
    rows = (
        db.query(StockDocumentItem)
        .filter(
            StockDocumentItem.document_id == int(document_id),
            StockDocumentItem.product_id == int(product_id),
            StockDocumentItem.mm_line_from_location_id == int(from_location_id),
        )
        .all()
    )
    return sum(float(r.received_quantity or 0) for r in rows)


def get_or_create_mm_draft_document(db: Session, tenant_id: int, warehouse_id: int) -> StockDocument:
    doc = (
        db.query(StockDocument)
        .filter(
            StockDocument.tenant_id == int(tenant_id),
            StockDocument.warehouse_id == int(warehouse_id),
            StockDocument.document_type == "MM",
            StockDocument.status == "draft",
            StockDocument.relocation_status != "DONE",
        )
        .order_by(StockDocument.updated_at.desc())
        .first()
    )
    if doc:
        return doc
    series = assert_relocation_document_series_configured(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
    )
    sid, did = get_or_create_mm_placeholder_fks(db, tenant_id)
    now = datetime.utcnow()
    doc = StockDocument(
        tenant_id=int(tenant_id),
        document_type="MM",
        supplier_id=sid,
        delivery_id=did,
        warehouse_id=int(warehouse_id),
        source_warehouse_id=int(warehouse_id),
        destination_warehouse_id=int(warehouse_id),
        location_id=None,
        mm_from_location_id=None,
        mm_to_location_id=None,
        status="draft",
        receiving_status="DONE",
        putaway_status="NOT_STARTED",
        relocation_status="OPEN",
        creation_source="WMS",
        created_at=now,
        updated_at=now,
    )
    db.add(doc)
    db.flush()
    wh_code = str(getattr(series, "code", None) or "").strip() or None
    assign_series_number_to_stock_document(db, doc, series, warehouse_code=wh_code)
    return doc


def get_mm_draft_document_read(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
) -> Optional[StockDocumentRead]:
    doc = (
        db.query(StockDocument)
        .filter(
            StockDocument.tenant_id == int(tenant_id),
            StockDocument.warehouse_id == int(warehouse_id),
            StockDocument.document_type == "MM",
            StockDocument.status == "draft",
            StockDocument.relocation_status != "DONE",
        )
        .order_by(StockDocument.updated_at.desc())
        .first()
    )
    if not doc:
        return None
    return build_stock_document_read(db, doc)


def append_mm_draft_line(
    db: Session,
    tenant_id: int,
    body: WmsMmDraftAppendBody,
) -> StockDocumentRead:
    wh_id = int(body.warehouse_id)
    from_id = int(body.from_location_id)
    pid = int(body.product_id)
    qty = float(body.quantity)

    if not math.isfinite(qty) or qty <= 1e-9:
        raise ValueError("Nieprawidłowa ilość")

    _assert_warehouse_for_tenant(db, int(tenant_id), wh_id)
    loc = db.query(Location).filter(Location.id == from_id, Location.warehouse_id == wh_id).first()
    if not loc:
        raise ValueError("Lokalizacja źródłowa nie należy do tego magazynu")

    prod = db.query(Product).filter(Product.id == pid).first()
    if not prod:
        raise ValueError("Produkt nie istnieje")

    avail = _available_qty_at_location(db, tenant_id, wh_id, from_id, pid)
    doc = get_or_create_mm_draft_document(db, tenant_id, wh_id)
    staged = _already_staged_on_draft(db, int(doc.id), from_id, pid)
    if staged + qty > avail + 1e-6:
        raise ValueError("Łączna ilość na dokumencie przekroczyłaby stan w lokalizacji źródłowej")

    existing = (
        db.query(StockDocumentItem)
        .filter(
            StockDocumentItem.document_id == int(doc.id),
            StockDocumentItem.product_id == pid,
            StockDocumentItem.mm_line_from_location_id == from_id,
        )
        .first()
    )
    now = datetime.utcnow()
    if existing:
        existing.ordered_quantity = float(existing.ordered_quantity or 0) + qty
        existing.received_quantity = float(existing.received_quantity or 0) + qty
        existing.quantity = float(existing.quantity or 0) + qty
    else:
        db.add(
            StockDocumentItem(
                document_id=int(doc.id),
                delivery_item_id=None,
                product_id=pid,
                ordered_quantity=qty,
                received_quantity=qty,
                quantity_putaway=0.0,
                quantity=qty,
                purchase_price_net=None,
                vat_rate=23.0,
                batch_number="",
                expiry_date=NO_EXPIRY_SENTINEL,
                mm_line_from_location_id=from_id,
            )
        )
    doc.updated_at = now
    db.flush()
    all_rows: List[StockDocumentItem] = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == doc.id)
        .order_by(StockDocumentItem.id)
        .all()
    )
    recompute_putaway_status_for_document(doc, all_rows)
    db.commit()
    db.refresh(doc)
    return build_stock_document_read(db, doc)


def list_wms_mm_relocation_documents(db: Session, tenant_id: int) -> List[WmsReceivingPzListRow]:
    """Draft MM (PM) with staged qty and relocation OPEN — warehouse transfer queue, not PZ receiving."""
    q = (
        db.query(StockDocument)
        .filter(
            StockDocument.tenant_id == int(tenant_id),
            StockDocument.document_type == "MM",
            StockDocument.status == "draft",
            StockDocument.relocation_status != "DONE",
        )
        .order_by(StockDocument.updated_at.desc(), StockDocument.id.desc())
    )
    docs = q.all()
    if not docs:
        return []
    dids = [d.id for d in docs]
    items = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id.in_(dids))
        .order_by(StockDocumentItem.id)
        .all()
    )
    by_doc: dict[int, list[StockDocumentItem]] = {}
    for it in items:
        by_doc.setdefault(it.document_id, []).append(it)
    merged: list[tuple[StockDocument, list[StockDocumentItem]]] = []
    for d in docs:
        lines = by_doc.get(d.id) or []
        if any(float(x.received_quantity or 0) > 1e-9 for x in lines):
            merged.append((d, lines))
    creator_ids = {
        int(d.created_by_user_id)
        for d, _lines in merged
        if getattr(d, "created_by_user_id", None) is not None
    }
    users_by_id = batch_load_app_users(db, creator_ids)
    return [
        build_wms_pz_list_row(db, d, lines, users_by_id=users_by_id)
        for d, lines in merged
    ]


def get_wms_mm_relocation_document_read(
    db: Session,
    tenant_id: int,
    document_id: int,
) -> StockDocumentRead:
    """Single MM draft for completing internal transfer (lines with staged qty only)."""
    doc = get_stock_document_read(db, tenant_id, document_id)
    if doc is None:
        raise ValueError("Dokument nie znaleziony")
    if str(getattr(doc, "document_type", None) or "").strip().upper() != "MM":
        raise ValueError("To nie jest dokument przesunięcia magazynowego (PM/MM)")
    if str(getattr(doc, "status", None) or "").strip().lower() != "draft":
        raise ValueError("Przesunięcie dostępne tylko dla dokumentu roboczego")
    if str(getattr(doc, "relocation_status", None) or "").strip().upper() == "DONE":
        raise ValueError("Przesunięcie zostało już zakończone")
    eps = 1e-5
    staged = [it for it in (doc.items or []) if float(it.received_quantity or 0) > eps]
    if not staged:
        raise ValueError("Brak pozycji do przesunięcia na dokumencie")
    all_items = list(doc.items or [])
    t_ord = sum(float(it.ordered_quantity or 0) for it in all_items)
    t_rec = sum(float(it.received_quantity or 0) for it in all_items)
    t_put = sum(float(it.quantity_putaway or 0) for it in all_items)
    doc.total_ordered = t_ord
    doc.total_received = t_rec
    doc.putaway_target_quantity = t_rec
    doc.total_putaway = t_put
    doc.items = staged
    return doc
