"""
SERVICE: PlanningService

Odpowiada za:
- pobranie wózków z bazy
- wywołanie silnika
- przygotowanie odpowiedzi API

Nie zawiera SQL bezpośrednio – używa ORM.
"""

from sqlalchemy.orm import Session
from typing import List

from ..models.cart import Cart
from ..domain.planning_engine import plan_orders


class PlanningService:

    def __init__(self, db: Session):
        self.db = db

    def run_planning(self, tenant_id: int, warehouse_id: int, orders: List[dict]):

        # ================================
        # 1. Pobranie wózków z bazy
        # ================================

        carts = (
            self.db.query(Cart)
            .filter(
                Cart.tenant_id == tenant_id,
                Cart.warehouse_id == warehouse_id
            )
            .all()
        )

        if not carts:
            raise ValueError("Brak wózków w tym magazynie")

        # ================================
        # 2. Konwersja ORM → dict dla silnika
        # ================================

        cart_dicts = [
            {
                "cart_id": cart.id,
                "capacity": getattr(cart, "capacity", 1000.0)  # fallback jeśli brak kolumny
            }
            for cart in carts
        ]

        # ================================
        # 3. Odpalenie silnika
        # ================================

        result = plan_orders(cart_dicts, orders)

        # ================================
        # 4. Obliczenie % wykorzystania
        # ================================

        for assignment in result["assignments"]:
            capacity = assignment["capacity"]
            used = assignment["used_volume"]

            assignment["utilization_percent"] = (
                (used / capacity) * 100 if capacity > 0 else 0
            )

        return result
