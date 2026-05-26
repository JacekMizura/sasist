"""
Structured debug logging for label PDF generation (trace code path + page size).

Log lines use prefix ``[label-pdf]`` so they are easy to grep. Label flows must use
label mm only; we warn if ``canvas._pagesize`` matches a common office default sheet (pt).
"""

from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

LOG_PREFIX = "[label-pdf]"
FLOW_PREFIX = "[label-pdf-flow]"

# Avoid huge stdout lines when logging template_json from DB
_TEMPLATE_JSON_PRINT_MAX = 4000


def log_label_pdf_flow(
    service: str,
    *,
    template_id: int | None = None,
    template_json: str | None = None,
    width_mm: float | None = None,
    height_mm: float | None = None,
    detail: str = "",
) -> None:
    """
    High-visibility trace: which module handles PDF (CSV uses ``label_render_service`` via
    ``POST /labels/render-pdf``, not ``barcode_pdf_service``).
    """
    logger.info(
        "%s SERVICE=%s template_id=%s width_mm=%s height_mm=%s detail=%s",
        FLOW_PREFIX,
        service,
        template_id,
        width_mm,
        height_mm,
        detail,
    )
    print(f"{FLOW_PREFIX} SERVICE={service} template_id={template_id} width_mm={width_mm} height_mm={height_mm}")
    if template_json is not None:
        tj = str(template_json)
        if len(tj) > _TEMPLATE_JSON_PRINT_MAX:
            tj = tj[:_TEMPLATE_JSON_PRINT_MAX] + f"... [truncated, total_len={len(str(template_json))}]"
        print(f"{FLOW_PREFIX} template_json={tj!r}")
    if detail:
        print(f"{FLOW_PREFIX} detail={detail!r}")


def print_pdf_canvas_size(canvas: Any) -> None:
    """ReportLab canvas media box in points (must match label mm × POINTS_PER_MM)."""
    print("PDF SIZE:", getattr(canvas, "_pagesize", None))

# ISO 216 ~210×297 mm @ 72 dpi (portrait), points — guardrail only; label PDFs must not use this as pagesize.
_OFFICE_DEFAULT_SHORT_PT = 595.2756
_OFFICE_DEFAULT_LONG_PT = 841.8898


def _tuple2f(t: Any) -> tuple[float, float] | None:
    if t is None:
        return None
    try:
        if len(t) < 2:
            return None
        return (float(t[0]), float(t[1]))
    except (TypeError, ValueError):
        return None


def canvas_pagesize_pt(canvas: Any) -> tuple[float, float] | None:
    """Return ReportLab canvas ``_pagesize`` (width, height) in points, or None."""
    if canvas is None:
        return None
    return _tuple2f(getattr(canvas, "_pagesize", None))


def pagesize_looks_like_office_default_sheet_pt(ps: tuple[float, float] | None) -> bool:
    """True if size matches portrait or landscape ~210×297 mm office sheet (within tolerance)."""
    if ps is None:
        return False
    w, h = ps[0], ps[1]
    lo, hi = (w, h) if w <= h else (h, w)
    return abs(lo - _OFFICE_DEFAULT_SHORT_PT) < 2.0 and abs(hi - _OFFICE_DEFAULT_LONG_PT) < 2.0


def log_label_pdf_stage(
    *,
    source: str,
    template_id: Optional[int] = None,
    template_json_present: Optional[bool] = None,
    template_name: Optional[str] = None,
    width_mm: Optional[float] = None,
    height_mm: Optional[float] = None,
    canvas_obj: Any = None,
    detail: str = "",
) -> None:
    """
    Log one stage of label PDF generation.

    Pass ``canvas_obj`` right after ``canvas.Canvas(...)`` to log ``canvas._pagesize`` (pt).
    """
    ps = canvas_pagesize_pt(canvas_obj)
    ps_str = repr(ps) if ps is not None else "None"
    extra = f"detail={detail!r}" if detail else ""
    logger.info(
        "%s source=%s template_id=%s template_json_present=%s template_name=%r "
        "width_mm=%s height_mm=%s canvas._pagesize_pt=%s %s",
        LOG_PREFIX,
        source,
        template_id,
        template_json_present,
        template_name,
        width_mm,
        height_mm,
        ps_str,
        extra,
    )
    if ps is not None and pagesize_looks_like_office_default_sheet_pt(ps):
        logger.warning(
            "%s UNEXPECTED_OFFICE_DEFAULT_PAGESIZE source=%s canvas._pagesize_pt=%s — label flow must use label mm",
            LOG_PREFIX,
            source,
            ps_str,
        )
