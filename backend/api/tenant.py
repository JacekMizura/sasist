"""
ROUTER: Tenant API
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas.tenant import TenantCreate, TenantRead
from ..services.tenant_service import TenantService

router = APIRouter(prefix="/tenants", tags=["Tenants"])


@router.post("/", response_model=TenantRead)
def create_tenant(data: TenantCreate, db: Session = Depends(get_db)):
    service = TenantService(db)
    return service.create_tenant(data.name)


@router.get("/", response_model=list[TenantRead])
def get_all_tenants(db: Session = Depends(get_db)):
    service = TenantService(db)
    return service.get_all()
