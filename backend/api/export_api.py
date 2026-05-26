"""API: szablony eksportu CSV i uruchomienie eksportu."""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse, Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.export_schema import (
    ExportRunRequest,
    ExportTemplateCreate,
    ExportTemplateRead,
    ExportTemplateUpdate,
)
from ..services.export_service import ExportService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/exports", tags=["Exports"])


def _to_read(row) -> ExportTemplateRead:
    try:
        fields = json.loads(row.fields_json or "[]")
    except json.JSONDecodeError:
        fields = []
    if not isinstance(fields, list):
        fields = []
    return ExportTemplateRead(
        id=row.id,
        tenant_id=row.tenant_id,
        name=row.name,
        type=row.type,
        fields_json=[str(x) for x in fields],
        is_active=bool(row.is_active),
        created_at=row.created_at.isoformat() if row.created_at else None,
    )


@router.get("/", response_model=list[ExportTemplateRead])
def list_exports(tenant_id: int = Query(..., ge=1), db: Session = Depends(get_db)):
    svc = ExportService(db)
    return [_to_read(r) for r in svc.list_templates(tenant_id)]


@router.post("/", response_model=ExportTemplateRead, status_code=201)
def create_export(body: ExportTemplateCreate, db: Session = Depends(get_db)):
    svc = ExportService(db)
    row = svc.create_template(
        tenant_id=body.tenant_id,
        name=body.name,
        entity_type=body.type,
        fields=body.fields_json,
        is_active=body.is_active,
    )
    return _to_read(row)


@router.put("/{template_id}", response_model=ExportTemplateRead)
def update_export(template_id: int, body: ExportTemplateUpdate, tenant_id: int = Query(..., ge=1), db: Session = Depends(get_db)):
    svc = ExportService(db)
    row = svc.update_template(
        template_id,
        tenant_id,
        name=body.name,
        entity_type=body.type,
        fields=body.fields_json,
        is_active=body.is_active,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Nie znaleziono szablonu")
    return _to_read(row)


@router.delete("/{template_id}")
def delete_export(template_id: int, tenant_id: int = Query(..., ge=1), db: Session = Depends(get_db)):
    svc = ExportService(db)
    if not svc.delete_template(template_id, tenant_id):
        raise HTTPException(status_code=404, detail="Nie znaleziono szablonu")
    return {"ok": True}


@router.post("/{template_id}/clone", response_model=ExportTemplateRead, status_code=201)
def clone_export(template_id: int, tenant_id: int = Query(..., ge=1), db: Session = Depends(get_db)):
    svc = ExportService(db)
    row = svc.clone_template(template_id, tenant_id)
    if not row:
        raise HTTPException(status_code=404, detail="Nie znaleziono szablonu")
    return _to_read(row)


@router.post("/run")
def run_export(body: ExportRunRequest, db: Session = Depends(get_db)):
    svc = ExportService(db)
    tpl = svc.get_template(body.template_id, body.tenant_id)
    if tpl and tpl.type == "label_templates":
        try:
            filename, content = svc.build_csv(tenant_id=body.tenant_id, template_id=body.template_id, ids=body.ids)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            logger.exception("export run failed: %s", e)
            raise HTTPException(status_code=500, detail="Eksport nie powiódł się") from e
        return Response(
            content=content.encode("utf-8"),
            media_type="application/json; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    try:
        filename, content = svc.build_csv(tenant_id=body.tenant_id, template_id=body.template_id, ids=body.ids)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("export run failed: %s", e)
        raise HTTPException(status_code=500, detail="Eksport nie powiódł się")
    return PlainTextResponse(
        content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
