"""
API: Import

Obsługuje:
- preview CSV
- import produktów
- import zamówień
- historia importów (GET /import/logs)
"""

import json
import logging
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from ..database import get_db
from ..services.import_service import ImportService
from ..models.import_log import ImportLog

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


# ==========================================================
# IMPORT LOGS (HISTORY)
# ==========================================================

@router.get("/logs")
def get_import_logs(
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """Return latest import logs for display in UI (Historia importów)."""
    rows = (
        db.query(ImportLog)
        .order_by(desc(ImportLog.created_at))
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "type": r.type,
            "tenant_id": r.tenant_id,
            "warehouse_id": r.warehouse_id,
            "total_rows": r.total_rows or 0,
            "created": r.created or 0,
            "updated": r.updated or 0,
            "skipped": r.skipped or 0,
            "warnings": r.warnings or 0,
            "errors": r.errors or 0,
            "message": r.message,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
