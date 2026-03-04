"""
SERVICE: Warehouse

Logika biznesowa magazynów.
Brak logiki w routerze.
"""

from sqlalchemy.orm import Session
from ..models.warehouse import Warehouse
from ..models.tenant import Tenant


class WarehouseService:

    def __init__(self, db: Session):
        self.db = db

    def create_warehouse(self, tenant_id: int, name: str):
        """
        Tworzy magazyn przypisany do konkretnego tenanta.
        """

        # Sprawdzamy czy tenant istnieje
        tenant = self.db.query(Tenant).filter(
            Tenant.id == tenant_id
        ).first()

        if not tenant:
            raise ValueError("Tenant nie istnieje")

        warehouse = Warehouse(
            name=name,
            tenant_id=tenant_id
        )

        self.db.add(warehouse)
        self.db.commit()
        self.db.refresh(warehouse)

        return warehouse

    def get_warehouses(self, tenant_id: int):
        """
        Zwraca wszystkie magazyny danego tenanta.
        """

        return self.db.query(Warehouse).filter(
            Warehouse.tenant_id == tenant_id
        ).all()
