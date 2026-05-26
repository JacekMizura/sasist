"""Pozycje reklamacji — operacje fizyczne (osobno od decyzji)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models.complaint import Complaint
from ..models.complaint_line import ComplaintLine
from ..models.order_item import OrderItem
from ..schemas.complaint import ComplaintLineOperationBody, ComplaintRead
from ..services.complaint_audit import append_complaint_audit_event
from .complaint import (
    _apply_due_response_deadlines,
    apply_line_operation_transition,
    build_complaint_read,
    _tenant_warehouse_active,
)

router = APIRouter(prefix="/complaint-lines", tags=["Complaint lines"])

# Akcje panelu → wartość pola operation_status (jedna wspólna logika z apply_line_operation_transition).
LINE_OPERATION_ACTION_TO_STORAGE: dict[str, str] = {
    "CUSTOMER_PICKUP": "pickup",
    "PICKUP": "pickup",
    "WAREHOUSE_RECEIVED": "warehouse_in",
    "RECEIVED": "warehouse_in",
    "SENT_TO_SERVICE": "service_sent",
    "REPAIR_COMPLETED": "repair_done",
    "SHIPPED_TO_CUSTOMER": "shipped_customer",
    "EXCHANGE_ORDER_PLACED": "order_placed",
    "OUTBOUND_SHIPPED": "ship_out",
    "RETURNED_TO_CUSTOMER": "return_customer",
    "REFUND_COMPLETED": "refund_done",
}


@router.patch("/{line_id}/operation", response_model=ComplaintRead)
def patch_complaint_line_operation(
    line_id: int,
    body: ComplaintLineOperationBody,
    tenant_id: int = Query(...),
    warehouse_id: int = Query(...),
    db: Session = Depends(get_db),
):
    _apply_due_response_deadlines(db, tenant_id, warehouse_id)
    action = str(body.action or "").strip().upper()
    storage_key = LINE_OPERATION_ACTION_TO_STORAGE.get(action)
    if not storage_key:
        raise HTTPException(status_code=400, detail="Nieznana akcja operacji.")

    line = db.query(ComplaintLine).filter(ComplaintLine.id == line_id).first()
    if not line:
        raise HTTPException(status_code=404, detail="Complaint line not found")

    c = (
        db.query(Complaint)
        .filter(
            Complaint.id == line.complaint_id,
            _tenant_warehouse_active(tenant_id, warehouse_id),
        )
        .first()
    )
    if not c or getattr(c, "deleted_at", None) is not None:
        raise HTTPException(status_code=404, detail="Complaint not found")

    prev_op = getattr(line, "operation_status", None)
    apply_line_operation_transition(line, storage_key)
    new_op = getattr(line, "operation_status", None)
    append_complaint_audit_event(
        db,
        c.id,
        "line_operation",
        f"Operacja fizyczna pozycji: {action} (etap: {new_op}).",
        meta={"complaint_line_id": line_id, "action": action, "from": prev_op, "to": new_op},
    )
    db.add(line)
    db.commit()

    refreshed = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.order),
            joinedload(Complaint.lines).joinedload(ComplaintLine.order_item).joinedload(OrderItem.product),
        )
        .filter(Complaint.id == c.id, _tenant_warehouse_active(tenant_id, warehouse_id))
        .first()
    )
    if not refreshed:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return build_complaint_read(db, refreshed)
