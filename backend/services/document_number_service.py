"""
Centralized document series resolution and numbering for ERP/WMS.

Used by sale documents (FV/PA), warehouse stock documents (PZ/WZ/MM/RW/PW), and corrections (KOR).
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Literal, Optional

from sqlalchemy.orm import Session

from ..models.document_series import DocumentSeries
from ..models.stock_document import StockDocument

logger = logging.getLogger(__name__)

WarehouseDocSubtype = Literal["PZ", "WZ", "MM", "RW", "PW", "RESERVATION"]
SaleDocSubtype = Literal["INVOICE", "RECEIPT"]
CorrectionSubtype = Literal["CORRECTION"]

DOCUMENT_SERIES_MISSING_CODE = "DOCUMENT_SERIES_MISSING"


class DocumentSeriesOperationalError(Exception):
    """Structured operational error — never surfaces as unhandled 500 for missing series."""

    def __init__(
        self,
        *,
        document_type: str,
        message: str,
        code: str = DOCUMENT_SERIES_MISSING_CODE,
    ) -> None:
        self.document_type = str(document_type or "").strip().upper()
        self.message = str(message or "").strip()
        self.code = str(code or DOCUMENT_SERIES_MISSING_CODE)
        super().__init__(self.message)

    def to_detail(self) -> dict[str, str]:
        return {
            "message": self.message,
            "code": self.code,
            "document_type": self.document_type,
        }


def _series_active(series: DocumentSeries) -> bool:
    return getattr(series, "is_active", True) is not False


def _pad_number(n: int, series: DocumentSeries) -> str:
    width = int(getattr(series, "padding_length", None) or 0)
    if width < 1:
        width = 6
    return str(max(1, int(n))).zfill(width)


def format_document_number(
    series: DocumentSeries,
    number: int,
    *,
    now: datetime | None = None,
    warehouse_code: str | None = None,
) -> str:
    """Render document number from series template."""
    ts = now or datetime.utcnow()
    fmt = (series.numbering_format or "{PREFIX}{NUMBER}").strip()
    prefix = (series.prefix or "").strip()
    suffix = (series.suffix or "").strip()
    code = (getattr(series, "code", None) or warehouse_code or "").strip()
    padded = _pad_number(number, series)
    out = (
        fmt.replace("{PREFIX}", prefix)
        .replace("{NUMBER}", padded)
        .replace("{SUFFIX}", suffix)
        .replace("{YEAR}", str(ts.year))
        .replace("{MONTH}", f"{ts.month:02d}")
        .replace("{WAREHOUSE}", code)
        .replace("{CODE}", code)
    )
    return out[:128]


def _should_reset_counter(series: DocumentSeries, now: datetime) -> bool:
    if bool(getattr(series, "yearly_reset", False)) or bool(getattr(series, "reset_each_period", False)):
        last = getattr(series, "last_number_period", None)
        if last is None:
            return False
        try:
            last_y = int(str(last).split("-")[0])
            return last_y != int(now.year)
        except (TypeError, ValueError):
            return False
    if bool(getattr(series, "monthly_reset", False)):
        last = getattr(series, "last_number_period", None)
        if last is None:
            return False
        try:
            parts = str(last).split("-")
            last_y, last_m = int(parts[0]), int(parts[1])
            return last_y != int(now.year) or last_m != int(now.month)
        except (TypeError, ValueError, IndexError):
            return False
    return False


def allocate_next_document_number(
    db: Session,
    series: DocumentSeries,
    *,
    now: datetime | None = None,
    warehouse_code: str | None = None,
) -> str:
    """Transaction-safe increment of ``numbering_start`` and formatted number."""
    ts = now or datetime.utcnow()
    db.refresh(series)
    if _should_reset_counter(series, ts):
        series.numbering_start = 1
    next_n = int(series.numbering_start or 1)
    doc_number = format_document_number(series, next_n, now=ts, warehouse_code=warehouse_code)
    series.numbering_start = next_n + 1
    if hasattr(series, "last_number_period"):
        series.last_number_period = f"{ts.year}-{ts.month:02d}"
    db.flush()
    logger.info(
        "[document_series.allocate] series_id=%s subtype=%s number=%s seq=%s",
        series.id,
        getattr(series, "subtype", ""),
        doc_number,
        next_n,
    )
    return doc_number


def resolve_default_document_series(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    series_type: str,
    subtype: str,
) -> DocumentSeries | None:
    """Find default active series for tenant/warehouse/type/subtype."""
    st = str(series_type or "").strip().upper()
    sub = str(subtype or "").strip().upper()
    rows = (
        db.query(DocumentSeries)
        .filter(
            DocumentSeries.tenant_id == int(tenant_id),
            DocumentSeries.warehouse_id == int(warehouse_id),
            DocumentSeries.series_type == st,
            DocumentSeries.subtype == sub,
        )
        .order_by(DocumentSeries.is_default.desc(), DocumentSeries.name.asc())
        .all()
    )
    active = [r for r in rows if _series_active(r)]
    if not active:
        return None
    defaults = [r for r in active if bool(getattr(r, "is_default", False))]
    if len(defaults) == 1:
        return defaults[0]
    if len(defaults) > 1:
        return defaults[0]
    if len(active) == 1:
        return active[0]
    return active[0]


def require_warehouse_series(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    subtype: str,
) -> DocumentSeries:
    hit = resolve_default_document_series(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        series_type="WAREHOUSE",
        subtype=str(subtype).strip().upper(),
    )
    if hit is None:
        sub = str(subtype).strip().upper()
        raise DocumentSeriesOperationalError(
            document_type=sub,
            message=f"Brak aktywnej serii dokumentów {sub}",
        )
    return hit


def stock_document_display_label(doc: StockDocument) -> str:
    stored = str(getattr(doc, "document_number", None) or "").strip()
    if stored:
        return stored
    from .delivery_pz_service import warehouse_document_display_number

    created = getattr(doc, "created_at", None) or datetime.utcnow()
    return warehouse_document_display_number(
        str(getattr(doc, "document_type", None) or "PZ"),
        created,
        int(doc.id),
    )


def assign_series_number_to_stock_document(
    db: Session,
    doc: StockDocument,
    series: DocumentSeries,
    *,
    warehouse_code: str | None = None,
) -> str:
    """Persist series FK + allocated number on a stock document."""
    number = allocate_next_document_number(db, series, warehouse_code=warehouse_code)
    if hasattr(doc, "document_series_id"):
        doc.document_series_id = str(series.id)
    if hasattr(doc, "document_number"):
        doc.document_number = number
    db.flush()
    return number
