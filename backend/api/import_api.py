"""
API: Import

Obsługuje:
- preview CSV
- import produktów
- import zamówień
"""

import json
import logging
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.import_service import ImportService

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/import",
    tags=["Import"]
)


# ==========================================================
# PREVIEW CSV
# ==========================================================

@router.post("/preview/")
def preview_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    try:
        service = ImportService(db)
        return service.preview_csv(file)
    except Exception as e:
        logger.exception("preview_csv failed: %s", e)
        raise HTTPException(status_code=500, detail={"error": "Preview failed", "message": str(e)})


# ==========================================================
# IMPORT PRODUKTÓW
# ==========================================================

@router.post("/products/")
def import_products(
    tenant_id: int,
    file: UploadFile = File(...),
    column_map: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        parsed_map = json.loads(column_map)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail={"error": "Invalid column_map JSON", "message": str(e)})
    try:
        service = ImportService(db)
        return service.import_products(
            file=file,
            column_map=parsed_map,
            tenant_id=tenant_id
        )
    except Exception as e:
        logger.exception("import_products failed: %s", e)
        raise HTTPException(status_code=500, detail={"error": "Import failed", "message": str(e)})


# ==========================================================
# IMPORT ZAMÓWIEŃ
# ==========================================================

@router.post("/orders/")
def import_orders(
    tenant_id: int,
    warehouse_id: int,
    file: UploadFile = File(...),
    column_map: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        parsed_map = json.loads(column_map)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail={"error": "Invalid column_map JSON", "message": str(e)})
    try:
        service = ImportService(db)
        return service.import_orders(
            file=file,
            column_map=parsed_map,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id
        )
    except Exception as e:
        logger.exception("import_orders failed: %s", e)
        raise HTTPException(status_code=500, detail={"error": "Order import failed", "message": str(e)})
