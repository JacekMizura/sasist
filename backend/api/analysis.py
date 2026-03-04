"""
Analysis API

Endpoint do pełnej analizy + symulacji.
"""

from fastapi import APIRouter, UploadFile, File, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.analysis_service import AnalysisService

router = APIRouter(prefix="/analysis", tags=["Analysis"])


@router.post("/run")
def run_analysis(
    orders_file: UploadFile = File(...),
    products_file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Przyjmuje dwa pliki CSV:
    - orders_file
    - products_file
    """

    service = AnalysisService(db)

    result = service.run_analysis(
        orders_file=orders_file,
        products_file=products_file
    )

    return result
