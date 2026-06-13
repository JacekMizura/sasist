"""
API: Waves (Wave Picking)

- POST /waves/ - create wave (take up to wave_size ready orders)
- GET /waves/ - list waves (with carts_count)
- GET /waves/{id} - get wave
- POST /waves/{id}/assign - run assignment for wave orders (optional cart_id)
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from fastapi import Depends
from ..auth.warehouse_deps import (
    require_operable_warehouse,
    require_active_operable_warehouse,
    require_active_or_query_operable_warehouse,
    assert_stock_document_warehouse,
    enforce_warehouse_access,
)
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.wave_service import create_wave, list_waves, get_wave
from ..schemas.wave import WaveRead, WaveListRead, WaveCreate

router = APIRouter(prefix="/waves", tags=["Waves"])


@router.post("/", response_model=WaveRead)
def create_wave_endpoint(
    tenant_id: int = Query(...),
    warehouse_id: int = Depends(require_operable_warehouse),
    body: WaveCreate | None = None,
    db: Session = Depends(get_db),
):
    """Create a new wave. algorithm: fifo (default) or location_clustering."""
    wave_size = (body and body.wave_size) or 80
    algorithm = (body and body.algorithm) or "fifo"
    max_orders_per_wave = getattr(body, "max_orders_per_wave", None) if body else None
    wave = create_wave(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        wave_size=wave_size,
        algorithm=algorithm,
        max_orders_per_wave=max_orders_per_wave,
    )
    from ..services.wave_service import compute_wave_metrics
    metrics = compute_wave_metrics(db, wave.id)
    return {
        "id": wave.id,
        "tenant_id": wave.tenant_id,
        "warehouse_id": wave.warehouse_id,
        "created_at": wave.created_at,
        "status": wave.status,
        "orders_count": wave.orders_count,
        "locations_count": metrics["locations_count"],
        "estimated_distance": metrics["estimated_distance"],
        "estimated_picking_time": metrics["estimated_picking_time"],
    }


@router.get("/", response_model=list[WaveListRead])
def list_waves_endpoint(
    tenant_id: int = Query(...),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    """List waves for tenant/warehouse with orders_count and carts_count."""
    return list_waves(db, tenant_id=tenant_id, warehouse_id=warehouse_id)


@router.get("/{wave_id}", response_model=WaveRead)
def get_wave_endpoint(
    wave_id: int,
    tenant_id: int = Query(...),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    """Get wave by id with metrics."""
    wave = get_wave(db, wave_id=wave_id, tenant_id=tenant_id, warehouse_id=warehouse_id)
    if not wave:
        raise HTTPException(status_code=404, detail="Wave not found")
    from ..services.wave_service import compute_wave_metrics
    metrics = compute_wave_metrics(db, wave.id)
    return {
        "id": wave.id,
        "tenant_id": wave.tenant_id,
        "warehouse_id": wave.warehouse_id,
        "created_at": wave.created_at,
        "status": wave.status,
        "orders_count": wave.orders_count,
        "locations_count": metrics["locations_count"],
        "estimated_distance": metrics["estimated_distance"],
        "estimated_picking_time": metrics["estimated_picking_time"],
    }


@router.post("/{wave_id}/assign")
def assign_wave_endpoint(
    wave_id: int,
    tenant_id: int = Query(...),
    warehouse_id: int = Depends(require_operable_warehouse),
    cart_id: int = Query(..., description="Cart to assign wave orders to"),
    db: Session = Depends(get_db),
):
    """Run assignment for this wave's orders onto the given cart (same logic as /simulation/assign, filtered by wave_id)."""
    wave = get_wave(db, wave_id=wave_id, tenant_id=tenant_id, warehouse_id=warehouse_id)
    if not wave:
        raise HTTPException(status_code=404, detail="Wave not found")
    from ..services.simulation_service import SimulationService
    service = SimulationService(db)
    result = service.assign_orders_to_cart(
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        cart_id=cart_id,
        wave_id=wave_id,
    )
    return result
