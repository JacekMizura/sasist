"""
API: Pick tasks (enterprise model).

- GET /picks/ - list pick tasks (filter by wave_id, order_id, status)
- GET /picks/{id} - get pick task
- POST /picks/{id}/complete - complete: decrease stock, set reservation to picked, create stock_movement and Pick event, set task status=picked
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models.pick import Pick
from ..models.pick_task import PickTask
from ..models.pick_wave import PickWave, PickWaveTask
from ..models.stock import Stock
from ..models.stock_reservation import StockReservation
from ..models.stock_movement import StockMovement
from ..schemas.pick import PickRead, PickListRead, PickCompleteBody

router = APIRouter(prefix="/picks", tags=["Picks"])


@router.get("/", response_model=list[PickListRead])
def list_picks(
    tenant_id: int = Query(...),
    wave_id: int = Query(None, description="Filter by wave id (Wave.id)"),
    order_id: int = Query(None),
    status: str = Query(None),
    db: Session = Depends(get_db),
):
    """List pick tasks. Filter by wave_id (Wave.id), order_id, or status (waiting | picking | picked)."""
    q = db.query(PickTask).filter(PickTask.tenant_id == tenant_id)
    if order_id is not None:
        q = q.filter(PickTask.order_id == order_id)
    if status:
        q = q.filter(PickTask.status == status)
    if wave_id is not None:
        sub = (
            db.query(PickWaveTask.pick_task_id)
            .join(PickWaveTask.wave)
            .filter(PickWave.wave_id == wave_id)
        )
        q = q.filter(PickTask.id.in_(sub))
    tasks = (
        q.options(
            joinedload(PickTask.product),
            joinedload(PickTask.location),
            joinedload(PickTask.order),
        )
        .order_by(PickTask.id)
        .all()
    )
    return [
        PickListRead(
            id=t.id,
            tenant_id=t.tenant_id,
            order_id=t.order_id,
            product_id=t.product_id,
            location_id=t.location_id,
            quantity=t.quantity,
            cart_id=t.cart_id,
            status=t.status,
            product_name=t.product.name if t.product else None,
            location_name=t.location.name if t.location else None,
            order_number=t.order.number if t.order else None,
        )
        for t in tasks
    ]


@router.get("/{pick_id}", response_model=PickRead)
def get_pick(
    pick_id: int,
    tenant_id: int = Query(...),
    db: Session = Depends(get_db),
):
    task = db.query(PickTask).filter(PickTask.id == pick_id, PickTask.tenant_id == tenant_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Pick not found")
    return task


@router.post("/{pick_id}/complete")
def complete_pick(
    pick_id: int,
    tenant_id: int = Query(...),
    body: PickCompleteBody | None = None,
    db: Session = Depends(get_db),
):
    """
    Complete a pick task: decrease stock.quantity, set matching reservation status to picked,
    create stock_movement (type=pick), set pick_task.status = picked.
    """
    task = (
        db.query(PickTask)
        .filter(PickTask.id == pick_id, PickTask.tenant_id == tenant_id)
        .options(joinedload(PickTask.order))
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Pick not found")
    if task.status == "picked":
        raise HTTPException(status_code=400, detail="Pick already completed")
    if not task.order:
        raise HTTPException(status_code=400, detail="Order not found")
    qty = (body and body.quantity) if (body and body.quantity is not None) else task.quantity
    qty = float(qty)
    if qty <= 0 or qty > task.quantity:
        raise HTTPException(status_code=400, detail="Invalid quantity")

    # Find reservation (order, product, location, status=reserved)
    reservation = (
        db.query(StockReservation)
        .filter(
            StockReservation.order_id == task.order_id,
            StockReservation.product_id == task.product_id,
            StockReservation.location_id == task.location_id,
            StockReservation.status == "reserved",
            StockReservation.tenant_id == tenant_id,
        )
        .first()
    )
    if not reservation or float(reservation.quantity) < qty:
        raise HTTPException(status_code=400, detail="Reservation not found or insufficient")

    # Stock row (tenant, product, warehouse from order, location)
    stock = (
        db.query(Stock)
        .filter(
            Stock.tenant_id == tenant_id,
            Stock.product_id == task.product_id,
            Stock.warehouse_id == task.order.warehouse_id,
            Stock.location_id == task.location_id,
        )
        .first()
    )
    if not stock or float(stock.quantity) < qty:
        raise HTTPException(status_code=400, detail="Insufficient stock")

    stock.quantity = float(stock.quantity) - qty
    reservation.status = "picked"
    if float(reservation.quantity) > qty:
        # Partial pick: reduce reservation quantity or leave as-is and only mark as picked for the fulfilled part.
        # Simple: treat as full pick of qty; leave reservation.quantity unchanged but status=picked (one reservation per line).
        pass
    db.add(
        StockMovement(
            tenant_id=tenant_id,
            product_id=task.product_id,
            from_location_id=task.location_id,
            to_location_id=None,
            quantity=qty,
            type="pick",
        )
    )
    task.status = "picked"
    # Create Pick event for analytics (Hot locations, Walking simulation, Slotting)
    try:
        db.add(
            Pick(
                tenant_id=tenant_id,
                warehouse_id=task.order.warehouse_id,
                order_id=task.order_id,
                order_item_id=None,
                product_id=task.product_id,
                location_id=task.location_id,
                quantity=qty,
                picked_at=datetime.utcnow(),
                picker_id=(body.picker_id if body and body.picker_id is not None else None),
                status="done",
            )
        )
    except Exception:
        # Old DB may have NOT NULL inventory_unit_id or missing columns; skip event
        pass
    db.commit()
    return {"ok": True, "pick_id": task.id, "quantity": qty}
