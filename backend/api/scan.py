"""
API: Universal barcode scan

POST /scan – resolve barcode to entity type, id, and additional_data.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.scan_service import resolve_barcode
from ..schemas.scan import ScanRequest, ScanResponse

router = APIRouter(prefix="/scan", tags=["Scan"])


@router.post("/", response_model=ScanResponse)
def scan_barcode(data: ScanRequest, db: Session = Depends(get_db)):
    """
    Resolve a scanned barcode to the warehouse entity.
    Returns type (product, location, cart, basket, order, pallet), id, and additional_data.
    """
    return resolve_barcode(db, data.barcode)
