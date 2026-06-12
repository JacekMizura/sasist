"""
SERVICE: TenantWarehouse (assignments)

Create and list tenant-warehouse assignments.
"""

from sqlalchemy.orm import Session
from ..models.tenant_warehouse import TenantWarehouse
from ..models.tenant import Tenant
from ..models.warehouse import Warehouse


class TenantWarehouseService:
    def __init__(self, db: Session):
        self.db = db

    def list_assignments(self, tenant_id: int | None = None, warehouse_id: int | None = None):
        q = self.db.query(TenantWarehouse)
        if tenant_id is not None:
            q = q.filter(TenantWarehouse.tenant_id == tenant_id)
        if warehouse_id is not None:
            q = q.filter(TenantWarehouse.warehouse_id == warehouse_id)
        return q.all()

    def create_assignment(
        self,
        tenant_id: int,
        warehouse_id: int,
        role: str = "operator",
        is_default: bool = False,
        *,
        participates_in_network_stock: bool = True,
        fulfillment_eligible: bool = True,
        fulfillment_priority: int = 100,
    ) -> TenantWarehouse:
        tenant = self.db.query(Tenant).filter(Tenant.id == tenant_id).first()
        if not tenant:
            raise ValueError("Tenant not found")
        warehouse = self.db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
        if not warehouse:
            raise ValueError("Warehouse not found")
        existing = (
            self.db.query(TenantWarehouse)
            .filter(
                TenantWarehouse.tenant_id == tenant_id,
                TenantWarehouse.warehouse_id == warehouse_id,
            )
            .first()
        )
        if existing:
            raise ValueError("Assignment already exists")
        valid_roles = ("owner", "client", "operator")
        if role not in valid_roles:
            role = "operator"
        if is_default:
            self.db.query(TenantWarehouse).filter(
                TenantWarehouse.tenant_id == tenant_id
            ).update({TenantWarehouse.is_default: 0})
        tw = TenantWarehouse(
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            role=role,
            is_default=1 if is_default else 0,
            participates_in_network_stock=participates_in_network_stock,
            fulfillment_eligible=fulfillment_eligible,
            fulfillment_priority=int(fulfillment_priority),
        )
        self.db.add(tw)
        self.db.commit()
        self.db.refresh(tw)
        return tw

    def delete_assignment(self, assignment_id: int) -> bool:
        tw = self.db.query(TenantWarehouse).filter(TenantWarehouse.id == assignment_id).first()
        if not tw:
            return False
        self.db.delete(tw)
        self.db.commit()
        return True

    def update_assignment(self, assignment_id: int, **fields) -> TenantWarehouse:
        tw = self.db.query(TenantWarehouse).filter(TenantWarehouse.id == int(assignment_id)).first()
        if not tw:
            raise ValueError("Assignment not found")
        if "participates_in_network_stock" in fields and fields["participates_in_network_stock"] is not None:
            tw.participates_in_network_stock = bool(fields["participates_in_network_stock"])
        if "fulfillment_eligible" in fields and fields["fulfillment_eligible"] is not None:
            tw.fulfillment_eligible = bool(fields["fulfillment_eligible"])
        if "fulfillment_priority" in fields and fields["fulfillment_priority"] is not None:
            tw.fulfillment_priority = int(fields["fulfillment_priority"])
        self.db.commit()
        self.db.refresh(tw)
        return tw

    def get_assignment(self, assignment_id: int) -> TenantWarehouse | None:
        return self.db.query(TenantWarehouse).filter(TenantWarehouse.id == int(assignment_id)).first()
