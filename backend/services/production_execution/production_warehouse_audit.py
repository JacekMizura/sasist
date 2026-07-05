"""Mirror production RW/PW stock events into unified WMS product warehouse history."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.app_user import AppUser
from ...models.stock_document import StockDocument
from ..warehouse_product_operation_log_service import record_warehouse_product_operation


def _resolve_audit_user(db: Session, user_id: int | None) -> AppUser | None:
    if user_id is not None and int(user_id) > 0:
        row = db.query(AppUser).filter(AppUser.id == int(user_id)).first()
        if row is not None and (row.login or "").strip():
            return row
    row = db.query(AppUser).filter(AppUser.login.isnot(None)).order_by(AppUser.id.asc()).first()
    if row is not None and (row.login or "").strip():
        return row
    return None


def _document_reference(doc: StockDocument) -> str:
    num = str(getattr(doc, "document_number", "") or "").strip()
    if num:
        return num
    dt = str(getattr(doc, "document_type", "") or "DOC").strip().upper()
    return f"{dt}-{int(doc.id)}"


def record_production_rw_issue_audit(
    db: Session,
    *,
    rw_doc: StockDocument,
    product_id: int,
    quantity: float,
    from_location_id: int,
    performed_by_user_id: int | None = None,
) -> None:
    user = _resolve_audit_user(db, performed_by_user_id or getattr(rw_doc, "created_by_user_id", None))
    if user is None:
        return
    record_warehouse_product_operation(
        db,
        tenant_id=int(rw_doc.tenant_id),
        warehouse_id=int(rw_doc.warehouse_id),
        product_id=int(product_id),
        movement_type="PRODUCTION",
        source_location_id=int(from_location_id),
        target_location_id=None,
        quantity=float(quantity),
        performed_by=user,
        reference_document=_document_reference(rw_doc),
        stock_document_id=int(rw_doc.id),
        wms_mode="RW",
    )


def record_production_pw_receipt_audit(
    db: Session,
    *,
    pw_doc: StockDocument,
    product_id: int,
    quantity: float,
    staging_location_id: int,
    performed_by_user_id: int | None = None,
) -> None:
    user = _resolve_audit_user(db, performed_by_user_id or getattr(pw_doc, "created_by_user_id", None))
    if user is None:
        return
    record_warehouse_product_operation(
        db,
        tenant_id=int(pw_doc.tenant_id),
        warehouse_id=int(pw_doc.warehouse_id),
        product_id=int(product_id),
        movement_type="PRODUCTION",
        source_location_id=None,
        target_location_id=int(staging_location_id),
        quantity=float(quantity),
        performed_by=user,
        reference_document=_document_reference(pw_doc),
        stock_document_id=int(pw_doc.id),
        wms_mode="PW",
    )
