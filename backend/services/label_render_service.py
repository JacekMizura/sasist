"""
Label rendering service: single template system for PDF generation.

All label PDFs are generated from SavedLabelTemplate.template_json only.
Flow: Designer (frontend) → SavedLabelTemplate.template_json → label_render_service
  → label_engine → PDF.

Template format: { "widthMm", "heightMm", "elements": [{ type, x, y, ... }] }.
Used by: location labels, cart/basket labels, label packs.
"""

import io
import json
import logging
from typing import Any

from reportlab.lib import colors as rl_colors
from reportlab.pdfgen import canvas
from reportlab.graphics.barcode import code128

from ..pdf_fonts import PDF_FONT, PDF_FONT_BOLD, register_pdf_fonts

register_pdf_fonts()

logger = logging.getLogger(__name__)

# mm to PDF points (ReportLab uses points; 1 inch = 25.4 mm = 72 points)
POINTS_PER_MM = 2.83465

# Optional QR support
try:
    import qrcode
    HAS_QR = True
except ImportError:
    HAS_QR = False


def _resolve(record: dict[str, Any], key: str) -> str:
    """Get value from record by key. Replaces template variables: e.g. {loc_name} -> record['loc_name'] or record['{loc_name}']."""
    if not isinstance(record, dict):
        return ""
    key = str(key).strip() if key is not None else ""
    if not key:
        return ""
    val = record.get(key)
    if val is not None:
        return str(val)
    if key.startswith("{") and key.endswith("}"):
        bare = key[1:-1].strip()
        val = record.get(bare)
        if val is not None:
            return str(val)
    return ""


def _get_barcode_value(record: dict[str, Any], data_binding: str) -> str:
    """Resolve barcode data; try binding first, then fallback: barcode_data, location_barcode, cart_barcode, basket_barcode."""
    data_binding = str(data_binding or "").strip() or "barcode_data"
    v = _resolve(record, data_binding)
    if v:
        return v
    if data_binding.startswith("{") and data_binding.endswith("}"):
        v = _resolve(record, data_binding[1:-1].strip())
        if v:
            return v
    for key in ("barcode_data", "location_barcode", "cart_barcode", "basket_barcode"):
        v = _resolve(record, key)
        if v:
            return v
    return _resolve(record, "location_code") or ""


def _get_text_value(record: dict[str, Any], binding: str) -> str:
    return _resolve(record, binding)


def _render_barcode_code128(
    c: canvas.Canvas,
    val: str,
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
    show_value: bool,
) -> None:
    """Draw Code128 barcode so it exactly fills (w_pt x h_pt) at (x_pt, y_pt). Bars only, no human-readable text."""
    if not (val or "").strip():
        return
    try:
        bc = code128.Code128((val or "").strip(), displayValue=False)
        bc_width = bc.width if (bc.width and bc.width > 0) else 1.0
        bc_height = bc.height if (bc.height and bc.height > 0) else 1.0
        scale_x = w_pt / bc_width
        scale_y = h_pt / bc_height
        c.saveState()
        c.translate(x_pt, y_pt)
        c.scale(scale_x, scale_y)
        bc.drawOn(c, 0, 0)
        c.restoreState()
    except Exception as e:
        logger.warning("Code128 render failed for %r: %s", (val or "")[:20], e)


def _render_barcode_qr(
    c: canvas.Canvas,
    val: str,
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
) -> None:
    """Draw QR at (x_pt, y_pt) in PDF points, size w_pt x h_pt. No human-readable text."""
    if not HAS_QR or not val:
        return
    try:
        qr = qrcode.QRCode(version=1, box_size=4, border=0)
        qr.add_data(val)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        c.drawImage(buf, x_pt, y_pt, width=w_pt, height=h_pt)
    except Exception as e:
        logger.warning("QR render failed for %r: %s", val[:20], e)


def _apply_element_color(c: canvas.Canvas, el: dict, default_fill: str = "#000000") -> None:
    """Set fill/stroke color from element textColor or backgroundColor (hex)."""
    color = el.get("textColor") or el.get("text_color") or default_fill
    try:
        if isinstance(color, str) and color.startswith("#"):
            c.setFillColor(rl_colors.HexColor(color))
            c.setStrokeColor(rl_colors.HexColor(color))
        else:
            c.setFillColor(color)
            c.setStrokeColor(color)
    except Exception:
        c.setFillColor(rl_colors.HexColor(default_fill))
        c.setStrokeColor(rl_colors.HexColor(default_fill))


def _render_element(
    c: canvas.Canvas,
    el: dict,
    record: dict[str, Any],
    x0_mm: float,
    y0_mm: float,
    label_width_mm: float,
    label_height_mm: float,
    offset_x_pt: float,
    offset_y_pt: float,
) -> None:
    """Draw one template element. Element coords in mm -> PDF points; offset positions label on page.
    Elements are clamped so they always render inside the label area."""
    el_type = (el.get("type") or "").strip()
    x_mm = x0_mm + float(el.get("x", 0))
    y_design_mm = y0_mm + float(el.get("y", 0))
    w_mm = float(el.get("width", 10))
    h_mm = float(el.get("height", 10))
    # Prevent elements larger than the label
    w_mm = min(w_mm, label_width_mm)
    h_mm = min(h_mm, label_height_mm)
    w_mm = max(0.0, w_mm)
    h_mm = max(0.0, h_mm)
    # Safe bounds: keep element fully inside label (position + size <= label size)
    x_mm = max(0.0, min(x_mm, label_width_mm - w_mm))
    y_design_mm = max(0.0, min(y_design_mm, label_height_mm - h_mm))
    # Debug: log when template had element outside label bounds
    orig_x = x0_mm + float(el.get("x", 0))
    orig_y = y0_mm + float(el.get("y", 0))
    orig_w = float(el.get("width", 10))
    orig_h = float(el.get("height", 10))
    if orig_x + orig_w > label_width_mm or orig_y + orig_h > label_height_mm or orig_x < 0 or orig_y < 0:
        logger.warning(
            "Element outside label bounds (clamped): type=%s x=%.1f y=%.1f w=%.1f h=%.1f label=%.1fx%.1f -> x=%.1f y=%.1f w=%.1f h=%.1f",
            el_type, orig_x, orig_y, orig_w, orig_h, label_width_mm, label_height_mm, x_mm, y_design_mm, w_mm, h_mm,
        )
    # Design: top-left origin. PDF: bottom-left. Convert to points and apply label offset.
    y_mm = label_height_mm - y_design_mm - h_mm
    x_pt = x_mm * POINTS_PER_MM + offset_x_pt
    y_pt = y_mm * POINTS_PER_MM + offset_y_pt
    w_pt = w_mm * POINTS_PER_MM
    h_pt = h_mm * POINTS_PER_MM

    if el_type == "barcode":
        data_binding = el.get("dataBinding") or el.get("data_binding") or el.get("binding") or "barcode_data"
        val = _get_barcode_value(record, data_binding)
        if not (val or "").strip():
            return
        fmt = (el.get("format") or "Code128").lower()
        show_value = el.get("showValue", False)
        if fmt == "qr":
            _render_barcode_qr(c, val, x_pt, y_pt, w_pt, h_pt)
        else:
            _render_barcode_code128(c, val, x_pt, y_pt, w_pt, h_pt, show_value)

    elif el_type == "staticText":
        text = el.get("text") or ""
        font_size = float(el.get("fontSize") or 8)
        _apply_element_color(c, el)
        c.setFont(PDF_FONT_BOLD if el.get("bold") else PDF_FONT, font_size)
        y_baseline_pt = y_pt + font_size * 0.35
        if el.get("verticalText") and text:
            for i, ch in enumerate(text):
                c.drawString(x_pt, y_baseline_pt + (i + 0.5) * font_size * 0.35, ch)
        else:
            c.drawString(x_pt, y_baseline_pt, text)

    elif el_type in ("dynamicText", "text"):
        binding = (el.get("binding") or el.get("dataBinding") or el.get("data_binding") or "").strip()
        if binding.startswith("{") and binding.endswith("}"):
            key = binding[1:-1].strip()
        else:
            key = binding
        value = record.get(key, record.get(binding, "")) if isinstance(record, dict) else ""
        val = str(value) if value is not None else ""
        font_size = float(el.get("fontSize") or 10)
        _apply_element_color(c, el)
        c.setFont(PDF_FONT_BOLD if el.get("bold") else PDF_FONT, font_size)
        y_baseline_pt = y_pt + font_size * 0.35
        if el.get("verticalText") and val:
            for i, ch in enumerate(val):
                c.drawString(x_pt, y_baseline_pt + (i + 0.5) * font_size * 0.35, ch)
        else:
            c.drawString(x_pt, y_baseline_pt, val)

    elif el_type == "line":
        stroke = float(el.get("strokeWidth") or el.get("stroke_width") or 0.5)
        _apply_element_color(c, el)
        c.setLineWidth(max(0.5, stroke * POINTS_PER_MM))
        x2_pt = (x_mm + w_mm) * POINTS_PER_MM + offset_x_pt
        y2_pt = (y_mm + h_mm) * POINTS_PER_MM + offset_y_pt
        c.line(x_pt, y_pt, x2_pt, y2_pt)

    elif el_type in ("rect", "rectangle"):
        stroke = float(el.get("strokeWidth") or el.get("stroke_width") or 0.5)
        fill = el.get("fill") or el.get("backgroundColor") or el.get("background_color")
        _apply_element_color(c, el)
        c.setLineWidth(max(0.5, stroke * POINTS_PER_MM))
        if fill:
            try:
                if isinstance(fill, str) and fill.startswith("#"):
                    c.setFillColor(rl_colors.HexColor(fill))
                else:
                    c.setFillColor(fill)
                c.rect(x_pt, y_pt, w_pt, h_pt, fill=1, stroke=0)
            except Exception:
                pass
        c.rect(x_pt, y_pt, w_pt, h_pt, fill=0, stroke=1)


def _normalize_template(template: dict) -> dict:
    """Ensure template has widthMm, heightMm, dpi, elements (support camelCase and snake_case)."""
    if not template or not isinstance(template, dict):
        return {"widthMm": 100.0, "heightMm": 60.0, "dpi": 96.0, "elements": []}
    inner = template.get("template") if isinstance(template.get("template"), dict) else None
    w = template.get("widthMm") or template.get("width_mm") or (inner and (inner.get("widthMm") or inner.get("width_mm")))
    h = template.get("heightMm") or template.get("height_mm") or (inner and (inner.get("heightMm") or inner.get("height_mm")))
    dpi = template.get("dpi") or (inner and inner.get("dpi"))
    elements = template.get("elements") or template.get("Elements") or []
    if not elements and inner:
        elements = inner.get("elements") or inner.get("Elements") or []
    if not isinstance(elements, list):
        elements = []
    if not elements:
        logger.warning(
            "Label template has no elements array (or empty). PDF may render blank. "
            "Check SavedLabelTemplate.template_json contains \"elements\": [...]."
        )
    return {
        "widthMm": float(w) if w is not None else 100.0,
        "heightMm": float(h) if h is not None else 60.0,
        "dpi": float(dpi) if dpi is not None else 96.0,
        "elements": elements,
    }


def render_label_to_canvas(
    c: canvas.Canvas,
    template: dict,
    record: dict[str, Any],
    x0_mm: float = 0,
    y0_mm: float = 0,
    offset_x_pt: float = 0,
    offset_y_pt: float = 0,
) -> None:
    """
    Draw one label onto the canvas. Each label uses its own coordinate offset so elements
    render inside the label area. Coordinates: element["x"], element["y"] in mm -> PDF points + offset.
    """
    t = _normalize_template(template)
    label_width_mm = t["widthMm"]
    label_height_mm = t["heightMm"]
    elements = t["elements"]
    if logger.isEnabledFor(logging.DEBUG):
        logger.debug(
            "render_label_to_canvas: template elements=%d, offset_y_pt=%s",
            len(elements),
            offset_y_pt,
        )
    for el in elements:
        if not isinstance(el, dict) or not el.get("type"):
            continue
        _render_element(
            c, el, record, x0_mm, y0_mm, label_width_mm, label_height_mm, offset_x_pt, offset_y_pt
        )


def build_label_pdf(template: dict, records: list[dict[str, Any]], one_page_per_label: bool = True) -> bytes:
    """
    Build a PDF from a label template and a list of records.
    Template must have widthMm, heightMm, elements. Uses label_engine.render_elements.
    Normalizes records so keys match template bindings (e.g. cart_name, barcode_data, loc_name).
    """
    t = _normalize_template(template)
    width = t["widthMm"]
    height = t["heightMm"]
    elements = t["elements"]
    # Ensure records have keys matching template bindings
    records = [_normalize_record_for_bindings(r, elements) for r in records]
    logger.info("LABEL TEMPLATE: %s", {"widthMm": width, "heightMm": height, "elementCount": len(elements)})
    logger.info("ELEMENT COUNT: %d", len(elements))
    if records:
        logger.info("RECORD KEYS: %s", list(records[0].keys()))
    layout = {"elements": elements}
    from .label_engine import build_label_pdf_engine
    return build_label_pdf_engine(layout, width, height, records)


def build_label_pdf_multi(template_record_pairs: list[tuple[dict, dict[str, Any]]]) -> bytes:
    """
    Build one PDF with one page per (template, record) pair. Uses generic label engine.
    """
    from .label_engine import render_label_to_canvas_engine
    if not template_record_pairs:
        return build_label_pdf(
            {"widthMm": 100, "heightMm": 60, "dpi": 96, "elements": []},
            [{}],
            one_page_per_label=True,
        )
    buf = io.BytesIO()
    c = None
    for i, (template, record) in enumerate(template_record_pairs):
        t = _normalize_template(template)
        w_mm = t["widthMm"]
        h_mm = t["heightMm"]
        elements = t["elements"]
        layout = {"elements": elements}
        record = _normalize_record_for_bindings(record, elements)
        label_width_pt = w_mm * POINTS_PER_MM
        label_height_pt = h_mm * POINTS_PER_MM
        if c is None:
            c = canvas.Canvas(buf, pagesize=(label_width_pt, label_height_pt))
        else:
            c.showPage()
            c.setPageSize((label_width_pt, label_height_pt))
        render_label_to_canvas_engine(c, layout, record, w_mm, h_mm, 0.0, 0.0)
    if c is not None:
        c.save()
    buf.seek(0)
    return buf.read()


def _normalize_record_for_bindings(record: dict[str, Any], elements: list) -> dict[str, Any]:
    """
    Ensure record has keys that match common template bindings so text/barcode elements resolve.
    Maps alternate key names to expected names (e.g. name -> cart_name, barcode -> barcode_data).
    Does not overwrite existing keys; only fills in missing ones.
    """
    if not isinstance(record, dict):
        return record
    out = dict(record)
    # barcode_data: required by barcode elements; fallback from cart_barcode, basket_barcode, loc_barcode, barcode
    if not out.get("barcode_data") and not out.get("{barcode_data}"):
        val = (
            out.get("cart_barcode")
            or out.get("basket_barcode")
            or out.get("loc_barcode")
            or out.get("location_barcode")
            or out.get("barcode")
        )
        if val:
            out["barcode_data"] = val
            out["{barcode_data}"] = val
    # Cart bindings
    if out.get("name") and not out.get("cart_name"):
        out["cart_name"] = out["name"]
        out["{cart_name}"] = out["name"]
    if out.get("barcode") and not out.get("cart_barcode"):
        out["cart_barcode"] = out["barcode"]
        out["{cart_barcode}"] = out["barcode"]
    # Location bindings
    if out.get("location_name") and not out.get("loc_name"):
        out["loc_name"] = out["location_name"]
        out["{loc_name}"] = out["location_name"]
    if out.get("location_code") and not out.get("loc_name"):
        out["loc_name"] = out["location_code"]
        out["{loc_name}"] = out["location_code"]
    if out.get("location_barcode") and not out.get("loc_barcode"):
        out["loc_barcode"] = out["location_barcode"]
        out["{loc_barcode}"] = out["location_barcode"]
    if out.get("zone_name") and not out.get("zone"):
        out["zone"] = out["zone_name"]
        out["{zone}"] = out["zone_name"]
    # Basket: basket_code -> basket_name if missing
    if out.get("basket_code") and not out.get("basket_name"):
        out["basket_name"] = out["basket_code"]
        out["{basket_name}"] = out["basket_code"]
    return out


def validate_template_json(template_json: str) -> str | None:
    """
    Validate SavedLabelTemplate.template_json. Returns None if valid, or an error message string.
    Checks: widthMm/width_mm and heightMm/height_mm exist (or extractable), elements is array, each element has type.
    """
    if not template_json or not isinstance(template_json, str) or not template_json.strip():
        return "template_json is required and must be a non-empty string"
    try:
        data = json.loads(template_json)
        if isinstance(data, str):
            data = json.loads(data)
        if not isinstance(data, dict):
            return "template_json must be a JSON object"
    except (json.JSONDecodeError, TypeError, ValueError):
        return "template_json must be valid JSON"
    inner = data.get("template") if isinstance(data.get("template"), dict) else None
    w = data.get("widthMm") or data.get("width_mm") or (inner and (inner.get("widthMm") or inner.get("width_mm")))
    h = data.get("heightMm") or data.get("height_mm") or (inner and (inner.get("heightMm") or inner.get("height_mm")))
    if w is None or (isinstance(w, (int, float)) and (w <= 0 or w > 2000)):
        return "template must have widthMm (or width_mm) between 1 and 2000"
    if h is None or (isinstance(h, (int, float)) and (h <= 0 or h > 2000)):
        return "template must have heightMm (or height_mm) between 1 and 2000"
    elements = data.get("elements") or data.get("Elements")
    if inner:
        elements = elements or inner.get("elements") or inner.get("Elements")
    if not isinstance(elements, list):
        return "template must have an elements array"
    for i, el in enumerate(elements):
        if not isinstance(el, dict):
            return f"elements[{i}] must be an object"
        if not el.get("type"):
            return f"elements[{i}] must have a type field"
    return None


def _safe_default_template() -> dict:
    """Return canonical template shape: widthMm, heightMm, elements. Used when parsing fails."""
    return {"widthMm": 100.0, "heightMm": 60.0, "elements": []}


def template_json_to_dict(template_json: str | dict | None) -> dict:
    """
    Parse template_json into a dict for PDF rendering. Bulletproof: always returns
    { widthMm: number, heightMm: number, elements: [] } even for None, string,
    double-encoded JSON, or invalid JSON.
    """
    data: dict | None = None
    if template_json is None:
        pass
    elif isinstance(template_json, dict):
        data = template_json
    elif isinstance(template_json, str):
        s = template_json.strip()
        if not s:
            return _safe_default_template()
        try:
            data = json.loads(s)
            while isinstance(data, str) and data.strip():
                data = json.loads(data)
            if not isinstance(data, dict):
                data = None
        except (json.JSONDecodeError, TypeError, ValueError) as e:
            logger.warning("template_json parse failed: %s", e)
            return _safe_default_template()
    else:
        return _safe_default_template()
    return _normalize_template(data) if data else _safe_default_template()


def get_product_label_template_id(db: "Session", tenant_id: int, product_id: int) -> int | None:
    """
    Resolve which label template to use for a product.
    Returns product.label_template_id if set, else the first product-type template for the tenant (default).
    Use this when generating product labels so each product can have its own template.
    """
    from ..models.product import Product
    from ..models.label_template import SavedLabelTemplate

    product = db.query(Product).filter(
        Product.id == product_id,
        Product.tenant_id == tenant_id,
    ).first()
    if not product:
        return None
    if getattr(product, "label_template_id", None) is not None:
        return int(product.label_template_id)
    row = (
        db.query(SavedLabelTemplate.id)
        .filter(
            SavedLabelTemplate.tenant_id == tenant_id,
            SavedLabelTemplate.template_type == "product",
        )
        .order_by(SavedLabelTemplate.updated_at.desc())
        .first()
    )
    return int(row[0]) if row else None


def render_label_template(
    db: "Session",
    template_id: int,
    data: dict[str, Any] | list[dict[str, Any]],
    tenant_id: int,
) -> bytes:
    """
    Single entry point for label PDF generation. Loads template from SavedLabelTemplate.template_json only.
    Ensures template_json is parsed to dict and normalized (widthMm, heightMm, elements) before rendering.
    """
    from ..models.label_template import SavedLabelTemplate

    row = db.query(SavedLabelTemplate).filter(
        SavedLabelTemplate.id == template_id,
        SavedLabelTemplate.tenant_id == tenant_id,
    ).first()
    if not row:
        raise ValueError(f"Template id={template_id} not found for tenant_id={tenant_id}")
    raw = getattr(row, "template_json", None)
    if not raw:
        raise ValueError(f"Template id={template_id} has no template_json")
    # Always parse to dict (DB stores template_json as string)
    template = template_json_to_dict(raw)
    width = template.get("widthMm")
    height = template.get("heightMm")
    elements = template.get("elements", [])
    if not elements:
        logger.warning(
            "render_label_template: template_id=%s name=%s has empty elements; PDF may be blank.",
            template_id, getattr(row, "name", ""),
        )
    logger.info("LABEL TEMPLATE: %s", template)
    logger.info("ELEMENT COUNT: %d", len(elements))
    records = [data] if isinstance(data, dict) else data
    if not records:
        raise ValueError("No records to render")
    if records:
        logger.info("RECORD KEYS: %s", list(records[0].keys()))
    # Ensure each record has keys matching common template bindings (e.g. cart_name, barcode_data, loc_name)
    records = [_normalize_record_for_bindings(r, elements) for r in records]
    # Pass explicit shape so build_label_pdf always receives widthMm, heightMm, elements
    template_for_pdf = {"widthMm": width, "heightMm": height, "elements": elements}
    return build_label_pdf(template_for_pdf, records, one_page_per_label=True)
