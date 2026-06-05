"""Default document series per tenant/warehouse — idempotent bootstrap."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from ..models.document_series import DocumentSeries
from ..models.tenant_warehouse import TenantWarehouse

logger = logging.getLogger(__name__)

_DEFAULT_WAREHOUSE_SERIES: list[dict] = [
    {
        "name": "PZ — przyjęcia",
        "subtype": "PZ",
        "prefix": "PZ/",
        "numbering_format": "{PREFIX}{YEAR}/{NUMBER}",
        "padding_length": 6,
        "is_default": True,
    },
    {
        "name": "WZ — wydania",
        "subtype": "WZ",
        "prefix": "WZ/",
        "numbering_format": "{PREFIX}{WAREHOUSE}/{YEAR}/{NUMBER}",
        "padding_length": 6,
        "code": "MAG1",
        "is_default": True,
    },
    {
        "name": "MM — przesunięcia magazynowe",
        "subtype": "MM",
        "prefix": "MM/",
        "numbering_format": "{PREFIX}{YEAR}/{NUMBER}",
        "padding_length": 6,
        "is_default": True,
        "yearly_reset": True,
    },
    {
        "name": "RW — rozchód wewnętrzny",
        "subtype": "RW",
        "prefix": "RW/",
        "numbering_format": "{PREFIX}{YEAR}/{NUMBER}",
        "padding_length": 6,
        "is_default": True,
    },
    {
        "name": "PW — przychód wewnętrzny",
        "subtype": "PW",
        "prefix": "PW/",
        "numbering_format": "{PREFIX}{YEAR}/{NUMBER}",
        "padding_length": 6,
        "is_default": True,
    },
]

_DEFAULT_SALE_SERIES: list[dict] = [
    {
        "name": "FV — faktura VAT",
        "subtype": "INVOICE",
        "prefix": "FV/",
        "numbering_format": "{PREFIX}{MONTH}/{YEAR}/{NUMBER}",
        "padding_length": 6,
        "is_default": True,
        "monthly_reset": True,
    },
    {
        "name": "PA — paragon",
        "subtype": "RECEIPT",
        "prefix": "PA/",
        "numbering_format": "{PREFIX}{MONTH}/{YEAR}/{NUMBER}",
        "padding_length": 6,
        "is_default": True,
        "monthly_reset": True,
    },
]

_DEFAULT_CORRECTION_SERIES: list[dict] = [
    {
        "name": "KOR — korekta",
        "subtype": "CORRECTION",
        "prefix": "KOR/",
        "numbering_format": "{PREFIX}{YEAR}/{NUMBER}",
        "padding_length": 6,
        "is_default": True,
    },
]


def _tenant_warehouse_pairs(db: Session) -> list[tuple[int, int]]:
    rows = db.query(TenantWarehouse.tenant_id, TenantWarehouse.warehouse_id).all()
    return [(int(t), int(w)) for t, w in rows]


def _ensure_series_row(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    series_type: str,
    spec: dict,
) -> DocumentSeries | None:
    subtype = str(spec["subtype"]).strip().upper()
    existing = (
        db.query(DocumentSeries)
        .filter(
            DocumentSeries.tenant_id == int(tenant_id),
            DocumentSeries.warehouse_id == int(warehouse_id),
            DocumentSeries.series_type == series_type,
            DocumentSeries.subtype == subtype,
            DocumentSeries.is_default == True,  # noqa: E712
        )
        .first()
    )
    if existing is not None:
        return existing
    any_exists = (
        db.query(DocumentSeries)
        .filter(
            DocumentSeries.tenant_id == int(tenant_id),
            DocumentSeries.warehouse_id == int(warehouse_id),
            DocumentSeries.series_type == series_type,
            DocumentSeries.subtype == subtype,
        )
        .first()
    )
    if any_exists is not None:
        return any_exists

    now = datetime.utcnow()
    row = DocumentSeries(
        id=str(uuid.uuid4()),
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        name=str(spec["name"]),
        prefix=str(spec.get("prefix") or ""),
        suffix=str(spec.get("suffix") or ""),
        series_type=series_type,
        subtype=subtype,
        numbering_start=1,
        numbering_format=str(spec.get("numbering_format") or "{PREFIX}{NUMBER}"),
        reset_each_period=bool(spec.get("yearly_reset")),
    )
    for attr in ("code", "padding_length", "yearly_reset", "monthly_reset", "is_default", "is_active"):
        if attr in spec and hasattr(DocumentSeries, attr):
            setattr(row, attr, spec[attr])
    if hasattr(DocumentSeries, "is_active"):
        row.is_active = True
    if hasattr(DocumentSeries, "is_default"):
        row.is_default = bool(spec.get("is_default", True))
    if hasattr(DocumentSeries, "padding_length"):
        row.padding_length = int(spec.get("padding_length") or 6)
    if hasattr(DocumentSeries, "yearly_reset"):
        row.yearly_reset = bool(spec.get("yearly_reset"))
    if hasattr(DocumentSeries, "monthly_reset"):
        row.monthly_reset = bool(spec.get("monthly_reset"))
    if hasattr(DocumentSeries, "code"):
        row.code = str(spec.get("code") or "")
    row.created_at = now
    row.updated_at = now
    db.add(row)
    db.flush()
    logger.info(
        "[document_series.seed] tenant_id=%s warehouse_id=%s type=%s subtype=%s series_id=%s",
        tenant_id,
        warehouse_id,
        series_type,
        subtype,
        row.id,
    )
    return row


def seed_default_document_series(db: Session) -> int:
    """Create default series for every tenant↔warehouse link. Returns rows created (approx)."""
    created = 0
    for tenant_id, warehouse_id in _tenant_warehouse_pairs(db):
        for spec in _DEFAULT_WAREHOUSE_SERIES:
            before = db.query(DocumentSeries).count()
            _ensure_series_row(
                db,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                series_type="WAREHOUSE",
                spec=spec,
            )
            if db.query(DocumentSeries).count() > before:
                created += 1
        for spec in _DEFAULT_SALE_SERIES:
            before = db.query(DocumentSeries).count()
            _ensure_series_row(
                db,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                series_type="SALE",
                spec=spec,
            )
            if db.query(DocumentSeries).count() > before:
                created += 1
        for spec in _DEFAULT_CORRECTION_SERIES:
            before = db.query(DocumentSeries).count()
            _ensure_series_row(
                db,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                series_type="CORRECTION",
                spec=spec,
            )
            if db.query(DocumentSeries).count() > before:
                created += 1
    if created:
        db.commit()
    return created
