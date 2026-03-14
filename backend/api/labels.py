"""Labels API: template-by-type and generation entry points."""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.cart import Cart
from ..models.label_template import SavedLabelTemplate
from ..models.product import Product
from ..models.tenant import Tenant
from ..services.label_pack_service import _cart_record
from ..services.rack_label_generator import generate_rack_locations
from ..services.rack_strip_generator import generate_rack_strip
from ..services.label_render_service import render_label_template
from ..services.pdf_barcode_import import extract_barcodes_from_pdf

router = APIRouter(prefix="/labels", tags=["Labels"])

TENANT_ID = 1


class GenerateRackBody(BaseModel):
    rack: str = "A"
    levels: int = 5
    positions: int = 4
    zone: str | None = None


class GenerateRackStripBody(BaseModel):
    rack: str = "A"
    level: int = 1
    start: int = 1
    end: int = 10


class RenderPdfBody(BaseModel):
    template_id: int
    records: list[dict]
    printer_profile_id: int | None = None


class ProductLabelBody(BaseModel):
    product_id: int
    template_id: int
    quantity: int = 1


class CartLabelBody(BaseModel):
    cart_id: int
    template_id: int
    quantity: int = 1


def _product_to_label_record(p: Product) -> dict:
    """Build a single label record from product (matches template bindings prod_name, sku, ean, barcode_data)."""
    name = (p.name or "").strip() or "—"
    sku = (p.symbol or "").strip() or (p.ean or "").strip() or "—"
    ean = (p.ean or "").strip() or "—"
    barcode = (p.barcode or "").strip() or ean or sku
    return {
        "prod_name": name,
        "sku": sku,
        "ean": ean,
        "barcode_data": barcode,
        "{prod_name}": name,
        "{sku}": sku,
        "{ean}": ean,
    }


@router.post("/product")
def post_labels_product(
    body: ProductLabelBody,
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    """Generate a product label PDF. Returns PDF with one page per copy (quantity)."""
    if body.quantity < 1 or body.quantity > 500:
        raise HTTPException(status_code=400, detail="quantity must be between 1 and 500")
    product = db.query(Product).filter(
        Product.id == body.product_id,
        Product.tenant_id == tenant_id,
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    template = db.query(SavedLabelTemplate).filter(
        SavedLabelTemplate.id == body.template_id,
        SavedLabelTemplate.tenant_id == tenant_id,
    ).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    record = _product_to_label_record(product)
    records = [record] * body.quantity
    pdf_bytes = render_label_template(
        db=db,
        template_id=body.template_id,
        data=records,
        tenant_id=tenant_id,
    )
    return Response(content=pdf_bytes, media_type="application/pdf")


@router.post("/cart")
def post_labels_cart(
    body: CartLabelBody,
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    """Generate a cart label PDF. Returns PDF with one page per copy (quantity). Reuses existing label renderer."""
    if body.quantity < 1 or body.quantity > 500:
        raise HTTPException(status_code=400, detail="quantity must be between 1 and 500")
    cart = db.query(Cart).filter(
        Cart.id == body.cart_id,
        Cart.tenant_id == tenant_id,
    ).first()
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")
    template = db.query(SavedLabelTemplate).filter(
        SavedLabelTemplate.id == body.template_id,
        SavedLabelTemplate.tenant_id == tenant_id,
    ).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    record = _cart_record(cart)
    records = [record] * body.quantity
    pdf_bytes = render_label_template(
        db=db,
        template_id=body.template_id,
        data=records,
        tenant_id=tenant_id,
    )
    return Response(content=pdf_bytes, media_type="application/pdf")


@router.get("/templates/by-type/{template_type}")
def get_templates_by_type(
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


@router.post("/generate-rack")
def post_generate_rack(
    body: GenerateRackBody,
):
    """Generate rack location records for labels. Returns list of records (loc_name, barcode_data, level, position, etc.)."""
    records = generate_rack_locations(
        rack_prefix=body.rack,
        levels=body.levels,
        positions=body.positions,
        zone=body.zone,
    )
    return {"records": records}


@router.post("/generate-rack-strip")
def post_generate_rack_strip(
    body: GenerateRackStripBody,
):
    """Generate segment records for one rack strip (one level, position range). For use with repeater templates (dataset 'locations'). Returns list of records."""
    records = generate_rack_strip(
        rack_prefix=body.rack,
        level=body.level,
        start_position=body.start,
        end_position=body.end,
    )
    return {"records": records}


@router.post("/render-pdf")
def post_render_pdf(
    body: RenderPdfBody,
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    """Render a label PDF from a template and list of records. One page per record."""
    import logging
    _log = logging.getLogger(__name__)
    _log.info("render-pdf request: template_id=%s records_count=%s", body.template_id, len(body.records or []))
    if body.records:
        first = body.records[0]
        _log.info("render-pdf first record keys: %s", list(first.keys()) if isinstance(first, dict) else "not a dict")
        _log.info("render-pdf first record has 'locations': %s", "locations" in first if isinstance(first, dict) else False)
    if not body.records:
        return Response(content=b"", status_code=400, media_type="text/plain")
    calibration = None
    if body.printer_profile_id is not None:
        from ..models.printer_profile import PrinterProfile
        profile = db.query(PrinterProfile).filter(
            PrinterProfile.id == body.printer_profile_id,
            PrinterProfile.tenant_id == tenant_id,
        ).first()
        if profile:
            calibration = {
                "offset_x_mm": float(profile.offset_x_mm or 0),
                "offset_y_mm": float(profile.offset_y_mm or 0),
                "scale": float(profile.scale if profile.scale is not None else 1.0),
            }
    print("PDF REQUEST BODY:", body)
    pdf_bytes = render_label_template(
        db=db,
        template_id=body.template_id,
        data=body.records,
        tenant_id=tenant_id,
        calibration=calibration,
    )
    return Response(content=pdf_bytes, media_type="application/pdf")


@router.post("/import-barcode-pdf")
async def post_import_barcode_pdf(
    file: UploadFile = File(...),
):
    """Upload a PDF file; extract barcode values from all pages. Returns { barcodes: [...] }."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")
    try:
        pdf_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Read failed: {e}")
    try:
        barcodes = extract_barcodes_from_pdf(pdf_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"barcodes": barcodes}
