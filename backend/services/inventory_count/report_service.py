"""Inventory report generation — PDF/XLSX enterprise exports."""

from __future__ import annotations

import hashlib
import io
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.audit_event import InventoryAuditEvent
from ...models.inventory_count.constants import AUDIT_EXPORT, REPORT_FORMAT_PDF, REPORT_FORMAT_XLSX
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.inventory_count.report import InventoryReport
from ...models.inventory_count.snapshot import InventorySnapshotStockLine
from ...models.location import Location
from ...models.product import Product
from .audit_service import log_inventory_audit
from .difference_service import analyze_document_differences
from .errors import InventoryDocumentNotFoundError
from .line_materialization_service import get_stock_snapshot

logger = logging.getLogger(__name__)

REPORT_KINDS = {
    "counting_sheet": "Arkusz inwentaryzacji (spis z natury)",
    "differences": "Protokół różnic inwentaryzacyjnych",
    "missing_stock": "Raport braków",
    "excess_stock": "Raport nadwyżek",
    "adjustments": "Raport korekt magazynowych",
    "user_activity": "Aktywność operatorów",
    "empty_locations": "Puste lokalizacje",
    "problematic_locations": "Problematyczne lokalizacje",
    "valuation": "Wycena inwentaryzacji",
    "opening_balance": "Bilans otwarcia (snapshot)",
    "closing_balance": "Bilans zamknięcia",
    "recount": "Raport ponownych liczeń",
    "product_discrepancy": "Rozbieżności produktów",
    "serial_mismatch": "Niezgodności numerów seryjnych",
    "lot_mismatch": "Niezgodności partii",
}

UPLOADS_SUBDIR = Path("uploads") / "inventory_reports"


def _report_rows_for_kind(db: Session, doc: InventoryDocument, kind: str) -> tuple[list[str], list[list[Any]]]:
    if kind == "opening_balance":
        snap = get_stock_snapshot(db, int(doc.id))
        headers = ["Lokalizacja", "SKU", "EAN", "Produkt", "Partia", "Ilość snapshot", "Rezerwacja"]
        rows: list[list[Any]] = []
        if snap:
            for sl, loc, prod in (
                db.query(InventorySnapshotStockLine, Location, Product)
                .outerjoin(Location, Location.id == InventorySnapshotStockLine.location_id)
                .outerjoin(Product, Product.id == InventorySnapshotStockLine.product_id)
                .filter(InventorySnapshotStockLine.snapshot_id == int(snap.id))
                .all()
            ):
                rows.append(
                    [
                        loc.name if loc else sl.location_id,
                        getattr(prod, "sku", "") if prod else "",
                        getattr(prod, "ean", "") if prod else "",
                        getattr(prod, "name", "") if prod else "",
                        sl.batch_number or "",
                        sl.quantity,
                        sl.reserved_quantity,
                    ]
                )
        return headers, rows

    analysis = analyze_document_differences(db, document=doc)
    base_headers = [
        "Lokalizacja",
        "SKU",
        "EAN",
        "Produkt",
        "Oczekiwana",
        "Policzona",
        "Różnica",
        "Różnica %",
        "Wpływ netto",
        "Klasa",
        "Status",
    ]

    def _line_rows(filter_fn) -> list[list[Any]]:
        out = []
        for row in analysis["lines"]:
            if not filter_fn(row):
                continue
            loc = db.query(Location).filter(Location.id == int(row["location_id"])).first()
            prod = db.query(Product).filter(Product.id == int(row["product_id"])).first()
            out.append(
                [
                    loc.name if loc else row["location_id"],
                    row.get("sku") or getattr(prod, "sku", ""),
                    getattr(prod, "ean", "") if prod else "",
                    getattr(prod, "name", "") if prod else "",
                    row["expected_quantity"],
                    row["counted_quantity"],
                    row["difference_quantity"],
                    round(float(row["difference_percent"]), 2),
                    row["value_impact_net"],
                    row["difference_class"],
                    row["status"],
                ]
            )
        return out

    if kind == "counting_sheet":
        headers = ["Lokalizacja", "SKU", "EAN", "Produkt", "Partia", "Nr seryjny", "Oczekiwana", "Policzona", "Podpis"]
        rows = []
        blind = doc.count_mode == "blind"
        for row in analysis["lines"]:
            loc = db.query(Location).filter(Location.id == int(row["location_id"])).first()
            prod = db.query(Product).filter(Product.id == int(row["product_id"])).first()
            line = db.query(InventoryDocumentLine).filter(InventoryDocumentLine.id == int(row["line_id"])).first()
            rows.append(
                [
                    loc.name if loc else row["location_id"],
                    row.get("sku") or getattr(prod, "sku", ""),
                    getattr(prod, "ean", "") if prod else "",
                    getattr(prod, "name", "") if prod else "",
                    getattr(line, "batch_number", "") if line else "",
                    getattr(line, "serial_number", "") if line else "",
                    "" if blind else row["expected_quantity"],
                    row["counted_quantity"] if row["counted_quantity"] is not None else "",
                    "",
                ]
            )
        return headers, rows

    if kind == "differences":
        return base_headers, _line_rows(lambda r: abs(float(r.get("difference_quantity") or 0)) > 1e-9)

    if kind == "missing_stock":
        return base_headers, _line_rows(lambda r: float(r.get("difference_quantity") or 0) < -1e-9)

    if kind == "excess_stock":
        return base_headers, _line_rows(lambda r: float(r.get("difference_quantity") or 0) > 1e-9)

    if kind == "valuation":
        headers = base_headers
        return headers, _line_rows(lambda r: True)

    if kind == "user_activity":
        headers = ["Czas", "Akcja", "Użytkownik", "Szczegóły"]
        rows = []
        for ev in (
            db.query(InventoryAuditEvent)
            .filter(InventoryAuditEvent.inventory_document_id == int(doc.id))
            .order_by(InventoryAuditEvent.created_at.asc())
            .all()
        ):
            rows.append(
                [
                    ev.created_at.isoformat() if ev.created_at else "",
                    ev.action,
                    ev.user_id,
                    ev.detail_json,
                ]
            )
        return headers, rows

    if kind == "empty_locations":
        headers = ["Lokalizacja", "SKU", "Oczekiwana"]
        rows = []
        for ln, loc, prod in (
            db.query(InventoryDocumentLine, Location, Product)
            .outerjoin(Location, Location.id == InventoryDocumentLine.location_id)
            .outerjoin(Product, Product.id == InventoryDocumentLine.product_id)
            .filter(
                InventoryDocumentLine.inventory_document_id == int(doc.id),
                InventoryDocumentLine.expected_quantity <= 0,
            )
            .all()
        ):
            rows.append([loc.name if loc else ln.location_id, getattr(prod, "sku", ""), ln.expected_quantity])
        return headers, rows

    if kind == "problematic_locations":
        headers = ["Lokalizacja", "Liczba różnic", "Suma różnic"]
        from collections import defaultdict

        agg: dict[int, list[float]] = defaultdict(list)
        for row in analysis["lines"]:
            if abs(float(row.get("difference_quantity") or 0)) > 1e-9:
                agg[int(row["location_id"])].append(float(row["difference_quantity"]))
        rows = []
        for loc_id, diffs in agg.items():
            loc = db.query(Location).filter(Location.id == loc_id).first()
            rows.append([loc.name if loc else loc_id, len(diffs), sum(diffs)])
        return headers, rows

    return base_headers, _line_rows(lambda r: True)


def _build_xlsx(headers: list[str], rows: list[list[Any]]) -> bytes:
    try:
        from openpyxl import Workbook
    except ImportError as exc:
        raise RuntimeError("openpyxl required for XLSX export") from exc
    wb = Workbook()
    ws = wb.active
    ws.title = "Raport"
    ws.append(headers)
    for row in rows:
        ws.append(row)
    bio = io.BytesIO()
    wb.save(bio)
    return bio.getvalue()


def _build_pdf_html(title: str, headers: list[str], rows: list[list[Any]]) -> bytes:
    html_rows = "".join(
        "<tr>" + "".join(f"<td>{cell}</td>" for cell in row) + "</tr>" for row in rows[:500]
    )
    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>{title}</title>
    <style>body{{font-family:Arial,sans-serif;font-size:11px}}table{{border-collapse:collapse;width:100%}}
    th,td{{border:1px solid #ccc;padding:4px;text-align:left}}th{{background:#eee}}</style></head>
    <body><h1>{title}</h1><table><thead><tr>{"".join(f"<th>{h}</th>" for h in headers)}</tr></thead>
    <tbody>{html_rows}</tbody></table></body></html>"""
    try:
        from ..structure_report_pdf_service import html_document_to_pdf_bytes

        return html_document_to_pdf_bytes(html)
    except Exception:
        return html.encode("utf-8")


def generate_inventory_report(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
    report_kind: str,
    report_format: str = REPORT_FORMAT_XLSX,
    user_id: int | None = None,
) -> dict[str, Any]:
    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(document_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise InventoryDocumentNotFoundError(f"Document {document_id} not found")
    kind = str(report_kind).strip().lower()
    if kind not in REPORT_KINDS:
        raise InventoryDocumentNotFoundError(f"Unknown report kind: {kind}")

    headers, rows = _report_rows_for_kind(db, doc, kind)
    title = REPORT_KINDS[kind]
    if report_format == REPORT_FORMAT_PDF:
        content = _build_pdf_html(f"{title} — {doc.number}", headers, rows)
        ext = "pdf"
        media = "application/pdf"
    else:
        content = _build_xlsx(headers, rows)
        ext = "xlsx"
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    checksum = hashlib.sha256(content).hexdigest()[:32]
    UPLOADS_SUBDIR.mkdir(parents=True, exist_ok=True)
    file_name = f"inv_{doc.id}_{kind}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.{ext}"
    storage_path = UPLOADS_SUBDIR / file_name
    storage_path.write_bytes(content)

    report = InventoryReport(
        inventory_document_id=int(doc.id),
        tenant_id=int(tenant_id),
        report_kind=kind,
        report_format=report_format,
        file_name=file_name,
        storage_path=str(storage_path),
        checksum=checksum,
        row_count=len(rows),
        generated_by_user_id=user_id,
        metadata_json=json.dumps({"title": title}, ensure_ascii=False),
    )
    db.add(report)
    log_inventory_audit(
        db,
        tenant_id=int(tenant_id),
        inventory_document_id=int(doc.id),
        user_id=user_id,
        action=AUDIT_EXPORT,
        detail={"report_kind": kind, "format": report_format, "rows": len(rows)},
    )
    db.commit()
    db.refresh(report)
    return {
        "report_id": report.id,
        "file_name": file_name,
        "report_kind": kind,
        "report_format": report_format,
        "row_count": len(rows),
        "media_type": media,
        "content": content,
    }
