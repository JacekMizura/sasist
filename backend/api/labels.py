"""Labels API: template-by-type and generation entry points."""

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.cart import Cart
from ..models.label_template import SavedLabelTemplate
from ..models.order import Order
from ..models.bundle import Bundle
from ..models.product import Product
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.tenant import Tenant
from ..models.wms_order_return import WmsOrderReturn
from ..models.wms_rmz_line import RMZLine
from ..services.label_pack_service import _cart_record
from ..services.rack_label_generator import generate_rack_locations
from ..services.rack_strip_generator import generate_rack_strip
from ..services.label_pdf_generation_log import log_label_pdf_flow
from ..services.label_render_service import render_label_template
from ..services.location_label_filters import apply_label_filters
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
    """When set (e.g. CSV labels), overrides DB ``SavedLabelTemplate.template_json`` so rendering always uses the template engine with correct mm."""
    template_json: str | None = None
    """Exclude locations on these floors (e.g. A, F). Matched against record['floor'] or parsed loc_name."""
    exclude_floors: list[str] = Field(default_factory=list)
    """CSV / flat rows: merge by ``row`` into one PDF page with ``floor_1..3``, ``barcode_1..3`` (unused slots ``null``)."""
    group_mode: bool = False
    """If ``group_mode``: split groups by ``rack_name`` as well as ``row``."""
    group_by_rack: bool = False
    """When ``group_mode`` and non-empty: merge by ``(row, floor_set_id)`` using these floor groups (case-insensitive). Empty = legacy row merge only."""
    floor_sets: list[list[str]] = Field(default_factory=list)


class ProductLabelBody(BaseModel):
    product_id: int
    template_id: int
    quantity: int = 1


class BundleLabelBody(BaseModel):
    bundle_id: int
    template_id: int
    quantity: int = 1


class CartLabelBody(BaseModel):
    cart_id: int
    template_id: int
    quantity: int = 1


class ReturnLabelPrintBody(BaseModel):
    return_line_id: int
    template_type: str = "RETURN"


class ZPzLabelPrintBody(BaseModel):
    stock_document_id: int = Field(ge=1)
    template_id: int = Field(ge=1)


def _return_line_to_label_record(
    rmz: WmsOrderReturn,
    line: RMZLine,
    product: Product,
    order: Order | None,
) -> dict:
    """Bindings for RETURN templates: product fields + RMZ / order context."""
    base = _product_to_label_record(product)
    rmz_num = (rmz.rmz_number or "").strip() or "—"
    ord_num = ""
    if order is not None:
        ord_num = (order.number or "").strip() or (f"#{order.id}" if order.id else "")
    q = int(line.quantity or 0)
    base.update(
        {
            "rmz_number": rmz_num,
            "order_number": ord_num or "—",
            "return_line_id": str(line.id),
            "return_qty": str(q),
            "quantity": str(q),
            "{rmz_number}": rmz_num,
            "{order_number}": ord_num or "—",
            "{return_line_id}": str(line.id),
            "{return_qty}": str(q),
        }
    )
    return base


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


def _bundle_to_label_record(b: Bundle) -> dict:
    """Same field names as product labels so product-type templates work for bundles."""
    name = (b.name or "").strip() or "—"
    sku = ((b.sku or "").strip() or (b.ean or "").strip() or "—")
    ean = (b.ean or "").strip() or "—"
    barcode = ean if ean != "—" else sku
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


@router.post("/bundle")
def post_labels_bundle(
    body: BundleLabelBody,
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    """Generate a bundle label PDF using the same record shape as product labels (template_type=product)."""
    if body.quantity < 1 or body.quantity > 500:
        raise HTTPException(status_code=400, detail="quantity must be between 1 and 500")
    bundle = db.query(Bundle).filter(
        Bundle.id == body.bundle_id,
        Bundle.tenant_id == tenant_id,
    ).first()
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")
    template = db.query(SavedLabelTemplate).filter(
        SavedLabelTemplate.id == body.template_id,
        SavedLabelTemplate.tenant_id == tenant_id,
    ).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    record = _bundle_to_label_record(bundle)
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


@router.post("/print/return")
def post_labels_print_return(
    body: ReturnLabelPrintBody,
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    """Generate one return-line label PDF using tenant template_type RETURN (default printer/QZ on client)."""
    line = db.query(RMZLine).filter(RMZLine.id == body.return_line_id).first()
    if not line:
        raise HTTPException(status_code=404, detail="Pozycja zwrotu nie znaleziona")
    rmz = (
        db.query(WmsOrderReturn)
        .filter(
            WmsOrderReturn.id == line.rmz_id,
            WmsOrderReturn.tenant_id == tenant_id,
        )
        .first()
    )
    if not rmz:
        raise HTTPException(status_code=404, detail="Zwrot nie znaleziony")
    tt_raw = (body.template_type or "RETURN").strip().upper() or "RETURN"
    template = (
        db.query(SavedLabelTemplate)
        .filter(
            SavedLabelTemplate.tenant_id == tenant_id,
            func.upper(func.coalesce(SavedLabelTemplate.template_type, "")) == tt_raw,
        )
        .order_by(SavedLabelTemplate.updated_at.desc())
        .first()
    )
    if not template:
        raise HTTPException(
            status_code=404,
            detail=f"Brak szablonu etykiety typu {tt_raw}",
        )
    product = (
        db.query(Product)
        .filter(Product.id == line.product_id, Product.tenant_id == tenant_id)
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nie znaleziony")
    order = (
        db.query(Order)
        .filter(Order.id == rmz.order_id, Order.tenant_id == tenant_id)
        .first()
    )
    record = _return_line_to_label_record(rmz, line, product, order)
    pdf_bytes = render_label_template(
        db=db,
        template_id=template.id,
        data=[record],
        tenant_id=tenant_id,
    )
    return Response(content=pdf_bytes, media_type="application/pdf")


def _z_pz_to_label_record(
    doc: StockDocument,
    *,
    line_count: int,
    unit_sum: float,
) -> dict:
    num = str(getattr(doc, "document_number", None) or "").strip() or f"Z-PZ #{int(doc.id)}"
    barcode = f"ZPZ-{int(doc.id)}"
    units = int(unit_sum) if float(unit_sum).is_integer() else round(float(unit_sum), 4)
    return {
        "document_number": num,
        "barcode_data": barcode,
        "barcode_value": barcode,
        "line_count": str(line_count),
        "unit_sum": str(units),
        "quantity": str(units),
        "{document_number}": num,
        "{barcode_data}": barcode,
        "{barcode_value}": barcode,
        "{line_count}": str(line_count),
        "{unit_sum}": str(units),
    }


@router.post("/print/z-pz")
def post_labels_print_z_pz(
    body: ZPzLabelPrintBody,
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    """Generate Z-PZ carrier label PDF (template from WMS returns settings)."""
    doc = (
        db.query(StockDocument)
        .filter(
            StockDocument.id == int(body.stock_document_id),
            StockDocument.tenant_id == tenant_id,
            StockDocument.document_type == "Z_PZ",
        )
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Dokument Z-PZ nie znaleziony")
    template = db.query(SavedLabelTemplate).filter(
        SavedLabelTemplate.id == int(body.template_id),
        SavedLabelTemplate.tenant_id == tenant_id,
    ).first()
    if not template:
        raise HTTPException(status_code=404, detail="Szablon etykiety nie znaleziony")
    agg = (
        db.query(
            func.count(StockDocumentItem.id),
            func.coalesce(func.sum(StockDocumentItem.received_quantity), 0.0),
        )
        .filter(StockDocumentItem.document_id == int(doc.id))
        .one()
    )
    line_count = int(agg[0] or 0)
    unit_sum = float(agg[1] or 0.0)
    record = _z_pz_to_label_record(doc, line_count=line_count, unit_sum=unit_sum)
    pdf_bytes = render_label_template(
        db=db,
        template_id=int(body.template_id),
        data=[record],
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
    print_mode: bool = Query(
        False,
        description="When true: bleed, trim crop marks, and CMYK colors. Default is standard (RGB, no bleed).",
    ),
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
    records_for_pdf = apply_label_filters(body.records, body.exclude_floors)
    if not records_for_pdf:
        raise HTTPException(
            status_code=400,
            detail="No records left after exclude_floors filter. Clear some exclusions or add locations.",
        )
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
    print(
        "LABEL_RENDER_PDF_PATH:",
        "labels.py:post_render_pdf",
        "->",
        "label_render_service.render_label_template",
        "->",
        "label_render_service.build_label_pdf_multi",
        "| NOT barcode_pdf_service | NOT cart_service | NOT complaint_shipment",
    )
    log_label_pdf_flow(
        "label_render_service",
        template_id=int(body.template_id),
        template_json=(body.template_json.strip() if isinstance(body.template_json, str) and body.template_json.strip() else None),
        width_mm=None,
        height_mm=None,
        detail="labels_api.post_render_pdf -> render_label_template + build_label_pdf_multi (NOT barcode_pdf_service)",
    )
    try:
        pdf_bytes = render_label_template(
            db=db,
            template_id=body.template_id,
            data=records_for_pdf,
            tenant_id=tenant_id,
            calibration=calibration,
            override_template_json=body.template_json,
            print_mode=print_mode,
            group_mode=bool(body.group_mode),
            group_by_rack=bool(body.group_by_rack),
            floor_sets=body.floor_sets,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
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
