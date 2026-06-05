"""Serie dokumentów magazynowych wymagane do workflow rozlokowania (ZWK/MM)."""

from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.orm import Session

from ..models.document_series import DocumentSeries

logger = logging.getLogger(__name__)

RELOCATION_DOCUMENT_SERIES_MISSING_MSG = (
    "Brak skonfigurowanej serii dokumentów dla rozlokowania (ZWK/MM)."
)

_RELOCATION_NAME_HINTS = ("ZWK", "MM", "ROZLOK", "PRZESUN", "INTERNAL")


def _series_name_hints_relocation(name: str) -> bool:
    u = (name or "").strip().upper()
    return any(h in u for h in _RELOCATION_NAME_HINTS)


def _warehouse_series_query(db: Session, *, tenant_id: int, warehouse_id: int):
    return (
        db.query(DocumentSeries)
        .filter(
            DocumentSeries.tenant_id == int(tenant_id),
            DocumentSeries.warehouse_id == int(warehouse_id),
            DocumentSeries.series_type == "WAREHOUSE",
        )
        .order_by(DocumentSeries.name.asc())
    )


def resolve_relocation_document_series(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> Optional[DocumentSeries]:
    """
    Znajdź serię WAREHOUSE dla rozlokowania (ZWK/MM).

    Priorytet: RW/PW z nazwą sugerującą ZWK/MM → RW → PW → dowolna WAREHOUSE.
    """
    rows = _warehouse_series_query(db, tenant_id=tenant_id, warehouse_id=warehouse_id).all()
    if not rows:
        return None

    for prefer_subtype in ("RW", "PW"):
        named = [
            r
            for r in rows
            if str(getattr(r, "subtype", "") or "").strip().upper() == prefer_subtype
            and _series_name_hints_relocation(str(getattr(r, "name", "") or ""))
        ]
        if len(named) == 1:
            return named[0]
        if len(named) > 1:
            logger.warning(
                "[wms.relocation.series] tenant_id=%s warehouse_id=%s multiple_named subtype=%s count=%s using_first",
                tenant_id,
                warehouse_id,
                prefer_subtype,
                len(named),
            )
            return named[0]

    for prefer_subtype in ("RW", "PW"):
        typed = [
            r
            for r in rows
            if str(getattr(r, "subtype", "") or "").strip().upper() == prefer_subtype
        ]
        if len(typed) == 1:
            logger.warning(
                "[wms.relocation.series] tenant_id=%s warehouse_id=%s auto_default subtype=%s series_id=%s",
                tenant_id,
                warehouse_id,
                prefer_subtype,
                typed[0].id,
            )
            return typed[0]
        if len(typed) > 1:
            logger.warning(
                "[wms.relocation.series] tenant_id=%s warehouse_id=%s multiple subtype=%s count=%s using_first",
                tenant_id,
                warehouse_id,
                prefer_subtype,
                len(typed),
            )
            return typed[0]

    if len(rows) == 1:
        logger.warning(
            "[wms.relocation.series] tenant_id=%s warehouse_id=%s auto_default only_warehouse_series series_id=%s",
            tenant_id,
            warehouse_id,
            rows[0].id,
        )
        return rows[0]

    if len(rows) > 1:
        logger.warning(
            "[wms.relocation.series] tenant_id=%s warehouse_id=%s ambiguous count=%s using_first",
            tenant_id,
            warehouse_id,
            len(rows),
        )
        return rows[0]

    return None


def assert_relocation_document_series_configured(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> DocumentSeries:
    """Walidacja przed utworzeniem dokumentu ZWK/MM — ValueError z komunikatem biznesowym."""
    hit = resolve_relocation_document_series(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
    )
    if hit is None:
        raise ValueError(RELOCATION_DOCUMENT_SERIES_MISSING_MSG)
    return hit
