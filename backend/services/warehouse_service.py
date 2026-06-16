"""
SERVICE: Warehouse

Logika biznesowa magazynów.
Many-to-many with tenants via tenant_warehouses.
"""

from sqlalchemy.orm import Session
from ..models.warehouse import Warehouse
from ..models.tenant import Tenant
from ..models.tenant_warehouse import TenantWarehouse


class WarehouseService:

    def __init__(self, db: Session):
        self.db = db

    def create_warehouse(self, tenant_id: int, name: str):
        """Create warehouse and assign it to the tenant as owner (default). Backward compat."""
        tenant = self.db.query(Tenant).filter(Tenant.id == tenant_id).first()
        if not tenant:
            raise ValueError("Tenant nie istnieje")
        warehouse = Warehouse(name=name, tenant_id=tenant_id)
        self.db.add(warehouse)
        self.db.flush()
        from .warehouse_receiving_location_service import ensure_warehouse_system_receiving_location

        ensure_warehouse_system_receiving_location(self.db, int(warehouse.id))
        self.db.commit()
        self.db.refresh(warehouse)
        # Ensure assignment exists
        self._ensure_assignment(tenant_id, warehouse.id, "owner", is_default=True)
        return warehouse

    def create_warehouse_standalone(self, name: str, owner_tenant_id: int | None = None):
        """Create warehouse (no tenant required). Optionally assign owner via tenant_warehouses."""
        warehouse = Warehouse(name=name, tenant_id=owner_tenant_id)
        self.db.add(warehouse)
        self.db.flush()
        from .warehouse_receiving_location_service import ensure_warehouse_system_receiving_location

        ensure_warehouse_system_receiving_location(self.db, int(warehouse.id))
        self.db.commit()
        self.db.refresh(warehouse)
        if owner_tenant_id is not None:
            self._ensure_assignment(owner_tenant_id, warehouse.id, "owner", is_default=True)
        return warehouse

    def _ensure_assignment(
        self, tenant_id: int, warehouse_id: int, role: str, *, is_default: bool = False
    ) -> TenantWarehouse:
        existing = (
            self.db.query(TenantWarehouse)
            .filter(
                TenantWarehouse.tenant_id == tenant_id,
                TenantWarehouse.warehouse_id == warehouse_id,
            )
            .first()
        )
        if existing:
            existing.role = role
            existing.is_default = 1 if is_default else 0
            self.db.commit()
            self.db.refresh(existing)
            return existing
        tw = TenantWarehouse(
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            role=role,
            is_default=1 if is_default else 0,
        )
        self.db.add(tw)
        self.db.commit()
        self.db.refresh(tw)
        return tw

    def get_warehouses(self, tenant_id: int):
        """Return warehouses the tenant has access to (via tenant_warehouses)."""
        return (
            self.db.query(Warehouse)
            .join(TenantWarehouse, TenantWarehouse.warehouse_id == Warehouse.id)
            .filter(TenantWarehouse.tenant_id == tenant_id)
            .all()
        )

    def update_warehouse(
        self,
        warehouse_id: int,
        *,
        name: str | None = None,
        requires_putaway: bool | None = None,
    ) -> Warehouse:
        wh = self.db.query(Warehouse).filter(Warehouse.id == int(warehouse_id)).first()
        if not wh:
            raise ValueError("Magazyn nie istnieje")
        if requires_putaway is not None:
            from .warehouse_profile_change_service import assert_requires_putaway_change_allowed

            assert_requires_putaway_change_allowed(
                self.db,
                warehouse_id=int(warehouse_id),
                new_requires_putaway=bool(requires_putaway),
            )
            wh.requires_putaway = bool(requires_putaway)
        if name is not None:
            nm = (name or "").strip()
            if not nm:
                raise ValueError("Nazwa magazynu jest wymagana")
            wh.name = nm
        if name is None and requires_putaway is None:
            raise ValueError("Brak pól do aktualizacji")
        self.db.commit()
        self.db.refresh(wh)
        return wh

    def get_all_warehouses(self):
        """Return all warehouses (for Setup / admin)."""
        return self.db.query(Warehouse).all()

    def can_tenant_access_warehouse(self, tenant_id: int, warehouse_id: int) -> bool:
        """True if tenant has access to warehouse (via tenant_warehouses or legacy tenant_id)."""
        wh = self.db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
        if not wh:
            return False
        if wh.tenant_id == tenant_id:
            return True
        return (
            self.db.query(TenantWarehouse)
            .filter(
                TenantWarehouse.tenant_id == tenant_id,
                TenantWarehouse.warehouse_id == warehouse_id,
            )
            .first()
            is not None
        )
