"""
SERVICE: TenantService

Warstwa biznesowa.
Brak kodu FastAPI.
Brak logiki ORM w routerach.
"""

from sqlalchemy.orm import Session
from ..models.tenant import Tenant


class TenantService:

    def __init__(self, db: Session):
        self.db = db

    def create_tenant(self, name: str) -> Tenant:
        tenant = Tenant(name=name)
        self.db.add(tenant)
        self.db.commit()
        self.db.refresh(tenant)
        return tenant

    def get_all(self):
        return self.db.query(Tenant).all()

    def get_by_id(self, tenant_id: int) -> Tenant | None:
        return self.db.query(Tenant).filter(Tenant.id == tenant_id).first()

    def update_label_defaults(
        self,
        tenant_id: int,
        default_cart_template_id: int | None = None,
        default_basket_template_id: int | None = None,
        default_location_template_id: int | None = None,
    ) -> Tenant | None:
        tenant = self.get_by_id(tenant_id)
        if not tenant:
            return None
        if default_cart_template_id is not None:
            tenant.default_cart_template_id = default_cart_template_id
        if default_basket_template_id is not None:
            tenant.default_basket_template_id = default_basket_template_id
        if default_location_template_id is not None:
            tenant.default_location_template_id = default_location_template_id
        self.db.commit()
        self.db.refresh(tenant)
        return tenant
