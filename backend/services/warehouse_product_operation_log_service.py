"""Single entry point for persisting WMS product warehouse operation audit rows."""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy.orm import Session

from ..models.app_user import AppUser
from ..models.wms_product_warehouse_operation import WmsProductWarehouseOperation

ALLOWED_MOVEMENT_TYPES = frozenset(
    {
        "MANUAL_MM",
        "REPLENISHMENT",
        "PUTAWAY",
        "RECEIVING",
        "PICKING",
        "PACKING",
        "INVENTORY",
        "RETURN",
        "COMPLAINT",
    }
)
ALLOWED_PACKAGING_TYPES = frozenset({"UNIT", "CARTON", "MASTER_PACK"})


def _normalize_movement_type(value: str) -> str:
    mt = (value or "").strip().upper()
    if mt not in ALLOWED_MOVEMENT_TYPES:
        raise ValueError(f"Nieprawidłowy movement_type: {value!r}")
    return mt


def _normalize_packaging_type(value: str) -> str:
    pt = (value or "").strip().upper()
    if pt not in ALLOWED_PACKAGING_TYPES:
        raise ValueError(f"Nieprawidłowy packaging_type: {value!r}")
    return pt


def record_warehouse_product_operation(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    movement_type: str,
    source_location_id: Optional[int],
    target_location_id: Optional[int],
    quantity: float,
    performed_by: AppUser,
    reference_document: Optional[str] = None,
    stock_document_id: Optional[int] = None,
    replenishment_task_id: Optional[int] = None,
    packaging_type: str = "UNIT",
    packaging_quantity: Optional[float] = None,
    wms_mode: Optional[str] = None,
    created_at: Optional[datetime] = None,
    batch_number: Optional[str] = None,
    expiry_date: Optional[date] = None,
    pick_id: Optional[int] = None,
) -> WmsProductWarehouseOperation:
    if performed_by is None:
        raise ValueError("Brak użytkownika — operacja musi być przypisana do zalogowanego konta")
    uid = int(getattr(performed_by, "id", 0) or 0)
    if uid <= 0:
        raise ValueError("Nieprawidłowe konto użytkownika")

    login = (getattr(performed_by, "login", None) or "").strip()
    if not login:
        raise ValueError("Konto użytkownika nie ma loginu — nie można zapisać audytu")

    mt = _normalize_movement_type(movement_type)
    pt = _normalize_packaging_type(packaging_type or "UNIT")
    ts = created_at or datetime.utcnow()
    pkg_q = float(packaging_quantity) if packaging_quantity is not None else None
    if pkg_q is None and pt == "UNIT":
        pkg_q = float(quantity)

    row = WmsProductWarehouseOperation(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        product_id=int(product_id),
        movement_type=mt,
        source_location_id=int(source_location_id) if source_location_id is not None else None,
        target_location_id=int(target_location_id) if target_location_id is not None else None,
        quantity=float(quantity),
        packaging_type=pt,
        packaging_quantity=pkg_q,
        admin_id=uid,
        admin_login=login,
        admin_first_name=(getattr(performed_by, "first_name", None) or None),
        admin_last_name=(getattr(performed_by, "last_name", None) or None),
        created_at=ts,
        reference_document=(reference_document.strip() if isinstance(reference_document, str) else None)
        or None,
        stock_document_id=int(stock_document_id) if stock_document_id is not None else None,
        replenishment_task_id=int(replenishment_task_id) if replenishment_task_id is not None else None,
        wms_mode=(wms_mode.strip() if isinstance(wms_mode, str) and wms_mode.strip() else None),
        batch_number=(batch_number.strip() if isinstance(batch_number, str) and batch_number.strip() else None),
        expiry_date=expiry_date,
        pick_id=int(pick_id) if pick_id is not None and int(pick_id) > 0 else None,
    )
    db.add(row)
    db.flush()
    from .warehouse_inventory_movement_service import safe_mirror_product_warehouse_operation

    safe_mirror_product_warehouse_operation(db, row)
    return row


def movement_running_delta_for_history(movement_type: str, quantity: float) -> float:
    """Signed delta for product movement running total (same semantics as mixed stock_operation stream)."""
    mt = (movement_type or "").strip().upper()
    q = float(quantity or 0.0)
    if mt == "RECEIVING":
        return abs(q)
    if mt == "PICKING":
        return -abs(q)
    if mt == "INVENTORY":
        return q
    if mt in ("RETURN",):
        return abs(q)
    return 0.0
