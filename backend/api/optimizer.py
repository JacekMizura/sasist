"""
Optimizer API – analiza zapotrzebowania na wózki (best-fit bez zapisu) i reset floty.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.optimizer_service import OptimizerService
from ..services.simulation_service import SimulationService

router = APIRouter(prefix="/optimizer", tags=["Optimizer"])


@router.get("/analyze/")
def analyze_fleet(
    tenant_id: int,
    warehouse_id: int,
    db: Session = Depends(get_db),
):
    """
    Oblicza minimalne zapotrzebowanie na wózki dla zamówień NEW.
    Zwraca: orders_to_serve, remaining_orders, remaining_capacity_percent, itd.
    """
    service = OptimizerService(db)
    return service.analyze_fleet(tenant_id=tenant_id, warehouse_id=warehouse_id)


@router.post("/apply/")
def apply_fleet(
    tenant_id: int,
    warehouse_id: int,
    db: Session = Depends(get_db),
):
    """
    Zatwierdź i przypisz: uruchamia algorytm best-fit, zapisuje przypisania do bazy
    (order.cart_id, order.basket_id, cart.used_volume) i zwraca podsumowanie.
    """
    service = OptimizerService(db)
    return service.apply_fleet(tenant_id=tenant_id, warehouse_id=warehouse_id)


@router.post("/reset-fleet/")
def reset_fleet(
    tenant_id: int,
    warehouse_id: int,
    db: Session = Depends(get_db),
):
    """
    Resetuj Flotę / Wyczyść przypisania: order.cart_id i basket_id = NULL, zerowanie used_volume.
    """
    service = SimulationService(db)
    return service.reset_fleet(tenant_id=tenant_id, warehouse_id=warehouse_id)
