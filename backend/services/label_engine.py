"""
Generic label rendering engine for WMS labels. Single template format for all PDF generation.

All rendering is VECTOR (PDF vector graphics). No rasterization of labels to PNG.
Template element positions use the template page (top-left origin, y downward, same units as
``width`` / ``widthMm`` / ``height`` in layout JSON). PDF output uses **native PDF coordinates**
(bottom-left origin, y upward): each element is converted with explicit arithmetic
(``x_pt = x_mm * sx``, ``y_bottom = label_height_pt - y_mm * sy - height_pt``) — **no** global
``canvas.translate`` / ``canvas.scale`` for page mapping. Strokes in template mm scale by
``min(sx, sy)`` into points.

Input: layout dict with "elements" list + width_mm, height_mm (from SavedLabelTemplate.template_json
via label_render_service.build_label_pdf). Supports: text, staticText, dynamicText, barcode,
rectangle, line, icon, group, repeater. Rotation 0-360°. Conditional styling. Recursive groups/repeater.
"""

from __future__ import annotations

import io
import json
import math
import logging
import re
import xml.sax.saxutils as saxutils
from typing import Any

from ..pdf_fonts import PDF_FONT, PDF_FONT_BOLD, register_pdf_fonts
from .location_label_parse import inject_parsed_location_fields
from .label_pdf_generation_log import log_label_pdf_stage, print_pdf_canvas_size
from .pdf_deps import raise_if_no_reportlab

try:
    from reportlab.lib import colors as rl_colors
    from reportlab.pdfgen import canvas
    from reportlab.graphics.barcode import code128
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.pdfmetrics import stringWidth

    REPORTLAB_AVAILABLE = True
except ImportError:
    rl_colors = None  # type: ignore[misc, assignment]
    canvas = None  # type: ignore[misc, assignment]
    code128 = None  # type: ignore[misc, assignment]
    pdfmetrics = None  # type: ignore[misc, assignment]
    stringWidth = None  # type: ignore[misc, assignment]
    REPORTLAB_AVAILABLE = False


def _require_reportlab_for_pdf() -> None:
    raise_if_no_reportlab(REPORTLAB_AVAILABLE)
    register_pdf_fonts()


logger = logging.getLogger(__name__)

# 1 mm = 2.83465 PDF points (72 pt/inch, 25.4 mm/inch). Use for all mm -> pt conversion (must match frontend renderText.ts).
POINTS_PER_MM = 2.83465

# Extra media beyond trim for label PDFs (no change to layout JSON / compute_layout).
LABEL_PDF_BLEED_MM = 3.0

# Default design DPI (matches designer canvas); used for fontSizeUnit px → pt only.
_DEFAULT_LAYOUT_DPI = 96.0


def _layout_dpi(layout: dict | None) -> float:
    if not isinstance(layout, dict):
        return _DEFAULT_LAYOUT_DPI
    try:
        d = float(layout.get("dpi") or _DEFAULT_LAYOUT_DPI)
        return d if d > 0 else _DEFAULT_LAYOUT_DPI
    except (TypeError, ValueError):
        return _DEFAULT_LAYOUT_DPI


def _template_dimensions_mm(layout: dict | None, fallback_w: float, fallback_h: float) -> tuple[float, float]:
    """
    Logical template page size (same unit system as element x/y/width/height).
    Prefer explicit mm keys, then generic width/height from JSON.
    """
    if not isinstance(layout, dict):
        return (max(float(fallback_w), 0.1), max(float(fallback_h), 0.1))

    def _pick(keys: tuple[str, ...]) -> float | None:
        for k in keys:
            v = layout.get(k)
            if v is None or v == "":
                continue
            try:
                x = float(v)
                if x > 0:
                    return x
            except (TypeError, ValueError):
                continue
        return None

    tw = _pick(("widthMm", "width_mm", "width"))
    th = _pick(("heightMm", "height_mm", "height"))
    fw = max(float(fallback_w), 0.1)
    fh = max(float(fallback_h), 0.1)
    return (tw if tw is not None else fw, th if th is not None else fh)


def _template_top_rect_to_pdf_pts(
    x_mm: float,
    y_mm: float,
    w_mm: float,
    h_mm: float,
    label_width_pt: float,
    label_height_pt: float,
    tw: float,
    th: float,
    off_x_pt: float = 0.0,
    off_y_pt: float = 0.0,
) -> tuple[float, float, float, float, float, float]:
    """
    Map a rectangle from template space (top-left origin, y downward, mm) to PDF points
    (bottom-left origin, y upward). Returns (x_left_pt, y_bottom_pt, width_pt, height_pt, sx, sy).
    """
    sx = float(label_width_pt) / max(float(tw), 1e-9)
    sy = float(label_height_pt) / max(float(th), 1e-9)
    w_pt = float(w_mm) * sx
    h_pt = float(h_mm) * sy
    x_pt = float(x_mm) * sx + float(off_x_pt)
    y_top_pt = float(label_height_pt) - float(y_mm) * sy - float(off_y_pt)
    y_bl_pt = y_top_pt - h_pt
    return (x_pt, y_bl_pt, w_pt, h_pt, sx, sy)


def _font_size_pt_for_pdf(el: dict, dpi: float) -> float:
    """Template fontSize is usually points; if fontSizeUnit is px, convert px→pt."""
    raw = el.get("fontSize")
    if raw is None:
        return 10.0
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return 10.0
    unit = str(el.get("fontSizeUnit") or el.get("font_size_unit") or "").strip().lower()
    if unit == "px":
        d = dpi if dpi and dpi > 0 else _DEFAULT_LAYOUT_DPI
        return max(1.0, v * 72.0 / d)
    return max(0.5, v)


# After metric vertical centering, nudge baseline down slightly (PDF y −= factor×font_size).
# Tunable: ~0.05 subtle, 0.08 default, ~0.1 stronger.
OPTICAL_CENTER_FACTOR = 0.08

try:
    import qrcode
    HAS_QR = True
except ImportError:
    HAS_QR = False


def _binding_scalar_to_str(val: Any) -> str:
    if val is None:
        return ""
    if isinstance(val, (list, tuple)):
        return ""
    if isinstance(val, dict):
        return ""
    return str(val)


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
        result = _binding_scalar_to_str(val)
        print("BINDING VALUE AFTER:", repr(result))
        return result
    if key.startswith("{") and key.endswith("}"):
        bare = key[1:-1].strip()
        val = data.get(bare)
        if val is not None:
            result = _binding_scalar_to_str(val)
            print("BINDING VALUE AFTER:", repr(result))
            return result
    print("BINDING VALUE AFTER:", repr(""))
    return ""


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


def to_print_color(hex_color: str, print_mode: bool = False) -> Any:
    """CMYK when ``print_mode`` (print-ready); otherwise ``HexColor`` (RGB / on-screen PDF)."""
    from reportlab.lib.colors import CMYKColor, HexColor

    raw = (hex_color or "#000000").strip()
    if not raw.startswith("#"):
        raw = "#000000"
    digits = raw[1:]
    if len(digits) == 3:
        digits = digits[0] * 2 + digits[1] * 2 + digits[2] * 2
    if len(digits) != 6:
        return CMYKColor(0, 0, 0, 1) if print_mode else HexColor("#000000")
    try:
        r = int(digits[0:2], 16) / 255.0
        g = int(digits[2:4], 16) / 255.0
        b = int(digits[4:6], 16) / 255.0
    except ValueError:
        return CMYKColor(0, 0, 0, 1) if print_mode else HexColor("#000000")

    if not print_mode:
        return HexColor("#" + digits.lower())

    k = 1 - max(r, g, b)
    if k == 1:
        return CMYKColor(0, 0, 0, 1)

    c = (1 - r - k) / (1 - k)
    m = (1 - g - k) / (1 - k)
    y = (1 - b - k) / (1 - k)

    return CMYKColor(c, m, y, k)


def hex_to_cmyk(hex_color: str | None) -> Any:
    """
    Convert #rrggbb or #rgb hex to ReportLab CMYKColor (device CMYK for PDF).
    Kept for callers outside the label engine (e.g. legacy label_render_service).
    """
    s = (hex_color or "#000000").strip() if isinstance(hex_color, str) else "#000000"
    return to_print_color(s, True)


def draw_crop_marks_outside_trim(
    c: Any,
    trim_left: float,
    trim_bottom: float,
    trim_right: float,
    trim_top: float,
) -> None:
    """L-shaped marks just outside the trim box (PDF pt). Stroke only."""
    from reportlab.lib.units import mm as mm_unit

    mark = 5 * mm_unit
    gap = 2 * mm_unit

    c.saveState()
    c.setStrokeColor(to_print_color("#000000", True))
    c.setLineWidth(0.3)

    # bottom-left — outside left and below
    c.line(trim_left - gap - mark, trim_bottom, trim_left - gap, trim_bottom)
    c.line(trim_left, trim_bottom - gap - mark, trim_left, trim_bottom - gap)

    # bottom-right — outside right and below
    c.line(trim_right + gap, trim_bottom, trim_right + gap + mark, trim_bottom)
    c.line(trim_right, trim_bottom - gap - mark, trim_right, trim_bottom - gap)

    # top-left — outside left and above
    c.line(trim_left - gap - mark, trim_top, trim_left - gap, trim_top)
    c.line(trim_left, trim_top + gap, trim_left, trim_top + gap + mark)

    # top-right — outside right and above
    c.line(trim_right + gap, trim_top, trim_right + gap + mark, trim_top)
    c.line(trim_right, trim_top + gap, trim_right, trim_top + gap + mark)

    c.restoreState()


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


def _clamp_corner_radius_mm(r_raw: Any, w_mm: float, h_mm: float) -> float:
    """Rect corner radius in mm; cap so arcs do not exceed half the shorter side."""
    try:
        r = float(r_raw or 0)
    except (TypeError, ValueError):
        r = 0.0
    r = max(0.0, r)
    cap = min(float(w_mm), float(h_mm)) / 2.0
    return min(r, cap)


def _svg_rect_corner_attrs(corner_mm: float | None, w_mm: float, h_mm: float) -> str:
    r = _clamp_corner_radius_mm(corner_mm, w_mm, h_mm)
    if r <= 0:
        return ""
    return f' rx="{r:.3f}" ry="{r:.3f}"'


def _rect_conditions_from_element(el: dict) -> list[dict[str, Any]] | None:
    """
    Rect conditional styling: support ``conditions`` and ``conditionalStyles`` (and ``conditional_styles``).
    Normalize per-rule keys: when -> if, color -> fill, borderColor -> stroke.
    """
    # Templates may only persist conditionalStyles; layout/evaluate expect ``conditions``.
    cs = el.get("conditionalStyles") if isinstance(el, dict) else None
    if cs is None and isinstance(el, dict):
        cs_alt = el.get("conditional_styles")
        if cs_alt is not None:
            cs = cs_alt
    if cs is not None and not el.get("conditions"):
        el["conditions"] = cs

    raw = el.get("conditions") or el.get("conditionalStyles") or el.get("conditional_styles")
    if raw is None or not isinstance(raw, list):
        return None
    out: list[dict[str, Any]] = []
    for c in raw:
        if not isinstance(c, dict):
            continue
        n: dict[str, Any] = dict(c)
        _when = n.get("when")
        _if = n.get("if")
        expr_src = _if if _if is not None else _when
        if expr_src is None:
            expr = ""
        else:
            expr = str(expr_src).strip()
        if expr:
            n["if"] = expr
        if n.get("fill") is None and n.get("color") is not None:
            n["fill"] = n["color"]
        if n.get("fill") is None and n.get("backgroundColor") is not None:
            n["fill"] = n["backgroundColor"]
        if n.get("stroke") is None and n.get("borderColor") is not None:
            n["stroke"] = n["borderColor"]
        if not (n.get("if") or "").strip():
            continue
        out.append(n)
    if not out:
        return None
    return out


def _evaluate_condition(expression: str, record: dict[str, Any]) -> bool:
    """
    Simple condition evaluator for visibleIf. Supports: {field} == value, != value, > value, < value.
    RHS may be quoted string, number, or unquoted string token (e.g. {loc_name} == A-1).
    Unquoted: try float (then int if whole); on failure treat entire token as string.
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

    def _as_cmp_string(v: Any) -> str:
        if v is None:
            return ""
        if isinstance(v, bool):
            return str(v).lower()
        if isinstance(v, int):
            return str(v)
        if isinstance(v, float):
            if v != v:  # NaN
                return "nan"
            if v.is_integer():
                return str(int(v))
            return str(v).strip()
        return str(v).strip()

    quoted = (right_raw.startswith("'") and right_raw.endswith("'")) or (
        right_raw.startswith('"') and right_raw.endswith('"')
    )
    if quoted:
        right_val: Any = right_raw[1:-1].strip()
    else:
        try:
            fv = float(right_raw)
            if fv.is_integer():
                right_val = int(fv)
            else:
                right_val = fv
        except (ValueError, TypeError, OverflowError):
            right_val = right_raw.strip()

    left_cmp = _as_cmp_string(field_val)
    if op == "==":
        right_cmp = _as_cmp_string(right_val)
        result = left_cmp == right_cmp
        print("COND:", key, left_cmp, "==", right_cmp, "=>", result)
        return result
    if op == "!=":
        right_cmp = _as_cmp_string(right_val)
        result = left_cmp != right_cmp
        print("COND:", key, left_cmp, "!=", right_cmp, "=>", result)
        return result
    if op in (">", "<"):
        try:
            left_num = float(field_val) if field_val is not None else float("nan")
            if isinstance(right_val, (int, float)):
                right_num = float(right_val)
            else:
                right_num = float(str(right_val))
            if op == ">":
                result = left_num > right_num
            else:
                result = left_num < right_num
        except (TypeError, ValueError):
            right_s = _as_cmp_string(right_val)
            if op == ">":
                result = left_cmp > right_s
            else:
                result = left_cmp < right_s
        print("COND:", key, left_cmp, op, _as_cmp_string(right_val), "=>", result)
        return result
    return True


def _compute_layout_items(
    elements: list[dict],
    record: dict[str, Any],
    label_width_mm: float,
    label_height_mm: float,
    x0_mm: float,
    y0_mm: float,
    out: list[dict],
    dpi: float,
    scale_x_to_pt: float,
    scale_y_to_pt: float,
) -> None:
    """Flatten template elements into layout items (same schema as frontend). Top-left origin, template units."""

    def _eval_layout_cond(expr: str, rec: dict[str, Any]) -> bool:
        print("COND CHECK:", {"expr": expr, "record": rec})
        result = _evaluate_condition(expr, rec)
        print("COND RESULT:", result)
        return result

    for el in elements:
        if not isinstance(el, dict) or not el.get("type"):
            continue
        if el.get("visible") is False:
            continue
        visible_if = el.get("visibleIf")
        if visible_if and not _eval_layout_cond(str(visible_if).strip(), record):
            continue
        el_type = (el.get("type") or "").strip().lower()
        if el_type == "group":
            nested = el.get("elements") or []
            gbx = float(el.get("x", 0))
            gby = float(el.get("y", 0))
            gx = x0_mm + gbx
            gy = y0_mm + gby
            _compute_layout_items(
                nested, record, label_width_mm, label_height_mm, gx, gy, out, dpi, scale_x_to_pt, scale_y_to_pt
            )
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
            norm_items: list[dict[str, Any]] = []
            for dataset_index, item in enumerate(items):
                if isinstance(item, dict):
                    row: dict[str, Any] = {**item, "dataset_index": dataset_index}
                else:
                    s = str(item)
                    row = {
                        "value": item,
                        "loc_name": s,
                        "location_name": s,
                        "location_code": s,
                        "dataset_index": dataset_index,
                    }
                norm_items.append(row)
            items = norm_items
            filter_expr = (el.get("filter") or "").strip()
            if filter_expr:
                items = [i for i in items if _eval_layout_cond(filter_expr, i)]
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
            ih = float(el.get("itemHeight") or el.get("itemWidth") or el.get("height") or 20)
            rbx = float(el.get("x", 0))
            rby = float(el.get("y", 0))
            base_x = x0_mm + rbx
            base_y = y0_mm + rby
            for idx, item in enumerate(items):
                item_data = item if isinstance(item, dict) else {}
                parent_for_slot = {k: v for k, v in record.items() if k != dataset_key}
                child_record = {**parent_for_slot, **item_data, "repeater_slot": idx}
                inject_parsed_location_fields(child_record)
                if use_grid:
                    row, col = idx // columns, idx % columns
                    cx = base_x + col * iw
                    cy = base_y + row * ih
                else:
                    if direction == "vertical":
                        cx, cy = base_x, base_y + idx * ih
                    else:
                        cx, cy = base_x + idx * iw, base_y
                _compute_layout_items(
                    nested, child_record, label_width_mm, label_height_mm, cx, cy, out, dpi, scale_x_to_pt, scale_y_to_pt
                )
            continue
        x_rel = float(el.get("x", 0))
        y_rel = float(el.get("y", 0))
        w_mm, h_mm = _element_bounds(el)
        x_mm = x0_mm + x_rel
        y_mm = y0_mm + y_rel
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
            "x": x_mm,
            "y": y_mm,
            "width": w_mm,
            "height": h_mm,
            "rotation": rotation,
            "backgroundColor": el.get("backgroundColor"),
            "borderColor": el.get("borderColor"),
            "color": el.get("color"),
            "textColor": el.get("textColor") or el.get("color") or "#000000",
        }
        if el_type in ("text", "dynamictext"):
            binding = el.get("binding") or el.get("dataBinding") or ""
            resolved_text = _resolve(record, binding) or ""
            print("TEXT ELEMENT RAW:", repr(el.get("text")), "binding:", repr(binding))
            print("TEXT ELEMENT RESOLVED:", repr(resolved_text))
            item["text"] = resolved_text
            item["fontSize"] = _font_size_pt_for_pdf(el, dpi)
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
            item["fontSize"] = _font_size_pt_for_pdf({**el, "fontSize": el.get("fontSize") if el.get("fontSize") is not None else 8}, dpi)
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
                    if width_pt <= w_mm * scale_x_to_pt:
                        break
                    font_size -= 0.5
                item["fontSize"] = max(min_font_size, font_size)
            elif scale_to_height:
                item["fontSize"] = float(h_mm * scale_y_to_pt * 0.7)
        elif el_type == "barcode":
            binding = el.get("dataBinding") or el.get("data_binding") or el.get("binding") or "barcode_data"
            item["barcodeValue"] = _resolve_barcode_value(record, binding) or "SAMPLE"
            item["barcodeFormat"] = (el.get("format") or "Code128").lower()
            item["showValue"] = el.get("showValue", False)
            item["textPosition"] = el.get("textPosition") or "below"
        elif el_type in ("rect", "rectangle"):
            print("ELEMENT:", el)
            print("CONDITIONS RAW:", el.get("conditions"))
            print("CONDITIONS STYLES:", el.get("conditionalStyles"))
            conditions = _rect_conditions_from_element(el)
            print("CONDITIONS NORMALIZED:", conditions)
            item["strokeWidth"] = float(el.get("strokeWidth") or el.get("stroke_width") or 0.5)
            item["fill"] = el.get("fill") or el.get("backgroundColor") or el.get("color")
            if conditions:
                for cond in conditions:
                    expr = (cond.get("if") or "").strip()
                    if not expr:
                        continue
                    if _eval_layout_cond(expr, record):
                        if cond.get("fill") is not None:
                            item["fill"] = cond["fill"]
                        if cond.get("stroke") is not None:
                            item["borderColor"] = cond["stroke"]
                        break
            item["cornerRadius"] = _clamp_corner_radius_mm(el.get("cornerRadius"), w_mm, h_mm)
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


def _element_z_index(el: Any) -> int:
    if not isinstance(el, dict):
        return 0
    z = el.get("zIndex")
    if z is None:
        return 0
    try:
        return int(z)
    except (TypeError, ValueError):
        return 0


def compute_layout(
    layout: dict,
    record: dict[str, Any],
    width_mm: float,
    height_mm: float,
) -> list[dict[str, Any]]:
    """Single layout engine output: flat list of layout items (template units, top-left origin)."""
    elements = layout.get("elements") if isinstance(layout, dict) else []
    if not isinstance(elements, list):
        elements = []
    elements = sorted(elements, key=_element_z_index)
    out: list[dict[str, Any]] = []
    rec: dict[str, Any] = dict(record) if isinstance(record, dict) else {}
    if isinstance(record, dict):
        inject_parsed_location_fields(rec)
    dpi = _layout_dpi(layout if isinstance(layout, dict) else None)
    tw, th = _template_dimensions_mm(layout if isinstance(layout, dict) else None, width_mm, height_mm)
    scale_x_to_pt = (float(width_mm) * POINTS_PER_MM) / max(tw, 1e-6)
    scale_y_to_pt = (float(height_mm) * POINTS_PER_MM) / max(th, 1e-6)
    _compute_layout_items(elements, rec, tw, th, 0.0, 0.0, out, dpi, scale_x_to_pt, scale_y_to_pt)
    return out


def _apply_rotation(
    c: Any,
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
    rotation: float,
) -> None:
    """
    Rotate the CTM by ``rotation`` degrees around the element center (PDF coords, y up).
    Uses a single ``canvas.transform`` (no ``translate`` / ``rotate`` / ``scale``).
    """
    if not rotation:
        return
    ang = math.radians(-float(rotation))
    cos_a = math.cos(ang)
    sin_a = math.sin(ang)
    cx = x_pt + w_pt / 2.0
    cy = y_pt + h_pt / 2.0
    a, b, cmm, d = cos_a, sin_a, -sin_a, cos_a
    e = cx - a * cx - cmm * cy
    f = cy - b * cx - d * cy
    c.transform(a, b, cmm, d, e, f)


def _font_vertical_metrics_pt(font_name: str, font_size: float) -> tuple[float, float, float]:
    """
    Ascender, descender (positive below baseline), and total ink height in points.
    Uses ReportLab font face UPM (ascent/descent per 1000 em); falls back if metrics missing.
    """
    fs = float(font_size)
    if pdfmetrics is not None:
        try:
            font = pdfmetrics.getFont(font_name)
            face = getattr(font, "face", None)
            if face is not None and hasattr(face, "ascent") and hasattr(face, "descent"):
                asc = float(face.ascent) / 1000.0 * fs
                desc = abs(float(face.descent)) / 1000.0 * fs
                return asc, desc, asc + desc
        except Exception:
            pass
    asc = 0.72 * fs
    desc = 0.28 * fs
    return asc, desc, asc + desc


def _text_baseline_y_in_box(
    y_pt: float, h_pt: float, font_name: str, font_size: float, valign: str
) -> float:
    """
    Baseline Y for single-line text in a box. PDF: y_pt = bottom of box, h_pt = height (up).
    Middle: metric center, then small downward optical shift (OPTICAL_CENTER_FACTOR × font_size).
    """
    asc, desc, text_height = _font_vertical_metrics_pt(font_name, font_size)
    fs = float(font_size)
    v = (valign or "middle").strip().lower()
    if v == "top":
        return y_pt + h_pt - asc
    if v == "bottom":
        return y_pt + desc
    y_metric = y_pt + (h_pt / 2.0) - (text_height / 2.0) + desc
    optical_offset = fs * OPTICAL_CENTER_FACTOR
    return y_metric - optical_offset


def _draw_string_aligned(
    c: Any,
    text: str,
    x_box: float,
    y_baseline: float,
    w_box: float,
    font_name: str,
    font_size: float,
    align: str,
) -> None:
    """Draw text with a single ``drawString`` (no ``drawCentredString`` / ``drawRightString`` / local scale)."""
    if not text:
        return
    fs = max(0.5, abs(float(font_size)))
    tw = stringWidth(text, font_name, fs)
    a = (align or "left").lower()
    if a == "center":
        x_draw = x_box + max(0.0, (w_box - tw) / 2.0)
    elif a in ("right", "end"):
        x_draw = x_box + max(0.0, w_box - tw)
    else:
        x_draw = x_box
    c.setFont(font_name, fs)
    c.drawString(x_draw, y_baseline, text)


def _text_baseline_y_svg_mm(
    y_mm: float, h_mm: float, font_name: str, font_size: float, valign: str
) -> float:
    """
    SVG text baseline Y (mm, top-left origin, y increases downward). Uses same metrics as PDF.
    """
    asc, desc, _th = _font_vertical_metrics_pt(font_name, font_size)
    v = (valign or "middle").strip().lower()
    if v == "top":
        return y_mm + asc
    if v == "bottom":
        return y_mm + h_mm - desc
    # Center of ink: ys + (desc - asc) / 2 = y_mm + h_mm / 2
    return y_mm + h_mm / 2.0 - (desc - asc) / 2.0


def _draw_text(
    c: Any,
    el: dict,
    data: dict[str, Any],
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
    *,
    print_mode: bool = False,
) -> None:
    binding = el.get("binding") or el.get("dataBinding") or ""
    val = _resolve(data, binding) or ""
    fs = abs(float(el.get("fontSize") or 10))
    font_name = PDF_FONT_BOLD if el.get("bold") else PDF_FONT
    c.setFillColor(to_print_color(str(el.get("textColor") or el.get("color") or "#000000"), print_mode))
    # Width clipping uses positive size only (no local Y inversion / transforms).
    while val and stringWidth(val, font_name, fs) > w_pt:
        val = val[:-1]
    if not val:
        return
    valign = (el.get("verticalAlign") or el.get("vertical_text") or "middle").lower()
    y_baseline = _text_baseline_y_in_box(y_pt, h_pt, font_name, fs, valign)
    align = (el.get("align") or el.get("horizontalAlign") or "left").lower()
    print("TEXT DRAW INPUT:", repr(val))
    _draw_string_aligned(c, val, x_pt, y_baseline, w_pt, font_name, fs, align)


def _draw_code128_fitted(
    c: Any,
    val: str,
    x_pt: float,
    y_bl_pt: float,
    w_pt: float,
    h_pt: float,
    *,
    print_mode: bool = False,
) -> None:
    """Draw Code128 in a rectangle. ``(x_pt, y_bl_pt)`` is the bottom-left corner of the cell (PDF coords)."""
    if code128 is None:
        return
    val = (val or "").strip()
    if not val:
        return
    w_box = max(0.5, float(w_pt))
    h_box = max(0.5, float(h_pt))
    h_bar = h_box

    lo, hi = 0.006, 4.0
    best: Any = None
    for _ in range(52):
        mid = (lo + hi) / 2.0
        try:
            bc_try = code128.Code128(val, barWidth=mid, barHeight=h_bar, displayValue=False)
        except Exception:
            hi = mid
            continue
        if float(bc_try.width) <= w_box + 1e-9:
            best = bc_try
            lo = mid
        else:
            hi = mid

    if best is None:
        try:
            best = code128.Code128(val, barWidth=0.006, barHeight=h_bar, displayValue=False)
        except Exception as e:
            logger.warning("Code128 create failed %r: %s", val[:24], e)
            return

    black = to_print_color("#000000", print_mode)
    bw = float(best.width)
    dx = max(0.0, (w_box - bw) / 2.0)
    abs_x = float(x_pt) + dx
    if bw <= w_box + 0.25:
        c.saveState()
        c.setFillColor(black)
        c.setStrokeColor(black)
        best.drawOn(c, abs_x, float(y_bl_pt))
        c.restoreState()
        return
    clip = c.beginPath()
    clip.rect(float(x_pt), float(y_bl_pt), w_box, h_box)
    c.saveState()
    c.setFillColor(black)
    c.setStrokeColor(black)
    c.clipPath(clip, stroke=0, fill=0)
    best.drawOn(c, abs_x, float(y_bl_pt))
    c.restoreState()


def _draw_barcode(
    c: Any,
    el: dict,
    data: dict[str, Any],
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
    *,
    print_mode: bool = False,
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
            black = to_print_color("#000000", print_mode)
            c.saveState()
            c.setFillColor(black)
            c.setStrokeColor(black)
            c.drawImage(buf, x_pt, y_pt, width=w_pt, height=h_pt)
            c.restoreState()
        else:
            _draw_code128_fitted(c, val, x_pt, y_pt, w_pt, h_pt, print_mode=print_mode)
    except Exception as e:
        logger.warning("Barcode render failed %r: %s", val[:20], e)


def _draw_rectangle(
    c: Any,
    el: dict,
    data: dict[str, Any],
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
    *,
    geom_line_scale: float = POINTS_PER_MM,
    print_mode: bool = False,
) -> None:
    # fill is resolved in compute_layout (incl. conditions); draw uses that value first — not backgroundColor alone
    fill = el.get("fill") or el.get("backgroundColor") or el.get("color") or "#ffffff"
    stroke = el.get("borderColor") or el.get("stroke") or "#374151"
    stroke_width = max(0.5, float(el.get("strokeWidth") or el.get("stroke_width") or 0.5) * geom_line_scale)
    fill_c = to_print_color(str(fill), print_mode)
    stroke_c = to_print_color(str(stroke), print_mode)
    r_mm = _clamp_corner_radius_mm(el.get("cornerRadius"), w_pt / geom_line_scale, h_pt / geom_line_scale)
    r_pt = r_mm * geom_line_scale

    if r_pt < 0.01:
        if fill:
            c.setFillColor(fill_c)
            c.rect(x_pt, y_pt, w_pt, h_pt, fill=1, stroke=0)
        c.setStrokeColor(stroke_c)
        c.setLineWidth(stroke_width)
        c.rect(x_pt, y_pt, w_pt, h_pt, fill=0, stroke=1)
        return

    c.setStrokeColor(stroke_c)
    c.setLineWidth(stroke_width)
    if fill:
        c.setFillColor(fill_c)
        c.roundRect(x_pt, y_pt, w_pt, h_pt, r_pt, stroke=1, fill=1)
    else:
        c.roundRect(x_pt, y_pt, w_pt, h_pt, r_pt, stroke=1, fill=0)


def _draw_section(
    c: Any,
    el: dict,
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
    *,
    geom_line_scale: float = POINTS_PER_MM,
    print_mode: bool = False,
) -> None:
    """Draw section block: backgroundColor fill, borderColor border, borderWidth."""
    fill = el.get("backgroundColor") or el.get("color") or el.get("fill") or "#e5e7eb"
    stroke = el.get("borderColor") or el.get("stroke") or el.get("textColor") or "#374151"
    stroke_width = max(0, float(el.get("borderWidth") or el.get("strokeWidth") or 0.5) * geom_line_scale)
    fill_c = to_print_color(str(fill), print_mode)
    stroke_c = to_print_color(str(stroke), print_mode)
    if fill:
        c.setFillColor(fill_c)
        c.rect(x_pt, y_pt, w_pt, h_pt, fill=1, stroke=0)
    if stroke_width > 0:
        c.setStrokeColor(stroke_c)
        c.setLineWidth(stroke_width)
        c.rect(x_pt, y_pt, w_pt, h_pt, fill=0, stroke=1)


def _draw_line(
    c: Any,
    el: dict,
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
    *,
    geom_line_scale: float = POINTS_PER_MM,
    print_mode: bool = False,
) -> None:
    color = el.get("color") or el.get("stroke") or "#000000"
    stroke_width = max(0.5, float(el.get("strokeWidth") or 0.5) * geom_line_scale)
    try:
        c.setStrokeColor(to_print_color(str(color), print_mode))
    except Exception:
        c.setStrokeColor(to_print_color("#000000", print_mode))
    c.setLineWidth(stroke_width)
    c.line(x_pt, y_pt, x_pt + w_pt, y_pt + h_pt)


def _draw_icon(
    c: Any,
    el: dict,
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
    *,
    print_mode: bool = False,
) -> None:
    """Draw a simple icon (arrow_up, arrow_down, etc.) as path."""
    name = (el.get("icon") or el.get("name") or "arrow_up").lower()
    color = el.get("color") or "#000000"
    try:
        cc = to_print_color(str(color), print_mode)
        c.setStrokeColor(cc)
        c.setFillColor(cc)
    except Exception:
        bk = to_print_color("#000000", print_mode)
        c.setStrokeColor(bk)
        c.setFillColor(bk)
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
    c: Any,
    elements: list[dict],
    data: dict[str, Any],
    ctx: dict[str, Any],
) -> None:
    """
    Recursively render layout elements.
    ctx: label_width_mm, label_height_mm, offset_x_pt, offset_y_pt, x0_mm, y0_mm (current origin in mm).
    """
    _require_reportlab_for_pdf()
    if not elements:
        return
    label_w_mm = float(ctx.get("label_width_mm", 100))
    label_h_mm = float(ctx.get("label_height_mm", 60))
    offset_x_pt = float(ctx.get("offset_x_pt", 0))
    offset_y_pt = float(ctx.get("offset_y_pt", 0))
    x0_mm = float(ctx.get("x0_mm", 0))
    y0_mm = float(ctx.get("y0_mm", 0))
    pm = bool(ctx.get("print_mode", False))
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
            _draw_text(c, el, data, x_pt, y_pt, w_pt, h_pt, print_mode=pm)
            c.restoreState()

        elif el_type == "statictext":
            c.saveState()
            if rotation:
                _apply_rotation(c, x_pt, y_pt, w_pt, h_pt, rotation)
            val = el.get("text") or ""
            fs = abs(float(el.get("fontSize") or 10))
            font_name = PDF_FONT_BOLD if el.get("bold") else PDF_FONT
            c.setFillColor(to_print_color(str(el.get("textColor") or el.get("color") or "#000000"), pm))
            while val and stringWidth(val, font_name, fs) > w_pt:
                val = val[:-1]
            valign = (el.get("verticalAlign") or "middle").lower()
            y_baseline = _text_baseline_y_in_box(y_pt, h_pt, font_name, fs, valign)
            align = (el.get("align") or el.get("horizontalAlign") or "left").lower()
            print("TEXT DRAW INPUT:", repr(val))
            _draw_string_aligned(c, val, x_pt, y_baseline, w_pt, font_name, fs, align)
            c.restoreState()

        elif el_type == "barcode":
            c.saveState()
            if rotation:
                _apply_rotation(c, x_pt, y_pt, w_pt, h_pt, rotation)
            _draw_barcode(c, el, data, x_pt, y_pt, w_pt, h_pt, print_mode=pm)
            c.restoreState()

        elif el_type in ("rect", "rectangle"):
            c.saveState()
            if rotation:
                _apply_rotation(c, x_pt, y_pt, w_pt, h_pt, rotation)
            _draw_rectangle(c, el, data, x_pt, y_pt, w_pt, h_pt, print_mode=pm)
            c.restoreState()

        elif el_type == "section":
            c.saveState()
            if rotation:
                _apply_rotation(c, x_pt, y_pt, w_pt, h_pt, rotation)
            _draw_section(c, el, x_pt, y_pt, w_pt, h_pt, print_mode=pm)
            c.restoreState()

        elif el_type == "line":
            c.saveState()
            if rotation:
                _apply_rotation(c, x_pt, y_pt, w_pt, h_pt, rotation)
            _draw_line(c, el, x_pt, y_pt, w_pt, h_pt, print_mode=pm)
            c.restoreState()

        elif el_type == "icon":
            c.saveState()
            if rotation:
                _apply_rotation(c, x_pt, y_pt, w_pt, h_pt, rotation)
            _draw_icon(c, el, x_pt, y_pt, w_pt, h_pt, print_mode=pm)
            c.restoreState()

        elif el_type == "group":
            nested = el.get("elements") or []
            if nested:
                render_elements(c, nested, data, {**ctx, "x0_mm": x_mm, "y0_mm": y_design_mm, "print_mode": pm})

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
            item_h_mm = float(el.get("itemHeight") or el.get("itemWidth") or el.get("height") or 20)
            cur_x_mm = x_mm
            cur_y_mm = y_design_mm
            for item in items:
                item_data = item if isinstance(item, dict) else {}
                sub_ctx = {**ctx, "x0_mm": cur_x_mm, "y0_mm": cur_y_mm, "print_mode": pm}
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
            c.setStrokeColor(to_print_color("#ff0000", pm))
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


def _layout_rect_covers_full_template(
    x_mm: float, y_mm: float, w_mm: float, h_mm: float, tw: float, th: float
) -> bool:
    """True if a rectangle spans the full template page (for bleed extension at draw time only)."""
    eps = 0.05
    return (
        x_mm <= eps
        and y_mm <= eps
        and (x_mm + w_mm) >= tw - eps
        and (y_mm + h_mm) >= th - eps
    )


def _draw_layout_item(
    c: Any,
    item: dict[str, Any],
    label_width_pt: float,
    label_height_pt: float,
    tw: float,
    th: float,
    offset_x_pt: float = 0.0,
    offset_y_pt: float = 0.0,
    *,
    bleed_mm: float = 0.0,
    print_mode: bool = False,
) -> None:
    """
    Draw one layout item in PDF space: template top-left mm → bottom-left pt via
    ``_template_top_rect_to_pdf_pts`` (no page-level canvas transforms).
    """
    typ = (item.get("type") or "").lower()
    x_mm = float(item.get("x_mm", item.get("x", 0)))
    y_mm = float(item.get("y_mm", item.get("y", 0)))
    w_mm = float(item.get("width_mm", item.get("width", 10)))
    h_mm = float(item.get("height_mm", item.get("height", 10)))
    if (
        bleed_mm > 0
        and typ in ("rect", "rectangle")
        and _layout_rect_covers_full_template(x_mm, y_mm, w_mm, h_mm, tw, th)
    ):
        x_mm -= bleed_mm
        y_mm -= bleed_mm
        w_mm += 2.0 * bleed_mm
        h_mm += 2.0 * bleed_mm
    x_pt, y_pt, w_pt, h_pt, sx, sy = _template_top_rect_to_pdf_pts(
        x_mm,
        y_mm,
        w_mm,
        h_mm,
        label_width_pt,
        label_height_pt,
        tw,
        th,
        off_x_pt=float(offset_x_pt),
        off_y_pt=float(offset_y_pt),
    )
    geom_scale = min(sx, sy)
    raw_rot = item.get("rotation")
    if raw_rot is None:
        rotation = 0.0
    else:
        try:
            rotation = float(raw_rot)
            rotation = ((rotation % 360) + 360) % 360
        except (TypeError, ValueError):
            rotation = 0.0
    # Build el-like dict for _draw_* helpers; layout item fields are final (rect fill includes conditionals).
    el = {
        "binding": item.get("binding"),
        "dataBinding": item.get("dataBinding"),
        "text": item.get("text"),
        "fontSize": float(item.get("fontSize") or 10),
        "bold": item.get("bold"),
        "align": item.get("align"),
        "horizontalAlign": item.get("horizontalAlign"),
        "verticalAlign": item.get("verticalAlign"),
        "textColor": item.get("textColor"),
        "backgroundColor": item.get("backgroundColor"),
        "borderColor": item.get("borderColor"),
        "strokeWidth": item.get("strokeWidth"),
        "borderWidth": item.get("borderWidth"),
        "fill": item.get("fill"),
        "color": item.get("color"),
        "cornerRadius": float(item.get("cornerRadius") or 0),
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
        _draw_text(c, el, data, x_pt, y_pt, w_pt, h_pt, print_mode=print_mode)
    elif typ == "statictext":
        _draw_static_text_layout(c, item, x_pt, y_pt, w_pt, h_pt, print_mode=print_mode)
    elif typ == "barcode":
        _draw_barcode_layout(c, item, x_pt, y_pt, w_pt, h_pt, print_mode=print_mode)
    elif typ in ("rect", "rectangle"):
        _draw_rectangle(
            c,
            el,
            data,
            x_pt,
            y_pt,
            w_pt,
            h_pt,
            geom_line_scale=geom_scale,
            print_mode=print_mode,
        )
    elif typ == "section":
        _draw_section(
            c, el, x_pt, y_pt, w_pt, h_pt, geom_line_scale=geom_scale, print_mode=print_mode
        )
    elif typ == "line":
        _draw_line(c, el, x_pt, y_pt, w_pt, h_pt, geom_line_scale=geom_scale, print_mode=print_mode)
    elif typ == "icon":
        el["icon"] = item.get("icon") or "arrow_up"
        el["color"] = item.get("textColor") or item.get("borderColor") or "#000000"
        _draw_icon(c, el, x_pt, y_pt, w_pt, h_pt, print_mode=print_mode)
    elif typ == "triangle":
        _draw_triangle_layout(
            c, item, x_pt, y_pt, w_pt, h_pt, geom_line_scale=geom_scale, print_mode=print_mode
        )
    elif typ == "arrow":
        _draw_arrow_layout(
            c, item, x_pt, y_pt, w_pt, h_pt, geom_line_scale=geom_scale, print_mode=print_mode
        )
    elif typ == "polygon":
        _draw_polygon_layout(
            c, item, x_pt, y_pt, w_pt, h_pt, geom_line_scale=geom_scale, print_mode=print_mode
        )
    c.restoreState()


def _draw_static_text_layout(
    c: Any,
    item: dict,
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
    *,
    print_mode: bool = False,
) -> None:
    val = item.get("text") or ""
    fs = abs(float(item.get("fontSize") or 10))
    font_name = PDF_FONT_BOLD if item.get("bold") else PDF_FONT
    c.setFillColor(to_print_color(str(item.get("textColor") or "#000000"), print_mode))
    while val and stringWidth(val, font_name, fs) > w_pt:
        val = val[:-1]
    if not val:
        return
    valign = (item.get("verticalAlign") or "middle").lower()
    y_baseline = _text_baseline_y_in_box(y_pt, h_pt, font_name, fs, valign)
    align = (item.get("align") or item.get("horizontalAlign") or "left").lower()
    print("TEXT DRAW INPUT:", repr(val))
    _draw_string_aligned(c, val, x_pt, y_baseline, w_pt, font_name, fs, align)


def _draw_barcode_layout(
    c: Any,
    item: dict,
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
    *,
    print_mode: bool = False,
) -> None:
    """Draw barcode as vector. ``(x_pt,y_pt)`` is bottom-left of cell (PDF coords)."""
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
            black = to_print_color("#000000", print_mode)
            c.saveState()
            c.setFillColor(black)
            c.setStrokeColor(black)
            c.drawImage(buf, x_pt, y_pt, width=w_pt, height=h_pt)
            c.restoreState()
        else:
            _draw_code128_fitted(c, val, x_pt, y_pt, w_pt, h_pt, print_mode=print_mode)
    except Exception as e:
        logger.warning("Barcode render failed %r: %s", val[:20], e)


def _draw_triangle_layout(
    c: Any,
    item: dict,
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
    *,
    geom_line_scale: float = POINTS_PER_MM,
    print_mode: bool = False,
) -> None:
    """Draw triangle inside element box. ``(x_pt,y_pt)`` is bottom-left (PDF coords)."""
    variant = (item.get("variant") or "topleft").lower().replace(" ", "")
    fill = item.get("backgroundColor") or item.get("textColor") or "#e5e7eb"
    stroke = item.get("borderColor") or item.get("textColor") or "#374151"
    c.setFillColor(to_print_color(str(fill), print_mode))
    c.setStrokeColor(to_print_color(str(stroke), print_mode))
    c.setLineWidth(max(0.5, float(item.get("strokeWidth") or 0.5) * geom_line_scale))
    left, right = x_pt, x_pt + w_pt
    y_bottom = y_pt
    y_top = y_pt + h_pt
    p = c.beginPath()
    if variant == "topleft":
        p.moveTo(left, y_top)
        p.lineTo(right, y_top)
        p.lineTo(left, y_bottom)
    elif variant == "topright":
        p.moveTo(left, y_top)
        p.lineTo(right, y_top)
        p.lineTo(right, y_bottom)
    elif variant == "bottomleft":
        p.moveTo(left, y_top)
        p.lineTo(left, y_bottom)
        p.lineTo(right, y_bottom)
    elif variant == "bottomright":
        p.moveTo(right, y_top)
        p.lineTo(left, y_bottom)
        p.lineTo(right, y_bottom)
    else:
        p.moveTo(left, y_top)
        p.lineTo(right, y_top)
        p.lineTo(left, y_bottom)
    p.close()
    c.drawPath(p, fill=1, stroke=1)


def _draw_arrow_layout(
    c: Any,
    item: dict,
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
    *,
    geom_line_scale: float = POINTS_PER_MM,
    print_mode: bool = False,
) -> None:
    """Draw arrow: line stem + filled triangle head. ``(x_pt,y_pt)`` is bottom-left (PDF coords)."""
    direction = (item.get("direction") or "right").lower()
    stroke = item.get("borderColor") or item.get("textColor") or "#000000"
    fill = item.get("backgroundColor") or item.get("textColor") or stroke
    c.setFillColor(to_print_color(str(fill), print_mode))
    c.setStrokeColor(to_print_color(str(stroke), print_mode))
    c.setLineWidth(max(0.5, float(item.get("strokeWidth") or 1) * geom_line_scale))
    y_bottom = y_pt
    y_top = y_pt + h_pt
    cx = x_pt + w_pt / 2
    cy = y_bottom + h_pt / 2
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
        c.line(cx, y_bottom + head, cx, y_top - head)
        p = c.beginPath()
        p.moveTo(cx, y_top)
        p.lineTo(cx - head * 0.7, y_top - head * 0.7)
        p.lineTo(cx + head * 0.7, y_top - head * 0.7)
        p.close()
        c.drawPath(p, fill=1, stroke=1)
    else:
        c.line(cx, y_top - head, cx, y_bottom + head)
        p = c.beginPath()
        p.moveTo(cx, y_bottom)
        p.lineTo(cx - head * 0.7, y_bottom + head * 0.7)
        p.lineTo(cx + head * 0.7, y_bottom + head * 0.7)
        p.close()
        c.drawPath(p, fill=1, stroke=1)


def _draw_polygon_layout(
    c: Any,
    item: dict,
    x_pt: float,
    y_pt: float,
    w_pt: float,
    h_pt: float,
    *,
    geom_line_scale: float = POINTS_PER_MM,
    print_mode: bool = False,
) -> None:
    """Draw polygon from points string. Points in % or 0-1; Y is measured from the **top** of the box."""
    points_str = item.get("points") or "0 0, 100% 0, 50% 100%"
    fill = item.get("backgroundColor") or item.get("textColor") or "#e5e7eb"
    stroke = item.get("borderColor") or item.get("textColor") or "#374151"
    c.setFillColor(to_print_color(str(fill), print_mode))
    c.setStrokeColor(to_print_color(str(stroke), print_mode))
    c.setLineWidth(max(0.5, float(item.get("strokeWidth") or 0.5) * geom_line_scale))
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
    c: Any,
    layout_items: list[dict[str, Any]],
    label_width_pt: float,
    label_height_pt: float,
    tw: float,
    th: float,
    offset_x_pt: float = 0.0,
    offset_y_pt: float = 0.0,
    *,
    bleed_mm: float = 0.0,
    print_mode: bool = False,
) -> None:
    """Draw precomputed layout items (from ``compute_layout``) in native PDF coordinates."""
    _require_reportlab_for_pdf()
    for item in layout_items:
        _draw_layout_item(
            c,
            item,
            label_width_pt,
            label_height_pt,
            tw,
            th,
            offset_x_pt,
            offset_y_pt,
            bleed_mm=bleed_mm,
            print_mode=print_mode,
        )


def render_label_to_canvas_engine(
    c: Any,
    layout: dict,
    record: dict[str, Any],
    width_mm: float,
    height_mm: float,
    offset_x_pt: float = 0,
    offset_y_pt: float = 0,
    debug_draw_bounds: bool = False,
    *,
    bleed_mm: float = 0.0,
    print_mode: bool = False,
) -> None:
    """
    Draw one label using the generic engine.
    Uses single layout engine: compute_layout -> render_layout_items_to_canvas.
    """
    _require_reportlab_for_pdf()
    tw, th = _template_dimensions_mm(layout if isinstance(layout, dict) else None, width_mm, height_mm)
    label_width_pt = float(width_mm) * POINTS_PER_MM
    label_height_pt = float(height_mm) * POINTS_PER_MM
    print("DRAW AREA:", label_width_pt, label_height_pt, "TEMPLATE:", tw, th)
    layout_items = compute_layout(layout, record, width_mm, height_mm)
    print("LAYOUT ITEMS COUNT:", len(layout_items))
    render_layout_items_to_canvas(
        c,
        layout_items,
        label_width_pt,
        label_height_pt,
        tw,
        th,
        float(offset_x_pt),
        float(offset_y_pt),
        bleed_mm=bleed_mm,
        print_mode=print_mode,
    )


def build_label_pdf_engine(
    layout_json: str | dict,
    width_mm: float,
    height_mm: float,
    records: list[dict[str, Any]],
    debug_draw_bounds: bool = False,
    calibration: dict | None = None,
    *,
    print_mode: bool = False,
) -> bytes:
    """
    Build PDF using the generic engine. One page per record.
    Accepts layout_json with elements (text, barcode, rectangle, line, icon, group, repeater).
    calibration: optional dict (ignored for output).
    When ``print_mode`` is True, each page includes bleed, trim crop marks, and CMYK colors.
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

    _require_reportlab_for_pdf()

    assert width_mm and height_mm, "label PDF requires width_mm and height_mm"
    assert float(width_mm) > 0 and float(height_mm) > 0, "label PDF requires positive width_mm and height_mm"
    print("FINAL PDF SIZE:", width_mm, height_mm)

    from reportlab.lib.units import mm as mm_unit

    final_w_mm = float(width_mm)
    final_h_mm = float(height_mm)
    bleed_mm = float(LABEL_PDF_BLEED_MM) if print_mode else 0.0
    if print_mode:
        bleed_pt = bleed_mm * mm_unit
        w_pt = (final_w_mm + 2.0 * bleed_mm) * mm_unit
        h_pt = (final_h_mm + 2.0 * bleed_mm) * mm_unit
        trim_l = bleed_pt
        trim_b = bleed_pt
        trim_r = trim_l + final_w_mm * mm_unit
        trim_t = trim_b + final_h_mm * mm_unit
    else:
        bleed_pt = 0.0
        w_pt = final_w_mm * POINTS_PER_MM
        h_pt = final_h_mm * POINTS_PER_MM
        trim_l = trim_b = trim_r = trim_t = 0.0
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(w_pt, h_pt))
    log_label_pdf_stage(
        source="label_engine.build_label_pdf_engine",
        width_mm=float(width_mm),
        height_mm=float(height_mm),
        canvas_obj=c,
        detail=(
            f"print_mode={print_mode} trim_mm=({final_w_mm:.4f},{final_h_mm:.4f}) bleed_mm={bleed_mm} "
            f"pagesize_pt=({w_pt:.4f},{h_pt:.4f}) records={len(records)}"
        ),
    )
    print_pdf_canvas_size(c)

    if calibration:
        ox = float(calibration.get("offset_x_mm") or 0)
        oy = float(calibration.get("offset_y_mm") or 0)
        sc = float(calibration.get("scale") or 1.0)
        if ox != 0.0 or oy != 0.0 or sc != 1.0:
            logger.debug(
                "build_label_pdf_engine: ignoring printer calibration so PDF page size matches label (%.2f×%.2f mm)",
                width_mm,
                height_mm,
            )

    for i, record in enumerate(records):
        if i > 0:
            c.showPage()
            c.setPageSize((w_pt, h_pt))
        if print_mode:
            draw_crop_marks_outside_trim(c, trim_l, trim_b, trim_r, trim_t)
        c.saveState()
        c.translate(bleed_pt, bleed_pt)
        render_label_to_canvas_engine(
            c,
            layout,
            record,
            width_mm,
            height_mm,
            0.0,
            0.0,
            debug_draw_bounds,
            bleed_mm=bleed_mm,
            print_mode=print_mode,
        )
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
            valign = (el.get("verticalAlign") or el.get("vertical_text") or "middle").lower()
            text_anchor = "middle" if align == "center" else "end" if align == "right" else "start"
            tx = x_mm + w_mm / 2 if align == "center" else (x_mm + w_mm if align == "right" else x_mm)
            fn = PDF_FONT_BOLD if bold else PDF_FONT
            y_baseline = _text_baseline_y_svg_mm(y_mm, h_mm, fn, font_size, valign)
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
            valign = (el.get("verticalAlign") or "middle").lower()
            text_anchor = "middle" if align == "center" else "end" if align == "right" else "start"
            tx = x_mm + w_mm / 2 if align == "center" else (x_mm + w_mm if align == "right" else x_mm)
            fn = PDF_FONT_BOLD if bold else PDF_FONT
            y_baseline = _text_baseline_y_svg_mm(y_mm, h_mm, fn, font_size, valign)
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
            rr = _svg_rect_corner_attrs(el.get("cornerRadius"), w_mm, h_mm)
            frag = f'<rect x="{x_mm:.2f}" y="{y_mm:.2f}" width="{w_mm:.2f}" height="{h_mm:.2f}"{rr} fill="{_svg_escape(fill)}" stroke="{_svg_escape(stroke)}" stroke-width="{sw:.2f}"/>'
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
            item_h_mm = float(el.get("itemHeight") or el.get("itemWidth") or el.get("height") or 20)
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
        fn = PDF_FONT_BOLD if bold else PDF_FONT
        y_baseline = _text_baseline_y_svg_mm(y_mm, h_mm, fn, font_size, valign)
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
        rr = _svg_rect_corner_attrs(item.get("cornerRadius"), w_mm, h_mm)
        out.append(wrap_transform(
            f'<rect x="{x_mm:.2f}" y="{y_mm:.2f}" width="{w_mm:.2f}" height="{h_mm:.2f}"{rr} fill="{_svg_escape(fill)}" stroke="{_svg_escape(stroke)}" stroke-width="{sw:.2f}"/>'
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
    tw, th = _template_dimensions_mm(layout, width_mm, height_mm)
    layout_items = compute_layout(layout, record, width_mm, height_mm)
    out: list[str] = []
    for item in layout_items:
        _render_layout_item_svg(item, out)
    body = "\n".join(out)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {tw:.2f} {th:.2f}" '
        f'width="{width_mm}mm" height="{height_mm}mm" preserveAspectRatio="none">{body}</svg>'
    )
