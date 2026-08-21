"""issue_sale_correction — sole legal path to create SaleDocument corrections (KOR)."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...models.document_series import DocumentSeries
from ...models.sale_document import SaleDocument
from ...models.wms_order_return import WmsOrderReturn
from ..document_number_service import allocate_next_document_number, resolve_default_document_series
from ..sale_document_buyer_snapshot import parse_buyer_snapshot, serialize_buyer_snapshot
from .correction_financials import compute_totals_from_sale_document_items
from .errors import SaleCorrectionError
from .items_snapshot import replace_sale_document_items
from .return_correction_adapter import (
    build_return_correction_lines,
    source_shipping_already_corrected,
)

logger = logging.getLogger(__name__)

BUSINESS_SOURCE_RETURN = "RETURN"
BUSINESS_SOURCE_MANUAL = "MANUAL"


def find_primary_sale_document_for_order(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    warehouse_id: int | None = None,
) -> SaleDocument | None:
    q = (
        db.query(SaleDocument)
        .filter(
            SaleDocument.tenant_id == int(tenant_id),
            SaleDocument.order_id == int(order_id),
            SaleDocument.document_kind == "PRIMARY",
            SaleDocument.series_type == "SALE",
        )
        .order_by(SaleDocument.created_at.desc())
    )
    if warehouse_id is not None:
        q = q.filter(SaleDocument.warehouse_id == int(warehouse_id))
    return q.first()


def list_corrections_for_source(
    db: Session,
    *,
    tenant_id: int,
    source_sale_document_id: str,
) -> list[SaleDocument]:
    return (
        db.query(SaleDocument)
        .filter(
            SaleDocument.tenant_id == int(tenant_id),
            SaleDocument.source_sale_document_id == str(source_sale_document_id),
            SaleDocument.document_kind == "CORRECTION",
        )
        .order_by(SaleDocument.created_at.asc(), SaleDocument.id.asc())
        .all()
    )


def _resolve_kor_series(db: Session, *, source: SaleDocument) -> DocumentSeries:
    parent_series = (
        db.query(DocumentSeries)
        .filter(DocumentSeries.id == str(source.document_series_id))
        .first()
    )
    if parent_series is not None:
        corr_id = getattr(parent_series, "correction_series_id", None)
        if corr_id:
            linked = (
                db.query(DocumentSeries)
                .filter(
                    DocumentSeries.id == str(corr_id),
                    DocumentSeries.tenant_id == int(source.tenant_id),
                )
                .first()
            )
            if linked is not None and str(linked.series_type or "").upper() == "CORRECTION":
                return linked

    resolved = resolve_default_document_series(
        db,
        tenant_id=int(source.tenant_id),
        warehouse_id=int(source.warehouse_id),
        series_type="CORRECTION",
        subtype="CORRECTION",
    )
    if resolved is None:
        raise SaleCorrectionError(
            "CORRECTION_SERIES_MISSING",
            "Brak aktywnej serii KOR (CORRECTION) dla magazynu.",
        )
    return resolved


def _assert_source_supports_correction(source: SaleDocument) -> None:
    kind = str(getattr(source, "document_kind", None) or "PRIMARY").strip().upper()
    if kind != "PRIMARY":
        raise SaleCorrectionError("INVALID_SOURCE", "Dokument źródłowy musi być dokumentem pierwotnym (PRIMARY).")
    if str(source.series_type or "").upper() != "SALE":
        raise SaleCorrectionError("INVALID_SOURCE", "Dokument źródłowy musi mieć series_type=SALE.")
    panel = str(source.panel_document_type or "").strip().upper()
    subtype = str(source.document_subtype or "").strip().upper()
    # V1: invoice only
    if panel not in ("INVOICE",) and subtype not in ("INVOICE",):
        raise SaleCorrectionError(
            "CORRECTION_NOT_SUPPORTED_FOR_DOCUMENT_TYPE",
            "V1 obsługuje wyłącznie korektę faktury (INVOICE). Paragon/RECEIPT jest odrzucony.",
        )


def _find_existing_idempotent(
    db: Session,
    *,
    source_id: str,
    business_source_type: str,
    business_source_id: str,
    scope_hash: str,
) -> SaleDocument | None:
    return (
        db.query(SaleDocument)
        .filter(
            SaleDocument.source_sale_document_id == str(source_id),
            SaleDocument.business_source_type == str(business_source_type),
            SaleDocument.business_source_id == str(business_source_id),
            SaleDocument.correction_scope_hash == str(scope_hash),
            SaleDocument.document_kind == "CORRECTION",
        )
        .first()
    )


def issue_sale_correction(
    db: Session,
    *,
    tenant_id: int,
    source_sale_document_id: str,
    correction_lines: list[dict[str, Any]],
    correction_scope_hash: str,
    business_source_type: str,
    business_source_id: str,
    reason: str | None = None,
    warehouse_id: int | None = None,
) -> tuple[SaleDocument, bool]:
    """
    Create or reuse a CORRECTION SaleDocument.

    Returns (document, reused_existing).
    Lines must already be signed deltas with order_item_id.
    """
    source = (
        db.query(SaleDocument)
        .filter(
            SaleDocument.id == str(source_sale_document_id),
            SaleDocument.tenant_id == int(tenant_id),
        )
        .first()
    )
    if source is None:
        raise SaleCorrectionError("SOURCE_NOT_FOUND", "Dokument źródłowy nie istnieje.")
    if warehouse_id is not None and int(source.warehouse_id) != int(warehouse_id):
        raise SaleCorrectionError("WAREHOUSE_MISMATCH", "Dokument źródłowy należy do innego magazynu.")

    _assert_source_supports_correction(source)

    if not correction_lines:
        raise SaleCorrectionError("EMPTY_CORRECTION", "Korekta nie zawiera pozycji.")
    scope = str(correction_scope_hash or "").strip()
    if not scope:
        raise SaleCorrectionError("SCOPE_HASH_REQUIRED", "Brak correction_scope_hash.")

    bst = str(business_source_type or "").strip().upper()
    bsid = str(business_source_id or "").strip()
    if not bst or not bsid:
        raise SaleCorrectionError("BUSINESS_SOURCE_REQUIRED", "Wymagane business_source_type oraz business_source_id.")

    existing = _find_existing_idempotent(
        db,
        source_id=str(source.id),
        business_source_type=bst,
        business_source_id=bsid,
        scope_hash=scope,
    )
    if existing is not None:
        return existing, True

    kor_series = _resolve_kor_series(db, source=source)
    warehouse_code = str(getattr(kor_series, "code", None) or "").strip() or None
    doc_number = allocate_next_document_number(db, kor_series, warehouse_code=warehouse_code)
    if len(doc_number) > 128:
        doc_number = doc_number[:128]

    buyer_raw = getattr(source, "buyer_json", None)
    parsed_buyer = parse_buyer_snapshot(buyer_raw)
    buyer_json = serialize_buyer_snapshot(parsed_buyer) if parsed_buyer else buyer_raw

    row = SaleDocument(
        id=str(uuid.uuid4()),
        tenant_id=int(source.tenant_id),
        warehouse_id=int(source.warehouse_id),
        order_id=int(source.order_id),
        document_series_id=str(kor_series.id),
        document_type_id=str(kor_series.id),
        document_number=doc_number,
        panel_document_type=str(source.panel_document_type or "INVOICE"),
        document_subtype="CORRECTION",
        series_type="CORRECTION",
        document_kind="CORRECTION",
        source_sale_document_id=str(source.id),
        correction_reason=(str(reason).strip() if reason else None),
        business_source_type=bst,
        business_source_id=bsid,
        correction_scope_hash=scope,
        buyer_json=buyer_json,
        created_at=datetime.utcnow(),
    )
    db.add(row)
    db.flush()

    replace_sale_document_items(db, sale_document_id=str(row.id), lines=correction_lines)
    totals = compute_totals_from_sale_document_items(correction_lines)
    row.total_net = float(totals["total_net"])
    row.total_vat = float(totals["total_vat"])
    row.total_gross = float(totals["total_gross"])
    db.add(kor_series)

    try:
        with db.begin_nested():
            db.flush()
    except IntegrityError as exc:
        reused = _find_existing_idempotent(
            db,
            source_id=str(source.id),
            business_source_type=bst,
            business_source_id=bsid,
            scope_hash=scope,
        )
        if reused is not None:
            return reused, True
        raise SaleCorrectionError("IDEMPOTENCY_RACE", "Konflikt idempotencji korekty.") from exc

    logger.info(
        "Sale correction issued id=%s number=%s source=%s reused=0",
        row.id,
        doc_number,
        source.id,
    )
    return row, False


def issue_sale_correction_for_return(
    db: Session,
    *,
    tenant_id: int,
    return_id: int,
    source_sale_document_id: str | None = None,
    reason: str | None = None,
    warehouse_id: int | None = None,
    include_shipping_cost: bool = False,
) -> tuple[SaleDocument, bool]:
    """Domain adapter: RETURN → correction request → issue_sale_correction."""
    ret = (
        db.query(WmsOrderReturn)
        .filter(
            WmsOrderReturn.id == int(return_id),
            WmsOrderReturn.tenant_id == int(tenant_id),
        )
        .first()
    )
    if ret is None:
        raise SaleCorrectionError("RETURN_MISSING", "Zwrot nie istnieje.")
    if warehouse_id is not None and int(getattr(ret, "warehouse_id", 0) or 0) not in (0, int(warehouse_id)):
        # warehouse_id on return may be nullable in some schemas — soft check when set
        ret_wh = getattr(ret, "warehouse_id", None)
        if ret_wh is not None and int(ret_wh) != int(warehouse_id):
            raise SaleCorrectionError("WAREHOUSE_MISMATCH", "Zwrot należy do innego magazynu.")

    source: SaleDocument | None = None
    if source_sale_document_id:
        source = (
            db.query(SaleDocument)
            .filter(
                SaleDocument.id == str(source_sale_document_id),
                SaleDocument.tenant_id == int(tenant_id),
            )
            .first()
        )
        if source is None:
            raise SaleCorrectionError("SOURCE_NOT_FOUND", "Dokument źródłowy nie istnieje.")
    else:
        source = find_primary_sale_document_for_order(
            db,
            tenant_id=int(tenant_id),
            order_id=int(ret.order_id),
            warehouse_id=warehouse_id,
        )
        if source is None:
            raise SaleCorrectionError(
                "SOURCE_DOCUMENT_MISSING",
                "Brak pierwotnej faktury (PRIMARY INVOICE) dla zamówienia zwrotu.",
            )

    # Ambiguous: more than one PRIMARY invoice for order
    primaries = (
        db.query(SaleDocument)
        .filter(
            SaleDocument.tenant_id == int(tenant_id),
            SaleDocument.order_id == int(ret.order_id),
            SaleDocument.document_kind == "PRIMARY",
            SaleDocument.series_type == "SALE",
        )
        .all()
    )
    invoice_primaries = [
        p
        for p in primaries
        if str(p.panel_document_type or "").upper() == "INVOICE"
        or str(p.document_subtype or "").upper() == "INVOICE"
    ]
    if source_sale_document_id is None and len(invoice_primaries) > 1:
        raise SaleCorrectionError(
            "SOURCE_DOCUMENT_AMBIGUOUS",
            "Więcej niż jedna faktura PRIMARY dla zamówienia — podaj source_sale_document_id.",
        )

    lines, scope_hash = build_return_correction_lines(
        db,
        source=source,
        return_row=ret,
        include_shipping_cost=bool(include_shipping_cost),
    )
    # Idempotency first — retry of same scope must reuse even if shipping already on that doc.
    existing = _find_existing_idempotent(
        db,
        source_id=str(source.id),
        business_source_type=BUSINESS_SOURCE_RETURN,
        business_source_id=str(int(ret.id)),
        scope_hash=scope_hash,
    )
    if existing is not None:
        return existing, True

    if bool(include_shipping_cost) and source_shipping_already_corrected(
        db, source_sale_document_id=str(source.id)
    ):
        raise SaleCorrectionError(
            "SHIPPING_ALREADY_CORRECTED",
            "Koszt dostawy z dokumentu źródłowego został już skorygowany wcześniej.",
        )

    return issue_sale_correction(
        db,
        tenant_id=int(tenant_id),
        source_sale_document_id=str(source.id),
        correction_lines=lines,
        correction_scope_hash=scope_hash,
        business_source_type=BUSINESS_SOURCE_RETURN,
        business_source_id=str(int(ret.id)),
        reason=reason or f"Korekta do zwrotu RMZ #{int(ret.id)}",
        warehouse_id=warehouse_id,
    )
