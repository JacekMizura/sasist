"""
Generate PDF with Code128 barcodes for cart and baskets.
One label per page: large centered barcode only (no human-readable text).
"""

import io
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.graphics.barcode import code128

from ..pdf_fonts import register_pdf_fonts

register_pdf_fonts()

MARGIN = 20 * mm
BARCODE_BAR_WIDTH = 0.5 * mm
BARCODE_HEIGHT = 25 * mm


def build_barcodes_pdf(labels: list[str]) -> bytes:
    """
    Build a PDF with one label per page: barcode (Code128) centered, bars only.
    After each label, showPage() so the next label starts on a new page.
    labels: list of strings, e.g. ["CART-0001", "CART-0001-B01", ...]
    """
    buf = io.BytesIO()
    page_width, page_height = A4

    c = canvas.Canvas(buf, pagesize=A4)

    for i, text in enumerate(labels):
        try:
            barcode = code128.Code128(
                text,
                barWidth=BARCODE_BAR_WIDTH,
                barHeight=BARCODE_HEIGHT,
            )
            bw = getattr(barcode, "width", 100)
            bh = getattr(barcode, "height", float(BARCODE_HEIGHT))
        except Exception:
            barcode = None
            bw = 100
            bh = float(BARCODE_HEIGHT)

        x_barcode = (page_width - bw) / 2.0
        y_center = page_height / 2.0
        y_barcode_bottom = y_center - bh / 2.0

        if barcode is not None:
            barcode.drawOn(c, x_barcode, y_barcode_bottom)

        if i < len(labels) - 1:
            c.showPage()

    c.save()
    buf.seek(0)
    return buf.read()
