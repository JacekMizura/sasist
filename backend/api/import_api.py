"""
API: Import

Obsługuje:
- preview CSV
- import produktów
- import zamówień
- import zestawów
- import kartonów
- import producentów
- import dostawców
- import klientów
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
        result = service.preview_csv(file)
        if isinstance(result, dict) and result.get("error"):
            raise HTTPException(
                status_code=400,
                detail={
                    "error": result.get("error", "validation"),
                    "message": result.get("message", ""),
                },
            )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("preview_csv failed: %s", e)
        raise HTTPException(status_code=500, detail={"error": "Preview failed", "message": str(e)})

# ==========================================================
# IMPORT KARTONÓW
# ==========================================================

@router.post("/cartons/")
def import_cartons(
    tenant_id: int,
    file: UploadFile = File(...),
    column_map: str = Form(...),
    db: Session = Depends(get_db),
):
    try:
        parsed_map = json.loads(column_map)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail={"error": "Invalid column_map JSON", "message": str(e)})

    try:
        service = ImportService(db)
        return service.import_cartons(
            file=file,
            column_map=parsed_map,
            tenant_id=tenant_id
        )
    except Exception as e:
        logger.exception("import_cartons failed: %s", e)
        raise HTTPException(status_code=500, detail={"error": "Cartons import failed", "message": str(e)})


# ==========================================================
# IMPORT PRODUCENTÓW
# ==========================================================

@router.post("/manufacturers/")
def import_manufacturers(
    tenant_id: int,
    file: UploadFile = File(...),
    column_map: str = Form(...),
    db: Session = Depends(get_db),
):
    try:
        parsed_map = json.loads(column_map)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail={"error": "Invalid column_map JSON", "message": str(e)})

    try:
        service = ImportService(db)
        return service.import_manufacturers(
            file=file,
            column_map=parsed_map,
            tenant_id=tenant_id
        )
    except Exception as e:
        logger.exception("import_manufacturers failed: %s", e)
        raise HTTPException(status_code=500, detail={"error": "Manufacturers import failed", "message": str(e)})


# ==========================================================
# IMPORT DOSTAWCÓW
# ==========================================================

@router.post("/suppliers/")
def import_suppliers(
    tenant_id: int,
    file: UploadFile = File(...),
    column_map: str = Form(...),
    db: Session = Depends(get_db),
):
    try:
        parsed_map = json.loads(column_map)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail={"error": "Invalid column_map JSON", "message": str(e)})

    try:
        service = ImportService(db)
        return service.import_suppliers(
            file=file,
            column_map=parsed_map,
            tenant_id=tenant_id
        )
    except Exception as e:
        logger.exception("import_suppliers failed: %s", e)
        raise HTTPException(status_code=500, detail={"error": "Suppliers import failed", "message": str(e)})
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

@router.post("/sets/")
def import_sets(
    tenant_id: int,
    file: UploadFile = File(...),
    column_map: str = Form(...),
    db: Session = Depends(get_db),
):
    try:
        parsed_map = json.loads(column_map)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail={"error": "Invalid column_map JSON", "message": str(e)})
    try:
        service = ImportService(db)
        return service.import_sets(file=file, column_map=parsed_map, tenant_id=tenant_id)
    except Exception as e:
        logger.exception("import_sets failed: %s", e)
        raise HTTPException(status_code=500, detail={"error": "Sets import failed", "message": str(e)})


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
# IMPORT KLIENTÓW
# ==========================================================

@router.post("/customers/")
def import_customers(
    tenant_id: int,
    file: UploadFile = File(...),
    column_map: str = Form(...),
    db: Session = Depends(get_db),
):
    try:
        parsed_map = json.loads(column_map)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail={"error": "Invalid column_map JSON", "message": str(e)})
    try:
        service = ImportService(db)
        return service.import_customers(file=file, column_map=parsed_map, tenant_id=tenant_id)
    except Exception as e:
        logger.exception("import_customers failed: %s", e)
        raise HTTPException(status_code=500, detail={"error": "Customers import failed", "message": str(e)})


# ==========================================================
# IMPORT LOGS (HISTORY)
# ==========================================================

@router.get("/logs")
def get_import_logs(
    limit: int = Query(100, ge=1, le=500),
    log_type: str | None = Query(
        None,
        alias="type",
        description="Filtr: products | orders | sets | manufacturers | suppliers | cartons | customers",
    ),
    db: Session = Depends(get_db),
):
    """Return latest import logs for display in UI (Historia importów)."""
    q = db.query(ImportLog)
    if log_type:
        q = q.filter(ImportLog.type == log_type)
    rows = q.order_by(desc(ImportLog.created_at)).limit(limit).all()
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