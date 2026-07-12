"""Tenant auto-print settings (configuration only)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.printing.printing_auto_setting import PrintingAutoSetting
from ...schemas.printing.release import PrintingAutoPrintUpdate


def get_auto_print_settings(db: Session, *, tenant_id: int) -> dict:
    row = db.query(PrintingAutoSetting).filter(PrintingAutoSetting.tenant_id == tenant_id).first()
    if row is None:
        return {
            "tenant_id": tenant_id,
            "labels": False,
            "stock_documents": False,
            "sale_documents": False,
            "shipping_labels": False,
        }
    return {
        "tenant_id": row.tenant_id,
        "labels": bool(row.labels),
        "stock_documents": bool(row.stock_documents),
        "sale_documents": bool(row.sale_documents),
        "shipping_labels": bool(row.shipping_labels),
    }


def update_auto_print_settings(
    db: Session,
    *,
    tenant_id: int,
    payload: PrintingAutoPrintUpdate,
) -> dict:
    row = db.query(PrintingAutoSetting).filter(PrintingAutoSetting.tenant_id == tenant_id).first()
    if row is None:
        row = PrintingAutoSetting(tenant_id=tenant_id)
        db.add(row)

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        if value is not None:
            setattr(row, key, bool(value))

    db.commit()
    db.refresh(row)
    return get_auto_print_settings(db, tenant_id=tenant_id)
