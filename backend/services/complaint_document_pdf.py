"""Generate complaint legal / financial / RMA PDFs (ReportLab)."""

from __future__ import annotations

import io
import json
import logging
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from xml.sax.saxutils import escape

from ..models.complaint import Complaint
from ..models.complaint_line import ComplaintLine
from ..models.order import Order
from ..pdf_fonts import PDF_FONT, PDF_FONT_BOLD, register_pdf_fonts
from .pdf_deps import raise_if_no_reportlab

logger = logging.getLogger(__name__)

UPLOAD_ROOT = Path(__file__).resolve().parent.parent / "uploads"

try:
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm, mm
    from reportlab.platypus import Image as RLImage
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    _REPORTLAB = True
except ImportError:
    _REPORTLAB = False


def _styles():
    register_pdf_fonts()
    base = getSampleStyleSheet()
    normal = ParagraphStyle(
        name="CdNormal",
        parent=base["Normal"],
        fontName=PDF_FONT,
        fontSize=10,
        leading=13,
    )
    heading = ParagraphStyle(
        name="CdHeading",
        parent=base["Heading1"],
        fontName=PDF_FONT_BOLD,
        fontSize=14,
        leading=18,
        spaceAfter=8,
    )
    small = ParagraphStyle(
        name="CdSmall",
        parent=normal,
        fontSize=9,
        leading=11,
        textColor=colors.grey,
    )
    return normal, heading, small


def _complaint_ref(c: Complaint) -> str:
    rc = getattr(c, "reference_code", None)
    if rc and str(rc).strip():
        return str(rc).strip()
    return f"#{c.id}"


def _norm_status_pl(st: str) -> str:
    s = str(st or "").strip().upper()
    if s == "ZAAKCEPTOWANA":
        return "Zaakceptowana"
    if s == "ODRZUCONA":
        return "Odrzucona"
    return s or "—"


def _resolution_label(rt: Optional[str]) -> str:
    r = str(rt or "").strip().upper()
    m = {
        "REPLACEMENT": "Wymiana (nowe zamówienie)",
        "REFUND": "Pełny zwrot",
        "PARTIAL_REFUND": "Częściowy zwrot",
        "REJECTION": "Odmowa rozpatrzenia (bez zwrotu)",
    }
    return m.get(r, r or "—")


def _defect_ids_from_complaint(c: Complaint) -> List[str]:
    raw = getattr(c, "defects_json", None)
    if not raw or not str(raw).strip():
        return []
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [str(x) for x in data if x is not None and str(x).strip()][:30]
    except Exception:
        pass
    return []


def _line_photos(line: ComplaintLine) -> List[str]:
    raw = getattr(line, "photo_urls_json", None)
    if not raw or not str(raw).strip():
        return []
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [str(x) for x in data if x is not None and str(x).strip()][:10]
    except Exception:
        pass
    return []


def _abs_upload_path(url: str) -> Optional[Path]:
    u = str(url).strip()
    if not u.startswith("/uploads/"):
        return None
    rel = u[len("/uploads/") :].lstrip("/")
    p = (UPLOAD_ROOT / rel).resolve()
    try:
        p.relative_to(UPLOAD_ROOT.resolve())
    except ValueError:
        return None
    if p.is_file():
        return p
    return None


def build_decision_pdf_bytes(c: Complaint) -> bytes:
    raise_if_no_reportlab(_REPORTLAB)
    normal, heading, small = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=(210 * mm, 297 * mm), topMargin=1.5 * cm, bottomMargin=1.5 * cm)
    story: List[Any] = []

    story.append(Paragraph(escape("Decyzja reklamacyjna"), heading))
    story.append(Paragraph(escape(f"Numer sprawy: {_complaint_ref(c)}"), normal))
    story.append(Paragraph(escape(f"Data dokumentu: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC"), small))
    story.append(Spacer(1, 0.4 * cm))

    st = _norm_status_pl(str(getattr(c, "status", None) or ""))
    story.append(Paragraph(escape(f"<b>Status końcowy reklamacji:</b> {st}"), normal))
    fd = getattr(c, "financial_decision", None)
    rt = getattr(c, "resolution_type", None)
    if fd or rt:
        story.append(
            Paragraph(
                escape(
                    f"<b>Rozliczenie / decyzja finansowa:</b> {_resolution_label(str(rt) if rt else None)}"
                    + (f" (pole legacy: {fd})" if fd else "")
                ),
                normal,
            )
        )
    story.append(Spacer(1, 0.5 * cm))
    story.append(Paragraph(escape("<b>Pozycje</b>"), normal))
    story.append(Spacer(1, 0.2 * cm))

    rows: List[List[str]] = [["Produkt", "SKU", "Ilość", "Powód"]]
    for line in sorted(getattr(c, "lines", None) or [], key=lambda x: x.id):
        oi = line.order_item
        prod = oi.product if oi else None
        nm = getattr(prod, "name", None) if prod else None
        sku = None
        if prod:
            sku = getattr(prod, "sku", None) or getattr(prod, "symbol", None)
        rows.append(
            [
                str(nm or "—")[:80],
                str(sku or "—")[:32],
                str(line.quantity),
                str(line.reason or "—")[:120],
            ]
        )
    t = Table(rows, colWidths=[6.5 * cm, 3 * cm, 1.2 * cm, 6.3 * cm])
    t.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, 0), PDF_FONT_BOLD),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(t)
    doc.build(story)
    return buf.getvalue()


def build_correction_pdf_bytes(c: Complaint, order: Optional[Order]) -> bytes:
    raise_if_no_reportlab(_REPORTLAB)
    normal, heading, small = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=(210 * mm, 297 * mm), topMargin=1.5 * cm, bottomMargin=1.5 * cm)
    story: List[Any] = []

    inv = None
    ord_no = None
    if order:
        inv = getattr(order, "sales_document_number", None)
        ord_no = getattr(order, "number", None)

    story.append(Paragraph(escape("Dokument korekty (zgłoszenie reklamacyjne)"), heading))
    story.append(Paragraph(escape(f"Reklamacja: {_complaint_ref(c)}"), normal))
    story.append(
        Paragraph(
            escape(
                f"Powiązana faktura / dokument sprzedaży: {str(inv).strip() if inv and str(inv).strip() else '—'}"
            ),
            normal,
        )
    )
    story.append(
        Paragraph(
            escape(f"Zamówienie źródłowe (wewn.): {str(ord_no).strip() if ord_no and str(ord_no).strip() else '—'}"),
            normal,
        )
    )
    rt = str(getattr(c, "resolution_type", None) or "").upper()
    amt = getattr(c, "resolution_amount", None)
    cur = getattr(c, "resolution_currency", None) or "PLN"
    story.append(Spacer(1, 0.4 * cm))
    story.append(Paragraph(escape(f"<b>Typ korekty:</b> {_resolution_label(rt)}"), normal))
    if amt is not None:
        story.append(Paragraph(escape(f"<b>Kwota korekty:</b> {amt} {cur}"), normal))
    story.append(Paragraph(escape(f"Data: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC"), small))
    story.append(Spacer(1, 0.5 * cm))
    story.append(
        Paragraph(
            escape(
                "Ten dokument informacyjny powstał automatycznie w systemie. "
                "Formalną korektę wystaw zgodnie z procedurą księgową / ERP."
            ),
            small,
        )
    )
    doc.build(story)
    return buf.getvalue()


def build_rma_pdf_bytes(c: Complaint) -> bytes:
    raise_if_no_reportlab(_REPORTLAB)
    normal, heading, small = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=(210 * mm, 297 * mm), topMargin=1.5 * cm, bottomMargin=1.5 * cm)
    story: List[Any] = []

    story.append(Paragraph(escape("Dokument RMA — naprawa"), heading))
    story.append(Paragraph(escape(f"Reklamacja: {_complaint_ref(c)}"), normal))
    story.append(Paragraph(escape(f"Data: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC"), small))
    defects = _defect_ids_from_complaint(c)
    if defects:
        story.append(Paragraph(escape(f"<b>Tagi wad (reklamacja):</b> {', '.join(defects)}"), normal))
    story.append(Spacer(1, 0.4 * cm))

    by_producer: Dict[str, List[ComplaintLine]] = defaultdict(list)
    for line in getattr(c, "lines", None) or []:
        d = str(line.line_decision or "").strip().lower()
        if d != "repair":
            continue
        oi = line.order_item
        prod = oi.product if oi else None
        man = ""
        if prod:
            m = getattr(prod, "manufacturer", None)
            man = str(m).strip() if m and str(m).strip() else ""
        key = man or "(Brak producenta w katalogu)"
        by_producer[key].append(line)

    if not by_producer:
        story.append(Paragraph(escape("Brak pozycji z decyzją „naprawa”."), normal))
        doc.build(story)
        return buf.getvalue()

    for producer, lines in sorted(by_producer.items(), key=lambda x: x[0].lower()):
        story.append(Paragraph(escape(f"<b>Producent: {producer}</b>"), normal))
        story.append(Spacer(1, 0.15 * cm))
        for line in sorted(lines, key=lambda x: x.id):
            oi = line.order_item
            prod = oi.product if oi else None
            nm = getattr(prod, "name", None) if prod else None
            sku = None
            if prod:
                sku = getattr(prod, "sku", None) or getattr(prod, "symbol", None)
            story.append(
                Paragraph(
                    escape(
                        f"• {nm or '—'} — SKU {sku or '—'} — szt. {line.quantity} — "
                        f"powód: {line.reason or '—'}"
                    ),
                    normal,
                )
            )
            for pu in _line_photos(line)[:4]:
                pth = _abs_upload_path(pu)
                if pth:
                    try:
                        img = RLImage(str(pth), width=4 * cm, height=4 * cm)
                        story.append(img)
                        story.append(Spacer(1, 0.1 * cm))
                    except Exception as ex:
                        logger.debug("RMA PDF skip image %s: %s", pth, ex)
                        story.append(Paragraph(escape(f"  (zdjęcie: {pu})"), small))
        story.append(Spacer(1, 0.35 * cm))

    doc.build(story)
    return buf.getvalue()
