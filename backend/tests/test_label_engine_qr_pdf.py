"""Label engine PDF: QR via ImageReader + Code128 regression."""

from __future__ import annotations

import io
import logging

import pytest
from pypdf import PdfReader

from backend.pdf_fonts import register_pdf_fonts
from backend.services.esp_scan_codes import parse_esp_scan
from backend.services.label_engine import build_label_pdf_engine, compute_layout


def _extract_qr_rgb(pdf_bytes: bytes) -> tuple[int, int, bytes]:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    page = reader.pages[0]
    xobj = page["/Resources"]["/XObject"].get_object()
    for name in xobj:
        obj = xobj[name].get_object()
        if obj.get("/Subtype") != "/Image":
            continue
        w = int(obj["/Width"])
        h = int(obj["/Height"])
        data = obj.get_data()
        return w, h, data
    raise AssertionError("no embedded image in PDF")


def test_qr_pdf_uses_image_reader_and_embeds_square_image(caplog):
    register_pdf_fonts()
    tpl = {
        "widthMm": 40,
        "heightMm": 40,
        "dpi": 300,
        "elements": [
            {
                "id": "q1",
                "type": "barcode",
                "x": 5,
                "y": 5,
                "width": 30,
                "height": 30,
                "format": "QR",
                "dataBinding": "barcode_data",
                "qrMargin": 1,
            }
        ],
    }
    record = {"barcode_data": "ESP:carrier:6"}
    with caplog.at_level(logging.WARNING, logger="backend.services.label_engine"):
        pdf = build_label_pdf_engine(tpl, 40.0, 40.0, [record])
    assert not any("Barcode render failed" in r.message for r in caplog.records)
    assert pdf.startswith(b"%PDF")
    w, h, data = _extract_qr_rgb(pdf)
    assert w == h
    assert w >= 64
    assert len(data) == w * h * 3

    # Pixel-exact match vs regenerated QR (quiet zone = 1)
    import qrcode
    from PIL import Image

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=1,
    )
    qr.add_data("ESP:carrier:6")
    qr.make(fit=True)
    expected = qr.make_image(fill_color="black", back_color="white").convert("RGB").resize(
        (w, h), Image.Resampling.NEAREST
    )
    actual = Image.frombytes("RGB", (w, h), data)
    assert list(actual.getdata()) == list(expected.getdata())
    assert parse_esp_scan("ESP:carrier:6") == ("carrier", 6)

    items = compute_layout(tpl, record, 40.0, 40.0)
    assert items[0]["barcodeValue"] == "ESP:carrier:6"
    assert items[0]["qrMargin"] == 1


def test_transparent_rounded_border_does_not_blackout_page():
    """Regression: fill=transparent must not paint black over the label (B* fill)."""
    register_pdf_fonts()
    tpl = {
        "widthMm": 100,
        "heightMm": 50,
        "dpi": 300,
        "elements": [
            {
                "id": "bg",
                "type": "rect",
                "x": 0,
                "y": 0,
                "width": 100,
                "height": 50,
                "fill": "#ffffff",
                "strokeWidth": 0,
                "zIndex": 0,
            },
            {
                "id": "left",
                "type": "rect",
                "x": 0,
                "y": 0,
                "width": 40,
                "height": 50,
                "fill": "#0f172a",
                "strokeWidth": 0,
                "zIndex": 1,
            },
            {
                "id": "q1",
                "type": "barcode",
                "x": 55,
                "y": 10,
                "width": 30,
                "height": 30,
                "format": "QR",
                "dataBinding": "barcode_data",
                "qrMargin": 1,
                "zIndex": 5,
            },
            {
                "id": "border",
                "type": "rect",
                "x": 0,
                "y": 0,
                "width": 100,
                "height": 50,
                "fill": "transparent",
                "borderColor": "#14b8a6",
                "strokeWidth": 0.35,
                "cornerRadius": 1,
                "zIndex": 10,
            },
        ],
    }
    pdf = build_label_pdf_engine(tpl, 100.0, 50.0, [{"barcode_data": "ESP:carrier:6"}])
    import fitz

    doc = fitz.open(stream=pdf, filetype="pdf")
    pix = doc[0].get_pixmap(dpi=72, alpha=False)
    doc.close()
    w, h = pix.width, pix.height
    # Sample right-side white area (should not be blacked out by outer border).
    i = ((h // 2) * w + int(w * 0.85)) * 3
    r, g, b = pix.samples[i], pix.samples[i + 1], pix.samples[i + 2]
    assert r > 200 and g > 200 and b > 200, (r, g, b)
    mean = sum(pix.samples) / len(pix.samples)
    assert mean > 40, mean


def test_code128_pdf_still_renders_without_image(caplog):
    register_pdf_fonts()
    tpl = {
        "widthMm": 80,
        "heightMm": 30,
        "dpi": 300,
        "elements": [
            {
                "id": "b1",
                "type": "barcode",
                "x": 5,
                "y": 5,
                "width": 70,
                "height": 18,
                "format": "Code128",
                "dataBinding": "barcode_data",
            },
            {
                "id": "t1",
                "type": "dynamicText",
                "x": 5,
                "y": 24,
                "width": 70,
                "height": 5,
                "binding": "{code}",
                "fontSize": 8,
            },
        ],
    }
    record = {"barcode_data": "PAL-000006", "{code}": "PAL-000006", "code": "PAL-000006"}
    with caplog.at_level(logging.WARNING, logger="backend.services.label_engine"):
        pdf = build_label_pdf_engine(tpl, 80.0, 30.0, [record])
    assert not any("Barcode render failed" in r.message for r in caplog.records)
    reader = PdfReader(io.BytesIO(pdf))
    text = reader.pages[0].extract_text() or ""
    assert "PAL-000006" in text
    # Code128 is vector — typically no raster XObject image
    resources = reader.pages[0].get("/Resources")
    if resources and resources.get("/XObject"):
        xobj = resources["/XObject"].get_object()
        for name in xobj:
            obj = xobj[name].get_object()
            assert obj.get("/Subtype") != "/Image", "Code128 should remain vector, not raster QR path"


def test_carrier_preset_pdf_text_and_qr_payload():
    register_pdf_fonts()
    from pathlib import Path
    import json

    preset = Path("frontend/src/labelSystem/presets/carrierLabelHorizontal100x50.json")
    if not preset.is_file():
        pytest.skip("preset missing")
    tpl = json.loads(preset.read_text(encoding="utf-8"))
    record = {
        "carrier_code": "PAL-000006",
        "{carrier_code}": "PAL-000006",
        "barcode_data": "ESP:carrier:6",
        "{barcode_data}": "ESP:carrier:6",
        "carrier_scan_code": "ESP:carrier:6",
    }
    pdf = build_label_pdf_engine(tpl, 100.0, 50.0, [record])
    reader = PdfReader(io.BytesIO(pdf))
    page = reader.pages[0]
    box = page.mediabox
    w_mm = float(box.width) * 25.4 / 72
    h_mm = float(box.height) * 25.4 / 72
    assert abs(w_mm - 100) < 0.6
    assert abs(h_mm - 50) < 0.6
    text = page.extract_text() or ""
    assert "PAL-000006" in text
    w, h, data = _extract_qr_rgb(pdf)
    assert w == h
    import qrcode
    from PIL import Image

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=1,
    )
    qr.add_data("ESP:carrier:6")
    qr.make(fit=True)
    expected = qr.make_image(fill_color="black", back_color="white").convert("RGB").resize(
        (w, h), Image.Resampling.NEAREST
    )
    actual = Image.frombytes("RGB", (w, h), data)
    assert list(actual.getdata()) == list(expected.getdata())
