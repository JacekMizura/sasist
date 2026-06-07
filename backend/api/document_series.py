"""CRUD API for document series (serie dokumentów)."""

from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from ..database import engine, get_db
from ..db.schema_upgrade import ensure_document_series_extended_columns
from ..models.document_series import DocumentSeries
from ..services.document_series_seed_service import (
    ensure_default_document_series,
    missing_operational_subtypes,
)
from ..models.order_ui_status import OrderUiStatus
from ..schemas.document_series import (
    DocumentSeriesBase,
    DocumentSeriesBulkDeleteBody,
    DocumentSeriesBulkDeleteOut,
    DocumentSeriesCreate,
    DocumentSeriesRead,
    DocumentSeriesUpdate,
    OperationalDocumentCatalogOut,
    OperationalDocumentSeriesOut,
    OrderUiStatusMiniOut,
)
from ..services.document_series_operational_service import build_operational_catalog

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/document-series", tags=["Document series"])

_VALID_SERIES_TYPES = {"SALE", "WAREHOUSE", "CORRECTION"}
_VALID_SUBTYPES = {
    "INVOICE",
    "RECEIPT",
    "WZ",
    "PZ",
    "MM",
    "RW",
    "PW",
    "RESERVATION",
    "CORRECTION",
}
_VALID_DELETE_MODES = {"ALWAYS_DELETE", "ASK"}


def _coerce_series_type(raw: object) -> str:
    s = str(raw or "WAREHOUSE").strip().upper()
    return s if s in _VALID_SERIES_TYPES else "WAREHOUSE"


def _coerce_subtype(raw: object, series_type: str) -> str:
    s = str(raw or "").strip().upper()
    if s in _VALID_SUBTYPES:
        return s
    if series_type == "SALE":
        return "INVOICE"
    if series_type == "CORRECTION":
        return "CORRECTION"
    return "PZ"


def _coerce_delete_mode(raw: object) -> str:
    s = str(raw or "ASK").strip().upper()
    return s if s in _VALID_DELETE_MODES else "ASK"


def _coerce_color(raw: object) -> str:
    s = str(raw or "#64748b").strip()
    if s.startswith("#") and len(s) in (4, 7):
        return s
    return "#64748b"


def _coerce_vat_rate(raw: object) -> Optional[int]:
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _mini_status(row: Optional[OrderUiStatus]) -> Optional[OrderUiStatusMiniOut]:
    if row is None:
        return None
    mg = str(getattr(row, "main_group", None) or "NEW").strip().upper()
    return OrderUiStatusMiniOut(id=int(row.id), name=str(row.name or "").strip() or f"#{row.id}", main_group=mg)


def _series_to_read(row: DocumentSeries) -> DocumentSeriesRead:
    series_type = _coerce_series_type(row.series_type)
    return DocumentSeriesRead(
        id=str(row.id),
        tenant_id=int(row.tenant_id),
        warehouse_id=int(row.warehouse_id),
        name=str(row.name or ""),
        prefix=str(row.prefix or ""),
        suffix=str(row.suffix or ""),
        color=_coerce_color(row.color),
        type=series_type,  # type: ignore[arg-type]
        subtype=_coerce_subtype(row.subtype, series_type),  # type: ignore[arg-type]
        correction_series_id=str(row.correction_series_id).strip() if row.correction_series_id else None,
        warehouse_document_series_id=(
            str(row.warehouse_document_series_id).strip()
            if getattr(row, "warehouse_document_series_id", None)
            else None
        ),
        print_template=str(row.print_template or ""),
        print_template_id=int(row.print_template_id) if getattr(row, "print_template_id", None) is not None else None,
        email_notification_enabled=bool(row.email_notification_enabled),
        delete_mode=_coerce_delete_mode(row.delete_mode),  # type: ignore[arg-type]
        vat_source=str(row.vat_source).strip().upper() if row.vat_source else None,  # type: ignore[arg-type]
        vat_calc_shipping=str(getattr(row, "vat_calc_shipping", None) or "DEFAULT").strip().upper(),  # type: ignore[arg-type]
        vat_calc_payment=str(getattr(row, "vat_calc_payment", None) or "DEFAULT").strip().upper(),  # type: ignore[arg-type]
        vat_rate_percent=_coerce_vat_rate(getattr(row, "vat_rate_percent", None)),
        sale_date_source=str(row.sale_date_source or "ORDER_DATE").upper(),  # type: ignore[arg-type]
        count_shipping_cost_always=bool(row.count_shipping_cost_always),
        shipping_cost_name=str(row.shipping_cost_name or "Koszt wysyłki"),
        payment_term_default=str(row.payment_term_default or ""),
        currency_source=str(row.currency_source or "ORDER").upper(),  # type: ignore[arg-type]
        auto_currency_conversion=bool(row.auto_currency_conversion),
        additional_fields_template=row.additional_fields_template,
        disable_customer_validation=bool(row.disable_customer_validation),
        allow_empty_customer=bool(row.allow_empty_customer),
        warehouse_effect=bool(row.warehouse_effect),
        status_on_create_id=getattr(row, "status_on_create_id", None),
        status_on_delete_id=getattr(row, "status_on_delete_id", None),
        status_on_error_id=getattr(row, "status_on_error_id", None),
        status_on_update_id=getattr(row, "status_on_update_id", None),
        numbering_start=int(row.numbering_start or 1),
        numbering_format=str(row.numbering_format or "{PREFIX}{NUMBER}"),
        reset_each_period=bool(row.reset_each_period),
        code=str(getattr(row, "code", None) or ""),
        padding_length=int(getattr(row, "padding_length", None) or 6),
        yearly_reset=bool(getattr(row, "yearly_reset", False)),
        monthly_reset=bool(getattr(row, "monthly_reset", False)),
        is_default=bool(getattr(row, "is_default", False)),
        is_active=bool(getattr(row, "is_active", True)),
        notes=row.notes,
        company_name=row.company_name,
        company_street=getattr(row, "company_street", None),
        company_house_number=getattr(row, "company_house_number", None),
        company_apartment_number=getattr(row, "company_apartment_number", None),
        company_address=row.company_address,
        company_city=row.company_city,
        company_zip=row.company_zip,
        company_country=row.company_country,
        company_nip=row.company_nip,
        company_regon=getattr(row, "company_regon", None),
        company_bank=row.company_bank,
        company_iban=row.company_iban,
        company_bic=row.company_bic,
        company_email=row.company_email,
        created_at=getattr(row, "created_at", None),
        updated_at=getattr(row, "updated_at", None),
        status_on_create=_mini_status(getattr(row, "status_on_create", None)),
        status_on_delete=_mini_status(getattr(row, "status_on_delete", None)),
        status_on_error=_mini_status(getattr(row, "status_on_error", None)),
        status_on_update=_mini_status(getattr(row, "status_on_update", None)),
    )


def _assert_ui_status(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_id: Optional[int],
    field: str,
) -> None:
    if status_id is None:
        return
    r = (
        db.query(OrderUiStatus)
        .filter(
            OrderUiStatus.id == int(status_id),
            OrderUiStatus.tenant_id == int(tenant_id),
            OrderUiStatus.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not r:
        raise HTTPException(status_code=400, detail=f"Invalid {field}: status not in tenant/warehouse.")


def _assert_correction_series(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    series_id: Optional[str],
    self_id: Optional[str],
) -> None:
    if not series_id or not str(series_id).strip():
        return
    sid = str(series_id).strip()
    if self_id and sid == str(self_id).strip():
        raise HTTPException(status_code=400, detail="correction_series_id cannot point to self.")
    r = (
        db.query(DocumentSeries)
        .filter(
            DocumentSeries.id == sid,
            DocumentSeries.tenant_id == int(tenant_id),
            DocumentSeries.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not r:
        raise HTTPException(status_code=400, detail="correction_series_id not found for tenant/warehouse.")


def _assert_warehouse_document_series(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    series_id: Optional[str],
    self_id: Optional[str],
) -> None:
    if not series_id or not str(series_id).strip():
        return
    sid = str(series_id).strip()
    if self_id and sid == str(self_id).strip():
        raise HTTPException(status_code=400, detail="warehouse_document_series_id cannot point to self.")
    r = (
        db.query(DocumentSeries)
        .filter(
            DocumentSeries.id == sid,
            DocumentSeries.tenant_id == int(tenant_id),
            DocumentSeries.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not r:
        raise HTTPException(status_code=400, detail="warehouse_document_series_id not found for tenant/warehouse.")
    st = str(getattr(r, "series_type", "") or "").strip().upper()
    sub = str(getattr(r, "subtype", "") or "").strip().upper()
    if st != "WAREHOUSE" or sub != "WZ":
        raise HTTPException(status_code=400, detail="warehouse_document_series_id must reference an active WZ series.")


def _default_print_template_id_for_subtype(subtype: str) -> int | None:
    from ..services.document_print_template_catalog import DEFAULT_PRINT_TEMPLATE_ID_BY_SUBTYPE

    sub = str(subtype or "").strip().upper()
    mapping = {
        "FV": "INVOICE",
        "PA": "RECEIPT",
        "KOR": "CORRECTION",
    }
    key = mapping.get(sub, sub)
    preset = DEFAULT_PRINT_TEMPLATE_ID_BY_SUBTYPE.get(key)
    return int(preset) if preset is not None else None


def _apply_body_to_row(row: DocumentSeries, body: DocumentSeriesBase) -> None:
    """Assign scalar fields from create/update body onto ORM row."""
    row.name = body.name.strip()
    row.prefix = (body.prefix or "").strip()
    row.suffix = (body.suffix or "").strip()
    row.color = body.color.strip()
    row.series_type = str(body.type).strip().upper()
    row.subtype = str(body.subtype).strip().upper()
    row.correction_series_id = body.correction_series_id.strip() if body.correction_series_id else None
    if hasattr(row, "warehouse_document_series_id"):
        row.warehouse_document_series_id = (
            body.warehouse_document_series_id.strip() if body.warehouse_document_series_id else None
        )
    row.print_template = (body.print_template or "").strip()
    tpl_id = int(body.print_template_id) if body.print_template_id is not None else None
    if tpl_id is None and not row.print_template:
        tpl_id = _default_print_template_id_for_subtype(str(body.subtype))
    row.print_template_id = tpl_id
    row.email_notification_enabled = bool(body.email_notification_enabled)
    row.delete_mode = str(body.delete_mode).strip().upper()
    row.vat_source = str(body.vat_source).strip().upper() if body.vat_source else None
    row.vat_calc_shipping = str(body.vat_calc_shipping or "DEFAULT").strip().upper()
    row.vat_calc_payment = str(body.vat_calc_payment or "DEFAULT").strip().upper()
    row.vat_rate_percent = int(body.vat_rate_percent) if body.vat_rate_percent is not None else None
    row.sale_date_source = str(body.sale_date_source).strip().upper()
    row.count_shipping_cost_always = bool(body.count_shipping_cost_always)
    row.shipping_cost_name = (body.shipping_cost_name or "Koszt wysyłki").strip() or "Koszt wysyłki"
    row.payment_term_default = (body.payment_term_default or "").strip()
    row.currency_source = str(body.currency_source).strip().upper()
    row.auto_currency_conversion = bool(body.auto_currency_conversion)
    row.additional_fields_template = body.additional_fields_template
    row.disable_customer_validation = bool(body.disable_customer_validation)
    row.allow_empty_customer = bool(body.allow_empty_customer)
    row.warehouse_effect = bool(body.warehouse_effect)
    row.status_on_create_id = body.status_on_create_id
    row.status_on_delete_id = body.status_on_delete_id
    row.status_on_error_id = body.status_on_error_id
    row.status_on_update_id = body.status_on_update_id
    row.numbering_start = int(body.numbering_start)
    row.numbering_format = (body.numbering_format or "{PREFIX}{NUMBER}").strip()
    row.reset_each_period = bool(body.reset_each_period)
    if hasattr(row, "code"):
        row.code = (body.code or "").strip()
    if hasattr(row, "padding_length"):
        row.padding_length = int(body.padding_length or 6)
    if hasattr(row, "yearly_reset"):
        row.yearly_reset = bool(body.yearly_reset)
    if hasattr(row, "monthly_reset"):
        row.monthly_reset = bool(body.monthly_reset)
    if hasattr(row, "is_default"):
        row.is_default = bool(body.is_default)
    if hasattr(row, "is_active"):
        row.is_active = bool(body.is_active)
    row.notes = body.notes
    row.company_name = body.company_name
    row.company_street = body.company_street
    row.company_house_number = body.company_house_number
    row.company_apartment_number = body.company_apartment_number
    row.company_address = body.company_address
    row.company_city = body.company_city
    row.company_zip = body.company_zip
    row.company_country = body.company_country
    row.company_nip = body.company_nip
    row.company_regon = body.company_regon
    row.company_bank = body.company_bank
    row.company_iban = body.company_iban
    row.company_bic = body.company_bic
    row.company_email = body.company_email


@router.post("/bulk-delete", response_model=DocumentSeriesBulkDeleteOut)
def document_series_bulk_delete(body: DocumentSeriesBulkDeleteBody, db: Session = Depends(get_db)):
    q = db.query(DocumentSeries).filter(
        DocumentSeries.tenant_id == int(body.tenant_id),
        DocumentSeries.warehouse_id == int(body.warehouse_id),
        DocumentSeries.id.in_([str(x).strip() for x in body.ids if str(x).strip()]),
    )
    n = q.delete(synchronize_session=False)
    db.commit()
    logger.info("DOCUMENT_SERIES bulk_delete tenant=%s wh=%s deleted=%s", body.tenant_id, body.warehouse_id, n)
    return DocumentSeriesBulkDeleteOut(deleted=int(n))


def _safe_series_to_read(row: DocumentSeries) -> Optional[DocumentSeriesRead]:
    try:
        return _series_to_read(row)
    except Exception:
        logger.exception(
            "document_series row serialization failed id=%s tenant=%s warehouse=%s",
            getattr(row, "id", "?"),
            getattr(row, "tenant_id", "?"),
            getattr(row, "warehouse_id", "?"),
        )
        return None


def _list_document_series_impl(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    series_type: Optional[str],
) -> List[DocumentSeriesRead]:
    try:
        ensure_document_series_extended_columns(engine)
    except Exception:
        logger.exception("ensure_document_series_extended_columns failed in list_document_series")
    try:
        created = ensure_default_document_series(db, int(tenant_id), int(warehouse_id))
        if created:
            logger.info(
                "document_series auto-seeded tenant=%s warehouse=%s created=%s",
                tenant_id,
                warehouse_id,
                created,
            )
    except Exception:
        logger.exception(
            "ensure_default_document_series failed tenant=%s warehouse=%s",
            tenant_id,
            warehouse_id,
        )
        db.rollback()
    missing = missing_operational_subtypes(db, int(tenant_id), int(warehouse_id))
    if missing:
        logger.warning(
            "document_series missing subtypes after ensure tenant=%s warehouse=%s missing=%s",
            tenant_id,
            warehouse_id,
            missing,
        )
    q = (
        db.query(DocumentSeries)
        .options(
            joinedload(DocumentSeries.status_on_create),
            joinedload(DocumentSeries.status_on_delete),
            joinedload(DocumentSeries.status_on_error),
            joinedload(DocumentSeries.status_on_update),
        )
        .filter(
            DocumentSeries.tenant_id == int(tenant_id),
            DocumentSeries.warehouse_id == int(warehouse_id),
        )
        .order_by(DocumentSeries.name.asc())
    )
    if series_type and str(series_type).strip():
        q = q.filter(DocumentSeries.series_type == str(series_type).strip().upper())
    rows = q.all()
    out: list[DocumentSeriesRead] = []
    for r in rows:
        item = _safe_series_to_read(r)
        if item is not None:
            out.append(item)
    return out


@router.get("/operational-catalog", response_model=OperationalDocumentCatalogOut)
def operational_document_catalog(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """Series-driven operational document types for UI tabs, filters, and WMS gates."""
    try:
        ensure_document_series_extended_columns(engine)
    except Exception:
        logger.exception("ensure_document_series_extended_columns failed in operational_catalog")
    try:
        raw = build_operational_catalog(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            ensure_defaults=True,
        )
        return OperationalDocumentCatalogOut(
            tenant_id=int(raw["tenant_id"]),
            warehouse_id=int(raw["warehouse_id"]),
            required_count=int(raw["required_count"]),
            configured_count=int(raw["configured_count"]),
            missing_required_subtypes=list(raw.get("missing_required_subtypes") or []),
            bootstrap_complete=bool(raw.get("bootstrap_complete")),
            items=[OperationalDocumentSeriesOut(**item) for item in raw.get("items") or []],
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "operational_document_catalog failed tenant=%s warehouse=%s",
            tenant_id,
            warehouse_id,
        )
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Nie udało się wczytać katalogu dokumentów operacyjnych.",
                "code": "DOCUMENT_SERIES_CATALOG_FAILED",
            },
        )


@router.get("", response_model=List[DocumentSeriesRead])
@router.get("/", response_model=List[DocumentSeriesRead], include_in_schema=False)
def list_document_series(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    series_type: Optional[str] = Query(None, alias="type", description="Filter: SALE | WAREHOUSE | CORRECTION"),
    db: Session = Depends(get_db),
):
    try:
        return _list_document_series_impl(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            series_type=series_type,
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "list_document_series failed tenant=%s warehouse=%s type=%s",
            tenant_id,
            warehouse_id,
            series_type,
        )
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Nie udało się wczytać serii dokumentów. Spróbuj ponownie za chwilę.",
                "code": "DOCUMENT_SERIES_LIST_FAILED",
            },
        )


@router.post("", response_model=DocumentSeriesRead, status_code=201)
@router.post("/", response_model=DocumentSeriesRead, status_code=201, include_in_schema=False)
def create_document_series(body: DocumentSeriesCreate, db: Session = Depends(get_db)):
    for fld, sid in (
        ("status_on_create_id", body.status_on_create_id),
        ("status_on_delete_id", body.status_on_delete_id),
        ("status_on_error_id", body.status_on_error_id),
        ("status_on_update_id", body.status_on_update_id),
    ):
        _assert_ui_status(db, tenant_id=body.tenant_id, warehouse_id=body.warehouse_id, status_id=sid, field=fld)
    _assert_correction_series(
        db,
        tenant_id=body.tenant_id,
        warehouse_id=body.warehouse_id,
        series_id=body.correction_series_id,
        self_id=None,
    )
    _assert_warehouse_document_series(
        db,
        tenant_id=body.tenant_id,
        warehouse_id=body.warehouse_id,
        series_id=body.warehouse_document_series_id,
        self_id=None,
    )
    row = DocumentSeries(
        tenant_id=body.tenant_id,
        warehouse_id=body.warehouse_id,
    )
    _apply_body_to_row(row, body)
    db.add(row)
    db.commit()
    db.refresh(row)
    row = (
        db.query(DocumentSeries)
        .options(
            joinedload(DocumentSeries.status_on_create),
            joinedload(DocumentSeries.status_on_delete),
            joinedload(DocumentSeries.status_on_error),
            joinedload(DocumentSeries.status_on_update),
        )
        .filter(DocumentSeries.id == row.id)
        .first()
    )
    assert row is not None
    return _series_to_read(row)


@router.get("/{series_id}", response_model=DocumentSeriesRead)
def get_document_series(
    series_id: str,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = (
        db.query(DocumentSeries)
        .options(
            joinedload(DocumentSeries.status_on_create),
            joinedload(DocumentSeries.status_on_delete),
            joinedload(DocumentSeries.status_on_error),
            joinedload(DocumentSeries.status_on_update),
        )
        .filter(
            DocumentSeries.id == str(series_id).strip(),
            DocumentSeries.tenant_id == int(tenant_id),
            DocumentSeries.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Document series not found")
    return _series_to_read(row)


@router.put("/{series_id}", response_model=DocumentSeriesRead)
def update_document_series(
    series_id: str,
    body: DocumentSeriesUpdate,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = (
        db.query(DocumentSeries)
        .filter(
            DocumentSeries.id == str(series_id).strip(),
            DocumentSeries.tenant_id == int(tenant_id),
            DocumentSeries.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Document series not found")
    for fld, sid in (
        ("status_on_create_id", body.status_on_create_id),
        ("status_on_delete_id", body.status_on_delete_id),
        ("status_on_error_id", body.status_on_error_id),
        ("status_on_update_id", body.status_on_update_id),
    ):
        _assert_ui_status(db, tenant_id=tenant_id, warehouse_id=warehouse_id, status_id=sid, field=fld)
    _assert_correction_series(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        series_id=body.correction_series_id,
        self_id=str(row.id),
    )
    _assert_warehouse_document_series(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        series_id=body.warehouse_document_series_id,
        self_id=str(row.id),
    )
    _apply_body_to_row(row, body)
    db.commit()
    row = (
        db.query(DocumentSeries)
        .options(
            joinedload(DocumentSeries.status_on_create),
            joinedload(DocumentSeries.status_on_delete),
            joinedload(DocumentSeries.status_on_error),
            joinedload(DocumentSeries.status_on_update),
        )
        .filter(DocumentSeries.id == str(series_id).strip())
        .first()
    )
    assert row is not None
    return _series_to_read(row)


@router.delete("/{series_id}", status_code=204)
def delete_document_series(
    series_id: str,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = (
        db.query(DocumentSeries)
        .filter(
            DocumentSeries.id == str(series_id).strip(),
            DocumentSeries.tenant_id == int(tenant_id),
            DocumentSeries.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Document series not found")
    db.query(DocumentSeries).filter(DocumentSeries.correction_series_id == str(series_id).strip()).update(
        {DocumentSeries.correction_series_id: None},
        synchronize_session=False,
    )
    db.delete(row)
    db.commit()
    return None
