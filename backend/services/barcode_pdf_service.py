"""
Generate PDF with Code128 barcodes for cart and baskets.
One label per page: barcode (Code128) scaled to fill the label media box, bars only.
Page size is physical label dimensions (mm → points), never a generic office sheet size.
"""

import io

from ..pdf_fonts import register_pdf_fonts
from .label_pdf_generation_log import log_label_pdf_flow, log_label_pdf_stage, print_pdf_canvas_size
from .pdf_deps import raise_if_no_reportlab

try:
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas
    from reportlab.graphics.barcode import code128

    _REPORTLAB = True
except ImportError:
    mm = None  # type: ignore[misc, assignment]
    canvas = None  # type: ignore[misc, assignment]
    code128 = None  # type: ignore[misc, assignment]
    _REPORTLAB = False

# Match label_render_service._safe_default_template when no template dimensions are known.
_DEFAULT_LABEL_WIDTH_MM = 100.0
_DEFAULT_LABEL_HEIGHT_MM = 60.0

if _REPORTLAB:
    _MM = mm
    BARCODE_BAR_WIDTH = 0.5 * _MM
    BARCODE_HEIGHT = 25 * _MM
else:
    BARCODE_BAR_WIDTH = 0.0
    BARCODE_HEIGHT = 124.0


def build_barcodes_pdf(
    labels: list[str],
    *,
    width_mm: float | None = None,
    height_mm: float | None = None,
) -> bytes:
    """
    Build a PDF with one label per page. Media box = width_mm × height_mm (defaults 100×60 mm).
    Barcode is uniformly scaled to fit inside the page and drawn from the bottom-left origin (0, 0).
    labels: list of strings, e.g. ["CART-0001", "CART-0001-B01", ...]
    """
    raise_if_no_reportlab(_REPORTLAB)
    register_pdf_fonts()

    w_mm = float(width_mm) if width_mm is not None and float(width_mm) > 0 else _DEFAULT_LABEL_WIDTH_MM
    h_mm = float(height_mm) if height_mm is not None and float(height_mm) > 0 else _DEFAULT_LABEL_HEIGHT_MM
    assert w_mm and h_mm
    assert float(w_mm) > 0 and float(h_mm) > 0
    print("FINAL PDF SIZE:", w_mm, h_mm)
    page_width = w_mm * mm
    page_height = h_mm * mm

    log_label_pdf_flow(
        "barcode_pdf_service",
        template_id=None,
        template_json=None,
        width_mm=w_mm,
        height_mm=h_mm,
        detail=f"build_barcodes_pdf labels_count={len(labels)}",
    )

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(page_width, page_height))
    print_pdf_canvas_size(c)
    log_label_pdf_stage(
        source="barcode_pdf_service.build_barcodes_pdf",
        template_id=None,
        template_json_present=None,
        width_mm=w_mm,
        height_mm=h_mm,
        canvas_obj=c,
        detail=f"labels_count={len(labels)} pagesize_pt=({page_width:.4f},{page_height:.4f})",
    )

    for i, text in enumerate(labels):
        if i > 0:
            c.showPage()
            c.setPageSize((page_width, page_height))
        try:
            barcode = code128.Code128(
                text,
                barWidth=BARCODE_BAR_WIDTH,
                barHeight=BARCODE_HEIGHT,
            )
            bw = float(getattr(barcode, "width", 100) or 100)
            bh = float(getattr(barcode, "height", BARCODE_HEIGHT) or BARCODE_HEIGHT)
        except Exception:
            barcode = None
            bw = 100.0
            bh = float(BARCODE_HEIGHT)

        if barcode is not None:
            scale = min(page_width / max(bw, 0.01), page_height / max(bh, 0.01))
            c.saveState()
            c.scale(scale, scale)
            barcode.drawOn(c, 0, 0)
            c.restoreState()

    c.save()
    buf.seek(0)
    return buf.read()
