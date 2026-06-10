"""GUS lookup — proxy po NIP (frontend nigdy nie woła GUS bezpośrednio)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.gus_lookup import GusLookupRequest, GusLookupResponse
from ..services.customers.gus_lookup_service import lookup_gus_by_nip

router = APIRouter(tags=["Customers — GUS"])


@router.post("/gus-lookup", response_model=GusLookupResponse)
def post_gus_lookup(body: GusLookupRequest, db: Session = Depends(get_db)):
    result = lookup_gus_by_nip(
        db,
        body.nip,
        force_refresh=bool(body.force_refresh),
        tenant_id=body.tenant_id,
    )
    return GusLookupResponse(**result)
