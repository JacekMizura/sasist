from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.label_template import SavedLabelTemplate
from ..schemas.label_template import SavedLabelTemplatePayload

router = APIRouter(prefix="/label-templates", tags=["Label Templates"])

TENANT_ID = 1


@router.get("")
def list_templates(
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    rows = db.query(SavedLabelTemplate).filter(
        SavedLabelTemplate.tenant_id == tenant_id
    ).order_by(SavedLabelTemplate.updated_at.desc()).all()
    return [
        {
            "id": r.id,
            "tenant_id": r.tenant_id,
            "name": r.name,
            "template_json": r.template_json,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in rows
    ]


@router.post("")
def save_template(
    payload: SavedLabelTemplatePayload,
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    row = SavedLabelTemplate(
        tenant_id=tenant_id,
        name=payload.name,
        template_json=payload.template_json,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "name": row.name,
        "template_json": row.template_json,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.delete("/{template_id}")
def delete_template(
    template_id: int,
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    row = db.query(SavedLabelTemplate).filter(
        SavedLabelTemplate.id == template_id,
        SavedLabelTemplate.tenant_id == tenant_id,
    ).first()
    if not row:
        return {"ok": False, "error": "Not found"}
    db.delete(row)
    db.commit()
    return {"ok": True}
