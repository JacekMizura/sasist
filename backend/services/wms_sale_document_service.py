"""Tworzenie dokumentu sprzedaży po pełnym spakowaniu (WMS) — zapis w ``sale_documents`` + numer na zamówieniu."""

from __future__ import annotations

import json
import logging
import uuid
from sqlalchemy.orm import Session

from ..models.document_series import DocumentSeries
from ..models.order import Order
from ..models.sale_document import SaleDocument

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


def _format_document_number(series: DocumentSeries, number: int) -> str:
    fmt = (series.numbering_format or "{PREFIX}{NUMBER}").strip()
    prefix = (series.prefix or "").strip()
    suffix = (series.suffix or "").strip()
    return (
        fmt.replace("{PREFIX}", prefix)
        .replace("{NUMBER}", str(number))
        .replace("{SUFFIX}", suffix)
    )


def _panel_type_for_series_subtype(series: DocumentSeries) -> str:
    st = str(getattr(series, "subtype", "") or "").strip().upper()
    if st == "RECEIPT":
        return "PARAGON"
    return "INVOICE"


def create_sale_document(
    db: Session,
    *,
    order: Order,
    series_id: str,
    tenant_id: int,
    warehouse_id: int,
    panel_document_type: str,
) -> SaleDocument:
    """
    Alokuje numer z serii (``document_series.numbering_start``), zapisuje wiersz ``sale_documents``,
    ustawia ``orders.sales_document_number`` oraz metadane panelu (seria + typ dokumentu).
    Wymaga ``document_series.type`` (kolumna ``type``) = SALE.
    """
    sid = str(series_id).strip()
    logger.info(
        "Creating document… order_id=%s SELECTED_SERIES=%s panel_document_type=%s",
        order.id,
        sid,
        panel_document_type,
    )

    existing = (
        db.query(SaleDocument).filter(SaleDocument.order_id == int(order.id)).order_by(SaleDocument.created_at.desc()).first()
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

    next_n = int(ds.numbering_start or 1)
    doc_number = _format_document_number(ds, next_n)
    if len(doc_number) > 128:
        doc_number = doc_number[:128]

    ds.numbering_start = next_n + 1
    db.add(ds)

    row = SaleDocument(
        id=str(uuid.uuid4()),
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order.id),
        document_series_id=sid,
        document_number=doc_number,
        panel_document_type=str(panel_document_type).strip().upper(),
        series_type="SALE",
    )
    db.add(row)

    order.sales_document_number = doc_number

    meta = _order_import_meta(order)
    meta["panel_document_series_id"] = sid
    meta["panel_document_type"] = str(panel_document_type).strip().upper()
    _order_set_import_meta(order, meta)

    db.flush()
    logger.info("Document created ID: %s number=%s", row.id, doc_number)
    return row


def panel_document_type_for_series(series: DocumentSeries) -> str:
    """INVOICE / PARAGON (UI) z podtypu serii sprzedażowej."""
    return _panel_type_for_series_subtype(series)
