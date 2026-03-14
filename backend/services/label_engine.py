"""
Generic label rendering engine for WMS labels. Single template format for all PDF generation.

All rendering is VECTOR (PDF vector graphics). No rasterization of labels to PNG.
Positions and sizes use millimeters; convert to PDF points with 1 mm = 2.83465 pt.

Input: layout dict with "elements" list + width_mm, height_mm (from SavedLabelTemplate.template_json
via label_render_service.build_label_pdf). Supports: text, staticText, dynamicText, barcode,
rectangle, line, icon, group, repeater. Rotation 0-360°. Conditional styling. Recursive groups/repeater.
"""

import io
import json
import logging
import re
import xml.sax.saxutils as saxutils
from typing import Any

from reportlab.lib import colors as rl_colors
from reportlab.pdfgen import canvas
from reportlab.graphics.barcode import code128
from reportlab.pdfbase.pdfmetrics import stringWidth

from ..pdf_fonts import PDF_FONT, PDF_FONT_BOLD, register_pdf_fonts

register_pdf_fonts()

logger = logging.getLogger(__name__)

# 1 mm = 2.83465 PDF points (72 pt/inch, 25.4 mm/inch). Use for all mm -> pt conversion.
POINTS_PER_MM = 2.83465

try:
    import qrcode
    HAS_QR = True
except ImportError:
    HAS_QR = False


def _resolve(data: dict[str, Any], key: str) -> str:
    if not isinstance(data, dict):
        return ""
    key = (key or "").strip()
    if not key:
        return ""
    print("BINDING KEY:", repr(key))
    val = data.get(key)
    print("BINDING VALUE BEFORE:", repr(val))
    if val is not None:
        result = str(val)
        print("BINDING VALUE AFTER:", repr(result))
        return result
    if key.startswith("{") and key.endswith("}"):
        bare = key[1:-1].strip()
        val = data.get(bare)
        if val is not None:
            result = str(val)
            print("BINDING VALUE AFTER:", repr(result))
            return result
    print("BINDING VALUE AFTER:", repr(""))
    return ""


def _resolve_color(binding: str, data: dict[str, Any], conditions: list[dict] | None, default: str = "#000000") -> str:
    """Resolve fill/stroke color: check conditions by binding value, else use default."""
    if not conditions:
        return default
    val = _resolve(data, binding).strip()
    for cond in conditions:
        if str(cond.get("value", "")).strip() == val:
            return cond.get("color") or default
    return default


def _hex_to_rgb(hex_str: str) -> tuple[float, float, float]:
    """Convert #rrggbb or #rgb to (r, g, b) in 0-1 for ReportLab."""
    hex_str = (hex_str or "#000000").strip()
    if hex_str.startswith("#"):
        hex_str = hex_str[1:]
    if len(hex_str) == 3:
        hex_str = hex_str[0] * 2 + hex_str[1] * 2 + hex_str[2] * 2
    try:
        r = int(hex_str[0:2], 16) / 255.0
        g = int(hex_str[2:4], 16) / 255.0
        b = int(hex_str[4:6], 16) / 255.0
        return (r, g, b)
    except (ValueError, IndexError):
        return (0, 0, 0)


# Fallback order must match frontend for consistent barcode resolution.
_BARCODE_FALLBACK_KEYS = (
    "barcode_data",
    "loc_barcode",
    "location_barcode",
    "cart_barcode",
    "basket_barcode",
    "product_barcode",
    "order_barcode",
    "location_code",
)


def _resolve_barcode_value(data: dict[str, Any], binding: str) -> str:
    v = _resolve(data, binding)
    if v:
        return v
    for k in _BARCODE_FALLBACK_KEYS:
        v = _resolve(data, k)
        if v:
            return v
    return ""


def _element_bounds(el: dict) -> tuple[float, float]:
    w = float(el.get("width") or 10)
    h = float(el.get("height") or 10)
    return (max(0.5, w), max(0.5, h))


def _evaluate_condition(expression: str, record: dict[str, Any]) -> bool:
    """
    Simple condition evaluator for visibleIf. Supports: {field} == value, != value, > value, < value.
    Value can be quoted string or number. No full expression engine.
    """
    if not expression or not isinstance(expression, str):
        return True
    s = expression.strip()
    if not s:
        return True
    m = re.match(r"^\s*(\{[^}]+\}|[a-zA-Z_][a-zA-Z0-9_]*)\s*(==|!=|>|<)\s*(.+)\s*$", s, re.DOTALL)
    if not m:
        return True
    left_key_raw = (m.group(1) or "").strip()
    op = (m.group(2) or "").strip()
    right_raw = (m.group(3) or "").strip()
    key = left_key_raw.strip("{}").strip() if left_key_raw.startswith("{") else left_key_raw
    field_val = record.get(key) if key in record else record.get(f"{{{key}}}")
    str_val = str(field_val) if field_val is not None else ""
    right_val: Any = right_raw
    if (right_raw.startswith("'") and right_raw.endswith("'")) or (right_raw.startswith('"') and right_raw.endswith('"')):
        right_val = right_raw[1:-1]
    else:
        try:
            if "." in right_raw:
                right_val = float(right_raw)
            else:
                right_val = int(right_raw)
        except (ValueError, TypeError):
            right_val = right_raw
    if op == "==":
        return str_val == str(right_val)
    if op == "!=":
        return str_val != str(right_val)
    if op in (">", "<"):
        try:
            left_num = float(field_val) if field_val is not None else float("nan")
            right_num = float(right_val) if isinstance(right_val, (int, float)) else float(right_val)
            if op == ">":
                return left_num > right_num
            return left_num < right_num
        except (TypeError, ValueError):
            if op == ">":
                return str_val > str(right_val)
            return str_val < str(right_val)
    return True


def _compute_layout_items(
    elements: list[dict],
    record: dict[str, Any],
    label_width_mm: float,
    label_height_mm: float,
    x0_mm: float,
    y0_mm: float,
    out: list[dict],
) -> None:
    """Flatten template elements into layout items (same schema as frontend). Top-left origin, mm."""
    for el in elements:
        if not isinstance(el, dict) or not el.get("type"):
            continue
        visible_if = el.get("visibleIf")
        if visible_if and not _evaluate_condition(str(visible_if).strip(), record):
            continue
        el_type = (el.get("type") or "").strip().lower()
        if el_type == "group":
            nested = el.get("elements") or []
            gx = x0_mm + float(el.get("x", 0))
            gy = y0_mm + float(el.get("y", 0))
            _compute_layout_items(nested, record, label_width_mm, label_height_mm, gx, gy, out)
            continue
        if el_type == "repeater":
            dataset_key = el.get("dataset")
            if not dataset_key or (isinstance(dataset_key, str) and not dataset_key.strip()):
                logger.warning("Repeater element missing dataset property")
                continue
            dataset_key = dataset_key.strip() if isinstance(dataset_key, str) else dataset_key
            raw_dataset = record.get(dataset_key)
            items = list(raw_dataset or [])
            if not isinstance(raw_dataset, list):
                items = []
            print("REPEATER DATASET KEY:", dataset_key)
            print("RECORD DATASET:", record.get(dataset_key))
            logger.info(
                "layout repeater: record_keys=%s dataset_key=%r record[dataset_key]=%s len=%s",
                list(record.keys()),
                dataset_key,
                type(raw_dataset).__name__ if raw_dataset is not None else "missing",
                len(items),
            )
            filter_expr = (el.get("filter") or "").strip()
            if filter_expr:
                items = [i for i in items if _evaluate_condition(filter_expr, i if isinstance(i, dict) else {})]
            sort_by = (el.get("sortBy") or "").strip()
            if sort_by:

                def _repeater_sort_key(it: Any) -> tuple[int, float | str]:
                    if not isinstance(it, dict):
                        return (1, "")
                    v = it.get(sort_by) if sort_by in it else it.get(f"{{{sort_by}}}")
                    try:
                        n = float(v) if v is not None else float("nan")
                        return (0, n)
                    except (TypeError, ValueError):
                        return (1, str(v or ""))

                items.sort(key=_repeater_sort_key)

            template = el.get("template") or {}
            nested = template.get("elements") if isinstance(template, dict) else []
            layout = (el.get("layout") or "").strip().lower() or None
            use_grid = layout == "grid"
            columns = max(1, int(el.get("columns") or 1))
            direction = (el.get("direction") or "horizontal").lower()
            iw = float(el.get("itemWidth") or el.get("width") or 20)
            ih = float(el.get("itemHeight") or el.get("height") or 20)
            base_x = x0_mm + float(el.get("x", 0))
            base_y = y0_mm + float(el.get("y", 0))
            for idx, item in enumerate(items):
                item_data = item if isinstance(item, dict) else {}
                child_record = {**record, **item_data}
                if use_grid:
                    row, col = idx // columns, idx % columns
                    cx = base_x + col * iw
                    cy = base_y + row * ih
                else:
                    if direction == "vertical":
                        cx, cy = base_x, base_y + idx * ih
                    else:
                        cx, cy = base_x + idx * iw, base_y
                _compute_layout_items(nested, child_record, label_width_mm, label_height_mm, cx, cy, out)
            continue
        w_mm, h_mm = _element_bounds(el)
        x_mm = x0_mm + float(el.get("x", 0))
        y_mm = y0_mm + float(el.get("y", 0))
        x_mm = max(0, min(x_mm, label_width_mm - w_mm))
        y_mm = max(0, min(y_mm, label_height_mm - h_mm))
        raw_rot = el.get("rotation")
        if raw_rot is None:
            rotation = 0.0
        else:
            try:
                rotation = float(raw_rot)
                rotation = ((rotation % 360) + 360) % 360
            except (TypeError, ValueError):
                rotation = 0.0
        item: dict[str, Any] = {
            "id": el.get("id") or "",
            "type": "text" if el_type in ("text", "dynamictext") else "statictext" if el_type == "statictext" else el_type,
            "x_mm": x_mm,
            "y_mm": y_mm,
            "width_mm": w_mm,
            "height_mm": h_mm,
            "rotation": rotation,
            "backgroundColor": el.get("backgroundColor"),
            "borderColor": el.get("borderColor"),
            "textColor": el.get("textColor") or el.get("color") or "#000000",
        }
        if el_type in ("text", "dynamictext"):
            binding = el.get("binding") or el.get("dataBinding") or ""
            resolved_text = _resolve(record, binding) or ""
            print("TEXT ELEMENT RAW:", repr(el.get("text")), "binding:", repr(binding))
            print("TEXT ELEMENT RESOLVED:", repr(resolved_text))
            item["text"] = resolved_text
            item["fontSize"] = float(el.get("fontSize") or 10)
            item["fontFamily"] = el.get("fontFamily")
            item["bold"] = bool(el.get("bold"))
            item["align"] = (el.get("align") or "left").lower()
            item["verticalAlign"] = (el.get("verticalAlign") or el.get("vertical_text") or "middle").lower()
        elif el_type == "statictext":
            text_value = el.get("text") or ""
            print("TEXT ELEMENT RAW:", repr(text_value))
            static_placeholder_match = re.match(r"^{{?([a-zA-Z0-9_]+)}}?$", text_value.strip())
            if static_placeholder_match:
                var_name = static_placeholder_match.group(1)
                binding_key = "{" + var_name + "}"
                resolved = _resolve(record, binding_key)
                print("TEXT ELEMENT RESOLVED:", repr(resolved if resolved else text_value))
                if resolved:
                    item["text"] = resolved
                    logger.debug("Resolved staticText placeholder %s -> %s", text_value.strip(), resolved)
                else:
                    item["text"] = text_value
            else:
                item["text"] = text_value
                print("TEXT ELEMENT RESOLVED:", repr(text_value))
            item["fontSize"] = float(el.get("fontSize") or 8)
            item["fontFamily"] = el.get("fontFamily")
            item["bold"] = bool(el.get("bold"))
            item["align"] = (el.get("align") or "left").lower()
            item["verticalAlign"] = (el.get("verticalAlign") or "middle").lower()
        if el_type in ("text", "dynamictext", "statictext"):
            auto_fit = bool(el.get("autoFit"))
            scale_to_height = bool(el.get("scaleToHeight"))
            if auto_fit:
                min_font_size = max(1.0, float(el.get("minFontSize") or 6))
                font_size = float(item["fontSize"])
                font_name = PDF_FONT_BOLD if item.get("bold") else PDF_FONT
                text_val = (item.get("text") or "").strip()
                while text_val and font_size > min_font_size:
                    width_pt = stringWidth(text_val, font_name, font_size)
                    if width_pt <= w_mm * POINTS_PER_MM:
                        break
                    font_size -= 0.5
                item["fontSize"] = max(min_font_size, font_size)
            elif scale_to_height:
                item["fontSize"] = float(h_mm * 0.7)
        elif el_type == "barcode":
            binding = el.get("dataBinding") or el.get("data_binding") or el.get("binding") or "barcode_data"
            item["barcodeValue"] = _resolve_barcode_value(record, binding) or "SAMPLE"
            item["barcodeFormat"] = (el.get("format") or "Code128").lower()
            item["showValue"] = el.get("showValue", False)
            item["textPosition"] = el.get("textPosition") or "below"
        elif el_type in ("rect", "rectangle"):
            item["strokeWidth"] = float(el.get("strokeWidth") or el.get("stroke_width") or 0.5)
            item["fill"] = el.get("fill") or el.get("backgroundColor")
            conditions = el.get("conditions")
            if isinstance(conditions, list):
                for cond in conditions:
                    if not isinstance(cond, dict):
                        continue
                    expr = (cond.get("if") or "").strip()
                    if not expr:
                        continue
                    if _evaluate_condition(expr, record):
                        if cond.get("fill") is not None:
                            item["fill"] = cond["fill"]
                        if cond.get("stroke") is not None:
                            item["borderColor"] = cond["stroke"]
                        break
        elif el_type == "section":
            item["borderWidth"] = float(el.get("borderWidth") or el.get("strokeWidth") or 0.5)
        elif el_type == "line":
            item["strokeWidth"] = float(el.get("strokeWidth") or 0.5)
        elif el_type == "triangle":
            item["variant"] = (el.get("variant") or "topLeft").lower().replace(" ", "")
        elif el_type == "arrow":
            item["direction"] = (el.get("direction") or "right").lower()
        elif el_type == "polygon":
            item["points"] = el.get("points") or "0 0, 100% 0, 50% 100%"
        elif el_type == "statusicon":
            item["type"] = "icon"
            item["icon"] = (el.get("icon") or "none").lower()
        out.append(item)


def compute_layout(
    layout: dict,
    record: dict[str, Any],
    width_mm: float,
    height_mm: float,
) -> list[dict[str, Any]]:
    """Single layout engine output: flat list of layout items (mm, top-left origin)."""
    elements = layout.get("elements") if isinstance(layout, dict) else []
    if not isinstance(elements, list):
        elements = []
    out: list[dict[str, Any]] = []
    _compute_layout_items(elements, record, width_mm, height_mm, 0.0, 0.0, out)
    return out


def _apply_rotation(
    c: canvas.Canvas,
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
    rotation: float,
) -> None:
    """Apply rotation (0–360 degrees) around element center. Caller must saveState/restoreState."""
    if not rotation:
        return
    angle = float(rotation)
    cx = x_pt + w_pt / 2
    cy = y_pt + h_pt / 2
    c.translate(cx, cy)
    c.rotate(-angle)
    c.translate(-cx, -cy)


def _draw_text(
    c: canvas.Canvas,
    el: dict,
    data: dict[str, Any],
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
) -> None:
    binding = el.get("binding") or el.get("dataBinding") or ""
    val = _resolve(data, binding) or ""
    font_size = float(el.get("fontSize") or 10)
    font_name = PDF_FONT_BOLD if el.get("bold") else PDF_FONT
    r, g, b = _hex_to_rgb(el.get("textColor") or el.get("color") or "#000000")
    c.setFillColorRGB(r, g, b)
    c.setFont(font_name, font_size)
    # Clip text to element width so it never overflows
    while val and stringWidth(val, font_name, font_size) > w_pt:
        val = val[:-1]
    if not val:
        return
    # Vertical align: top / middle / bottom (position baseline inside box)
    valign = (el.get("verticalAlign") or el.get("vertical_text") or "middle").lower()
    if valign == "top":
        y_baseline = y_pt + font_size * 0.35
    elif valign == "bottom":
        y_baseline = y_pt + h_pt - font_size * 0.5
    else:
        y_baseline = y_pt + h_pt / 2 - font_size * 0.3
    # Horizontal align
    align = (el.get("align") or "left").lower()
    center_x = x_pt + w_pt / 2
    right_x = x_pt + w_pt
    print("TEXT DRAW INPUT:", repr(val))
    if align == "center":
        c.drawCentredString(center_x, y_baseline, val)
    elif align == "right":
        c.drawRightString(right_x, y_baseline, val)
    else:
        c.drawString(x_pt, y_baseline, val)


def _draw_barcode(
    c: canvas.Canvas,
    el: dict,
    data: dict[str, Any],
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
) -> None:
    """Draw barcode as vector. Dimensions from element (w_pt, h_pt). No displayValue, margin 0."""
    binding = el.get("binding") or el.get("dataBinding") or "barcode_data"
    val = _resolve(data, binding)
    if not (val or "").strip():
        return
    val = (val or "").strip()
    fmt = (el.get("format") or "Code128").lower()
    try:
        if fmt == "qr" and HAS_QR:
            # QR: bitmap (no standard vector QR in ReportLab); border=0, minimal margin
            qr = qrcode.QRCode(version=1, box_size=4, border=0)
            qr.add_data(val)
            qr.make(fit=True)
            img = qr.make_image(fill_color="black", back_color="white")
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            buf.seek(0)
            c.drawImage(buf, x_pt, y_pt, width=w_pt, height=h_pt)
        else:
            # Code128: scale so barcode exactly fills element width and height; draw at (x_pt, y_pt).
            bc = code128.Code128(val, displayValue=False)
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
        logger.warning("Barcode render failed %r: %s", val[:20], e)


def _draw_rectangle(
    c: canvas.Canvas,
    el: dict,
    data: dict[str, Any],
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
) -> None:
    conditions = el.get("conditions")
    binding = el.get("binding") or el.get("dataBinding") or ""
    if conditions:
        fill = _resolve_color(binding, data, conditions, el.get("backgroundColor") or el.get("color") or "#e5e7eb")
    else:
        fill = el.get("backgroundColor") or el.get("color") or el.get("fill") or "#e5e7eb"
    stroke = el.get("borderColor") or el.get("stroke") or "#374151"
    stroke_width = max(0.5, float(el.get("strokeWidth") or el.get("stroke_width") or 0.5) * POINTS_PER_MM)
    r_f, g_f, b_f = _hex_to_rgb(fill)
    r_s, g_s, b_s = _hex_to_rgb(stroke)
    if fill:
        c.setFillColorRGB(r_f, g_f, b_f)
        c.rect(x_pt, y_pt, w_pt, h_pt, fill=1, stroke=0)
    c.setStrokeColorRGB(r_s, g_s, b_s)
    c.setLineWidth(stroke_width)
    c.rect(x_pt, y_pt, w_pt, h_pt, fill=0, stroke=1)


def _draw_section(
    c: canvas.Canvas,
    el: dict,
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
) -> None:
    """Draw section block: backgroundColor fill, borderColor border, borderWidth."""
    fill = el.get("backgroundColor") or el.get("color") or el.get("fill") or "#e5e7eb"
    stroke = el.get("borderColor") or el.get("stroke") or el.get("textColor") or "#374151"
    stroke_width = max(0, float(el.get("borderWidth") or el.get("strokeWidth") or 0.5) * POINTS_PER_MM)
    r_f, g_f, b_f = _hex_to_rgb(fill)
    r_s, g_s, b_s = _hex_to_rgb(stroke)
    if fill:
        c.setFillColorRGB(r_f, g_f, b_f)
        c.rect(x_pt, y_pt, w_pt, h_pt, fill=1, stroke=0)
    if stroke_width > 0:
        c.setStrokeColorRGB(r_s, g_s, b_s)
        c.setLineWidth(stroke_width)
        c.rect(x_pt, y_pt, w_pt, h_pt, fill=0, stroke=1)


def _draw_line(
    c: canvas.Canvas,
    el: dict,
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
) -> None:
    color = el.get("color") or el.get("stroke") or "#000000"
    stroke_width = max(0.5, float(el.get("strokeWidth") or 0.5) * POINTS_PER_MM)
    try:
        c.setStrokeColor(rl_colors.HexColor(color))
    except Exception:
        c.setStrokeColor(rl_colors.black)
    c.setLineWidth(stroke_width)
    c.line(x_pt, y_pt, x_pt + w_pt, y_pt + h_pt)


def _draw_icon(
    c: canvas.Canvas,
    el: dict,
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
) -> None:
    """Draw a simple icon (arrow_up, arrow_down, etc.) as path."""
    name = (el.get("icon") or el.get("name") or "arrow_up").lower()
    color = el.get("color") or "#000000"
    try:
        c.setStrokeColor(rl_colors.HexColor(color))
        c.setFillColor(rl_colors.HexColor(color))
    except Exception:
        c.setStrokeColor(rl_colors.black)
        c.setFillColor(rl_colors.black)
    c.setLineWidth(max(1, w_pt * 0.1))
    cx, cy = x_pt + w_pt / 2, y_pt + h_pt / 2
    r = min(w_pt, h_pt) / 2 - 2
    if "arrow_up" in name or name == "up":
        p = c.beginPath()
        p.moveTo(cx, cy + r)
        p.lineTo(cx - r * 0.7, cy - r * 0.5)
        p.lineTo(cx, cy - r * 0.2)
        p.lineTo(cx + r * 0.7, cy - r * 0.5)
        p.close()
        c.drawPath(p, fill=1, stroke=1)
    elif "arrow_down" in name or name == "down":
        p = c.beginPath()
        p.moveTo(cx, cy - r)
        p.lineTo(cx - r * 0.7, cy + r * 0.5)
        p.lineTo(cx, cy + r * 0.2)
        p.lineTo(cx + r * 0.7, cy + r * 0.5)
        p.close()
        c.drawPath(p, fill=1, stroke=1)
    elif "arrow_left" in name or name == "left":
        p = c.beginPath()
        p.moveTo(cx - r, cy)
        p.lineTo(cx + r * 0.5, cy - r * 0.7)
        p.lineTo(cx + r * 0.2, cy)
        p.lineTo(cx + r * 0.5, cy + r * 0.7)
        p.close()
        c.drawPath(p, fill=1, stroke=1)
    elif "arrow_right" in name or name == "right":
        p = c.beginPath()
        p.moveTo(cx + r, cy)
        p.lineTo(cx - r * 0.5, cy - r * 0.7)
        p.lineTo(cx - r * 0.2, cy)
        p.lineTo(cx - r * 0.5, cy + r * 0.7)
        p.close()
        c.drawPath(p, fill=1, stroke=1)
    else:
        c.rect(x_pt + 2, y_pt + 2, w_pt - 4, h_pt - 4, fill=0, stroke=1)


def _element_bounds_mm(el: dict, default_w: float = 10, default_h: float = 5) -> tuple[float, float]:
    """Return (width_mm, height_mm) for an element."""
    w = float(el.get("width") or default_w)
    h = float(el.get("height") or default_h)
    return (w, h)


def render_elements(
    c: canvas.Canvas,
    elements: list[dict],
    data: dict[str, Any],
    ctx: dict[str, Any],
) -> None:
    """
    Recursively render layout elements.
    ctx: label_width_mm, label_height_mm, offset_x_pt, offset_y_pt, x0_mm, y0_mm (current origin in mm).
    """
    if not elements:
        return
    label_w_mm = float(ctx.get("label_width_mm", 100))
    label_h_mm = float(ctx.get("label_height_mm", 60))
    offset_x_pt = float(ctx.get("offset_x_pt", 0))
    offset_y_pt = float(ctx.get("offset_y_pt", 0))
    x0_mm = float(ctx.get("x0_mm", 0))
    y0_mm = float(ctx.get("y0_mm", 0))

    for el in elements:
        if not isinstance(el, dict):
            continue
        el_type = (el.get("type") or el.get("elementType") or "").strip().lower()
        if not el_type:
            continue
        x_mm = x0_mm + float(el.get("x", 0))
        y_design_mm = y0_mm + float(el.get("y", 0))
        w_mm, h_mm = _element_bounds_mm(el)
        # Design top-left -> PDF bottom-left
        y_mm = label_h_mm - y_design_mm - h_mm
        x_pt = x_mm * POINTS_PER_MM + offset_x_pt
        y_pt = y_mm * POINTS_PER_MM + offset_y_pt
        w_pt = w_mm * POINTS_PER_MM
        h_pt = h_mm * POINTS_PER_MM
        raw_rot = el.get("rotation")
        if raw_rot is None:
            rotation = 0.0
        else:
            try:
                rotation = float(raw_rot)
                rotation = ((rotation % 360) + 360) % 360
            except (TypeError, ValueError):
                rotation = 0.0

        if el_type in ("text", "dynamictext"):
            c.saveState()
            if rotation:
                _apply_rotation(c, x_pt, y_pt, w_pt, h_pt, rotation)
            _draw_text(c, el, data, x_pt, y_pt, w_pt, h_pt)
            c.restoreState()

        elif el_type == "statictext":
            c.saveState()
            if rotation:
                _apply_rotation(c, x_pt, y_pt, w_pt, h_pt, rotation)
            val = el.get("text") or ""
            font_size = float(el.get("fontSize") or 10)
            font_name = PDF_FONT_BOLD if el.get("bold") else PDF_FONT
            r, g, b = _hex_to_rgb(el.get("textColor") or el.get("color") or "#000000")
            c.setFillColorRGB(r, g, b)
            c.setFont(font_name, font_size)
            while val and stringWidth(val, font_name, font_size) > w_pt:
                val = val[:-1]
            valign = (el.get("verticalAlign") or "middle").lower()
            if valign == "top":
                y_baseline = y_pt + font_size * 0.35
            elif valign == "bottom":
                y_baseline = y_pt + h_pt - font_size * 0.5
            else:
                y_baseline = y_pt + h_pt / 2 - font_size * 0.3
            align = (el.get("align") or "left").lower()
            center_x = x_pt + w_pt / 2
            right_x = x_pt + w_pt
            print("TEXT DRAW INPUT:", repr(val))
            if align == "center":
                c.drawCentredString(center_x, y_baseline, val)
            elif align == "right":
                c.drawRightString(right_x, y_baseline, val)
            else:
                c.drawString(x_pt, y_baseline, val)
            c.restoreState()

        elif el_type == "barcode":
            c.saveState()
            if rotation:
                _apply_rotation(c, x_pt, y_pt, w_pt, h_pt, rotation)
            _draw_barcode(c, el, data, x_pt, y_pt, w_pt, h_pt)
            c.restoreState()

        elif el_type in ("rect", "rectangle"):
            c.saveState()
            if rotation:
                _apply_rotation(c, x_pt, y_pt, w_pt, h_pt, rotation)
            _draw_rectangle(c, el, data, x_pt, y_pt, w_pt, h_pt)
            c.restoreState()

        elif el_type == "section":
            c.saveState()
            if rotation:
                _apply_rotation(c, x_pt, y_pt, w_pt, h_pt, rotation)
            _draw_section(c, el, x_pt, y_pt, w_pt, h_pt)
            c.restoreState()

        elif el_type == "line":
            c.saveState()
            if rotation:
                _apply_rotation(c, x_pt, y_pt, w_pt, h_pt, rotation)
            _draw_line(c, el, x_pt, y_pt, w_pt, h_pt)
            c.restoreState()

        elif el_type == "icon":
            c.saveState()
            if rotation:
                _apply_rotation(c, x_pt, y_pt, w_pt, h_pt, rotation)
            _draw_icon(c, el, x_pt, y_pt, w_pt, h_pt)
            c.restoreState()

        elif el_type == "group":
            nested = el.get("elements") or []
            if nested:
                render_elements(c, nested, data, {**ctx, "x0_mm": x_mm, "y0_mm": y_design_mm})

        elif el_type == "repeater":
            dataset_key = el.get("dataset")
            if not dataset_key or (isinstance(dataset_key, str) and not dataset_key.strip()):
                logger.warning("Repeater element missing dataset property")
                continue
            dataset_key = dataset_key.strip() if isinstance(dataset_key, str) else dataset_key
            items = data.get(dataset_key)
            if not isinstance(items, list):
                items = []
            template = el.get("template") or {}
            nested = template.get("elements") if isinstance(template, dict) else []
            direction = (el.get("direction") or "horizontal").lower()
            item_w_mm = float(el.get("itemWidth") or el.get("width") or 20)
            item_h_mm = float(el.get("itemHeight") or el.get("height") or 10)
            cur_x_mm = x_mm
            cur_y_mm = y_design_mm
            for item in items:
                item_data = item if isinstance(item, dict) else {}
                sub_ctx = {**ctx, "x0_mm": cur_x_mm, "y0_mm": cur_y_mm}
                render_elements(c, nested, item_data, sub_ctx)
                if direction == "vertical":
                    cur_y_mm += item_h_mm
                else:
                    cur_x_mm += item_w_mm

        # Debug: draw element bounding boxes for visual comparison with designer
        if ctx.get("debug_draw_bounds") and el_type not in ("group", "repeater"):
            c.saveState()
            if rotation:
                _apply_rotation(c, x_pt, y_pt, w_pt, h_pt, rotation)
            c.setStrokeColorRGB(1, 0, 0)
            c.setLineWidth(0.5)
            c.rect(x_pt, y_pt, w_pt, h_pt, fill=0, stroke=1)
            c.restoreState()


def _mm_to_pdf_pt(
    x_mm: float,
    y_mm: float,
    w_mm: float,
    h_mm: float,
    label_height_mm: float,
    offset_x_pt: float,
    offset_y_pt: float,
) -> tuple[float, float, float, float]:
    """Convert layout item (mm, top-left) to PDF points (bottom-left origin)."""
    x_pt = x_mm * POINTS_PER_MM + offset_x_pt
    y_bottom_up_mm = label_height_mm - y_mm - h_mm
    y_pt = y_bottom_up_mm * POINTS_PER_MM + offset_y_pt
    w_pt = w_mm * POINTS_PER_MM
    h_pt = h_mm * POINTS_PER_MM
    return (x_pt, y_pt, w_pt, h_pt)


def _draw_layout_item(
    c: canvas.Canvas,
    item: dict[str, Any],
    width_mm: float,
    height_mm: float,
    offset_x_pt: float,
    offset_y_pt: float,
) -> None:
    """Draw one layout item (from compute_layout)."""
    x_pt, y_pt, w_pt, h_pt = _mm_to_pdf_pt(
        item["x_mm"], item["y_mm"], item["width_mm"], item["height_mm"],
        height_mm, offset_x_pt, offset_y_pt,
    )
    typ = (item.get("type") or "").lower()
    raw_rot = item.get("rotation")
    if raw_rot is None:
        rotation = 0.0
    else:
        try:
            rotation = float(raw_rot)
            rotation = ((rotation % 360) + 360) % 360
        except (TypeError, ValueError):
            rotation = 0.0
    # Build el-like dict for existing _draw_* helpers
    el = {
        "binding": item.get("binding"),
        "dataBinding": item.get("dataBinding"),
        "text": item.get("text"),
        "fontSize": item.get("fontSize"),
        "bold": item.get("bold"),
        "align": item.get("align"),
        "verticalAlign": item.get("verticalAlign"),
        "textColor": item.get("textColor"),
        "backgroundColor": item.get("backgroundColor"),
        "borderColor": item.get("borderColor"),
        "strokeWidth": item.get("strokeWidth"),
        "borderWidth": item.get("borderWidth"),
        "fill": item.get("fill"),
    }
    data: dict[str, Any] = {}
    if "text" in item:
        data["_resolved_text"] = item["text"]
    if "barcodeValue" in item:
        data["barcode_data"] = item["barcodeValue"]

    c.saveState()
    if rotation:
        _apply_rotation(c, x_pt, y_pt, w_pt, h_pt, rotation)

    if typ == "text" or typ == "dynamictext":
        el["dataBinding"] = "_resolved_text"
        _draw_text(c, el, data, x_pt, y_pt, w_pt, h_pt)
    elif typ == "statictext":
        _draw_static_text_layout(c, item, x_pt, y_pt, w_pt, h_pt)
    elif typ == "barcode":
        _draw_barcode_layout(c, item, x_pt, y_pt, w_pt, h_pt)
    elif typ in ("rect", "rectangle"):
        _draw_rectangle(c, el, data, x_pt, y_pt, w_pt, h_pt)
    elif typ == "section":
        _draw_section(c, el, x_pt, y_pt, w_pt, h_pt)
    elif typ == "line":
        _draw_line(c, el, x_pt, y_pt, w_pt, h_pt)
    elif typ == "icon":
        el["icon"] = item.get("icon") or "arrow_up"
        el["color"] = item.get("textColor") or item.get("borderColor") or "#000000"
        _draw_icon(c, el, x_pt, y_pt, w_pt, h_pt)
    elif typ == "triangle":
        _draw_triangle_layout(c, item, x_pt, y_pt, w_pt, h_pt)
    elif typ == "arrow":
        _draw_arrow_layout(c, item, x_pt, y_pt, w_pt, h_pt)
    elif typ == "polygon":
        _draw_polygon_layout(c, item, x_pt, y_pt, w_pt, h_pt)
    c.restoreState()


def _draw_static_text_layout(
    c: canvas.Canvas,
    item: dict,
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
) -> None:
    val = item.get("text") or ""
    font_size = float(item.get("fontSize") or 10)
    font_name = PDF_FONT_BOLD if item.get("bold") else PDF_FONT
    r, g, b = _hex_to_rgb(item.get("textColor") or "#000000")
    c.setFillColorRGB(r, g, b)
    c.setFont(font_name, font_size)
    while val and stringWidth(val, font_name, font_size) > w_pt:
        val = val[:-1]
    if not val:
        return
    valign = (item.get("verticalAlign") or "middle").lower()
    if valign == "top":
        y_baseline = y_pt + font_size * 0.35
    elif valign == "bottom":
        y_baseline = y_pt + h_pt - font_size * 0.5
    else:
        y_baseline = y_pt + h_pt / 2 - font_size * 0.3
    align = (item.get("align") or "left").lower()
    print("TEXT DRAW INPUT:", repr(val))
    if align == "center":
        c.drawCentredString(x_pt + w_pt / 2, y_baseline, val)
    elif align == "right":
        c.drawRightString(x_pt + w_pt, y_baseline, val)
    else:
        c.drawString(x_pt, y_baseline, val)


def _draw_barcode_layout(
    c: canvas.Canvas,
    item: dict,
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
) -> None:
    """Draw barcode as vector. Dimensions from layout item (element width/height in pt). No displayValue, margin 0."""
    val = (item.get("barcodeValue") or "").strip()
    if not val:
        return
    fmt = (item.get("barcodeFormat") or "code128").lower()
    try:
        if fmt == "qr" and HAS_QR:
            qr = qrcode.QRCode(version=1, box_size=4, border=0)
            qr.add_data(val)
            qr.make(fit=True)
            img = qr.make_image(fill_color="black", back_color="white")
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            buf.seek(0)
            c.drawImage(buf, x_pt, y_pt, width=w_pt, height=h_pt)
        else:
            bc = code128.Code128(val, displayValue=False)
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
        logger.warning("Barcode render failed %r: %s", val[:20], e)


def _draw_triangle_layout(
    c: canvas.Canvas,
    item: dict,
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
) -> None:
    """Draw triangle inside element box. PDF coords: y_pt is bottom, y_pt+h_pt is top."""
    variant = (item.get("variant") or "topleft").lower().replace(" ", "")
    fill = item.get("backgroundColor") or item.get("textColor") or "#e5e7eb"
    stroke = item.get("borderColor") or item.get("textColor") or "#374151"
    r_f, g_f, b_f = _hex_to_rgb(fill)
    r_s, g_s, b_s = _hex_to_rgb(stroke)
    c.setFillColorRGB(r_f, g_f, b_f)
    c.setStrokeColorRGB(r_s, g_s, b_s)
    c.setLineWidth(max(0.5, float(item.get("strokeWidth") or 0.5) * POINTS_PER_MM))
    # Box: left x_pt, right x_pt+w_pt, bottom y_pt, top y_pt+h_pt
    left, right = x_pt, x_pt + w_pt
    bottom, top = y_pt, y_pt + h_pt
    p = c.beginPath()
    if variant == "topleft":
        p.moveTo(left, top)
        p.lineTo(right, top)
        p.lineTo(left, bottom)
    elif variant == "topright":
        p.moveTo(left, top)
        p.lineTo(right, top)
        p.lineTo(right, bottom)
    elif variant == "bottomleft":
        p.moveTo(left, top)
        p.lineTo(left, bottom)
        p.lineTo(right, bottom)
    elif variant == "bottomright":
        p.moveTo(right, top)
        p.lineTo(left, bottom)
        p.lineTo(right, bottom)
    else:
        p.moveTo(left, top)
        p.lineTo(right, top)
        p.lineTo(left, bottom)
    p.close()
    c.drawPath(p, fill=1, stroke=1)


def _draw_arrow_layout(
    c: canvas.Canvas,
    item: dict,
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
) -> None:
    """Draw arrow: line stem + filled triangle head. Direction up/down/left/right."""
    direction = (item.get("direction") or "right").lower()
    stroke = item.get("borderColor") or item.get("textColor") or "#000000"
    fill = item.get("backgroundColor") or item.get("textColor") or stroke
    r_f, g_f, b_f = _hex_to_rgb(fill)
    r_s, g_s, b_s = _hex_to_rgb(stroke)
    c.setFillColorRGB(r_f, g_f, b_f)
    c.setStrokeColorRGB(r_s, g_s, b_s)
    c.setLineWidth(max(0.5, float(item.get("strokeWidth") or 1) * POINTS_PER_MM))
    cx = x_pt + w_pt / 2
    cy = y_pt + h_pt / 2
    head = min(w_pt, h_pt) * 0.4
    if direction == "right":
        c.line(x_pt, cy, x_pt + w_pt - head, cy)
        p = c.beginPath()
        p.moveTo(x_pt + w_pt, cy)
        p.lineTo(x_pt + w_pt - head, cy - head * 0.7)
        p.lineTo(x_pt + w_pt - head, cy + head * 0.7)
        p.close()
        c.drawPath(p, fill=1, stroke=1)
    elif direction == "left":
        c.line(x_pt + head, cy, x_pt + w_pt, cy)
        p = c.beginPath()
        p.moveTo(x_pt, cy)
        p.lineTo(x_pt + head, cy - head * 0.7)
        p.lineTo(x_pt + head, cy + head * 0.7)
        p.close()
        c.drawPath(p, fill=1, stroke=1)
    elif direction == "up":
        c.line(cx, y_pt + head, cx, y_pt + h_pt - head)
        p = c.beginPath()
        p.moveTo(cx, y_pt + h_pt)
        p.lineTo(cx - head * 0.7, y_pt + h_pt - head)
        p.lineTo(cx + head * 0.7, y_pt + h_pt - head)
        p.close()
        c.drawPath(p, fill=1, stroke=1)
    else:
        c.line(cx, y_pt + h_pt - head, cx, y_pt + head)
        p = c.beginPath()
        p.moveTo(cx, y_pt)
        p.lineTo(cx - head * 0.7, y_pt + head)
        p.lineTo(cx + head * 0.7, y_pt + head)
        p.close()
        c.drawPath(p, fill=1, stroke=1)


def _draw_polygon_layout(
    c: canvas.Canvas,
    item: dict,
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
) -> None:
    """Draw polygon from points string. Points in % or 0-1, origin top-left; convert to PDF (y up)."""
    points_str = item.get("points") or "0 0, 100% 0, 50% 100%"
    fill = item.get("backgroundColor") or item.get("textColor") or "#e5e7eb"
    stroke = item.get("borderColor") or item.get("textColor") or "#374151"
    r_f, g_f, b_f = _hex_to_rgb(fill)
    r_s, g_s, b_s = _hex_to_rgb(stroke)
    c.setFillColorRGB(r_f, g_f, b_f)
    c.setStrokeColorRGB(r_s, g_s, b_s)
    c.setLineWidth(max(0.5, float(item.get("strokeWidth") or 0.5) * POINTS_PER_MM))
    # Parse points: designer uses top-left origin; PDF box has bottom y_pt, top y_pt+h_pt
    # So point (px, py) with py=0 at top -> PDF y = y_pt + h_pt - py
    coords: list[tuple[float, float]] = []
    for part in points_str.split(","):
        part = part.strip()
        if not part:
            continue
        tokens = part.split()
        if len(tokens) < 2:
            continue
        xs, ys = tokens[0], tokens[1]
        if "%" in xs:
            px = (float(xs.replace("%", "").strip()) / 100.0) * w_pt
        else:
            px = float(xs) if "." in xs or xs.replace(".", "").replace("-", "").isdigit() else 0
            if 0 <= px <= 1:
                px *= w_pt
        if "%" in ys:
            py = (float(ys.replace("%", "").strip()) / 100.0) * h_pt
        else:
            py = float(ys) if "." in ys or ys.replace(".", "").replace("-", "").isdigit() else 0
            if 0 <= py <= 1:
                py *= h_pt
        coords.append((x_pt + px, y_pt + h_pt - py))
    if len(coords) < 2:
        return
    p = c.beginPath()
    p.moveTo(coords[0][0], coords[0][1])
    for i in range(1, len(coords)):
        p.lineTo(coords[i][0], coords[i][1])
    p.close()
    c.drawPath(p, fill=1, stroke=1)


def render_layout_items_to_canvas(
    c: canvas.Canvas,
    layout_items: list[dict[str, Any]],
    width_mm: float,
    height_mm: float,
    offset_x_pt: float = 0,
    offset_y_pt: float = 0,
) -> None:
    """Draw precomputed layout items (from compute_layout). Same output as render_elements."""
    for item in layout_items:
        _draw_layout_item(c, item, width_mm, height_mm, offset_x_pt, offset_y_pt)


def render_label_to_canvas_engine(
    c: canvas.Canvas,
    layout: dict,
    record: dict[str, Any],
    width_mm: float,
    height_mm: float,
    offset_x_pt: float = 0,
    offset_y_pt: float = 0,
    debug_draw_bounds: bool = False,
) -> None:
    """
    Draw one label using the generic engine.
    Uses single layout engine: compute_layout -> render_layout_items_to_canvas.
    """
    layout_items = compute_layout(layout, record, width_mm, height_mm)
    print("LAYOUT ITEMS COUNT:", len(layout_items))
    render_layout_items_to_canvas(c, layout_items, width_mm, height_mm, offset_x_pt, offset_y_pt)


def build_label_pdf_engine(
    layout_json: str | dict,
    width_mm: float,
    height_mm: float,
    records: list[dict[str, Any]],
    debug_draw_bounds: bool = False,
    calibration: dict | None = None,
) -> bytes:
    """
    Build PDF using the generic engine. One page per record.
    Accepts layout_json with elements (text, barcode, rectangle, line, icon, group, repeater).
    calibration: optional dict with offset_x_mm, offset_y_mm, scale (applied only during export).
    """
    if isinstance(layout_json, str):
        try:
            layout = json.loads(layout_json) if layout_json.strip() else {}
        except json.JSONDecodeError:
            layout = {}
    else:
        layout = layout_json if isinstance(layout_json, dict) else {}
    if not layout.get("elements"):
        layout = {"elements": []}

    import io
    from reportlab.pdfgen import canvas

    w_pt = width_mm * POINTS_PER_MM
    h_pt = height_mm * POINTS_PER_MM
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(w_pt, h_pt))

    ox_mm = 0.0 if not calibration else float(calibration.get("offset_x_mm") or 0)
    oy_mm = 0.0 if not calibration else float(calibration.get("offset_y_mm") or 0)
    scale = 1.0 if not calibration else float(calibration.get("scale") or 1.0)
    offset_x_pt = ox_mm * POINTS_PER_MM
    offset_y_pt = oy_mm * POINTS_PER_MM

    for i, record in enumerate(records):
        if i > 0:
            c.showPage()
            c.setPageSize((w_pt, h_pt))
        c.saveState()
        c.translate(offset_x_pt, offset_y_pt)
        c.scale(scale, scale)
        render_label_to_canvas_engine(c, layout, record, width_mm, height_mm, 0.0, 0.0, debug_draw_bounds)
        c.restoreState()
    c.save()
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# SVG rendering (same layout as PDF for designer preview)
# ---------------------------------------------------------------------------

def _svg_escape(s: str) -> str:
    return saxutils.escape(s or "", {"'": "&#39;"})


def _render_elements_svg(
    elements: list[dict],
    data: dict[str, Any],
    ctx: dict[str, Any],
    out: list[str],
) -> None:
    """Append SVG fragments for each element. ctx: label_width_mm, label_height_mm, x0_mm, y0_mm (design coords, top-left origin)."""
    if not elements:
        return
    label_w_mm = float(ctx.get("label_width_mm", 100))
    label_h_mm = float(ctx.get("label_height_mm", 60))
    x0_mm = float(ctx.get("x0_mm", 0))
    y0_mm = float(ctx.get("y0_mm", 0))

    for el in elements:
        if not isinstance(el, dict):
            continue
        el_type = (el.get("type") or el.get("elementType") or "").strip().lower()
        if not el_type:
            continue
        x_mm = x0_mm + float(el.get("x", 0))
        y_mm = y0_mm + float(el.get("y", 0))
        w_mm, h_mm = _element_bounds_mm(el)
        raw_rot = el.get("rotation")
        if raw_rot is None:
            rotation = 0.0
        else:
            try:
                rotation = float(raw_rot)
                rotation = ((rotation % 360) + 360) % 360
            except (TypeError, ValueError):
                rotation = 0.0

        def wrap_transform(frag: str) -> str:
            if not rotation:
                return frag
            cx, cy = x_mm + w_mm / 2, y_mm + h_mm / 2
            return f'<g transform="translate({cx:.2f},{cy:.2f}) rotate({-rotation}) translate({-cx:.2f},{-cy:.2f})">{frag}</g>'

        if el_type in ("text", "dynamictext"):
            binding = el.get("binding") or el.get("dataBinding") or ""
            val = _resolve(data, binding) or ""
            font_size = float(el.get("fontSize") or 10)
            bold = el.get("bold") or False
            color = (el.get("color") or el.get("textColor") or "#000000").strip()
            if not color.startswith("#"):
                color = "#000000"
            align = (el.get("align") or "left").lower()
            text_anchor = "middle" if align == "center" else "end" if align == "right" else "start"
            tx = x_mm + w_mm / 2 if align == "center" else (x_mm + w_mm if align == "right" else x_mm)
            # Match PDF: baseline from top of box = h_mm/2 + font_size*0.3 (PDF uses bottom-up)
            y_baseline = y_mm + h_mm / 2 + font_size * 0.3
            frag = (
                f'<text x="{tx:.2f}" y="{y_baseline:.2f}" font-family="DejaVu Sans, sans-serif" font-size="{font_size}" '
                f'font-weight="{"bold" if bold else "normal"}" fill="{_svg_escape(color)}" text-anchor="{text_anchor}" dominant-baseline="alphabetic">{_svg_escape(val)}</text>'
            )
            out.append(wrap_transform(frag))

        elif el_type == "statictext":
            val = el.get("text") or ""
            font_size = float(el.get("fontSize") or 10)
            bold = el.get("bold") or False
            try:
                color = (el.get("color") or el.get("textColor") or "#000000").strip()
                if not color.startswith("#"):
                    color = "#000000"
            except Exception:
                color = "#000000"
            align = (el.get("align") or "left").lower()
            text_anchor = "middle" if align == "center" else "end" if align == "right" else "start"
            tx = x_mm + w_mm / 2 if align == "center" else (x_mm + w_mm if align == "right" else x_mm)
            y_baseline = y_mm + h_mm / 2 + font_size * 0.3
            frag = (
                f'<text x="{tx:.2f}" y="{y_baseline:.2f}" font-family="DejaVu Sans, sans-serif" font-size="{font_size}" '
                f'font-weight="{"bold" if bold else "normal"}" fill="{_svg_escape(color)}" text-anchor="{text_anchor}" dominant-baseline="alphabetic">{_svg_escape(val)}</text>'
            )
            out.append(wrap_transform(frag))

        elif el_type == "barcode":
            val = _resolve(data, el.get("binding") or el.get("dataBinding") or "barcode_data") or ""
            val = (val or "").strip() or "?"
            fill = "#ffffff"
            stroke = "#000000"
            frag = f'<rect x="{x_mm:.2f}" y="{y_mm:.2f}" width="{w_mm:.2f}" height="{h_mm:.2f}" fill="{fill}" stroke="{stroke}" stroke-width="0.5"/>'
            out.append(wrap_transform(frag))
            out.append(wrap_transform(
                f'<text x="{x_mm + w_mm/2:.2f}" y="{y_mm + h_mm/2:.2f}" font-family="DejaVu Sans, sans-serif" font-size="6" fill="#000" text-anchor="middle" dominant-baseline="middle">{_svg_escape(val[:30])}</text>'
            ))

        elif el_type in ("rect", "rectangle"):
            fill = el.get("color") or el.get("fill") or "#e5e7eb"
            stroke = el.get("stroke") or "#374151"
            sw = max(0.5, float(el.get("strokeWidth") or el.get("stroke_width") or 0.5))
            frag = f'<rect x="{x_mm:.2f}" y="{y_mm:.2f}" width="{w_mm:.2f}" height="{h_mm:.2f}" fill="{_svg_escape(fill)}" stroke="{_svg_escape(stroke)}" stroke-width="{sw:.2f}"/>'
            out.append(wrap_transform(frag))

        elif el_type == "section":
            fill = el.get("backgroundColor") or el.get("color") or el.get("fill") or "#e5e7eb"
            stroke = el.get("borderColor") or el.get("stroke") or el.get("textColor") or "#374151"
            sw = max(0, float(el.get("borderWidth") or el.get("strokeWidth") or 0.5))
            frag = f'<rect x="{x_mm:.2f}" y="{y_mm:.2f}" width="{w_mm:.2f}" height="{h_mm:.2f}" fill="{_svg_escape(fill)}" stroke="{_svg_escape(stroke)}" stroke-width="{sw:.2f}"/>'
            out.append(wrap_transform(frag))

        elif el_type == "line":
            color = el.get("color") or el.get("stroke") or "#000000"
            sw = max(0.5, float(el.get("strokeWidth") or 0.5))
            x2 = x_mm + w_mm
            y2 = y_mm + h_mm / 2
            y1 = y_mm + h_mm / 2
            frag = f'<line x1="{x_mm:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" stroke="{_svg_escape(color)}" stroke-width="{sw:.2f}"/>'
            out.append(wrap_transform(frag))

        elif el_type == "icon":
            color = el.get("color") or "#000000"
            cx, cy = x_mm + w_mm / 2, y_mm + h_mm / 2
            r = min(w_mm, h_mm) / 2 - 0.5
            frag = f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r:.2f}" fill="none" stroke="{_svg_escape(color)}" stroke-width="0.5"/>'
            out.append(wrap_transform(frag))

        elif el_type == "group":
            nested = el.get("elements") or []
            if nested:
                _render_elements_svg(nested, data, {**ctx, "x0_mm": x_mm, "y0_mm": y_mm}, out)

        elif el_type == "repeater":
            dataset_key = el.get("dataset")
            if not dataset_key or (isinstance(dataset_key, str) and not dataset_key.strip()):
                logger.warning("Repeater element missing dataset property")
                continue
            dataset_key = dataset_key.strip() if isinstance(dataset_key, str) else dataset_key
            items = data.get(dataset_key)
            if not isinstance(items, list):
                items = []
            template = el.get("template") or {}
            nested = template.get("elements") if isinstance(template, dict) else []
            direction = (el.get("direction") or "horizontal").lower()
            item_w_mm = float(el.get("itemWidth") or el.get("width") or 20)
            item_h_mm = float(el.get("itemHeight") or el.get("height") or 10)
            cur_x_mm, cur_y_mm = x_mm, y_mm
            for item in items:
                item_data = item if isinstance(item, dict) else {}
                _render_elements_svg(nested, item_data, {**ctx, "x0_mm": cur_x_mm, "y0_mm": cur_y_mm}, out)
                if direction == "vertical":
                    cur_y_mm += item_h_mm
                else:
                    cur_x_mm += item_w_mm


def _render_layout_item_svg(item: dict[str, Any], out: list[str]) -> None:
    """Append SVG for one layout item (top-left mm, same as viewBox)."""
    x_mm = item["x_mm"]
    y_mm = item["y_mm"]
    w_mm = item["width_mm"]
    h_mm = item["height_mm"]
    raw_rot = item.get("rotation")
    if raw_rot is None:
        rotation = 0.0
    else:
        try:
            rotation = float(raw_rot)
            rotation = ((rotation % 360) + 360) % 360
        except (TypeError, ValueError):
            rotation = 0.0

    def wrap_transform(frag: str) -> str:
        if not rotation:
            return frag
        cx, cy = x_mm + w_mm / 2, y_mm + h_mm / 2
        return f'<g transform="translate({cx:.2f},{cy:.2f}) rotate({-rotation}) translate({-cx:.2f},{-cy:.2f})">{frag}</g>'

    typ = (item.get("type") or "").lower()
    color = (item.get("textColor") or "#000000").strip()
    if not color.startswith("#"):
        color = "#000000"

    if typ in ("text", "dynamictext", "statictext"):
        val = item.get("text") or ""
        font_size = float(item.get("fontSize") or 10)
        bold = bool(item.get("bold"))
        align = (item.get("align") or "left").lower()
        valign = (item.get("verticalAlign") or "middle").lower()
        text_anchor = "middle" if align == "center" else "end" if align == "right" else "start"
        tx = x_mm + w_mm / 2 if align == "center" else (x_mm + w_mm if align == "right" else x_mm)
        if valign == "top":
            y_baseline = y_mm + font_size * 0.35
        elif valign == "bottom":
            y_baseline = y_mm + h_mm - font_size * 0.5
        else:
            y_baseline = y_mm + h_mm / 2 + font_size * 0.3
        frag = (
            f'<text x="{tx:.2f}" y="{y_baseline:.2f}" font-family="DejaVu Sans, sans-serif" font-size="{font_size}" '
            f'font-weight="{"bold" if bold else "normal"}" fill="{_svg_escape(color)}" text-anchor="{text_anchor}" dominant-baseline="alphabetic">{_svg_escape(val)}</text>'
        )
        out.append(wrap_transform(frag))
    elif typ == "barcode":
        fill = item.get("backgroundColor") or "#ffffff"
        stroke = item.get("borderColor") or "#000000"
        out.append(wrap_transform(
            f'<rect x="{x_mm:.2f}" y="{y_mm:.2f}" width="{w_mm:.2f}" height="{h_mm:.2f}" fill="{_svg_escape(fill)}" stroke="{_svg_escape(stroke)}" stroke-width="0.5"/>'
        ))
    elif typ in ("rect", "rectangle"):
        fill = item.get("fill") or item.get("backgroundColor") or "#e5e7eb"
        stroke = item.get("borderColor") or "#374151"
        sw = max(0.5, float(item.get("strokeWidth") or 0.5))
        out.append(wrap_transform(
            f'<rect x="{x_mm:.2f}" y="{y_mm:.2f}" width="{w_mm:.2f}" height="{h_mm:.2f}" fill="{_svg_escape(fill)}" stroke="{_svg_escape(stroke)}" stroke-width="{sw:.2f}"/>'
        ))
    elif typ == "section":
        fill = item.get("backgroundColor") or "#e5e7eb"
        stroke = item.get("borderColor") or "#374151"
        sw = max(0, float(item.get("borderWidth") or 0.5))
        out.append(wrap_transform(
            f'<rect x="{x_mm:.2f}" y="{y_mm:.2f}" width="{w_mm:.2f}" height="{h_mm:.2f}" fill="{_svg_escape(fill)}" stroke="{_svg_escape(stroke)}" stroke-width="{sw:.2f}"/>'
        ))
    elif typ == "line":
        sw = max(0.5, float(item.get("strokeWidth") or 0.5))
        out.append(wrap_transform(
            f'<line x1="{x_mm:.2f}" y1="{y_mm + h_mm/2:.2f}" x2="{x_mm + w_mm:.2f}" y2="{y_mm + h_mm/2:.2f}" stroke="{_svg_escape(color)}" stroke-width="{sw:.2f}"/>'
        ))
    elif typ == "icon":
        cx, cy = x_mm + w_mm / 2, y_mm + h_mm / 2
        r = min(w_mm, h_mm) / 2 - 0.5
        out.append(wrap_transform(
            f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r:.2f}" fill="none" stroke="{_svg_escape(color)}" stroke-width="0.5"/>'
        ))
    elif typ == "triangle":
        variant = (item.get("variant") or "topleft").lower().replace(" ", "")
        fill = item.get("backgroundColor") or item.get("textColor") or "#e5e7eb"
        stroke = item.get("borderColor") or item.get("textColor") or "#374151"
        if variant == "topleft":
            pts = f"{x_mm:.2f},{y_mm + h_mm:.2f} {x_mm + w_mm:.2f},{y_mm + h_mm:.2f} {x_mm:.2f},{y_mm:.2f}"
        elif variant == "topright":
            pts = f"{x_mm:.2f},{y_mm + h_mm:.2f} {x_mm + w_mm:.2f},{y_mm + h_mm:.2f} {x_mm + w_mm:.2f},{y_mm:.2f}"
        elif variant == "bottomleft":
            pts = f"{x_mm:.2f},{y_mm + h_mm:.2f} {x_mm:.2f},{y_mm:.2f} {x_mm + w_mm:.2f},{y_mm:.2f}"
        elif variant == "bottomright":
            pts = f"{x_mm + w_mm:.2f},{y_mm + h_mm:.2f} {x_mm:.2f},{y_mm:.2f} {x_mm + w_mm:.2f},{y_mm:.2f}"
        else:
            pts = f"{x_mm:.2f},{y_mm + h_mm:.2f} {x_mm + w_mm:.2f},{y_mm + h_mm:.2f} {x_mm:.2f},{y_mm:.2f}"
        out.append(wrap_transform(
            f'<polygon points="{pts}" fill="{_svg_escape(fill)}" stroke="{_svg_escape(stroke)}" stroke-width="0.5"/>'
        ))
    elif typ == "arrow":
        direction = (item.get("direction") or "right").lower()
        fill = item.get("backgroundColor") or item.get("textColor") or color
        cx, cy = x_mm + w_mm / 2, y_mm + h_mm / 2
        head = min(w_mm, h_mm) * 0.4
        sw = max(0.5, float(item.get("strokeWidth") or 1))
        if direction == "right":
            out.append(wrap_transform(
                f'<line x1="{x_mm:.2f}" y1="{cy:.2f}" x2="{x_mm + w_mm - head:.2f}" y2="{cy:.2f}" stroke="{_svg_escape(color)}" stroke-width="{sw:.2f}"/>'
            ))
            pts = f"{x_mm + w_mm:.2f},{cy:.2f} {x_mm + w_mm - head:.2f},{cy - head*0.7:.2f} {x_mm + w_mm - head:.2f},{cy + head*0.7:.2f}"
        elif direction == "left":
            out.append(wrap_transform(
                f'<line x1="{x_mm + head:.2f}" y1="{cy:.2f}" x2="{x_mm + w_mm:.2f}" y2="{cy:.2f}" stroke="{_svg_escape(color)}" stroke-width="{sw:.2f}"/>'
            ))
            pts = f"{x_mm:.2f},{cy:.2f} {x_mm + head:.2f},{cy - head*0.7:.2f} {x_mm + head:.2f},{cy + head*0.7:.2f}"
        elif direction == "up":
            out.append(wrap_transform(
                f'<line x1="{cx:.2f}" y1="{y_mm + head:.2f}" x2="{cx:.2f}" y2="{y_mm + h_mm - head:.2f}" stroke="{_svg_escape(color)}" stroke-width="{sw:.2f}"/>'
            ))
            pts = f"{cx:.2f},{y_mm + h_mm:.2f} {cx - head*0.7:.2f},{y_mm + h_mm - head:.2f} {cx + head*0.7:.2f},{y_mm + h_mm - head:.2f}"
        else:
            out.append(wrap_transform(
                f'<line x1="{cx:.2f}" y1="{y_mm + h_mm - head:.2f}" x2="{cx:.2f}" y2="{y_mm + head:.2f}" stroke="{_svg_escape(color)}" stroke-width="{sw:.2f}"/>'
            ))
            pts = f"{cx:.2f},{y_mm:.2f} {cx - head*0.7:.2f},{y_mm + head:.2f} {cx + head*0.7:.2f},{y_mm + head:.2f}"
        out.append(wrap_transform(
            f'<polygon points="{pts}" fill="{_svg_escape(fill)}" stroke="{_svg_escape(color)}" stroke-width="{sw:.2f}"/>'
        ))
    elif typ == "polygon":
        points_str = item.get("points") or "0 0, 100% 0, 50% 100%"
        fill = item.get("backgroundColor") or item.get("textColor") or "#e5e7eb"
        stroke = item.get("borderColor") or item.get("textColor") or "#374151"
        sw = max(0.5, float(item.get("strokeWidth") or 0.5))
        coords: list[str] = []
        for part in points_str.split(","):
            part = part.strip()
            if not part:
                continue
            tokens = part.split()
            if len(tokens) < 2:
                continue
            xs, ys = tokens[0], tokens[1]
            if "%" in xs:
                px = (float(xs.replace("%", "").strip()) / 100.0) * w_mm
            else:
                px = float(xs) if "." in xs or xs.replace(".", "").replace("-", "").isdigit() else 0
                if 0 <= px <= 1:
                    px *= w_mm
            if "%" in ys:
                py = (float(ys.replace("%", "").strip()) / 100.0) * h_mm
            else:
                py = float(ys) if "." in ys or ys.replace(".", "").replace("-", "").isdigit() else 0
                if 0 <= py <= 1:
                    py *= h_mm
            coords.append(f"{x_mm + px:.2f},{y_mm + h_mm - py:.2f}")
        if len(coords) >= 2:
            out.append(wrap_transform(
                f'<polygon points="{" ".join(coords)}" fill="{_svg_escape(fill)}" stroke="{_svg_escape(stroke)}" stroke-width="{sw:.2f}"/>'
            ))


def build_label_svg_engine(
    layout_json: str | dict,
    width_mm: float,
    height_mm: float,
    record: dict[str, Any],
) -> str:
    """
    Render one label as SVG (same layout as PDF). Uses single layout engine.
    """
    if isinstance(layout_json, str):
        try:
            layout = json.loads(layout_json) if layout_json.strip() else {}
        except json.JSONDecodeError:
            layout = {}
    else:
        layout = layout_json if isinstance(layout_json, dict) else {}
    layout_items = compute_layout(layout, record, width_mm, height_mm)
    out: list[str] = []
    for item in layout_items:
        _render_layout_item_svg(item, out)
    body = "\n".join(out)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width_mm:.2f} {height_mm:.2f}" '
        f'width="100%" height="100%" preserveAspectRatio="xMidYMid meet">{body}</svg>'
    )
