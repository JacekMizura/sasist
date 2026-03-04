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
