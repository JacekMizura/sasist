"""
Simulation API

- /analysis/simulate: legacy symulacja.
- /simulation/assign: przypisanie zamówień NEW do koszyków wózka.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Dict

from ..database import get_db
from ..services.simulation_service import SimulationService
from ..schemas.simulation import SimulationAssignResponse

router = APIRouter(prefix="/analysis", tags=["Analysis"])
router_assign = APIRouter(prefix="/simulation", tags=["Simulation"])


@router.post("/simulate/")
def simulate(data: Dict[str, float], db: Session = Depends(get_db)):
    """
    data = { "order1": 1200, "order2": 800, ... }
    """
    service = SimulationService(db)
    return service.simulate(order_volumes=data)


@router_assign.post("/assign/", response_model=SimulationAssignResponse)
def assign_orders_to_cart(
    tenant_id: int,
    warehouse_id: int,
    cart_id: int,
    db: Session = Depends(get_db),
):
    """
    Przypisuje zamówienia ze statusem NEW do wolnych koszyków wskazanego wózka.
    Zwraca: assigned_orders_count, unassigned_orders_count, cart_utilization_percent, status.
    """
    service = SimulationService(db)
    return service.assign_orders_to_cart(
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        cart_id=cart_id,
    )
