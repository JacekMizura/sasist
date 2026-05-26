"""PDF export for warehouse stock documents (ReportLab)."""

from __future__ import annotations

from io import BytesIO

from sqlalchemy.orm import Session

from ..pdf_fonts import PDF_FONT, PDF_FONT_BOLD, register_pdf_fonts
from .pdf_deps import raise_if_no_reportlab
from .stock_document_service import get_stock_document_read

try:
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False


def build_stock_document_pdf_bytes(db: Session, tenant_id: int, document_id: int) -> bytes:
    raise_if_no_reportlab(REPORTLAB_AVAILABLE)
    register_pdf_fonts()
    read = get_stock_document_read(db, tenant_id, document_id)
    if not read:
        raise ValueError("Document not found")

    buf = BytesIO()
    # Warehouse document layout (210×297 mm), not label PDFs.
    doc = SimpleDocTemplate(
        buf,
        pagesize=(210 * mm, 297 * mm),
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        name="Hdr",
        parent=styles["Heading1"],
        fontName=PDF_FONT_BOLD,
        fontSize=16,
        leading=20,
    )
    body = ParagraphStyle(name="Body", parent=styles["Normal"], fontName=PDF_FONT, fontSize=9, leading=12)
    small = ParagraphStyle(name="Sm", parent=styles["Normal"], fontName=PDF_FONT, fontSize=8, leading=11)
    story = []

    story.append(Paragraph("Przyjęcie dostawy", title_style))
    ca = read.created_at
    ca_s = ca.strftime("%Y-%m-%d %H:%M") if hasattr(ca, "strftime") else str(ca)
    story.append(Paragraph(f"<i>Dokument magazynowy</i> · {read.document_type} #{read.id}", small))
    story.append(Spacer(1, 4))
    creator = (read.created_by.full_name if read.created_by else "System").strip() or "System"
    delivery_ref = f"#{read.delivery_id}" if read.delivery_id is not None else "—"
    story.append(Paragraph(f"Data: {ca_s} · Zamówienie dostawy: {delivery_ref}", body))
    story.append(Paragraph(f"<b>Utworzył:</b> {creator}", body))
    story.append(Spacer(1, 8))
    sup = (read.supplier_name or "").strip() or "—"
    story.append(Paragraph(f"<b>Kontrahent:</b> {sup}", body))
    wh = (read.warehouse_name or "").strip()
    if wh:
        story.append(Paragraph(f"<b>Magazyn:</b> {wh}", small))
    story.append(Spacer(1, 10))

    def _type_label(rt: str | None) -> str:
        s = (rt or "").strip().lower()
        if s == "carton":
            return "Karton"
        if s == "packaging_material":
            return "Materiał pakowy"
        if s == "product":
            return "Produkt"
        return "—"

    hdr = ["Lp.", "Typ", "Nazwa", "Przyjęto", "Cena netto", "Wartość netto"]
    data = [hdr]
    for i, it in enumerate(read.items, start=1):
        raw_nm = (it.product_name or "").strip()
        if raw_nm:
            name = raw_nm.replace("&", "&amp;").replace("<", "&lt;")
        elif getattr(it, "item_id", None):
            name = str(getattr(it, "item_id", "")).replace("&", "&amp;").replace("<", "&lt;")
        elif it.product_id is not None:
            name = f"Produkt #{int(it.product_id)}".replace("&", "&amp;").replace("<", "&lt;")
        else:
            name = "Pozycja"
        pq = it.purchase_price_net
        val = it.value_net
        rt = getattr(it, "receipt_line_type", None)
        data.append(
            [
                str(i),
                _type_label(str(rt) if rt is not None else None),
                name,
                f"{it.received_quantity:g}",
                f"{pq:g}" if pq is not None else "—",
                f"{val:g}" if val is not None else "—",
            ]
        )

    t = Table(data, colWidths=[10 * mm, 22 * mm, 62 * mm, 22 * mm, 24 * mm, 26 * mm])
    t.setStyle(
        TableStyle(
            [
                ("FONT", (0, 0), (-1, 0), PDF_FONT_BOLD),
                ("FONT", (0, 1), (-1, -1), PDF_FONT),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(t)
    story.append(Spacer(1, 12))

    cur = read.currency or "PLN"
    net = read.total_net
    gross = read.total_gross
    net_s = f"{net:g}" if net is not None else "—"
    gross_s = f"{gross:g}" if gross is not None else "—"
    story.append(Paragraph(f"<b>Suma netto:</b> {net_s} {cur}", body))
    story.append(Paragraph(f"<b>Suma brutto:</b> {gross_s} {cur}", body))

    doc.build(story)
    return buf.getvalue()
