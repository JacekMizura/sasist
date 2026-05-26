"""CRUD definicji dodatkowych pól zamówienia."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.order_custom_field import OrderCustomField, OrderCustomFieldOption
from ..schemas.order_custom_field import ORDER_CUSTOM_FIELD_TYPES, OrderCustomFieldRead, OrderCustomFieldWrite, OrderCustomFieldsBulkDeleteBody
from ..services.order_custom_field_definition_icon import delete_definition_icon_file, save_definition_icon_bytes
from ..services.order_custom_field_service import (
    default_settings_for_type,
    parse_settings,
    serialize_field_definition,
    slugify_name,
)
from ..auth.deps import get_current_user
from ..models.app_user import AppUser

router = APIRouter(prefix="/order-custom-fields", tags=["Order custom fields"])


def _merge_settings(field_type: str, incoming: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    base = default_settings_for_type(field_type)
    if incoming and isinstance(incoming, dict):
        for k, v in incoming.items():
            if k in base and isinstance(base[k], dict) and isinstance(v, dict):
                base[k].update(v)
            else:
                base[k] = v
    return base


@router.get("/", response_model=List[OrderCustomFieldRead])
def list_order_custom_fields(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    active_only: bool = Query(False),
    sort: str = Query("sort_order"),
    db: Session = Depends(get_db),
    _: AppUser = Depends(get_current_user),
):
    q = db.query(OrderCustomField).filter(
        OrderCustomField.tenant_id == int(tenant_id),
        OrderCustomField.warehouse_id == int(warehouse_id),
    )
    if active_only:
        q = q.filter(OrderCustomField.is_active.is_(True))
    if sort in ("name", "-name"):
        q = q.order_by(OrderCustomField.name.desc() if sort.startswith("-") else OrderCustomField.name.asc())
    else:
        q = q.order_by(OrderCustomField.sort_order.asc(), OrderCustomField.id.asc())
    rows = q.all()
    return [serialize_field_definition(r) for r in rows]


@router.post("/", response_model=OrderCustomFieldRead)
def create_order_custom_field(
    body: OrderCustomFieldWrite,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(get_current_user),
):
    ft = (body.type or "").strip().upper()
    if ft not in ORDER_CUSTOM_FIELD_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid type: {body.type}")
    slug = (body.slug or "").strip() or slugify_name(body.name)
    clash = (
        db.query(OrderCustomField)
        .filter(
            OrderCustomField.tenant_id == tenant_id,
            OrderCustomField.warehouse_id == warehouse_id,
            OrderCustomField.slug == slug,
        )
        .first()
    )
    if clash:
        raise HTTPException(status_code=409, detail="Slug already exists for this warehouse.")
    merged = _merge_settings(ft, body.settings_json)
    row = OrderCustomField(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        name=str(body.name).strip()[:256],
        slug=slug[:128],
        type=ft,
        settings_json=json.dumps(merged, ensure_ascii=False),
        icon_file_id=body.icon_file_id,
        sort_order=int(body.sort_order),
        is_active=bool(body.is_active),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.flush()
    for i, op in enumerate(body.options):
        db.add(
            OrderCustomFieldOption(
                field_id=int(row.id),
                label=str(op.label).strip()[:512],
                icon_file_id=op.icon_file_id,
                sort_order=int(op.sort_order) if op.sort_order is not None else i,
            )
        )
    db.commit()
    db.refresh(row)
    return serialize_field_definition(row)


@router.put("/{field_id}/", response_model=OrderCustomFieldRead)
def update_order_custom_field(
    field_id: int,
    body: OrderCustomFieldWrite,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(get_current_user),
):
    row = (
        db.query(OrderCustomField)
        .filter(
            OrderCustomField.id == int(field_id),
            OrderCustomField.tenant_id == int(tenant_id),
            OrderCustomField.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Field not found")
    ft = (body.type or row.type or "").strip().upper()
    if ft not in ORDER_CUSTOM_FIELD_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid type: {body.type}")
    slug = (body.slug or "").strip() or slugify_name(body.name)
    if slug != row.slug:
        clash = (
            db.query(OrderCustomField)
            .filter(
                OrderCustomField.tenant_id == tenant_id,
                OrderCustomField.warehouse_id == warehouse_id,
                OrderCustomField.slug == slug,
                OrderCustomField.id != int(field_id),
            )
            .first()
        )
        if clash:
            raise HTTPException(status_code=409, detail="Slug already exists.")
    merged = _merge_settings(ft, body.settings_json)
    row.name = str(body.name).strip()[:256]
    row.slug = slug[:128]
    row.type = ft
    row.settings_json = json.dumps(merged, ensure_ascii=False)
    row.icon_file_id = body.icon_file_id
    row.sort_order = int(body.sort_order)
    row.is_active = bool(body.is_active)
    row.updated_at = datetime.utcnow()
    db.query(OrderCustomFieldOption).filter(OrderCustomFieldOption.field_id == int(field_id)).delete(synchronize_session=False)
    for i, op in enumerate(body.options):
        db.add(
            OrderCustomFieldOption(
                field_id=int(field_id),
                label=str(op.label).strip()[:512],
                icon_file_id=op.icon_file_id,
                sort_order=int(op.sort_order) if op.sort_order is not None else i,
            )
        )
    db.commit()
    db.refresh(row)
    return serialize_field_definition(row)


@router.delete("/{field_id}/")
def delete_order_custom_field(
    field_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(get_current_user),
):
    row = (
        db.query(OrderCustomField)
        .filter(
            OrderCustomField.id == int(field_id),
            OrderCustomField.tenant_id == int(tenant_id),
            OrderCustomField.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Field not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/{field_id}/definition-icon/", response_model=OrderCustomFieldRead)
async def upload_order_custom_field_definition_icon(
    field_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    file: Optional[UploadFile] = File(None),
    icon: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    _: AppUser = Depends(get_current_user),
):
    row = (
        db.query(OrderCustomField)
        .filter(
            OrderCustomField.id == int(field_id),
            OrderCustomField.tenant_id == int(tenant_id),
            OrderCustomField.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Field not found")
    upload = file if (file is not None and (file.filename or "").strip()) else icon
    if upload is None or not (upload.filename or "").strip():
        raise HTTPException(
            status_code=422,
            detail="Brak pliku — wyślij multipart/form-data z polem „file” lub „icon” (UploadFile).",
        )
    raw = await upload.read()
    meta, err = save_definition_icon_bytes(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        field_id=int(field_id),
        original_filename=upload.filename or "icon.png",
        data=raw,
    )
    if err or not meta:
        raise HTTPException(status_code=400, detail=err or "Upload failed")
    settings = parse_settings(row.settings_json)
    ui = dict(settings.get("ui") or {})
    old_url = ui.get("custom_icon_url")
    if isinstance(old_url, str) and old_url.strip():
        delete_definition_icon_file(old_url.strip())
    ui["custom_icon_url"] = meta["custom_icon_url"]
    settings["ui"] = ui
    row.settings_json = json.dumps(settings, ensure_ascii=False)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return serialize_field_definition(row)


@router.delete("/{field_id}/definition-icon/", response_model=OrderCustomFieldRead)
def remove_order_custom_field_definition_icon(
    field_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(get_current_user),
):
    row = (
        db.query(OrderCustomField)
        .filter(
            OrderCustomField.id == int(field_id),
            OrderCustomField.tenant_id == int(tenant_id),
            OrderCustomField.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Field not found")
    settings = parse_settings(row.settings_json)
    ui = dict(settings.get("ui") or {})
    old_url = ui.get("custom_icon_url")
    if isinstance(old_url, str) and old_url.strip():
        delete_definition_icon_file(old_url.strip())
    ui.pop("custom_icon_url", None)
    settings["ui"] = ui
    row.settings_json = json.dumps(settings, ensure_ascii=False)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return serialize_field_definition(row)


@router.post("/bulk-delete/")
def bulk_delete_order_custom_fields(
    body: OrderCustomFieldsBulkDeleteBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(get_current_user),
):
    q = db.query(OrderCustomField).filter(
        OrderCustomField.tenant_id == int(tenant_id),
        OrderCustomField.warehouse_id == int(warehouse_id),
        OrderCustomField.id.in_(body.ids),
    )
    n = q.delete(synchronize_session=False)
    db.commit()
    return {"deleted": n}
