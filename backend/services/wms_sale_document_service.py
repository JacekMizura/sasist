"""Tworzenie dokumentu sprzedaży po pełnym spakowaniu (WMS) — zapis w ``sale_documents`` + numer na zamówieniu."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime

from sqlalchemy.orm import Session, joinedload

from ..models.commerce_operational import Payment, PaymentTransaction
from ..models.customer import Customer
from ..models.document_series import DocumentSeries
from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.sale_document import SaleDocument
from .document_number_service import allocate_next_document_number
from .sale_document_buyer_snapshot import persist_buyer_snapshot
from .sale_document_financials import compute_sale_totals_from_order

logger = logging.getLogger(__name__)


def _order_import_meta(order: Order) -> dict:
    raw = getattr(order, "import_metadata_json", None) or ""
    if not str(raw).strip():
        return {}
    try:
        d = json.loads(raw)
        return d if isinstance(d, dict) else {}
    except json.JSONDecodeError:
        return {}


def _order_set_import_meta(order: Order, meta: dict) -> None:
    if not meta:
        order.import_metadata_json = None
    else:
        order.import_metadata_json = json.dumps(meta, ensure_ascii=False)


def _panel_type_for_series_subtype(series: DocumentSeries) -> str:
    st = str(getattr(series, "subtype", "") or "").strip().upper()
    if st == "RECEIPT":
        return "PARAGON"
    return "INVOICE"


def _document_subtype_for_panel(panel_document_type: str) -> str:
    return "INVOICE" if str(panel_document_type).strip().upper() == "INVOICE" else "RECEIPT"


def _attach_payment_to_sale_document(db: Session, *, row: SaleDocument, order_id: int) -> None:
    pay = (
        db.query(Payment)
        .filter(Payment.order_id == int(order_id))
        .order_by(Payment.id.desc())
        .first()
    )
    if pay is None:
        return
    row.payment_id = int(pay.id)
    row.payment_method = str(pay.method or "").strip().upper() or None
    row.payment_status = str(pay.status or "").strip().upper() or None
    row.payment_captured_at = getattr(pay, "captured_at", None)
    row.payment_external_transaction_id = str(pay.external_transaction_id or "").strip() or None
    txn = (
        db.query(PaymentTransaction)
        .filter(PaymentTransaction.payment_id == int(pay.id))
        .order_by(PaymentTransaction.id.desc())
        .first()
    )
    if txn is not None and not row.payment_external_transaction_id:
        row.payment_external_transaction_id = str(txn.external_ref or "").strip() or None


def _enrich_sale_document_row(db: Session, *, row: SaleDocument, order: Order, series: DocumentSeries) -> None:
    totals = compute_sale_totals_from_order(order)
    row.total_net = float(totals["total_net"])
    row.total_gross = float(totals["total_gross"])
    row.total_vat = float(totals["total_vat"])
    row.document_subtype = _document_subtype_for_panel(row.panel_document_type)
    row.document_type_id = str(series.id)
    _attach_payment_to_sale_document(db, row=row, order_id=int(order.id))


def create_sale_document(
    db: Session,
    *,
    order: Order,
    series_id: str,
    tenant_id: int,
    warehouse_id: int,
    panel_document_type: str,
    issuance_overrides: dict | None = None,
) -> SaleDocument:
    """
    Alokuje numer z serii (``document_number_service``), zapisuje wiersz ``sale_documents``,
    ustawia ``orders.sales_document_number`` oraz metadane panelu (seria + typ dokumentu).
    Wymaga ``document_series.type`` (kolumna ``type``) = SALE.

    ``issuance_overrides`` (optional) is merged into buyer_json under key ``issuance``
    (payment_term_days, sale_date, additional_description) for automation / Activity readback.
    """
    sid = str(series_id).strip()
    logger.info(
        "Creating document… order_id=%s SELECTED_SERIES=%s panel_document_type=%s",
        order.id,
        sid,
        panel_document_type,
    )

    existing = (
        db.query(SaleDocument)
        .filter(
            SaleDocument.order_id == int(order.id),
            SaleDocument.document_kind == "PRIMARY",
            SaleDocument.series_type == "SALE",
        )
        .order_by(SaleDocument.created_at.desc())
        .first()
    )
    if existing is not None:
        logger.info("Document created ID: %s (already existed for order)", existing.id)
        return existing

    ds = (
        db.query(DocumentSeries)
        .filter(
            DocumentSeries.id == sid,
            DocumentSeries.tenant_id == int(tenant_id),
            DocumentSeries.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if ds is None:
        logger.error("DOCUMENT CREATE FAILED: series not found order_id=%s series_id=%s", order.id, sid)
        raise ValueError("CREATE_DOCUMENT_SERIES_NOT_FOUND")

    stype = str(getattr(ds, "series_type", "") or "").strip().upper()
    if stype != "SALE":
        logger.error(
            "DOCUMENT CREATE FAILED: series_type=%s (expected SALE) order_id=%s",
            stype,
            order.id,
        )
        raise ValueError("CREATE_DOCUMENT_SERIES_NOT_SALE")

    want_sub = "INVOICE" if str(panel_document_type).strip().upper() == "INVOICE" else "RECEIPT"
    sub = str(getattr(ds, "subtype", "") or "").strip().upper()
    if sub != want_sub:
        logger.error(
            "DOCUMENT CREATE FAILED: subtype mismatch order_id=%s want=%s got=%s",
            order.id,
            want_sub,
            sub,
        )
        raise ValueError(f"CREATE_DOCUMENT_SUBTYPE_MISMATCH_EXPECT_{want_sub}")

    warehouse_code = str(getattr(ds, "code", None) or "").strip() or None
    doc_number = allocate_next_document_number(db, ds, warehouse_code=warehouse_code)
    if len(doc_number) > 128:
        doc_number = doc_number[:128]

    db.add(ds)

    panel = str(panel_document_type).strip().upper()
    row = SaleDocument(
        id=str(uuid.uuid4()),
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order.id),
        document_series_id=sid,
        document_number=doc_number,
        panel_document_type=panel,
        document_subtype=_document_subtype_for_panel(panel),
        document_type_id=sid,
        series_type="SALE",
        document_kind="PRIMARY",
        created_at=datetime.utcnow(),
    )

    order_loaded = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == int(order.id))
        .first()
    )
    order_for_snapshot = order_loaded if order_loaded is not None else order
    if order_loaded is not None:
        _enrich_sale_document_row(db, row=row, order=order_loaded, series=ds)

    customer: Customer | None = None
    if getattr(order_for_snapshot, "customer_id", None):
        customer = db.query(Customer).filter(Customer.id == int(order_for_snapshot.customer_id)).first()
    persist_buyer_snapshot(
        db,
        row=row,
        order=order_for_snapshot,
        panel_document_type=panel,
        customer=customer,
    )

    if issuance_overrides:
        try:
            buyer = json.loads(row.buyer_json) if row.buyer_json else {}
            if not isinstance(buyer, dict):
                buyer = {}
        except (json.JSONDecodeError, TypeError):
            buyer = {}
        issuance = buyer.get("issuance") if isinstance(buyer.get("issuance"), dict) else {}
        for key in ("payment_term_days", "sale_date", "additional_description", "payment_term_text"):
            if key in issuance_overrides and issuance_overrides[key] is not None:
                issuance[key] = issuance_overrides[key]
        if issuance:
            buyer["issuance"] = issuance
            row.buyer_json = json.dumps(buyer, ensure_ascii=False)

    db.add(row)

    order.sales_document_number = doc_number

    meta = _order_import_meta(order)
    meta["panel_document_series_id"] = sid
    meta["panel_document_type"] = panel
    _order_set_import_meta(order, meta)

    db.flush()
    from .sale_documents.items_snapshot import snapshot_primary_items_from_order

    # Shipping snapshot only on legal create (series flag). Never on early-return reuse.
    snapshot_primary_items_from_order(
        db,
        doc=row,
        order=order_for_snapshot,
        series=ds,
        include_shipping=True,
    )
    logger.info("Document created ID: %s number=%s", row.id, doc_number)
    return row


def panel_document_type_for_series(series: DocumentSeries) -> str:
    """INVOICE / PARAGON (UI) z podtypu serii sprzedażowej."""
    return _panel_type_for_series_subtype(series)
