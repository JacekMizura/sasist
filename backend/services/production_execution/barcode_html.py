"""Code128 PNG data-URI for HTML production cards (Puppeteer PDF)."""

from __future__ import annotations

import base64
import logging
from io import BytesIO

logger = logging.getLogger(__name__)


def code128_png_data_uri(value: str | None, *, bar_height: float = 36.0) -> str | None:
    text = (value or "").strip()
    if not text:
        return None
    try:
        from reportlab.graphics.barcode import code128
        from reportlab.graphics.shapes import Drawing
        from reportlab.graphics import renderPM

        bc = code128.Code128(text, barHeight=bar_height, displayValue=False)
        width = max(float(getattr(bc, "width", 120) or 120), 80.0)
        height = max(float(getattr(bc, "height", bar_height) or bar_height), bar_height)
        drawing = Drawing(width, height)
        drawing.add(bc)
        png = renderPM.drawToString(drawing, fmt="PNG")
        encoded = base64.b64encode(png).decode("ascii")
        return f"data:image/png;base64,{encoded}"
    except Exception as exc:
        logger.debug("code128_png_data_uri failed for %r: %s", text, exc)
        return None


def product_barcode_value(product) -> str | None:
    if product is None:
        return None
    for attr in ("ean", "barcode", "sku", "symbol"):
        raw = getattr(product, attr, None)
        if raw and str(raw).strip():
            return str(raw).strip()
    return None
