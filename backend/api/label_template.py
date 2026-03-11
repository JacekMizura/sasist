import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.label_template import SavedLabelTemplate
from ..models.label_template_group import LabelTemplateGroup
from ..models.tenant import Tenant
from ..schemas.label_template import SavedLabelTemplatePayload, LabelTemplateGroupPayload
from ..services.label_engine import build_label_svg_engine
from ..services.label_render_service import validate_template_json

router = APIRouter(prefix="/label-templates", tags=["Label Templates"])

TENANT_ID = 1


# ---------- Groups ----------
@router.get("/groups")
def list_groups(
    template_type: str,
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    """List groups for a label type (location, cart, basket, product, order)."""
    rows = (
        db.query(LabelTemplateGroup)
        .filter(
            LabelTemplateGroup.tenant_id == tenant_id,
            LabelTemplateGroup.template_type == template_type,
        )
        .order_by(LabelTemplateGroup.name.asc())
        .all()
    )
    return [
        {
            "id": r.id,
            "tenant_id": r.tenant_id,
            "template_type": r.template_type,
            "name": r.name,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in rows
    ]


@router.post("/groups")
def create_group(
    payload: LabelTemplateGroupPayload,
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    """Create a template group for a label type."""
    row = LabelTemplateGroup(
        tenant_id=tenant_id,
        template_type=payload.template_type,
        name=payload.name.strip(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "template_type": row.template_type,
        "name": row.name,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("/by-type/{template_type}")
def list_templates_by_type(
    template_type: str,
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    """Get templates by type (location, cart, basket, product, order). Includes is_default for tenant's default template."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    default_id = None
    if tenant:
        if template_type == "location":
            default_id = getattr(tenant, "default_location_template_id", None)
        elif template_type == "cart":
            default_id = getattr(tenant, "default_cart_template_id", None)
        elif template_type == "basket":
            default_id = getattr(tenant, "default_basket_template_id", None)
    rows = db.query(SavedLabelTemplate).filter(
        SavedLabelTemplate.tenant_id == tenant_id,
        SavedLabelTemplate.template_type == template_type,
    ).order_by(SavedLabelTemplate.updated_at.desc()).all()
    return [
        {
            "id": r.id,
            "tenant_id": r.tenant_id,
            "name": r.name,
            "template_type": getattr(r, "template_type", None),
            "is_default": (default_id is not None and r.id == default_id),
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in rows
    ]


@router.get("")
def list_templates(
    tenant_id: int = TENANT_ID,
    template_type: str | None = None,
    group_id: int | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(SavedLabelTemplate).filter(SavedLabelTemplate.tenant_id == tenant_id)
    if template_type is not None:
        q = q.filter(SavedLabelTemplate.template_type == template_type)
    if group_id is not None:
        q = q.filter(SavedLabelTemplate.group_id == group_id)
    rows = q.order_by(SavedLabelTemplate.updated_at.desc()).all()
    return [
        {
            "id": r.id,
            "tenant_id": r.tenant_id,
            "group_id": getattr(r, "group_id", None),
            "name": r.name,
            "template_type": getattr(r, "template_type", None),
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
    err = validate_template_json(payload.template_json)
    if err:
        raise HTTPException(status_code=400, detail=err)
    row = SavedLabelTemplate(
        tenant_id=tenant_id,
        name=payload.name,
        template_json=payload.template_json,
        template_type=payload.template_type,
        group_id=payload.group_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "name": row.name,
        "template_type": getattr(row, "template_type", None),
        "template_json": row.template_json,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("/{template_id}")
def get_template(
    template_id: int,
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    row = db.query(SavedLabelTemplate).filter(
        SavedLabelTemplate.id == template_id,
        SavedLabelTemplate.tenant_id == tenant_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Template not found")
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "name": row.name,
        "template_type": getattr(row, "template_type", None),
        "template_json": row.template_json,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


# Sample product record for template preview (matches common template bindings)
_PREVIEW_PRODUCT_RECORD = {
    "prod_name": "Karton 40x30x25",
    "sku": "KAR-40-01",
    "ean": "5901234123458",
    "barcode_data": "5901234123458",
    "{prod_name}": "Karton 40x30x25",
    "{sku}": "KAR-40-01",
    "{ean}": "5901234123458",
}

# Sample cart record for template preview (cart_number, cart_name, barcode_data, etc.)
_PREVIEW_CART_RECORD = {
    "cart_id": "1",
    "cart_number": "#1",
    "cart_name": "CART-A",
    "cart_barcode": "CART-0001",
    "barcode_data": "CART-0001",
    "cart_capacity": "120.00 dm³",
    "cart_sections": "4",
    "{cart_id}": "1",
    "{cart_number}": "#1",
    "{cart_name}": "CART-A",
    "{cart_barcode}": "CART-0001",
    "{cart_capacity}": "120.00 dm³",
    "{cart_sections}": "4",
}


@router.get("/{template_id}/preview")
def get_template_preview(
    template_id: int,
    preview_type: str | None = None,
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    """
    Return SVG preview of the label template with sample data.
    preview_type: "product" (default) or "cart".
    """
    row = db.query(SavedLabelTemplate).filter(
        SavedLabelTemplate.id == template_id,
        SavedLabelTemplate.tenant_id == tenant_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Template not found")
    raw = getattr(row, "template_json", None)
    if not raw:
        raise HTTPException(status_code=400, detail="Template has no template_json")
    template = raw if isinstance(raw, dict) else json.loads(raw) if isinstance(raw, str) and raw.strip() else {}
    if not template:
        raise HTTPException(status_code=400, detail="Template JSON is empty")
    width_mm = float(template.get("widthMm", 100))
    height_mm = float(template.get("heightMm", 60))
    record = _PREVIEW_CART_RECORD if (preview_type or "").strip().lower() == "cart" else _PREVIEW_PRODUCT_RECORD
    try:
        svg = build_label_svg_engine(template, width_mm, height_mm, record)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"svg": svg}


@router.put("/{template_id}")
def update_template(
    template_id: int,
    payload: SavedLabelTemplatePayload,
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    row = db.query(SavedLabelTemplate).filter(
        SavedLabelTemplate.id == template_id,
        SavedLabelTemplate.tenant_id == tenant_id,
    ).first()
    if not row:
        return {"ok": False, "error": "Not found"}
    err = validate_template_json(payload.template_json)
    if err:
        raise HTTPException(status_code=400, detail=err)
    row.name = payload.name
    row.template_json = payload.template_json
    if payload.template_type is not None:
        row.template_type = payload.template_type
    row.group_id = payload.group_id
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "name": row.name,
        "template_type": getattr(row, "template_type", None),
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
