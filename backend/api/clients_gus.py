"""Client-facing GUS lookup (proxy — frontend never calls GUS directly)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.gus_lookup import GusLookupRequest, GusLookupResponse
from ..services.customers.gus_lookup_service import lookup_gus_by_nip

router = APIRouter(prefix="/clients", tags=["Klienci — GUS"])


@router.post("/gus-lookup", response_model=GusLookupResponse)
def post_gus_lookup(body: GusLookupRequest, db: Session = Depends(get_db)):
    result = lookup_gus_by_nip(db, body.nip, force_refresh=bool(body.force_refresh))
    return GusLookupResponse(**result)
