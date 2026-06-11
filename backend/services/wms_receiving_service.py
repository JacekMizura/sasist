"""Apply WMS physical counts to PZ lines (delta += only; no inventory or delivery updates)."""

from __future__ import annotations

import json
import logging
import math
from datetime import date, datetime
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.app_user import AppUser
from ..models.receiving_document_carrier import ReceivingDocumentCarrier
from ..models.product import Product
from ..models.receiving_scan_log import ReceivingScanLog
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.stock_operation import StockOperation
from ..models.supplier import Supplier
from ..models.warehouse_carrier import WarehouseCarrier
from ..schemas.stock_document import PatchStockDocumentItemsBody, StockDocumentRead
from ..schemas.wms_receiving import (
    ReceivingPzCarriersAttachBody,
    WmsCreateReceivingPzBody,
    WmsReceiveBody,
    WmsReceivingItemQuantityBody,
    WmsReceivingMarkDamagedBody,
    WmsReceivingPzListRow,
    WmsReceivingSplitBody,
)
from .delivery_pz_service import warehouse_document_display_number

logger = logging.getLogger(__name__)
from .document_creator_service import (
    app_user_full_name,
    batch_load_app_users,
    created_by_read_for_document,
    stamp_document_creator,
)
from .barcode_generation import next_product_barcode
from .tenant_default_warehouse import list_tenant_warehouse_ids
from ..utils.product_vat import product_vat_rate_percent
from ..schemas.wms_receiving import WmsCreateReceivingProductBody, WmsReceiveSerialBody
from .inventory_serial_service import (
    lot_keys_from_product,
    normalize_serial_number,
    register_serial_on_hand,
    serial_exists,
)
from .inventory_lot_keys import (
    NO_EXPIRY_SENTINEL,
    dock_lot_keys_for_pz_line,
    normalize_batch_number,
    storage_expiry_date,
)
from .stock_document_service import (
    MAX_RECEIVED_QUANTITY,
    apply_patch_lines_to_stock_document_items,
    build_stock_document_read,
    bump_receiving_in_progress_if_new,
    compute_is_fully_putaway_for_items,
    compute_is_fully_received_for_items,
    ensure_default_pz_receiving_location_if_missing,
    ensure_pz_document_warehouse_resolved,
    is_stock_document_item_wm_material,
    is_wms_ghost_stock_document_item,
    purge_wms_ghost_stock_document_lines,
    recompute_putaway_status_for_document,
    recalculate_wms_document_completion,
    sync_product_purchase_prices_from_pz,
)
from .stock_operation_receipt_service import append_receipt_operation
from .inventory_carrier_ops import (
    upsert_dock_inventory_for_carrier_receipt,
    upsert_dock_inventory_for_loose_receipt,
)
from .stock_disposition import (
    STOCK_DISPOSITION_REJECTED_STOCK,
    STOCK_DISPOSITION_SALEABLE,
    stock_disposition_for_document_line,
)
from .warehouse_product_operation_log_service import record_warehouse_product_operation
from .wms_carrier_service import log_carrier_operation
from .purchase_order_warehouse_sync_service import sync_purchase_order_status_for_stock_document_id


def _lot_row_query(
    db: Session,
    *,
    pz_id: int,
    product_id: int,
    batch_number: str,
    expiry_date,
    delivery_item_id: Optional[int],
    warehouse_carrier_id: Optional[int],
):
    """PZ lines for same product/lot/delivery group — rozróżnione po ``warehouse_carrier_id`` (NULL = luzem)."""
    q = db.query(StockDocumentItem).filter(
        StockDocumentItem.document_id == int(pz_id),
        StockDocumentItem.product_id == int(product_id),
        StockDocumentItem.batch_number == batch_number,
        StockDocumentItem.expiry_date == expiry_date,
    )
    if delivery_item_id is not None:
        q = q.filter(StockDocumentItem.delivery_item_id == int(delivery_item_id))
    else:
        q = q.filter(StockDocumentItem.delivery_item_id.is_(None))
    if warehouse_carrier_id is None:
        q = q.filter(StockDocumentItem.warehouse_carrier_id.is_(None))
    else:
        q = q.filter(StockDocumentItem.warehouse_carrier_id == int(warehouse_carrier_id))
    return q


def _find_matching_lot_row(
    db: Session,
    *,
    pz_id: int,
    anchor: StockDocumentItem,
    batch_number: str,
    expiry_date,
    warehouse_carrier_id: Optional[int],
) -> Optional[StockDocumentItem]:
    prod = db.query(Product).filter(Product.id == int(anchor.product_id)).first()
    if prod and bool(getattr(prod, "track_serial", False)):
        return None
    return (
        _lot_row_query(
            db,
            pz_id=pz_id,
            product_id=int(anchor.product_id),
            batch_number=batch_number,
            expiry_date=expiry_date,
            delivery_item_id=anchor.delivery_item_id,
            warehouse_carrier_id=warehouse_carrier_id,
        )
        .order_by(StockDocumentItem.id)
        .first()
    )


def _apply_dock_inventory_for_receipt(
    db: Session,
    *,
    tenant_id: int,
    doc: StockDocument,
    line: StockDocumentItem,
    add_qty: float,
    warehouse_carrier_id: Optional[int],
    performed_by: AppUser,
) -> None:
    dock_id = getattr(doc, "location_id", None)
    wh_id = int(getattr(doc, "warehouse_id", 0) or 0)
    if not dock_id or wh_id <= 0 or getattr(line, "product_id", None) is None:
        return
    sd = stock_disposition_for_document_line(line)
    bn, ed = dock_lot_keys_for_pz_line(line)
    if warehouse_carrier_id is not None:
        upsert_dock_inventory_for_carrier_receipt(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=wh_id,
            location_id=int(dock_id),
            product_id=int(line.product_id),
            carrier_id=int(warehouse_carrier_id),
            add_qty=float(add_qty),
            batch_number=bn,
            expiry_date=ed,
            stock_disposition=sd,
        )
        log_carrier_operation(
            db,
            tenant_id=int(tenant_id),
            carrier_id=int(warehouse_carrier_id),
            operation_type="RECEIVING_ON_CARRIER",
            user=performed_by,
            metadata={"pz_id": int(doc.id), "pz_item_id": int(line.id), "qty": float(add_qty)},
        )
    else:
        upsert_dock_inventory_for_loose_receipt(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=wh_id,
            location_id=int(dock_id),
            product_id=int(line.product_id),
            add_qty=float(add_qty),
            batch_number=bn,
            expiry_date=ed,
            stock_disposition=sd,
        )


def _sync_po_from_pz(db: Session, tenant_id: int, pz_document_id: int) -> None:
    """Keep purchase order status aligned with linked PZ receipt/putaway."""
    sync_purchase_order_status_for_stock_document_id(db, tenant_id, pz_document_id)


def _lot_from_wms_body(product: Product, batch_number: Optional[str], expiry_date: Optional[date]) -> tuple[str, date]:
    tb = bool(getattr(product, "track_batch", False))
    te = bool(getattr(product, "track_expiry", False))
    bn = "" if not tb else normalize_batch_number(batch_number)
    if tb and not bn:
        raise ValueError("Numer partii wymagany")
    if not te:
        ed = NO_EXPIRY_SENTINEL
    else:
        if expiry_date is None:
            raise ValueError("Data ważności wymagana")
        ed = storage_expiry_date(True, expiry_date)
        if ed >= NO_EXPIRY_SENTINEL:
            raise ValueError("Nieprawidłowa data ważności")
    return bn, ed


def _assert_receiving_session_open(doc: StockDocument) -> None:
    if str(getattr(doc, "receiving_status", "") or "").strip().upper() == "DONE":
        raise ValueError("Przyjęcie zakończone — edycja zablokowana")


def _pz_linked_carrier_id_set(db: Session, pz_id: int) -> set[int]:
    rows = (
        db.query(ReceivingDocumentCarrier.warehouse_carrier_id)
        .filter(ReceivingDocumentCarrier.document_id == int(pz_id))
        .all()
    )
    return {int(r[0]) for r in rows}


def _assert_carrier_linked_to_pz(db: Session, pz_id: int, carrier_id: Optional[int]) -> None:
    if carrier_id is None:
        return
    if int(carrier_id) not in _pz_linked_carrier_id_set(db, pz_id):
        raise ValueError("Ten nośnik nie jest przypisany do tego PZ — użyj „Dodaj nośnik”.")


def _insert_pz_carrier_link(db: Session, tenant_id: int, pz_id: int, carrier_id: int) -> None:
    exists = (
        db.query(ReceivingDocumentCarrier)
        .filter(
            ReceivingDocumentCarrier.document_id == int(pz_id),
            ReceivingDocumentCarrier.warehouse_carrier_id == int(carrier_id),
        )
        .first()
    )
    if exists:
        return
    db.add(
        ReceivingDocumentCarrier(
            tenant_id=int(tenant_id),
            document_id=int(pz_id),
            warehouse_carrier_id=int(carrier_id),
        )
    )


def post_receiving_pz_carriers(
    db: Session,
    tenant_id: int,
    pz_id: int,
    body: ReceivingPzCarriersAttachBody,
    *,
    performed_by: AppUser,
) -> StockDocumentRead:
    """Dodaje istniejący nośnik do PZ albo tworzy serię i przypisuje wszystkie do PZ."""
    from .wms_carrier_service import bulk_create_carriers

    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == int(pz_id), StockDocument.tenant_id == int(tenant_id))
        .first()
    )
    if not doc:
        raise ValueError("PZ document not found")
    if doc.status != "draft":
        raise ValueError("Only draft PZ documents can be updated from WMS receiving")
    if doc.document_type != "PZ":
        raise ValueError("Not a PZ document")
    ensure_pz_document_warehouse_resolved(db, doc)
    ensure_default_pz_receiving_location_if_missing(db, doc)
    _assert_receiving_session_open(doc)

    if body.warehouse_carrier_id is not None:
        cid = int(body.warehouse_carrier_id)
        wc = (
            db.query(WarehouseCarrier)
            .filter(
                WarehouseCarrier.id == cid,
                WarehouseCarrier.tenant_id == int(tenant_id),
                WarehouseCarrier.deleted_at.is_(None),
            )
            .first()
        )
        if not wc:
            raise ValueError("Nośnik nie istnieje lub został usunięty")
        _insert_pz_carrier_link(db, tenant_id, pz_id, cid)
        doc.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(doc)
        return build_stock_document_read(db, doc)

    assert body.bulk_create is not None
    res = bulk_create_carriers(db, tenant_id, body.bulk_create, performed_by)
    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == int(pz_id), StockDocument.tenant_id == int(tenant_id))
        .first()
    )
    if not doc:
        raise ValueError("PZ document not found")
    for cid in range(int(res.first_id), int(res.last_id) + 1):
        _insert_pz_carrier_link(db, tenant_id, pz_id, cid)
    doc.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(doc)
    return build_stock_document_read(db, doc)


def _creation_source_label(doc: StockDocument) -> str:
    return str(getattr(doc, "creation_source", None) or "PANEL").strip().upper() or "PANEL"


def is_wms_created_pz(doc: StockDocument) -> bool:
    return _creation_source_label(doc) == "WMS"


def get_or_create_wms_supplier(db: Session, tenant_id: int, supplier_name: str, supplier_id: Optional[int] = None) -> Supplier:
    """Match existing supplier by id or case-insensitive name; otherwise minimal row with is_incomplete."""
    if supplier_id is not None:
        row = (
            db.query(Supplier)
            .filter(Supplier.id == int(supplier_id), Supplier.tenant_id == int(tenant_id))
            .first()
        )
        if not row:
            raise ValueError("Supplier not found")
        return row
    name = (supplier_name or "").strip()
    if not name:
        raise ValueError("supplier_name is required")
    existing = (
        db.query(Supplier)
        .filter(Supplier.tenant_id == int(tenant_id), func.lower(Supplier.name) == name.lower())
        .order_by(Supplier.id.asc())
        .first()
    )
    if existing:
        return existing
    row = Supplier(tenant_id=int(tenant_id), name=name, active=True, is_incomplete=True)
    db.add(row)
    db.flush()
    return row


def create_wms_empty_pz(
    db: Session,
    tenant_id: int,
    body: WmsCreateReceivingPzBody,
    *,
    created_by: Optional[AppUser] = None,
) -> StockDocumentRead:
    """Ad-hoc PZ from WMS: supplier only, no delivery lines, receiving already IN_PROGRESS."""
    sup = get_or_create_wms_supplier(db, tenant_id, body.supplier_name, body.supplier_id)
    now = datetime.utcnow()
    whs = list_tenant_warehouse_ids(db, tenant_id)
    initial_wh = whs[0] if len(whs) == 1 else None
    doc = StockDocument(
        tenant_id=int(tenant_id),
        document_type="PZ",
        supplier_id=int(sup.id),
        delivery_id=None,
        creation_source="WMS",
        warehouse_id=initial_wh,
        location_id=None,
        status="draft",
        receiving_status="IN_PROGRESS",
        putaway_status="NOT_STARTED",
        relocation_status="OPEN",
        created_at=now,
        updated_at=now,
    )
    stamp_document_creator(doc, created_by)
    db.add(doc)
    db.flush()
    doc.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(doc)
    return build_stock_document_read(db, doc)


def _normalize_receiving_ean(raw: str) -> str:
    return "".join(str(raw or "").split()).strip()


def _find_tenant_product_by_ean(db: Session, tenant_id: int, ean_raw: str) -> Optional[Product]:
    key = _normalize_receiving_ean(ean_raw)
    if not key:
        return None
    row = (
        db.query(Product)
        .filter(
            Product.tenant_id == int(tenant_id),
            Product.deleted_at.is_(None),
            Product.ean == key,
        )
        .first()
    )
    if row:
        return row
    return (
        db.query(Product)
        .filter(
            Product.tenant_id == int(tenant_id),
            Product.deleted_at.is_(None),
            Product.bulk_ean == key,
        )
        .first()
    )


def _wms_receiving_product_metadata() -> str:
    return json.dumps(
        {"creation_source": "WMS_RECEIVING", "status": "draft", "is_incomplete": True},
        ensure_ascii=False,
    )


def _pick_pz_line_for_product(rows: List[StockDocumentItem], eps: float = 1e-9) -> Optional[StockDocumentItem]:
    if not rows:
        return None
    doc_lines = [
        r
        for r in rows
        if r.delivery_item_id is not None or float(r.ordered_quantity or 0) > eps
    ]
    if doc_lines:
        return doc_lines[0]
    extra = [
        r
        for r in rows
        if r.delivery_item_id is None and float(r.ordered_quantity or 0) <= eps
    ]
    if extra:
        return extra[0]
    return rows[0]


def _product_needs_receiving_lot_decision(prod: Optional[Product]) -> bool:
    if not prod:
        return False
    return bool(getattr(prod, "track_batch", False) or getattr(prod, "track_expiry", False))


def ensure_wms_pz_product_anchor_line(
    db: Session,
    tenant_id: int,
    pz_id: int,
    product_id: int,
    *,
    performed_by: Optional[AppUser] = None,
    line_source: str = "WMS_SCAN",
    initial_received: float = 1.0,
) -> tuple[StockDocumentRead, int, bool]:
    """
    Dodaj lub powiąż produkt spoza PZ (ordered=0, EXTRA_ITEM).
    Zwraca (dokument, item_id, czy auto-przyjęto initial_received na linii).
    """
    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == int(pz_id), StockDocument.tenant_id == int(tenant_id))
        .first()
    )
    if not doc:
        raise ValueError("PZ document not found")
    if doc.status != "draft" or doc.document_type != "PZ":
        raise ValueError("Only draft PZ documents can be updated from WMS receiving")
    pid = int(product_id)
    prod = db.query(Product).filter(Product.id == pid, Product.tenant_id == int(tenant_id)).first()
    if not prod:
        raise ValueError("Product not found")

    rows = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == int(pz_id), StockDocumentItem.product_id == pid)
        .order_by(StockDocumentItem.id.asc())
        .all()
    )
    needs_lot = _product_needs_receiving_lot_decision(prod)
    track_serial = bool(getattr(prod, "track_serial", False))
    if needs_lot or track_serial:
        ghosts = [r for r in rows if is_wms_ghost_stock_document_item(r)]
        row = ghosts[0] if ghosts else None
    else:
        row = _pick_pz_line_for_product(rows)
    auto_qty = 0.0 if (needs_lot or track_serial) else max(0.0, float(initial_received))
    auto_received = False
    src = (line_source or "WMS_SCAN").strip().upper() or "WMS_SCAN"

    if row is not None:
        is_document_line = row.delivery_item_id is not None or float(row.ordered_quantity or 0) > 1e-9
        if not is_document_line:
            if src and not getattr(row, "wms_line_source", None):
                row.wms_line_source = src
            if auto_qty > 0 and float(row.received_quantity or 0) <= 1e-9:
                row.received_quantity = auto_qty
                row.quantity = auto_qty
                row.loose_units_count = int(getattr(row, "loose_units_count", 0) or 0) + int(auto_qty)
                auto_received = True
                if performed_by is not None:
                    _append_receiving_scan_log(
                        db,
                        document_id=int(pz_id),
                        item_id=int(row.id),
                        admin_id=int(performed_by.id),
                        quantity_added=auto_qty,
                        packaging_type="quantity",
                        cartons_added=None,
                        loose_units_added=int(auto_qty),
                    )
        line_id = int(row.id)
    else:
        vat = product_vat_rate_percent(getattr(prod, "metadata_json", None))
        rec = auto_qty
        row = StockDocumentItem(
            document_id=int(pz_id),
            delivery_item_id=None,
            product_id=pid,
            ordered_quantity=0.0,
            received_quantity=rec,
            quantity=rec,
            loose_units_count=int(rec) if rec > 0 else 0,
            purchase_price_net=None,
            vat_rate=float(vat),
            batch_number="",
            expiry_date=NO_EXPIRY_SENTINEL,
            wms_line_source=src,
        )
        db.add(row)
        db.flush()
        line_id = int(row.id)
        if rec > 0:
            auto_received = True
            if performed_by is not None:
                _append_receiving_scan_log(
                    db,
                    document_id=int(pz_id),
                    item_id=line_id,
                    admin_id=int(performed_by.id),
                    quantity_added=rec,
                    packaging_type="quantity",
                    cartons_added=None,
                    loose_units_added=int(rec),
                )

    bump_receiving_in_progress_if_new(doc)
    all_rows = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == int(pz_id))
        .order_by(StockDocumentItem.id.asc())
        .all()
    )
    recompute_putaway_status_for_document(doc, all_rows, db)
    doc.updated_at = datetime.utcnow()
    db.flush()
    doc_read = build_stock_document_read(db, doc, force_visible_item_ids={line_id})
    return doc_read, line_id, auto_received


def _find_tenant_product_by_sku(db: Session, tenant_id: int, sku_raw: str) -> Optional[Product]:
    key = (sku_raw or "").strip()
    if not key:
        return None
    return (
        db.query(Product)
        .filter(
            Product.tenant_id == int(tenant_id),
            Product.deleted_at.is_(None),
            or_(Product.sku == key, Product.symbol == key),
        )
        .first()
    )


def _create_minimal_wms_product(
    db: Session,
    tenant_id: int,
    *,
    name: str,
    ean: Optional[str],
    sku: Optional[str],
    unit: str,
    create_in_assortment: bool,
) -> Product:
    if not create_in_assortment:
        raise ValueError("Produkt musi być utworzony w asortymencie")
    name_s = (name or "").strip()
    if not name_s:
        raise ValueError("name is required")
    ean_norm = _normalize_receiving_ean(ean) if ean else ""
    sku_s = (sku or "").strip() or None
    unit_s = (unit or "szt.").strip() or "szt."
    product = Product(
        tenant_id=int(tenant_id),
        name=name_s,
        ean=ean_norm or None,
        symbol=sku_s,
        sku=sku_s,
        unit=unit_s,
        metadata_json=_wms_receiving_product_metadata(),
        track_batch=False,
        track_expiry=False,
    )
    db.add(product)
    db.flush()
    product.barcode = next_product_barcode(db, int(tenant_id))
    db.flush()
    return product


def create_product_from_wms_receiving(
    db: Session,
    tenant_id: int,
    pz_id: int,
    body: WmsCreateReceivingProductBody,
    *,
    performed_by: Optional[AppUser] = None,
) -> StockDocumentRead:
    """Link existing product by EAN/SKU or create minimal catalog row + ghost PZ line."""
    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == int(pz_id), StockDocument.tenant_id == int(tenant_id))
        .first()
    )
    if not doc:
        raise ValueError("PZ document not found")
    if doc.status != "draft" or doc.document_type != "PZ":
        raise ValueError("Only draft PZ documents can be updated from WMS receiving")

    name = (body.name or "").strip()
    if not name:
        raise ValueError("name is required")

    ean_norm = _normalize_receiving_ean(body.ean) if body.ean else ""
    sku_s = (body.sku or "").strip() or None

    existing: Optional[Product] = None
    if ean_norm:
        existing = _find_tenant_product_by_ean(db, tenant_id, ean_norm)
    if existing is None and sku_s:
        existing = _find_tenant_product_by_sku(db, tenant_id, sku_s)

    if existing is not None:
        doc_read, _, _ = ensure_wms_pz_product_anchor_line(
            db,
            tenant_id,
            pz_id,
            int(existing.id),
            performed_by=performed_by,
            line_source="WMS_MANUAL",
        )
        return doc_read

    product = _create_minimal_wms_product(
        db,
        tenant_id,
        name=name,
        ean=ean_norm or None,
        sku=sku_s,
        unit=(body.unit or "szt."),
        create_in_assortment=bool(body.create_in_assortment),
    )
    doc_read, _, _ = ensure_wms_pz_product_anchor_line(
        db,
        tenant_id,
        pz_id,
        int(product.id),
        performed_by=performed_by,
        line_source="WMS_MANUAL",
    )
    return doc_read


def create_minimal_wms_product_for_operations(
    db: Session,
    tenant_id: int,
    *,
    name: str,
    ean: Optional[str] = None,
    sku: Optional[str] = None,
    unit: str = "szt.",
    create_in_assortment: bool = True,
    pz_id: Optional[int] = None,
) -> tuple[Product, Optional[StockDocumentRead]]:
    """Create/link product; optionally attach ghost line on draft PZ."""
    ean_norm = _normalize_receiving_ean(ean) if ean else ""
    sku_s = (sku or "").strip() or None
    existing: Optional[Product] = None
    if ean_norm:
        existing = _find_tenant_product_by_ean(db, tenant_id, ean_norm)
    if existing is None and sku_s:
        existing = _find_tenant_product_by_sku(db, tenant_id, sku_s)

    if existing is not None:
        doc_read: Optional[StockDocumentRead] = None
        if pz_id is not None:
            doc_read, _, _ = ensure_wms_pz_product_anchor_line(
                db, tenant_id, int(pz_id), int(existing.id), line_source="WMS_MANUAL"
            )
        return existing, doc_read

    product = _create_minimal_wms_product(
        db,
        tenant_id,
        name=name,
        ean=ean_norm or None,
        sku=sku_s,
        unit=unit,
        create_in_assortment=create_in_assortment,
    )
    doc_read = None
    if pz_id is not None:
        doc_read, _, _ = ensure_wms_pz_product_anchor_line(
            db, tenant_id, int(pz_id), int(product.id), line_source="WMS_MANUAL"
        )
    return product, doc_read


def build_wms_pz_list_row(
    db: Session,
    d: StockDocument,
    lines: List[StockDocumentItem],
    *,
    supplier_name: str = "",
    users_by_id: Optional[dict] = None,
) -> WmsReceivingPzListRow:
    t_ord = sum(float(x.ordered_quantity or 0) for x in lines)
    t_rec = sum(float(x.received_quantity or 0) for x in lines)
    t_put = sum(float(getattr(x, "quantity_putaway", 0) or 0) for x in lines)
    rs = str(getattr(d, "receiving_status", None) or "NEW").strip().upper()
    put_target = t_rec if rs != "DONE" else t_ord
    carrier_ids: set[int] = set()
    for x in lines:
        if float(x.received_quantity or 0) <= 1e-9:
            continue
        wc = getattr(x, "warehouse_carrier_id", None)
        if wc is not None:
            carrier_ids.add(int(wc))
    created = getattr(d, "created_at", None)
    updated = getattr(d, "updated_at", None) or created
    if created is None:
        created = datetime.utcnow()
    if updated is None:
        updated = created
    return WmsReceivingPzListRow(
        id=d.id,
        number=warehouse_document_display_number(str(getattr(d, "document_type", None) or "PZ"), created, d.id),
        status=str(getattr(d, "status", None) or "draft"),
        created_at=created,
        updated_at=updated,
        total_ordered=t_ord,
        total_received=t_rec,
        receiving_status=str(getattr(d, "receiving_status", None) or "NEW"),
        putaway_status=str(getattr(d, "putaway_status", None) or "NOT_STARTED"),
        relocation_status=str(getattr(d, "relocation_status", None) or "OPEN"),
        is_fully_received=compute_is_fully_received_for_items(lines),
        is_fully_putaway=compute_is_fully_putaway_for_items(db, lines),
        carrier_count=len(carrier_ids),
        total_putaway=t_put,
        putaway_target_quantity=put_target,
        creation_source=_creation_source_label(d),
        supplier_name=(supplier_name or "").strip(),
        created_by=created_by_read_for_document(d, users_by_id),
    )


def _load_draft_pz_docs_with_lines(
    db: Session, tenant_id: int, *, extra_filters: tuple = ()
) -> tuple[List[StockDocument], dict[int, list[StockDocumentItem]]]:
    q = (
        db.query(StockDocument)
        .filter(
            StockDocument.tenant_id == tenant_id,
            StockDocument.document_type == "PZ",
            StockDocument.status == "draft",
        )
    )
    for f in extra_filters:
        q = q.filter(f)
    docs = q.order_by(StockDocument.created_at.desc()).all()
    if not docs:
        return [], {}
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
    return docs, by_doc


def list_wms_receiving_pz_documents(db: Session, tenant_id: int) -> List[WmsReceivingPzListRow]:
    """Draft PZ where przyjęcie workflow is not DONE yet."""
    docs, by_doc = _load_draft_pz_docs_with_lines(
        db,
        tenant_id,
        extra_filters=(StockDocument.receiving_status != "DONE",),
    )
    sup_ids = {int(d.supplier_id) for d in docs if getattr(d, "supplier_id", None) is not None}
    sup_by_id: dict[int, Supplier] = {}
    if sup_ids:
        for s in db.query(Supplier).filter(Supplier.tenant_id == tenant_id, Supplier.id.in_(sup_ids)).all():
            sup_by_id[int(s.id)] = s
    creator_ids = {
        int(d.created_by_user_id)
        for d in docs
        if getattr(d, "created_by_user_id", None) is not None
    }
    users_by_id = batch_load_app_users(db, creator_ids)
    out: List[WmsReceivingPzListRow] = []
    for d in docs:
        sn = ""
        if d.supplier_id is not None:
            sup = sup_by_id.get(int(d.supplier_id))
            if sup:
                sn = (sup.name or "").strip()
        out.append(
            build_wms_pz_list_row(
                db, d, by_doc.get(d.id) or [], supplier_name=sn, users_by_id=users_by_id
            )
        )
    return out


def _receiving_audit_packaging(
    *,
    cartons_delta: int,
    loose_delta: int,
    add_q: float,
) -> tuple[str, float | None]:
    if cartons_delta > 0 and loose_delta <= 0:
        return "CARTON", float(cartons_delta)
    if loose_delta > 0 and cartons_delta <= 0:
        return "UNIT", float(loose_delta)
    return "UNIT", float(add_q)


def apply_wms_receive_deltas(db: Session, tenant_id: int, body: WmsReceiveBody, *, performed_by: AppUser):
    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == body.pz_id, StockDocument.tenant_id == tenant_id)
        .first()
    )
    if not doc:
        raise ValueError("PZ document not found")
    if doc.status != "draft":
        raise ValueError("Only draft PZ documents can be updated from WMS receiving")
    if doc.document_type != "PZ":
        raise ValueError("Not a PZ document")
    ensure_pz_document_warehouse_resolved(db, doc)
    ensure_default_pz_receiving_location_if_missing(db, doc)
    _assert_receiving_session_open(doc)

    rows: List[StockDocumentItem] = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == doc.id)
        .order_by(StockDocumentItem.id)
        .all()
    )
    by_id = {r.id: r for r in rows}

    for ln in body.lines:
        anchor = by_id.get(ln.pz_item_id)
        if not anchor:
            raise ValueError(f"Unknown pz_item_id: {ln.pz_item_id}")
        wc_line = getattr(ln, "warehouse_carrier_id", None)
        if wc_line is not None:
            _assert_carrier_linked_to_pz(db, int(doc.id), int(wc_line))
        add = float(ln.quantity)
        if not math.isfinite(add) or add <= 0:
            raise ValueError("Invalid quantity")
        if add > MAX_RECEIVED_QUANTITY:
            raise ValueError("quantity exceeds maximum allowed")
        if is_stock_document_item_wm_material(anchor):
            if wc_line is not None:
                raise ValueError("Materiały magazynowe — przyjęcie tylko luzem (bez nośnika).")
            target = anchor
        else:
            bn = str(getattr(anchor, "batch_number", None) or "")
            ed = getattr(anchor, "expiry_date", None)
            target = _find_matching_lot_row(
                db,
                pz_id=int(doc.id),
                anchor=anchor,
                batch_number=bn,
                expiry_date=ed,
                warehouse_carrier_id=wc_line,
            )
            if not target:
                target = StockDocumentItem(
                    document_id=int(doc.id),
                    delivery_item_id=anchor.delivery_item_id,
                    product_id=anchor.product_id,
                    ordered_quantity=0.0,
                    received_quantity=0.0,
                    quantity=0.0,
                    cartons_count=0,
                    loose_units_count=0,
                    purchase_price_net=anchor.purchase_price_net,
                    vat_rate=float(anchor.vat_rate or 23.0),
                    batch_number=bn,
                    expiry_date=ed,
                    warehouse_carrier_id=wc_line,
                )
                db.add(target)
                db.flush()
                by_id[int(target.id)] = target
        new_rec = float(target.received_quantity or 0) + add
        if new_rec > MAX_RECEIVED_QUANTITY:
            raise ValueError("received_quantity would exceed maximum allowed")
        target.received_quantity = new_rec
        target.quantity = new_rec
        append_receipt_operation(
            db,
            doc,
            target,
            add,
            performed_by=performed_by,
            skip_inventory_movement=True,
        )
        wh_id = int(getattr(doc, "warehouse_id", 0) or 0)
        if getattr(target, "product_id", None) is not None and wh_id > 0:
            dt = (getattr(doc, "document_type", None) or "PZ").strip().upper()
            record_warehouse_product_operation(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=wh_id,
                product_id=int(target.product_id),
                movement_type="RECEIVING",
                source_location_id=None,
                target_location_id=getattr(doc, "location_id", None),
                quantity=float(add),
                performed_by=performed_by,
                reference_document=f"{dt}-{int(doc.id)}",
                stock_document_id=int(doc.id),
                packaging_type="UNIT",
                packaging_quantity=float(add),
                wms_mode=None,
            )
        _apply_dock_inventory_for_receipt(
            db,
            tenant_id=int(tenant_id),
            doc=doc,
            line=target,
            add_qty=float(add),
            warehouse_carrier_id=wc_line,
            performed_by=performed_by,
        )
        try:
            from .wms_waiting_supply_promotion import (
                receipt_from_receiving_line,
                run_promotion_after_inbound,
            )

            wh = int(getattr(doc, "warehouse_id", 0) or 0)
            if wh > 0:
                rec = receipt_from_receiving_line(
                    db,
                    tenant_id=int(tenant_id),
                    doc=doc,
                    line=target,
                    add_qty=float(add),
                    warehouse_carrier_id=int(wc_line) if wc_line is not None else None,
                )
                if rec:
                    run_promotion_after_inbound(
                        db,
                        tenant_id=int(tenant_id),
                        warehouse_id=wh,
                        receipts=[rec],
                        source_event_id=f"wms_recv:{int(doc.id)}:line:{int(target.id)}:qty:{new_rec:.6f}",
                    )
        except Exception:
            logger.exception(
                "waiting_supply promote after receiving line pz=%s item=%s",
                doc.id,
                target.id,
            )

    bump_receiving_in_progress_if_new(doc)
    recompute_putaway_status_for_document(doc, rows, db)
    doc.updated_at = datetime.utcnow()

    _sync_po_from_pz(db, tenant_id, doc.id)
    db.commit()
    db.refresh(doc)
    return build_stock_document_read(db, doc)


def _receiving_packaging_type(cartons: int, loose: int) -> str:
    if cartons > 0 and loose > 0:
        return "mixed"
    if cartons > 0:
        return "carton"
    if loose > 0:
        return "loose"
    return "quantity"


def _append_receiving_scan_log(
    db: Session,
    *,
    document_id: int,
    item_id: int,
    admin_id: int,
    quantity_added: float,
    packaging_type: str,
    cartons_added: Optional[int],
    loose_units_added: Optional[int],
    serial_number: Optional[str] = None,
    batch_number: Optional[str] = None,
    expiry_date: Optional[date] = None,
    raw_scan: Optional[str] = None,
    scan_kind: Optional[str] = None,
) -> None:
    db.add(
        ReceivingScanLog(
            document_id=int(document_id),
            item_id=int(item_id),
            admin_id=int(admin_id),
            quantity_added=float(quantity_added),
            packaging_type=str(packaging_type),
            cartons_added=cartons_added,
            loose_units_added=loose_units_added,
            serial_number=(serial_number or "").strip() or None,
            batch_number=(batch_number or "").strip() or None,
            expiry_date=expiry_date,
            raw_scan=(raw_scan or "").strip() or None,
            scan_kind=(scan_kind or "").strip() or None,
        )
    )


def patch_wms_receiving_pz_item_quantity(
    db: Session,
    tenant_id: int,
    pz_id: int,
    item_id: int,
    body: WmsReceivingItemQuantityBody,
    *,
    performed_by: AppUser,
) -> StockDocumentRead:
    """Draft PZ: add qty to row matching (delivery line, product, batch, expiry) or insert a new lot row."""
    add_q = float(body.quantity_received)
    if not math.isfinite(add_q) or add_q <= 0:
        raise ValueError("quantity_received must be a positive finite number")
    if add_q > MAX_RECEIVED_QUANTITY:
        raise ValueError("quantity_received exceeds maximum allowed")

    cartons_delta = int(body.cartons_count or 0)
    loose_delta = int(body.loose_units_count or 0)
    if cartons_delta < 0 or loose_delta < 0:
        raise ValueError("Invalid split counters")

    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == pz_id, StockDocument.tenant_id == tenant_id)
        .first()
    )
    if not doc:
        raise ValueError("PZ document not found")
    if doc.status != "draft":
        raise ValueError("Only draft PZ documents can be updated from WMS receiving")
    if doc.document_type != "PZ":
        raise ValueError("Not a PZ document")
    ensure_pz_document_warehouse_resolved(db, doc)
    ensure_default_pz_receiving_location_if_missing(db, doc)
    _assert_receiving_session_open(doc)

    anchor = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.id == item_id, StockDocumentItem.document_id == pz_id)
        .first()
    )
    if not anchor:
        raise ValueError("PZ line not found")

    wc_assign = getattr(body, "warehouse_carrier_id", None)

    if anchor.product_id is not None:
        prod_chk = db.query(Product).filter(Product.id == int(anchor.product_id)).first()
        if prod_chk and bool(getattr(prod_chk, "track_serial", False)) and add_q > 1 + 1e-9:
            raise ValueError("Produkt wymaga numeru seryjnego — użyj skanu serialu (1 szt. = 1 numer)")

    if is_stock_document_item_wm_material(anchor):
        if wc_assign is not None:
            raise ValueError("Materiały magazynowe — przyjęcie tylko luzem (bez nośnika).")
        new_rec = float(anchor.received_quantity or 0) + add_q
        if new_rec > MAX_RECEIVED_QUANTITY:
            raise ValueError("received_quantity would exceed maximum allowed")
        anchor.received_quantity = new_rec
        anchor.quantity = new_rec
        db.flush()
        _append_receiving_scan_log(
            db,
            document_id=pz_id,
            item_id=int(anchor.id),
            admin_id=int(performed_by.id),
            quantity_added=add_q,
            packaging_type="quantity",
            cartons_added=None,
            loose_units_added=None,
        )
        purge_wms_ghost_stock_document_lines(db, pz_id)
        db.flush()
        rows = (
            db.query(StockDocumentItem)
            .filter(StockDocumentItem.document_id == pz_id)
            .order_by(StockDocumentItem.id)
            .all()
        )
        bump_receiving_in_progress_if_new(doc)
        recompute_putaway_status_for_document(doc, rows, db)
        doc.updated_at = datetime.utcnow()
        _sync_po_from_pz(db, tenant_id, pz_id)
        db.commit()
        db.refresh(doc)
        return build_stock_document_read(db, doc)

    if wc_assign is not None:
        _assert_carrier_linked_to_pz(db, pz_id, int(wc_assign))

    prod = db.query(Product).filter(Product.id == anchor.product_id).first()
    if not prod:
        raise ValueError("Product not found")
    bn, ed = _lot_from_wms_body(prod, body.batch_number, body.expiry_date)

    match = _find_matching_lot_row(
        db,
        pz_id=pz_id,
        anchor=anchor,
        batch_number=bn,
        expiry_date=ed,
        warehouse_carrier_id=wc_assign,
    )

    log_item_id: Optional[int] = None
    if match:
        new_rec = float(match.received_quantity or 0) + add_q
        if new_rec > MAX_RECEIVED_QUANTITY:
            raise ValueError("received_quantity would exceed maximum allowed")
        match.received_quantity = new_rec
        match.quantity = new_rec
        prev_cc = int(getattr(match, "cartons_count", 0) or 0)
        prev_lu = int(getattr(match, "loose_units_count", 0) or 0)
        match.cartons_count = prev_cc + cartons_delta
        match.loose_units_count = prev_lu + loose_delta
        append_receipt_operation(
            db,
            doc,
            match,
            add_q,
            performed_by=performed_by,
            skip_inventory_movement=True,
        )
        log_item_id = int(match.id)
    else:
        db.add(
            StockDocumentItem(
                document_id=pz_id,
                delivery_item_id=anchor.delivery_item_id,
                product_id=anchor.product_id,
                ordered_quantity=0.0,
                received_quantity=add_q,
                quantity=add_q,
                cartons_count=cartons_delta,
                loose_units_count=loose_delta,
                purchase_price_net=anchor.purchase_price_net,
                vat_rate=float(anchor.vat_rate or 23.0),
                batch_number=bn,
                expiry_date=ed,
                warehouse_carrier_id=wc_assign,
            )
        )

    db.flush()
    if not match:
        new_line = _find_matching_lot_row(
            db,
            pz_id=pz_id,
            anchor=anchor,
            batch_number=bn,
            expiry_date=ed,
            warehouse_carrier_id=wc_assign,
        )
        if new_line:
            append_receipt_operation(
                db,
                doc,
                new_line,
                add_q,
                performed_by=performed_by,
                skip_inventory_movement=True,
            )
            log_item_id = int(new_line.id)

    if log_item_id is not None:
        pkg = _receiving_packaging_type(cartons_delta, loose_delta)
        ca = cartons_delta if cartons_delta > 0 else None
        la = loose_delta if loose_delta > 0 else None
        _append_receiving_scan_log(
            db,
            document_id=pz_id,
            item_id=log_item_id,
            admin_id=int(performed_by.id),
            quantity_added=add_q,
            packaging_type=pkg,
            cartons_added=ca,
            loose_units_added=la,
        )
        wh_id = int(getattr(doc, "warehouse_id", 0) or 0)
        if anchor.product_id is not None and wh_id > 0:
            ap_type, ap_qty = _receiving_audit_packaging(
                cartons_delta=cartons_delta,
                loose_delta=loose_delta,
                add_q=add_q,
            )
            dt_up = (getattr(doc, "document_type", None) or "PZ").strip().upper()
            record_warehouse_product_operation(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=wh_id,
                product_id=int(anchor.product_id),
                movement_type="RECEIVING",
                source_location_id=None,
                target_location_id=getattr(doc, "location_id", None),
                quantity=float(add_q),
                performed_by=performed_by,
                reference_document=f"{dt_up}-{int(doc.id)}",
                stock_document_id=int(doc.id),
                packaging_type=ap_type,
                packaging_quantity=ap_qty,
                wms_mode=None,
            )
            hit = (
                db.query(StockDocumentItem)
                .filter(StockDocumentItem.id == int(log_item_id), StockDocumentItem.document_id == pz_id)
                .first()
            )
            if hit:
                _apply_dock_inventory_for_receipt(
                    db,
                    tenant_id=int(tenant_id),
                    doc=doc,
                    line=hit,
                    add_qty=float(add_q),
                    warehouse_carrier_id=getattr(body, "warehouse_carrier_id", None),
                    performed_by=performed_by,
                )

    db.flush()
    purge_wms_ghost_stock_document_lines(db, pz_id)
    db.flush()
    rows = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == pz_id)
        .order_by(StockDocumentItem.id)
        .all()
    )
    bump_receiving_in_progress_if_new(doc)
    recompute_putaway_status_for_document(doc, rows, db)
    doc.updated_at = datetime.utcnow()

    _sync_po_from_pz(db, tenant_id, pz_id)
    db.commit()
    db.refresh(doc)
    return build_stock_document_read(db, doc)


def split_wms_receiving_pz_item_lines(
    db: Session,
    tenant_id: int,
    pz_id: int,
    item_id: int,
    body: WmsReceivingSplitBody,
) -> StockDocumentRead:
    """Replace sibling PZ lines (same delivery_item_id) with multiple lot rows."""
    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == pz_id, StockDocument.tenant_id == tenant_id)
        .first()
    )
    if not doc:
        raise ValueError("PZ document not found")
    if doc.status != "draft":
        raise ValueError("Only draft PZ documents can be updated from WMS receiving")
    if doc.document_type != "PZ":
        raise ValueError("Not a PZ document")
    ensure_pz_document_warehouse_resolved(db, doc)
    ensure_default_pz_receiving_location_if_missing(db, doc)
    _assert_receiving_session_open(doc)

    anchor = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.id == item_id, StockDocumentItem.document_id == pz_id)
        .first()
    )
    if not anchor:
        raise ValueError("PZ line not found")

    if is_stock_document_item_wm_material(anchor):
        raise ValueError("Podział partii dotyczy tylko produktów — materiały magazynowe mają jedną linię przyjęcia.")

    prod = db.query(Product).filter(Product.id == anchor.product_id).first()
    if not prod:
        raise ValueError("Product not found")
    tb = bool(getattr(prod, "track_batch", False))
    te = bool(getattr(prod, "track_expiry", False))

    group_key = anchor.delivery_item_id
    siblings: List[StockDocumentItem] = (
        db.query(StockDocumentItem)
        .filter(
            StockDocumentItem.document_id == pz_id,
            StockDocumentItem.delivery_item_id == group_key,
            StockDocumentItem.product_id == anchor.product_id,
        )
        .order_by(StockDocumentItem.id)
        .all()
        if group_key is not None
        else [anchor]
    )

    ordered_total = max(float(x.ordered_quantity or 0) for x in siblings)
    pp = anchor.purchase_price_net
    vat = float(anchor.vat_rate or 23.0)
    delivery_item_id = anchor.delivery_item_id
    carrier_ids = {getattr(s, "warehouse_carrier_id", None) for s in siblings}
    if len(carrier_ids) > 1:
        raise ValueError(
            "Pozycja ma przyjęcie na kilku nośnikach / luzem — podziel partie osobno dla każdego wpisu nośnika."
        )
    wc_preserve = next(iter(carrier_ids)) if carrier_ids else None

    pos_total = sum(float(s.quantity_received) for s in body.segments if float(s.quantity_received) > 0)
    if pos_total <= 0:
        raise ValueError("Co najmniej jeden segment musi mieć ilość > 0")

    seen: set[tuple[str, date]] = set()
    for seg in body.segments:
        qty = float(seg.quantity_received)
        if not math.isfinite(qty) or qty < 0 or qty > MAX_RECEIVED_QUANTITY:
            raise ValueError("Invalid segment quantity")
        bn = "" if not tb else normalize_batch_number(seg.batch_number)
        if tb and not bn:
            raise ValueError("Każdy segment musi mieć numer partii")
        if not te:
            ed = NO_EXPIRY_SENTINEL
        else:
            if seg.expiry_date is None:
                raise ValueError("Każdy segment musi mieć datę ważności")
            ed = storage_expiry_date(True, seg.expiry_date)
            if ed >= NO_EXPIRY_SENTINEL:
                raise ValueError("Nieprawidłowa data ważności w segmencie")
        key = (bn, ed)
        if key in seen:
            raise ValueError("Zduplikowana para partia + data w segmentach")
        seen.add(key)

    for s in siblings:
        db.delete(s)
    db.flush()

    first = True
    for seg in body.segments:
        qty = float(seg.quantity_received)
        if qty <= 0:
            continue
        bn = "" if not tb else normalize_batch_number(seg.batch_number)
        ed = NO_EXPIRY_SENTINEL if not te else storage_expiry_date(True, seg.expiry_date)
        db.add(
            StockDocumentItem(
                document_id=pz_id,
                delivery_item_id=delivery_item_id,
                product_id=anchor.product_id,
                ordered_quantity=ordered_total if first else 0.0,
                received_quantity=qty,
                quantity=qty,
                cartons_count=0,
                loose_units_count=0,
                purchase_price_net=pp,
                vat_rate=vat,
                batch_number=bn,
                expiry_date=ed,
                warehouse_carrier_id=wc_preserve,
            )
        )
        first = False

    db.flush()
    purge_wms_ghost_stock_document_lines(db, pz_id)
    db.flush()
    rows = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == pz_id)
        .order_by(StockDocumentItem.id)
        .all()
    )
    bump_receiving_in_progress_if_new(doc)
    recompute_putaway_status_for_document(doc, rows, db)
    doc.updated_at = datetime.utcnow()
    _sync_po_from_pz(db, tenant_id, pz_id)
    db.commit()
    db.refresh(doc)
    return build_stock_document_read(db, doc)


def finish_wms_receiving_pz(
    db: Session,
    tenant_id: int,
    pz_id: int,
    body: PatchStockDocumentItemsBody,
) -> StockDocumentRead:
    """Persist counted lines and close WMS receiving (receiving_status = DONE)."""
    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == pz_id, StockDocument.tenant_id == tenant_id)
        .first()
    )
    if not doc:
        raise ValueError("Document not found")
    if doc.status != "draft":
        raise ValueError("Only draft documents can be edited")
    dt_up = str(doc.document_type or "").strip().upper()
    if dt_up not in ("PZ", "Z_PZ", "PZ_RT", "RETURN_RECEIPT"):
        raise ValueError("Not a PZ document")
    ensure_pz_document_warehouse_resolved(db, doc)
    ensure_default_pz_receiving_location_if_missing(db, doc)
    _assert_receiving_session_open(doc)

    rows: List[StockDocumentItem] = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == pz_id)
        .order_by(StockDocumentItem.id)
        .all()
    )
    apply_patch_lines_to_stock_document_items(rows, body)
    doc.receiving_status = "DONE"
    recompute_putaway_status_for_document(doc, rows, db)
    recalculate_wms_document_completion(db, tenant_id, pz_id)
    doc.updated_at = datetime.utcnow()
    # Product master: last purchase price (same as on PZ post) — PZ may stay draft until office accept.
    if dt_up == "PZ":
        sync_product_purchase_prices_from_pz(db, tenant_id=tenant_id, pz_id=pz_id, posted_at=doc.updated_at)
    _sync_po_from_pz(db, tenant_id, pz_id)
    db.commit()
    db.refresh(doc)
    return build_stock_document_read(db, doc)


def receive_wms_pz_serial(
    db: Session,
    tenant_id: int,
    pz_id: int,
    body: WmsReceiveSerialBody,
    *,
    performed_by: AppUser,
) -> StockDocumentRead:
    """Receive one serialised unit (dedicated PZ line + inventory_serial)."""
    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == int(pz_id), StockDocument.tenant_id == int(tenant_id))
        .first()
    )
    if not doc:
        raise ValueError("PZ document not found")
    if doc.status != "draft" or doc.document_type != "PZ":
        raise ValueError("Only draft PZ documents can be updated from WMS receiving")
    ensure_pz_document_warehouse_resolved(db, doc)
    ensure_default_pz_receiving_location_if_missing(db, doc)
    _assert_receiving_session_open(doc)

    pid = int(body.product_id)
    prod = db.query(Product).filter(Product.id == pid, Product.tenant_id == int(tenant_id)).first()
    if not prod:
        raise ValueError("Product not found")
    if not bool(getattr(prod, "track_serial", False)):
        raise ValueError("Produkt nie wymaga numerów seryjnych")

    sn = normalize_serial_number(body.serial_number)
    if serial_exists(db, tenant_id, pid, sn):
        raise ValueError("Numer seryjny już istnieje w magazynie.")

    bn, ed = lot_keys_from_product(prod, batch_number=body.batch_number, expiry_date=body.expiry_date)
    wc_assign = body.warehouse_carrier_id
    if wc_assign is not None:
        _assert_carrier_linked_to_pz(db, pz_id, int(wc_assign))

    vat = product_vat_rate_percent(getattr(prod, "metadata_json", None))
    line = StockDocumentItem(
        document_id=int(pz_id),
        delivery_item_id=None,
        product_id=pid,
        ordered_quantity=0.0,
        received_quantity=1.0,
        quantity=1.0,
        loose_units_count=1,
        purchase_price_net=None,
        vat_rate=float(vat),
        batch_number=bn,
        expiry_date=ed,
        warehouse_carrier_id=int(wc_assign) if wc_assign is not None else None,
        wms_line_source="WMS_SCAN",
    )
    db.add(line)
    db.flush()

    append_receipt_operation(
        db,
        doc,
        line,
        1.0,
        serial_number=sn,
        performed_by=performed_by,
    )
    db.flush()
    op = (
        db.query(StockOperation)
        .filter(StockOperation.document_line_id == int(line.id), StockOperation.type == "RECEIPT")
        .order_by(StockOperation.id.desc())
        .first()
    )
    sd = stock_disposition_for_document_line(line)
    register_serial_on_hand(
        db,
        tenant_id=tenant_id,
        product_id=pid,
        serial_number=sn,
        batch_number=bn,
        expiry_date=ed,
        warehouse_id=int(doc.warehouse_id) if doc.warehouse_id else None,
        location_id=int(doc.location_id) if doc.location_id else None,
        carrier_id=int(wc_assign) if wc_assign is not None else None,
        stock_disposition=sd,
        source_document_id=int(doc.id),
        document_line_id=int(line.id),
        stock_operation_id=int(op.id) if op else None,
    )
    _append_receiving_scan_log(
        db,
        document_id=int(pz_id),
        item_id=int(line.id),
        admin_id=int(performed_by.id),
        quantity_added=1.0,
        packaging_type="serial",
        cartons_added=None,
        loose_units_added=1,
        serial_number=sn,
        batch_number=bn or None,
        expiry_date=ed if ed < NO_EXPIRY_SENTINEL else None,
        raw_scan=(body.raw_scan or sn),
        scan_kind="serial",
    )
    _apply_dock_inventory_for_receipt(
        db,
        tenant_id=tenant_id,
        doc=doc,
        line=line,
        add_qty=1.0,
        warehouse_carrier_id=int(wc_assign) if wc_assign is not None else None,
        performed_by=performed_by,
    )
    bump_receiving_in_progress_if_new(doc)
    rows = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == int(pz_id))
        .order_by(StockDocumentItem.id.asc())
        .all()
    )
    recompute_putaway_status_for_document(doc, rows, db)
    doc.updated_at = datetime.utcnow()
    _sync_po_from_pz(db, tenant_id, int(pz_id))
    db.commit()
    db.refresh(doc)
    return build_stock_document_read(db, doc, force_visible_item_ids={int(line.id)})


def _is_saleable_line(line: StockDocumentItem) -> bool:
    return stock_disposition_for_document_line(line) == STOCK_DISPOSITION_SALEABLE


def mark_wms_receiving_pz_item_damaged(
    db: Session,
    tenant_id: int,
    pz_id: int,
    item_id: int,
    body: WmsReceivingMarkDamagedBody,
    *,
    performed_by: AppUser,
) -> StockDocumentRead:
    """Transfer received saleable qty into a REJECTED_STOCK line (damaged bucket) on the same draft PZ."""
    qty = float(body.quantity)
    if not math.isfinite(qty) or qty <= 0:
        raise ValueError("quantity must be a positive finite number")
    if qty > MAX_RECEIVED_QUANTITY:
        raise ValueError("quantity exceeds maximum allowed")

    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == pz_id, StockDocument.tenant_id == tenant_id)
        .first()
    )
    if not doc:
        raise ValueError("PZ document not found")
    if doc.status != "draft":
        raise ValueError("Only draft PZ documents can be updated from WMS receiving")
    if doc.document_type != "PZ":
        raise ValueError("Not a PZ document")
    ensure_pz_document_warehouse_resolved(db, doc)
    ensure_default_pz_receiving_location_if_missing(db, doc)
    _assert_receiving_session_open(doc)

    anchor = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.id == item_id, StockDocumentItem.document_id == pz_id)
        .first()
    )
    if not anchor or anchor.product_id is None:
        raise ValueError("PZ line not found")

    prod = db.query(Product).filter(Product.id == anchor.product_id).first()
    if not prod:
        raise ValueError("Product not found")
    bn, ed = _lot_from_wms_body(prod, anchor.batch_number, anchor.expiry_date)

    rows = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == pz_id, StockDocumentItem.product_id == anchor.product_id)
        .order_by(StockDocumentItem.id.desc())
        .all()
    )

    saleable_avail = sum(
        float(r.received_quantity or 0)
        for r in rows
        if _is_saleable_line(r) and float(r.received_quantity or 0) > 1e-12
    )
    if qty > saleable_avail + 1e-9:
        raise ValueError("Niewystarczająca ilość przyjęta (sprzedażowa) do oznaczenia jako wada")

    remaining = qty
    for line in rows:
        if remaining <= 1e-12:
            break
        if not _is_saleable_line(line):
            continue
        avail = float(line.received_quantity or 0)
        if avail <= 1e-12:
            continue
        take = min(avail, remaining)
        line.received_quantity = avail - take
        line.quantity = line.received_quantity
        wc_id = getattr(line, "warehouse_carrier_id", None)
        _apply_dock_inventory_for_receipt(
            db,
            tenant_id=tenant_id,
            doc=doc,
            line=line,
            add_qty=-take,
            warehouse_carrier_id=int(wc_id) if wc_id is not None else None,
            performed_by=performed_by,
        )
        remaining -= take

    damaged = (
        _lot_row_query(
            db,
            pz_id=pz_id,
            product_id=int(anchor.product_id),
            batch_number=bn,
            expiry_date=ed,
            delivery_item_id=anchor.delivery_item_id,
            warehouse_carrier_id=None,
        )
        .filter(StockDocumentItem.stock_disposition == STOCK_DISPOSITION_REJECTED_STOCK)
        .order_by(StockDocumentItem.id.desc())
        .first()
    )
    if damaged:
        new_rec = float(damaged.received_quantity or 0) + qty
        damaged.received_quantity = new_rec
        damaged.quantity = new_rec
        damaged.loose_units_count = int(getattr(damaged, "loose_units_count", 0) or 0) + int(qty)
        append_receipt_operation(db, doc, damaged, qty, skip_inventory_movement=True)
        damaged_line = damaged
    else:
        damaged_line = StockDocumentItem(
            document_id=pz_id,
            delivery_item_id=anchor.delivery_item_id,
            product_id=anchor.product_id,
            ordered_quantity=0.0,
            received_quantity=qty,
            quantity=qty,
            cartons_count=0,
            loose_units_count=int(qty),
            purchase_price_net=anchor.purchase_price_net,
            vat_rate=float(anchor.vat_rate or 23.0),
            batch_number=bn,
            expiry_date=ed,
            warehouse_carrier_id=None,
            stock_disposition=STOCK_DISPOSITION_REJECTED_STOCK,
        )
        db.add(damaged_line)
        db.flush()
        append_receipt_operation(db, doc, damaged_line, qty, skip_inventory_movement=True)

    db.flush()
    _apply_dock_inventory_for_receipt(
        db,
        tenant_id=tenant_id,
        doc=doc,
        line=damaged_line,
        add_qty=qty,
        warehouse_carrier_id=None,
        performed_by=performed_by,
    )
    log_item_id = int(damaged_line.id)

    from .warehouse_inventory_movement_service import safe_record_damage_movement

    safe_record_damage_movement(
        db,
        doc=doc,
        from_line=anchor,
        to_line=damaged_line,
        quantity=qty,
        performed_by=performed_by,
        from_carrier_id=getattr(anchor, "warehouse_carrier_id", None),
    )

    _append_receiving_scan_log(
        db,
        document_id=pz_id,
        item_id=log_item_id,
        admin_id=int(performed_by.id),
        quantity_added=qty,
        packaging_type="damaged",
        cartons_added=None,
        loose_units_added=int(qty),
    )

    purge_wms_ghost_stock_document_lines(db, pz_id)
    db.flush()
    all_rows = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == pz_id)
        .order_by(StockDocumentItem.id)
        .all()
    )
    bump_receiving_in_progress_if_new(doc)
    recompute_putaway_status_for_document(doc, all_rows, db)
    doc.updated_at = datetime.utcnow()
    _sync_po_from_pz(db, tenant_id, pz_id)
    db.commit()
    db.refresh(doc)
    return build_stock_document_read(db, doc)


def move_wms_receiving_pz_item_carrier(
    db: Session,
    tenant_id: int,
    pz_id: int,
    item_id: int,
    body,
    *,
    performed_by: AppUser,
) -> StockDocumentRead:
    """Move all received quantity from the anchor line's carrier to another (or luzem)."""
    target_wc = getattr(body, "warehouse_carrier_id", None)
    if target_wc is not None:
        target_wc = int(target_wc)

    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == pz_id, StockDocument.tenant_id == tenant_id)
        .first()
    )
    if not doc:
        raise ValueError("PZ document not found")
    if doc.status != "draft":
        raise ValueError("Only draft PZ documents can be updated from WMS receiving")
    if doc.document_type != "PZ":
        raise ValueError("Not a PZ document")
    ensure_pz_document_warehouse_resolved(db, doc)
    ensure_default_pz_receiving_location_if_missing(db, doc)
    _assert_receiving_session_open(doc)

    anchor = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.id == item_id, StockDocumentItem.document_id == pz_id)
        .first()
    )
    if not anchor or anchor.product_id is None:
        raise ValueError("PZ line not found")
    if is_stock_document_item_wm_material(anchor) and target_wc is not None:
        raise ValueError("Materiały magazynowe — tylko luzem (bez nośnika).")

    source_wc = getattr(anchor, "warehouse_carrier_id", None)
    if source_wc is not None:
        source_wc = int(source_wc)
    if source_wc == target_wc:
        return build_stock_document_read(db, doc)

    if target_wc is not None:
        _assert_carrier_linked_to_pz(db, pz_id, target_wc)

    qty = float(anchor.received_quantity or 0)
    if qty <= 1e-12:
        raise ValueError("Brak przyjętej ilości do przeniesienia na inny nośnik")

    prod = db.query(Product).filter(Product.id == anchor.product_id).first()
    if not prod:
        raise ValueError("Product not found")

    track_serial = bool(getattr(prod, "track_serial", False))
    bn = str(getattr(anchor, "batch_number", None) or "")
    ed = getattr(anchor, "expiry_date", None)
    src_cartons = int(getattr(anchor, "cartons_count", 0) or 0)
    src_loose = int(getattr(anchor, "loose_units_count", 0) or 0)

    if track_serial:
        _apply_dock_inventory_for_receipt(
            db,
            tenant_id=tenant_id,
            doc=doc,
            line=anchor,
            add_qty=-qty,
            warehouse_carrier_id=source_wc,
            performed_by=performed_by,
        )
        anchor.warehouse_carrier_id = target_wc
        _apply_dock_inventory_for_receipt(
            db,
            tenant_id=tenant_id,
            doc=doc,
            line=anchor,
            add_qty=qty,
            warehouse_carrier_id=target_wc,
            performed_by=performed_by,
        )
        result_line_id = int(anchor.id)
    else:
        target_line = _find_matching_lot_row(
            db,
            pz_id=pz_id,
            anchor=anchor,
            batch_number=bn,
            expiry_date=ed,
            warehouse_carrier_id=target_wc,
        )
        if not target_line:
            target_line = StockDocumentItem(
                document_id=pz_id,
                delivery_item_id=anchor.delivery_item_id,
                product_id=anchor.product_id,
                ordered_quantity=0.0,
                received_quantity=0.0,
                quantity=0.0,
                cartons_count=0,
                loose_units_count=0,
                purchase_price_net=anchor.purchase_price_net,
                vat_rate=float(anchor.vat_rate or 23.0),
                batch_number=bn,
                expiry_date=ed,
                warehouse_carrier_id=target_wc,
                stock_disposition=getattr(anchor, "stock_disposition", None),
            )
            db.add(target_line)
            db.flush()

        _apply_dock_inventory_for_receipt(
            db,
            tenant_id=tenant_id,
            doc=doc,
            line=anchor,
            add_qty=-qty,
            warehouse_carrier_id=source_wc,
            performed_by=performed_by,
        )

        anchor.received_quantity = 0.0
        anchor.quantity = 0.0
        anchor.cartons_count = 0
        anchor.loose_units_count = 0

        new_rec = float(target_line.received_quantity or 0) + qty
        target_line.received_quantity = new_rec
        target_line.quantity = new_rec
        target_line.cartons_count = int(getattr(target_line, "cartons_count", 0) or 0) + src_cartons
        target_line.loose_units_count = int(getattr(target_line, "loose_units_count", 0) or 0) + src_loose

        _apply_dock_inventory_for_receipt(
            db,
            tenant_id=tenant_id,
            doc=doc,
            line=target_line,
            add_qty=qty,
            warehouse_carrier_id=target_wc,
            performed_by=performed_by,
        )
        result_line_id = int(target_line.id)

    purge_wms_ghost_stock_document_lines(db, pz_id)
    db.flush()
    all_rows = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == pz_id)
        .order_by(StockDocumentItem.id)
        .all()
    )
    bump_receiving_in_progress_if_new(doc)
    recompute_putaway_status_for_document(doc, all_rows, db)
    doc.updated_at = datetime.utcnow()
    _sync_po_from_pz(db, tenant_id, pz_id)
    db.commit()
    db.refresh(doc)
    return build_stock_document_read(db, doc, force_visible_item_ids={result_line_id})


def move_wms_receiving_pz_item_carrier(
    db: Session,
    tenant_id: int,
    pz_id: int,
    item_id: int,
    body,
    *,
    performed_by: AppUser,
) -> StockDocumentRead:
    """Move all received quantity from the anchor line's carrier to another (or luzem)."""
    target_wc = getattr(body, "warehouse_carrier_id", None)
    if target_wc is not None:
        target_wc = int(target_wc)

    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == pz_id, StockDocument.tenant_id == tenant_id)
        .first()
    )
    if not doc:
        raise ValueError("PZ document not found")
    if doc.status != "draft":
        raise ValueError("Only draft PZ documents can be updated from WMS receiving")
    if doc.document_type != "PZ":
        raise ValueError("Not a PZ document")
    ensure_pz_document_warehouse_resolved(db, doc)
    ensure_default_pz_receiving_location_if_missing(db, doc)
    _assert_receiving_session_open(doc)

    anchor = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.id == item_id, StockDocumentItem.document_id == pz_id)
        .first()
    )
    if not anchor or anchor.product_id is None:
        raise ValueError("PZ line not found")
    if is_stock_document_item_wm_material(anchor) and target_wc is not None:
        raise ValueError("Materiały magazynowe — tylko luzem (bez nośnika).")

    source_wc = getattr(anchor, "warehouse_carrier_id", None)
    if source_wc is not None:
        source_wc = int(source_wc)
    if source_wc == target_wc:
        return build_stock_document_read(db, doc)

    if target_wc is not None:
        _assert_carrier_linked_to_pz(db, pz_id, target_wc)

    qty = float(anchor.received_quantity or 0)
    if qty <= 1e-12:
        raise ValueError("Brak przyjętej ilości do przeniesienia na inny nośnik")

    prod = db.query(Product).filter(Product.id == anchor.product_id).first()
    if not prod:
        raise ValueError("Product not found")

    track_serial = bool(getattr(prod, "track_serial", False))
    bn = str(getattr(anchor, "batch_number", None) or "")
    ed = getattr(anchor, "expiry_date", None)
    src_cartons = int(getattr(anchor, "cartons_count", 0) or 0)
    src_loose = int(getattr(anchor, "loose_units_count", 0) or 0)

    if track_serial:
        _apply_dock_inventory_for_receipt(
            db,
            tenant_id=tenant_id,
            doc=doc,
            line=anchor,
            add_qty=-qty,
            warehouse_carrier_id=source_wc,
            performed_by=performed_by,
        )
        anchor.warehouse_carrier_id = target_wc
        _apply_dock_inventory_for_receipt(
            db,
            tenant_id=tenant_id,
            doc=doc,
            line=anchor,
            add_qty=qty,
            warehouse_carrier_id=target_wc,
            performed_by=performed_by,
        )
        result_line_id = int(anchor.id)
    else:
        target_line = _find_matching_lot_row(
            db,
            pz_id=pz_id,
            anchor=anchor,
            batch_number=bn,
            expiry_date=ed,
            warehouse_carrier_id=target_wc,
        )
        if not target_line:
            target_line = StockDocumentItem(
                document_id=pz_id,
                delivery_item_id=anchor.delivery_item_id,
                product_id=anchor.product_id,
                ordered_quantity=0.0,
                received_quantity=0.0,
                quantity=0.0,
                cartons_count=0,
                loose_units_count=0,
                purchase_price_net=anchor.purchase_price_net,
                vat_rate=float(anchor.vat_rate or 23.0),
                batch_number=bn,
                expiry_date=ed,
                warehouse_carrier_id=target_wc,
                stock_disposition=getattr(anchor, "stock_disposition", None),
            )
            db.add(target_line)
            db.flush()

        _apply_dock_inventory_for_receipt(
            db,
            tenant_id=tenant_id,
            doc=doc,
            line=anchor,
            add_qty=-qty,
            warehouse_carrier_id=source_wc,
            performed_by=performed_by,
        )

        anchor.received_quantity = 0.0
        anchor.quantity = 0.0
        anchor.cartons_count = 0
        anchor.loose_units_count = 0

        new_rec = float(target_line.received_quantity or 0) + qty
        target_line.received_quantity = new_rec
        target_line.quantity = new_rec
        target_line.cartons_count = int(getattr(target_line, "cartons_count", 0) or 0) + src_cartons
        target_line.loose_units_count = int(getattr(target_line, "loose_units_count", 0) or 0) + src_loose

        _apply_dock_inventory_for_receipt(
            db,
            tenant_id=tenant_id,
            doc=doc,
            line=target_line,
            add_qty=qty,
            warehouse_carrier_id=target_wc,
            performed_by=performed_by,
        )
        result_line_id = int(target_line.id)

    purge_wms_ghost_stock_document_lines(db, pz_id)
    db.flush()
    all_rows = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == pz_id)
        .order_by(StockDocumentItem.id)
        .all()
    )
    bump_receiving_in_progress_if_new(doc)
    recompute_putaway_status_for_document(doc, all_rows, db)
    doc.updated_at = datetime.utcnow()
    _sync_po_from_pz(db, tenant_id, pz_id)
    db.commit()
    db.refresh(doc)
    return build_stock_document_read(db, doc, force_visible_item_ids={result_line_id})
