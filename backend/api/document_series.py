"""CRUD API for document series (serie dokumentów)."""

from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models.document_series import DocumentSeries
from ..models.order_ui_status import OrderUiStatus
from ..schemas.document_series import (
    DocumentSeriesBase,
    DocumentSeriesBulkDeleteBody,
    DocumentSeriesBulkDeleteOut,
    DocumentSeriesCreate,
    DocumentSeriesRead,
    DocumentSeriesUpdate,
    OrderUiStatusMiniOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/document-series", tags=["Document series"])


def _mini_status(row: Optional[OrderUiStatus]) -> Optional[OrderUiStatusMiniOut]:
    if row is None:
        return None
    mg = str(getattr(row, "main_group", None) or "NEW").strip().upper()
    return OrderUiStatusMiniOut(id=int(row.id), name=str(row.name or "").strip() or f"#{row.id}", main_group=mg)


def _series_to_read(row: DocumentSeries) -> DocumentSeriesRead:
    return DocumentSeriesRead(
        id=str(row.id),
        tenant_id=int(row.tenant_id),
        warehouse_id=int(row.warehouse_id),
        name=str(row.name or ""),
        prefix=str(row.prefix or ""),
        suffix=str(row.suffix or ""),
        color=str(row.color or "#64748b"),
        type=str(row.series_type).strip().upper(),  # type: ignore[arg-type]
        subtype=str(row.subtype).strip().upper(),  # type: ignore[arg-type]
        correction_series_id=str(row.correction_series_id).strip() if row.correction_series_id else None,
        print_template=str(row.print_template or ""),
        print_template_id=int(row.print_template_id) if getattr(row, "print_template_id", None) is not None else None,
        email_notification_enabled=bool(row.email_notification_enabled),
        delete_mode=str(row.delete_mode or "ASK").upper(),  # type: ignore[arg-type]
        vat_source=str(row.vat_source).strip().upper() if row.vat_source else None,  # type: ignore[arg-type]
        vat_calc_shipping=str(getattr(row, "vat_calc_shipping", None) or "DEFAULT").strip().upper(),  # type: ignore[arg-type]
        vat_calc_payment=str(getattr(row, "vat_calc_payment", None) or "DEFAULT").strip().upper(),  # type: ignore[arg-type]
        vat_rate_percent=int(row.vat_rate_percent)
        if getattr(row, "vat_rate_percent", None) is not None
        else None,
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


def _apply_body_to_row(row: DocumentSeries, body: DocumentSeriesBase) -> None:
    """Assign scalar fields from create/update body onto ORM row."""
    row.name = body.name.strip()
    row.prefix = (body.prefix or "").strip()
    row.suffix = (body.suffix or "").strip()
    row.color = body.color.strip()
    row.series_type = str(body.type).strip().upper()
    row.subtype = str(body.subtype).strip().upper()
    row.correction_series_id = body.correction_series_id.strip() if body.correction_series_id else None
    row.print_template = (body.print_template or "").strip()
    row.print_template_id = int(body.print_template_id) if body.print_template_id is not None else None
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


@router.get("", response_model=List[DocumentSeriesRead])
def list_document_series(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    series_type: Optional[str] = Query(None, alias="type", description="Filter: SALE | WAREHOUSE | CORRECTION"),
    db: Session = Depends(get_db),
):
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
    return [_series_to_read(r) for r in rows]


@router.post("", response_model=DocumentSeriesRead, status_code=201)
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
