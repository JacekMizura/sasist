"""Default document series per tenant/warehouse — idempotent bootstrap and repair."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from ..models.document_series import DocumentSeries
from ..models.tenant_warehouse import TenantWarehouse
from .document_series_catalog import ALL_OPERATIONAL_SERIES, DEFAULT_NUMBERING_FORMAT, normalize_series_spec

logger = logging.getLogger(__name__)


def _tenant_warehouse_pairs(db: Session) -> list[tuple[int, int]]:
    rows = db.query(TenantWarehouse.tenant_id, TenantWarehouse.warehouse_id).all()
    return [(int(t), int(w)) for t, w in rows]


def _query_subtype_rows(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    series_type: str,
    subtype: str,
) -> list[DocumentSeries]:
    return (
        db.query(DocumentSeries)
        .filter(
            DocumentSeries.tenant_id == int(tenant_id),
            DocumentSeries.warehouse_id == int(warehouse_id),
            DocumentSeries.series_type == str(series_type).strip().upper(),
            DocumentSeries.subtype == str(subtype).strip().upper(),
        )
        .order_by(DocumentSeries.created_at.asc())
        .all()
    )


def _promote_default_row(row: DocumentSeries) -> None:
    if hasattr(row, "is_default"):
        row.is_default = True
    if hasattr(row, "is_active"):
        row.is_active = True


def _normalize_prefix(raw: object, fallback: str) -> str:
    s = str(raw or fallback).strip().upper().rstrip("/")
    return s or str(fallback).strip().upper()


def _repair_operational_series_row(row: DocumentSeries, spec: dict) -> bool:
    """Align legacy default rows with catalog — no duplicate rows."""
    changed = False
    want_prefix = _normalize_prefix(spec.get("prefix"), str(spec["subtype"]))
    stored_prefix = str(row.prefix or "").strip()
    if stored_prefix.upper().rstrip("/") != want_prefix or stored_prefix != want_prefix:
        row.prefix = want_prefix
        changed = True
    want_fmt = str(spec.get("numbering_format") or DEFAULT_NUMBERING_FORMAT)
    if str(row.numbering_format or "").strip() != want_fmt:
        row.numbering_format = want_fmt
        changed = True
    if hasattr(row, "monthly_reset") and bool(getattr(row, "monthly_reset", False)) is not bool(spec.get("monthly_reset", True)):
        row.monthly_reset = bool(spec.get("monthly_reset", True))
        changed = True
    if hasattr(row, "yearly_reset") and bool(getattr(row, "yearly_reset", False)) is not bool(spec.get("yearly_reset", False)):
        row.yearly_reset = bool(spec.get("yearly_reset", False))
        changed = True
    if bool(getattr(row, "reset_each_period", False)) is not bool(spec.get("monthly_reset", True)):
        row.reset_each_period = bool(spec.get("monthly_reset", True))
        changed = True
    if hasattr(row, "padding_length") and "padding_length" in spec:
        want_pad = int(spec.get("padding_length") or 0)
        if int(getattr(row, "padding_length", None) or 6) != want_pad:
            row.padding_length = want_pad
            changed = True
    if hasattr(row, "print_template_id") and spec.get("print_template_id") is not None:
        want_tpl = int(spec["print_template_id"])
        if int(getattr(row, "print_template_id", None) or 0) != want_tpl:
            row.print_template_id = want_tpl
            changed = True
    if hasattr(row, "warehouse_effect"):
        want_wh = bool(spec.get("warehouse_effect", str(spec.get("series_type", "")).upper() == "WAREHOUSE"))
        if bool(getattr(row, "warehouse_effect", False)) is not want_wh:
            row.warehouse_effect = want_wh
            changed = True
    if changed:
        row.updated_at = datetime.utcnow()
        logger.info(
            "[document_series.repair] normalized legacy row tenant_id=%s warehouse_id=%s subtype=%s id=%s",
            row.tenant_id,
            row.warehouse_id,
            getattr(row, "subtype", ""),
            row.id,
        )
    return changed


def _apply_spec_to_new_row(row: DocumentSeries, spec: dict) -> None:
    row.name = str(spec["name"])
    row.prefix = str(spec.get("prefix") or "")
    row.suffix = str(spec.get("suffix") or "")
    row.series_type = str(spec["series_type"])
    row.subtype = str(spec["subtype"])
    row.numbering_start = 1
    row.numbering_format = str(spec.get("numbering_format") or DEFAULT_NUMBERING_FORMAT)
    row.reset_each_period = bool(spec.get("monthly_reset"))
    if hasattr(row, "warehouse_effect"):
        row.warehouse_effect = bool(spec.get("warehouse_effect", str(spec["series_type"]).upper() == "WAREHOUSE"))
    for attr in (
        "code",
        "padding_length",
        "print_template_id",
        "yearly_reset",
        "monthly_reset",
        "is_default",
        "is_active",
    ):
        if attr in spec and hasattr(DocumentSeries, attr):
            setattr(row, attr, spec[attr])
    if hasattr(DocumentSeries, "is_active"):
        row.is_active = True
    if hasattr(DocumentSeries, "is_default"):
        row.is_default = bool(spec.get("is_default", True))
    if hasattr(DocumentSeries, "padding_length"):
        row.padding_length = int(spec["padding_length"]) if "padding_length" in spec else 0


def _ensure_series_row(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    spec: dict,
) -> tuple[DocumentSeries, bool]:
    """Return (row, created). Never duplicates subtype when a row already exists."""
    series_type = str(spec["series_type"]).strip().upper()
    subtype = str(spec["subtype"]).strip().upper()
    rows = _query_subtype_rows(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        series_type=series_type,
        subtype=subtype,
    )

    defaults = [r for r in rows if bool(getattr(r, "is_default", False))]
    if defaults:
        hit = defaults[0]
        if hasattr(hit, "is_active") and hit.is_active is False:
            hit.is_active = True
        _repair_operational_series_row(hit, spec)
        db.flush()
        return hit, False

    if len(rows) == 1:
        hit = rows[0]
        _promote_default_row(hit)
        _repair_operational_series_row(hit, spec)
        db.flush()
        logger.info(
            "[document_series.repair] promoted legacy default tenant_id=%s warehouse_id=%s type=%s subtype=%s id=%s",
            tenant_id,
            warehouse_id,
            series_type,
            subtype,
            hit.id,
        )
        return hit, False

    if len(rows) > 1:
        active = [r for r in rows if getattr(r, "is_active", True) is not False]
        hit = active[0] if active else rows[0]
        _promote_default_row(hit)
        _repair_operational_series_row(hit, spec)
        db.flush()
        logger.warning(
            "[document_series.repair] multiple rows for subtype — promoted first tenant_id=%s warehouse_id=%s type=%s subtype=%s id=%s count=%s",
            tenant_id,
            warehouse_id,
            series_type,
            subtype,
            hit.id,
            len(rows),
        )
        return hit, False

    now = datetime.utcnow()
    row = DocumentSeries(
        id=str(uuid.uuid4()),
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        created_at=now,
        updated_at=now,
    )
    _apply_spec_to_new_row(row, spec)
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
    return row, True


def ensure_default_document_series(db: Session, tenant_id: int, warehouse_id: int) -> int:
    """Idempotent defaults for one tenant/warehouse — PZ,WZ,MM,RW,PW,FV,PA,KOR. Returns rows created."""
    created = 0
    tid, wid = int(tenant_id), int(warehouse_id)

    for raw in ALL_OPERATIONAL_SERIES:
        spec = normalize_series_spec(raw)
        try:
            _, was_created = _ensure_series_row(db, tenant_id=tid, warehouse_id=wid, spec=spec)
            db.commit()
            if was_created:
                created += 1
        except Exception:
            db.rollback()
            logger.exception(
                "[document_series.seed] failed tenant_id=%s warehouse_id=%s type=%s subtype=%s",
                tid,
                wid,
                spec.get("series_type"),
                spec.get("subtype"),
            )

    missing = missing_operational_subtypes(db, tid, wid)
    if missing:
        logger.warning(
            "[document_series.seed] incomplete tenant_id=%s warehouse_id=%s missing_subtypes=%s",
            tid,
            wid,
            missing,
        )
    return created


def missing_operational_subtypes(db: Session, tenant_id: int, warehouse_id: int) -> list[str]:
    """Subtype codes still without any series row after ensure (diagnostics)."""
    missing: list[str] = []
    for raw in ALL_OPERATIONAL_SERIES:
        spec = normalize_series_spec(raw)
        st = spec["series_type"]
        sub = spec["subtype"]
        count = (
            db.query(DocumentSeries)
            .filter(
                DocumentSeries.tenant_id == int(tenant_id),
                DocumentSeries.warehouse_id == int(warehouse_id),
                DocumentSeries.series_type == st,
                DocumentSeries.subtype == sub,
            )
            .count()
        )
        if count < 1:
            missing.append(sub)
    return missing


def repair_receipt_series_padding_all(db: Session) -> int:
    """Force PA/RECEIPT padding_length=0 on legacy rows (e.g. PA/2026/06/000005 → …/5)."""
    rows = (
        db.query(DocumentSeries)
        .filter(
            DocumentSeries.series_type == "SALE",
            DocumentSeries.subtype == "RECEIPT",
        )
        .all()
    )
    changed = 0
    for row in rows:
        if not hasattr(row, "padding_length"):
            continue
        if int(getattr(row, "padding_length", None) or 0) != 0:
            row.padding_length = 0
            row.updated_at = datetime.utcnow()
            changed += 1
    if changed:
        db.commit()
        logger.info("[document_series.repair] receipt padding_length=0 rows_updated=%s", changed)
    return changed


def seed_default_document_series(db: Session) -> int:
    """Create default series for every tenant↔warehouse link. Returns rows created."""
    try:
        repair_receipt_series_padding_all(db)
    except Exception:
        db.rollback()
        logger.exception("[document_series.repair] receipt padding repair failed")
    total = 0
    for tenant_id, warehouse_id in _tenant_warehouse_pairs(db):
        total += ensure_default_document_series(db, tenant_id, warehouse_id)
    return total
