"""
Register embedded TTF fonts for PDF generation (ReportLab).
Requires DejaVu Sans TTF files in backend/assets/fonts/ (no Helvetica fallback).
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

PDF_FONT = "DejaVuSans"
PDF_FONT_BOLD = "DejaVuSans-Bold"

_registered = False


class PdfEmbeddedFontsError(RuntimeError):
    """Raised when DejaVu TTF files are missing from ``backend/assets/fonts/``."""


def register_pdf_fonts() -> None:
    """Register DejaVu Sans TTF fonts with ReportLab. Call once before generating PDFs."""
    global _registered
    if _registered:
        return
    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont

        base = os.path.dirname(os.path.abspath(__file__))
        fonts_dir = os.path.join(base, "assets", "fonts")
        normal_path = os.path.join(fonts_dir, "DejaVuSans.ttf")
        bold_path = os.path.join(fonts_dir, "DejaVuSans-Bold.ttf")

        if not os.path.isfile(normal_path):
            raise PdfEmbeddedFontsError(
                f"DejaVuSans.ttf not found at {normal_path}. Place DejaVu TTF files in backend/assets/fonts/."
            )
        if not os.path.isfile(bold_path):
            raise PdfEmbeddedFontsError(
                f"DejaVuSans-Bold.ttf not found at {bold_path}. Place DejaVu TTF files in backend/assets/fonts/."
            )

        pdfmetrics.registerFont(TTFont("DejaVuSans", normal_path))
        pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", bold_path))
        logger.info("Registered PDF fonts: DejaVuSans, DejaVuSans-Bold (%s)", fonts_dir)
        _registered = True
    except PdfEmbeddedFontsError:
        raise
    except Exception as e:
        raise PdfEmbeddedFontsError(f"Could not register DejaVu PDF fonts: {e}") from e
