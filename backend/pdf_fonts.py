"""
Register Unicode-capable fonts for PDF generation (ReportLab).
Uses DejaVu Sans so Polish characters (ą, ć, ę, ł, ń, ó, ś, ź, ż) render correctly.
Place DejaVuSans.ttf and DejaVuSans-Bold.ttf in backend/assets/fonts/.
"""

import logging
import os

logger = logging.getLogger(__name__)

# Set after register_pdf_fonts(); use these everywhere for PDF text
PDF_FONT = "Helvetica"
PDF_FONT_BOLD = "Helvetica-Bold"

_registered = False


def register_pdf_fonts() -> None:
    """Register DejaVu Sans TTF fonts with ReportLab. Call once before generating PDFs."""
    global _registered, PDF_FONT, PDF_FONT_BOLD
    if _registered:
        return
    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont

        base = os.path.dirname(os.path.abspath(__file__))
        fonts_dir = os.path.join(base, "assets", "fonts")

        normal_path = os.path.join(fonts_dir, "DejaVuSans.ttf")
        bold_path = os.path.join(fonts_dir, "DejaVuSans-Bold.ttf")

        if os.path.isfile(normal_path):
            pdfmetrics.registerFont(TTFont("DejaVuSans", normal_path))
            PDF_FONT = "DejaVuSans"
            logger.info("Registered PDF font: DejaVuSans (%s)", normal_path)
        else:
            logger.warning(
                "DejaVuSans.ttf not found at %s. PDFs will use Helvetica; Polish characters may not render.",
                normal_path,
            )

        if os.path.isfile(bold_path):
            pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", bold_path))
            PDF_FONT_BOLD = "DejaVuSans-Bold"
            logger.info("Registered PDF font: DejaVuSans-Bold (%s)", bold_path)
        else:
            if PDF_FONT == "DejaVuSans":
                PDF_FONT_BOLD = "DejaVuSans"  # use normal for bold if bold TTF missing
            logger.warning(
                "DejaVuSans-Bold.ttf not found at %s. Bold text will use %s.",
                bold_path, PDF_FONT_BOLD,
            )

        _registered = True
    except Exception as e:
        logger.warning("Could not register DejaVu PDF fonts: %s. Using Helvetica.", e)
