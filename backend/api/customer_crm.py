"""CRM-lite — notatki i timeline aktywności."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.customer_crm import (
    CustomerActivityOut,
    CustomerNoteCreateBody,
    CustomerNoteOut,
    CustomerNoteUpdateBody,
)
from ..services.customers.customer_activity_service import build_customer_activity_timeline
from ..services.customers.customer_note_service import (
    CustomerNoteError,
    create_customer_note,
    list_customer_notes,
    soft_delete_customer_note,
    update_customer_note,
)

router = APIRouter(tags=["Customers — CRM"])


@router.get("/{customer_id}/activity", response_model=CustomerActivityOut)
def get_customer_activity(
    customer_id: int,
    tenant_id: int = Query(..., ge=1),
    limit: int = Query(80, ge=1, le=200),
    db: Session = Depends(get_db),
):
    try:
        items = build_customer_activity_timeline(
            db, customer_id=customer_id, tenant_id=tenant_id, limit=limit
        )
        return CustomerActivityOut(items=items)
    except CustomerNoteError as exc:
        raise HTTPException(status_code=404, detail=exc.message) from exc


@router.get("/{customer_id}/notes", response_model=list[CustomerNoteOut])
def get_customer_notes(
    customer_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return list_customer_notes(db, customer_id=customer_id, tenant_id=tenant_id)
    except CustomerNoteError as exc:
        raise HTTPException(status_code=404, detail=exc.message) from exc


@router.post("/{customer_id}/notes", response_model=CustomerNoteOut, status_code=201)
def post_customer_note(
    customer_id: int,
    body: CustomerNoteCreateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        row = create_customer_note(
            db,
            customer_id=customer_id,
            tenant_id=tenant_id,
            body=body.body,
            is_pinned=body.is_pinned,
        )
        db.commit()
        return row
    except CustomerNoteError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=exc.message) from exc


@router.patch("/{customer_id}/notes/{note_id}", response_model=CustomerNoteOut)
def patch_customer_note(
    customer_id: int,
    note_id: int,
    body: CustomerNoteUpdateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    fields = getattr(body, "model_fields_set", None) or getattr(body, "__fields_set__", set())
    try:
        row = update_customer_note(
            db,
            note_id=note_id,
            customer_id=customer_id,
            tenant_id=tenant_id,
            body=body.body if "body" in fields else None,
            is_pinned=body.is_pinned if "is_pinned" in fields else None,
        )
        db.commit()
        return row
    except CustomerNoteError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=exc.message) from exc


@router.delete("/{customer_id}/notes/{note_id}", status_code=204)
def delete_customer_note(
    customer_id: int,
    note_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        soft_delete_customer_note(
            db, note_id=note_id, customer_id=customer_id, tenant_id=tenant_id
        )
        db.commit()
    except CustomerNoteError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=exc.message) from exc
