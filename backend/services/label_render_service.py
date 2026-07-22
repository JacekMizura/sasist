"""
Label rendering service: single template system for PDF generation.

All label PDFs are generated from SavedLabelTemplate.template_json only.
Flow: Designer (frontend) → SavedLabelTemplate.template_json → label_render_service
  → label_engine → PDF.

Template format: { "widthMm", "heightMm", "elements": [{ type, x, y, ... }] }.
Used by: location labels, cart/basket labels, label packs.

Calibration (offset/scale): Should be applied either in frontend export OR backend
rendering, not both, to avoid double transformation.
"""

from __future__ import annotations

import io
import json
import logging
from typing import Any

from ..pdf_fonts import PDF_FONT, PDF_FONT_BOLD, register_pdf_fonts
from .label_pdf_generation_log import log_label_pdf_flow, log_label_pdf_stage, print_pdf_canvas_size
from .pdf_deps import raise_if_no_reportlab

try:
    from reportlab.pdfgen import canvas
    from reportlab.graphics.barcode import code128

    _REPORTLAB = True
except ImportError:
    canvas = None  # type: ignore[misc, assignment]
    code128 = None  # type: ignore[misc, assignment]
    _REPORTLAB = False

logger = logging.getLogger(__name__)


def _require_pdf() -> None:
    raise_if_no_reportlab(_REPORTLAB)
    register_pdf_fonts()

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
    """Resolve barcode data; try binding first, then fallback keys including barcode_login_code."""
    data_binding = str(data_binding or "").strip() or "barcode_data"
    v = _resolve(record, data_binding)
    if v:
        return v
    if data_binding.startswith("{") and data_binding.endswith("}"):
        v = _resolve(record, data_binding[1:-1].strip())
        if v:
            return v
    for key in (
        "barcode_data",
        "location_barcode",
        "loc_barcode",
        "cart_barcode",
        "basket_barcode",
        "barcode_login_code",
        "{barcode_login_code}",
        "location_code",
    ):
        v = _resolve(record, key)
        if v:
            return v
    return ""


def _get_text_value(record: dict[str, Any], binding: str) -> str:
    return _resolve(record, binding)


def _render_barcode_code128(
    c: Any,
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
        from .label_engine import hex_to_cmyk

        bc = code128.Code128((val or "").strip(), displayValue=False)
        bc_width = bc.width if (bc.width and bc.width > 0) else 1.0
        bc_height = bc.height if (bc.height and bc.height > 0) else 1.0
        scale_x = w_pt / bc_width
        scale_y = h_pt / bc_height
        black = hex_to_cmyk("#000000")
        c.saveState()
        c.translate(x_pt, y_pt)
        c.scale(scale_x, scale_y)
        c.setFillColor(black)
        c.setStrokeColor(black)
        bc.drawOn(c, 0, 0)
        c.restoreState()
    except Exception as e:
        logger.warning("Code128 render failed for %r: %s", (val or "")[:20], e)


def _render_barcode_qr(
    c: Any,
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
        from .label_engine import hex_to_cmyk

        black = hex_to_cmyk("#000000")
        c.saveState()
        c.setFillColor(black)
        c.setStrokeColor(black)
        c.drawImage(buf, x_pt, y_pt, width=w_pt, height=h_pt)
        c.restoreState()
    except Exception as e:
        logger.warning("QR render failed for %r: %s", val[:20], e)


def _apply_element_color(c: Any, el: dict, default_fill: str = "#000000") -> None:
    """Set fill/stroke color from element textColor or backgroundColor (hex)."""
    from .label_engine import hex_to_cmyk

    color = el.get("textColor") or el.get("text_color") or default_fill
    try:
        cc = hex_to_cmyk(str(color) if isinstance(color, str) else default_fill)
        c.setFillColor(cc)
        c.setStrokeColor(cc)
    except Exception:
        df = hex_to_cmyk(default_fill)
        c.setFillColor(df)
        c.setStrokeColor(df)


def _render_element(
    c: Any,
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
                from .label_engine import hex_to_cmyk

                if isinstance(fill, str) and fill.startswith("#"):
                    c.setFillColor(hex_to_cmyk(fill))
                else:
                    c.setFillColor(hex_to_cmyk("#000000"))
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


# Legacy renderer. Do not use. Kept only for backward compatibility.
# Does not support repeaters or groups; current PDF pipeline uses label_engine.render_label_to_canvas_engine.
def render_label_to_canvas(
    c: Any,
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
    _require_pdf()
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


def build_label_pdf(
    template: dict,
    records: list[dict[str, Any]],
    one_page_per_label: bool = True,
    calibration: dict | None = None,
    *,
    print_mode: bool = False,
) -> bytes:
    """
    Build a PDF from a label template and a list of records.
    Template must have widthMm, heightMm, elements. Uses label_engine.render_elements.
    Normalizes records so keys match template bindings (e.g. cart_name, barcode_data, loc_name).
    calibration: optional dict (offset/scale); ignored for PDF so each page media box equals the label (no canvas transform).
    """
    t = _normalize_template(template)
    width = t["widthMm"]
    height = t["heightMm"]
    assert width and height, "label PDF requires width_mm and height_mm"
    assert float(width) > 0 and float(height) > 0, "label PDF requires positive width_mm and height_mm"
    elements = t["elements"]
    log_label_pdf_stage(
        source="label_render_service.build_label_pdf",
        template_json_present=isinstance(template, dict) and bool(template),
        width_mm=float(width),
        height_mm=float(height),
        detail=f"element_count={len(elements)} records={len(records)}",
    )
    # Ensure records have keys matching template bindings
    records = [_normalize_record_for_bindings(r, elements) for r in records]
    logger.info("LABEL TEMPLATE: %s", {"widthMm": width, "heightMm": height, "elementCount": len(elements)})
    logger.info("ELEMENT COUNT: %d", len(elements))
    if records:
        logger.info("RECORD KEYS: %s", list(records[0].keys()))
    layout = {"elements": elements}
    from .label_engine import build_label_pdf_engine

    return build_label_pdf_engine(
        layout, width, height, records, calibration=calibration, print_mode=print_mode
    )


def build_label_pdf_multi(
    template_record_pairs: list[tuple[dict, dict[str, Any]]],
    calibration: dict | None = None,
    *,
    print_mode: bool = False,
) -> bytes:
    """
    Build one PDF with one page per (template, record) pair. Uses generic label engine.
    calibration: optional dict (offset/scale); ignored so each page matches that template’s label size only.
    """
    _require_pdf()
    from reportlab.lib.units import mm
    from PyPDF2 import PdfReader

    from .label_engine import (
        LABEL_PDF_BLEED_MM,
        draw_crop_marks_outside_trim,
        render_label_to_canvas_engine,
    )
    if not template_record_pairs:
        return build_label_pdf(
            {"widthMm": 100, "heightMm": 60, "dpi": 96, "elements": []},
            [{}],
            one_page_per_label=True,
            calibration=calibration,
            print_mode=print_mode,
        )
    if calibration:
        ox = float(calibration.get("offset_x_mm") or 0)
        oy = float(calibration.get("offset_y_mm") or 0)
        sc = float(calibration.get("scale") or 1.0)
        if ox != 0.0 or oy != 0.0 or sc != 1.0:
            logger.debug(
                "build_label_pdf_multi: ignoring printer calibration so each page matches its label template size",
            )

    buf = io.BytesIO()
    c = None
    last_logged_mm: tuple[float, float] | None = None
    for i, (template, record) in enumerate(template_record_pairs):
        t = _normalize_template(template)
        w_mm = t["widthMm"]
        h_mm = t["heightMm"]
        assert w_mm and h_mm, "label PDF requires width_mm and height_mm"
        assert float(w_mm) > 0 and float(h_mm) > 0, "label PDF requires positive width_mm and height_mm"
        wh = (float(w_mm), float(h_mm))
        if last_logged_mm != wh:
            print("FINAL PDF SIZE:", w_mm, h_mm)
            last_logged_mm = wh
        elements = t["elements"]
        layout = {"elements": elements}
        record = _normalize_record_for_bindings(record, elements)

        template_json = json.dumps(t, default=str, ensure_ascii=False)
        logger.warning("TEMPLATE_JSON [%s]: %s", i, template_json)
        logger.warning("WIDTH_MM: %s, HEIGHT_MM: %s", w_mm, h_mm)

        bleed_mm = float(LABEL_PDF_BLEED_MM) if print_mode else 0.0
        final_w_mm = float(w_mm)
        final_h_mm = float(h_mm)
        bleed_pt = bleed_mm * mm
        width_pt = (final_w_mm + 2.0 * bleed_mm) * mm
        height_pt = (final_h_mm + 2.0 * bleed_mm) * mm
        trim_l = bleed_pt
        trim_b = bleed_pt
        trim_r = trim_l + final_w_mm * mm
        trim_t = trim_b + final_h_mm * mm
        logger.warning("WIDTH_PT: %s, HEIGHT_PT: %s", width_pt, height_pt)

        if c is None:
            c = canvas.Canvas(buf, pagesize=(width_pt, height_pt))
            logger.warning("CANVAS_PAGESIZE: %s", getattr(c, "_pagesize", None))
            print("PDF GENERATOR FILE:", __file__)
            print("REAL PDF SIZE:", getattr(c, "_pagesize", None))
            log_label_pdf_stage(
                source="label_render_service.build_label_pdf_multi",
                width_mm=float(w_mm),
                height_mm=float(h_mm),
                canvas_obj=c,
                detail=f"first_canvas pair_index={i} pagesize_pt=({width_pt:.4f},{height_pt:.4f})",
            )
            print_pdf_canvas_size(c)
            if print_mode:
                c.setAuthor("Label System")
                c.setTitle("Warehouse Labels")
                c.setSubject("Print-ready labels")
        else:
            c.showPage()
            c.setPageSize((width_pt, height_pt))
        if print_mode:
            draw_crop_marks_outside_trim(c, trim_l, trim_b, trim_r, trim_t)
        c.saveState()
        c.translate(bleed_pt, bleed_pt)
        render_label_to_canvas_engine(
            c, layout, record, w_mm, h_mm, 0.0, 0.0, bleed_mm=bleed_mm, print_mode=print_mode
        )
        c.restoreState()
    if c is not None:
        c.save()
    pdf_bytes = buf.getvalue()
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        if reader.pages:
            logger.warning("PDF_MEDIABOX: %s", reader.pages[0].mediabox)
        else:
            logger.warning("PDF_MEDIABOX: (no pages)")
    except Exception as exc:
        logger.warning("PDF_MEDIABOX: read failed: %s", exc)
    return pdf_bytes


def _normalize_record_for_bindings(record: dict[str, Any], elements: list) -> dict[str, Any]:
    """
    Ensure record has keys that match common template bindings so text/barcode elements resolve.
    Maps alternate key names to expected names (e.g. name -> cart_name, barcode -> barcode_data).
    Never overwrites a key that already exists on the record (including "" from CSV).
    Only fills missing canonical + braced pairs; then syncs bare <-> braced without overwriting.
    """
    if not isinstance(record, dict):
        return record
    out = dict(record)

    def _sync_bare_from_braced(canonical: str, braced: str) -> None:
        """Copy braced → canonical only; never write ``{...}`` keys (layout engine uses bare names)."""
        if braced in out and canonical not in out:
            out[canonical] = out[braced]

    # barcode_data: fallback only when missing keys entirely (CSV / caller values win, even empty string)
    if "barcode_data" not in out:
        val = (
            out.get("cart_barcode")
            or out.get("basket_barcode")
            or out.get("loc_barcode")
            or out.get("location_barcode")
            or out.get("barcode")
        )
        if val:
            out["barcode_data"] = val
    # Cart bindings
    if "cart_name" not in out and out.get("name"):
        v = out["name"]
        out["cart_name"] = v
    if "cart_barcode" not in out and out.get("barcode"):
        v = out["barcode"]
        out["cart_barcode"] = v
    # Location bindings (do not replace CSV loc_name because location_name is present and loc_name is "")
    if "loc_name" not in out and out.get("location_name"):
        v = out["location_name"]
        out["loc_name"] = v
    if "loc_name" not in out and out.get("location_code"):
        v = out["location_code"]
        out["loc_name"] = v
    if "loc_barcode" not in out and out.get("location_barcode"):
        v = out["location_barcode"]
        out["loc_barcode"] = v
    if "zone" not in out and out.get("zone_name"):
        v = out["zone_name"]
        out["zone"] = v
    if "basket_name" not in out and out.get("basket_code"):
        v = out["basket_code"]
        out["basket_name"] = v

    _sync_bare_from_braced("loc_name", "{loc_name}")
    _sync_bare_from_braced("loc_barcode", "{loc_barcode}")
    _sync_bare_from_braced("barcode_data", "{barcode_data}")
    _sync_bare_from_braced("cart_name", "{cart_name}")
    _sync_bare_from_braced("cart_barcode", "{cart_barcode}")
    _sync_bare_from_braced("zone", "{zone}")
    _sync_bare_from_braced("basket_name", "{basket_name}")

    from .location_label_parse import inject_parsed_location_fields

    inject_parsed_location_fields(out)

    out = {
        k: v
        for k, v in out.items()
        if not (isinstance(k, str) and k.startswith("{") and k.endswith("}"))
    }
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


def sanitize_label_record_keys(record: Any, *, depth: int = 0) -> Any:
    """
    Normalize dict keys from template style ``{rack_name}`` to ``rack_name`` (strip ``{`` / ``}``).
    Recurses into nested dicts and list elements. Braced keys are merged first so bare keys win on collision.
    """
    if isinstance(record, dict):
        items = list(record.items())

        def _sort_key(kv: tuple[Any, Any]) -> tuple[int, str]:
            k = kv[0]
            ks = k if isinstance(k, str) else str(k)
            has_brace = "{" in ks or "}" in ks
            return (0 if has_brace else 1, ks)

        items.sort(key=_sort_key)
        clean: dict[str, Any] = {}
        for k, v in items:
            ks = k if isinstance(k, str) else str(k)
            nk = ks.replace("{", "").replace("}", "")
            if not nk:
                continue
            if isinstance(v, list):
                clean[nk] = [sanitize_label_record_keys(x, depth=depth + 1) for x in v]
            elif isinstance(v, dict):
                clean[nk] = sanitize_label_record_keys(v, depth=depth + 1)
            else:
                clean[nk] = v
        if depth == 0:
            print("SANITIZED RECORD:", clean)
        return clean
    if isinstance(record, list):
        return [sanitize_label_record_keys(x, depth=depth) for x in record]
    return record


def _warn_and_clamp_a4_like_page_mm(template: dict[str, Any]) -> None:
    """
    In-place: log if any side > 200 mm; if dimensions look like an ISO A4 sheet in mm, clamp to 100×60 mm for label PDF.
    Matches frontend ``sanitizeTemplateJsonDimensionsForCsvExport`` heuristics.
    """
    w = template.get("widthMm")
    h = template.get("heightMm")
    try:
        w_eff = float(w) if w is not None else float("nan")
        h_eff = float(h) if h is not None else float("nan")
    except (TypeError, ValueError):
        return
    if not (w_eff > 0 and h_eff > 0):
        return
    if w_eff > 200 or h_eff > 200:
        logger.warning(
            "render_label_template: Template looks like A4 or oversized sheet (%.2f×%.2f mm)",
            w_eff,
            h_eff,
        )
        print("Template looks like A4 or oversized sheet:", w_eff, h_eff)
    looks_like_a4_sheet = (
        (w_eff >= 199 and h_eff >= 280)
        or (h_eff >= 199 and w_eff >= 280)
        or (abs(w_eff - 210) < 5 and abs(h_eff - 297) < 5)
        or (abs(h_eff - 210) < 5 and abs(w_eff - 297) < 5)
    )
    if looks_like_a4_sheet:
        logger.warning(
            "render_label_template: clamped page size to 100×60 mm (was %.2f×%.2f mm)",
            w_eff,
            h_eff,
        )
        print("TEMPLATE SIZE CLAMPED TO: 100 60 (was", w_eff, h_eff, ")")
        template["widthMm"] = 100.0
        template["heightMm"] = 60.0


def render_label_template(
    db: "Session",
    template_id: int,
    data: dict[str, Any] | list[dict[str, Any]],
    tenant_id: int,
    calibration: dict | None = None,
    template_variables: dict[str, Any] | None = None,
    override_template_json: str | None = None,
    *,
    print_mode: bool = False,
    group_mode: bool = False,
    group_by_rack: bool = False,
    floor_sets: list[list[str]] | None = None,
) -> bytes:
    """
    Single entry point for label PDF generation (template engine + ``build_label_pdf_multi``).

    Template JSON: uses ``override_template_json`` from the request when non-empty, otherwise the row in DB.
    Raises ``ValueError`` if no usable ``template_json`` (caller should map to HTTP 400).

    calibration: optional printer calibration dict; not applied to PDF output (exact label-sized pages).
    template_variables: optional dict merged into each record before layout (e.g. warehouse_name).
    """
    from ..models.label_template import SavedLabelTemplate

    row = db.query(SavedLabelTemplate).filter(
        SavedLabelTemplate.id == template_id,
        SavedLabelTemplate.tenant_id == tenant_id,
    ).first()
    if not row:
        raise ValueError(f"Template id={template_id} not found for tenant_id={tenant_id}")
    raw: str | None = None
    if override_template_json is not None and str(override_template_json).strip():
        raw = str(override_template_json).strip()
    else:
        raw_db = getattr(row, "template_json", None)
        raw = str(raw_db).strip() if raw_db is not None and str(raw_db).strip() else None
    if not raw:
        raise ValueError(
            "Template required for CSV labels: missing template_json. "
            "Pass template_json in POST /labels/render-pdf or save template_json on the saved template.",
        )
    raw_present = bool(raw and str(raw).strip())
    # Always parse to dict (DB stores template_json as string)
    template = template_json_to_dict(raw)
    _warn_and_clamp_a4_like_page_mm(template)
    width = template.get("widthMm")
    height = template.get("heightMm")
    print("TEMPLATE SIZE:", width, height)
    nrec = 1 if isinstance(data, dict) else len(data) if isinstance(data, list) else 0
    log_label_pdf_flow(
        "label_render_service",
        template_id=int(template_id),
        template_json=str(raw) if raw is not None else None,
        width_mm=float(width) if width is not None else None,
        height_mm=float(height) if height is not None else None,
        detail=f"render_label_template records={nrec}",
    )
    log_label_pdf_stage(
        source="label_render_service.render_label_template",
        template_id=int(template_id),
        template_json_present=raw_present,
        template_name=getattr(row, "name", None),
        width_mm=float(width) if width is not None else None,
        height_mm=float(height) if height is not None else None,
        detail=f"record_count={1 if isinstance(data, dict) else len(data) if isinstance(data, list) else 0}",
    )
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
    records = [sanitize_label_record_keys(r, depth=0) if isinstance(r, dict) else r for r in records]
    if records:
        logger.info("RECORD KEYS (after sanitize): %s", list(records[0].keys()) if isinstance(records[0], dict) else records[0])
    # Merge template variables into each record (caller-provided globals), then normalize bindings
    vars_dict = template_variables if isinstance(template_variables, dict) else {}
    if isinstance(vars_dict, dict) and vars_dict:
        vars_dict = sanitize_label_record_keys(vars_dict, depth=1)
    records = [_normalize_record_for_bindings({**vars_dict, **r}, elements) for r in records]
    if group_mode:
        from .label_record_grouping import (
            merge_records_by_floor_sets,
            merge_records_by_row_multi_slot,
            normalize_floor_sets_param,
        )

        fs = normalize_floor_sets_param(floor_sets)
        if fs:
            records = merge_records_by_floor_sets(list(records), fs, by_rack=bool(group_by_rack))
        else:
            records = merge_records_by_row_multi_slot(list(records), by_rack=bool(group_by_rack))
    for rec in records:
        print("FINAL RECORD:", rec)
    # One (template, record) pair per page — same engine path for CSV and other clients; never barcode_pdf_service.
    template_for_pdf = {"widthMm": width, "heightMm": height, "elements": elements}
    pairs: list[tuple[dict, dict[str, Any]]] = [(template_for_pdf, rec) for rec in records]
    logger.info(
        "render_label_template: using build_label_pdf_multi pairs=%s widthMm=%s heightMm=%s",
        len(pairs),
        width,
        height,
    )
    return build_label_pdf_multi(pairs, calibration=calibration, print_mode=print_mode)
