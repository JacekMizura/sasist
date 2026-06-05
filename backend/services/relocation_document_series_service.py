"""Serie dokumentów MM wymagane do workflow rozlokowania."""

from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.orm import Session

from ..models.document_series import DocumentSeries
from .document_number_service import (
    DocumentSeriesOperationalError,
    require_warehouse_series,
    resolve_default_document_series,
)

logger = logging.getLogger(__name__)

RELOCATION_DOCUMENT_SERIES_MISSING_MSG = "Brak aktywnej serii dokumentów MM"

_RELOCATION_SUBTYPES = ("MM", "RW", "PW")


def resolve_relocation_document_series(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> Optional[DocumentSeries]:
    """Domyślna seria WAREHOUSE dla rozlokowania — priorytet MM."""
    for subtype in _RELOCATION_SUBTYPES:
        hit = resolve_default_document_series(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            series_type="WAREHOUSE",
            subtype=subtype,
        )
        if hit is not None:
            if subtype != "MM":
                logger.warning(
                    "[wms.relocation.series] tenant_id=%s warehouse_id=%s fallback subtype=%s series_id=%s",
                    tenant_id,
                    warehouse_id,
                    subtype,
                    hit.id,
                )
            return hit
    return None


def assert_relocation_document_series_configured(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> DocumentSeries:
    """Walidacja przed utworzeniem dokumentu MM — structured operational error."""
    try:
        return require_warehouse_series(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            subtype="MM",
        )
    except DocumentSeriesOperationalError:
        hit = resolve_relocation_document_series(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
        )
        if hit is not None:
            return hit
        raise DocumentSeriesOperationalError(
            document_type="MM",
            message=RELOCATION_DOCUMENT_SERIES_MISSING_MSG,
        ) from None
