"""
Import barcode data from PDF files.

Converts PDF pages to images (pdf2image) and detects barcodes (pyzbar).
Returns a flat list of barcode values (e.g. location codes).
"""

import logging

logger = logging.getLogger(__name__)


def extract_barcodes_from_pdf(pdf_bytes: bytes) -> list[str]:
    """
    Convert PDF pages to images, detect barcodes on each image, return list of barcode values.

    Args:
        pdf_bytes: Raw PDF file content.

    Returns:
        List of barcode data strings (e.g. ["A-01-01", "A-01-02", ...]).
        Order follows page order and left-to-right/top-to-bottom where possible.
    """
    try:
        from pdf2image import convert_from_bytes
    except ImportError:
        logger.error("pdf2image not installed. pip install pdf2image (requires poppler)")
        raise ValueError("PDF conversion not available: install pdf2image and poppler") from None

    try:
        from pyzbar import pyzbar
    except ImportError:
        logger.error("pyzbar not installed. pip install pyzbar (may require libzbar)")
        raise ValueError("Barcode detection not available: install pyzbar") from None

    if not pdf_bytes or len(pdf_bytes) < 100:
        return []

    try:
        images = convert_from_bytes(pdf_bytes, dpi=150)
    except Exception as e:
        logger.warning("pdf2image failed: %s", e)
        raise ValueError(f"Could not convert PDF to images: {e}") from e

    result: list[str] = []
    for i, img in enumerate(images):
        try:
            decoded = pyzbar.decode(img)
            for obj in decoded:
                try:
                    value = obj.data.decode("utf-8").strip()
                    if value and value not in result:
                        result.append(value)
                except UnicodeDecodeError:
                    try:
                        value = obj.data.decode("latin-1").strip()
                        if value:
                            result.append(value)
                    except Exception:
                        pass
        except Exception as e:
            logger.warning("pyzbar decode failed on page %s: %s", i + 1, e)
    return result
