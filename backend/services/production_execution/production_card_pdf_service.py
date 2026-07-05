"""Production card PDF — informational document for WMS and ERP (same workflow)."""

from __future__ import annotations

import io
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy.orm import Session, joinedload

from ...models.product import Product
from ...models.product_composition import ProductComposition, ProductionBatch, ProductionBatchLine
from ...models.production import ProductionOrder
from ...models.warehouse import Warehouse
from ..production_batch_service import ProductionBatchError, _load_batch_entity, build_batch_pick_plan
from ..production_order_service import ProductionOrderError
from ..production_pick_service import build_production_pick_plan
from ..structure_report_pdf_service import html_document_to_pdf_bytes
from .barcode_html import code128_png_data_uri, product_barcode_value
from .collection_location_service import build_collection_location_options

logger = logging.getLogger(__name__)

BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
TEMPLATES_DIR = BACKEND_ROOT / "templates"


def _jinja_env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(["html", "j2"]),
    )


def _fmt_qty(q: float) -> str:
    qf = float(q)
    if abs(qf - round(qf)) < 1e-6:
        return str(int(round(qf)))
    return f"{qf:.4f}".rstrip("0").rstrip(".")


def _fmt_ts(value: datetime | None) -> str:
    if value is None:
        return "________________"
    try:
        return value.strftime("%d.%m.%Y %H:%M")
    except Exception:
        return "________________"


def _operator_name(db: Session, user_id: int | None) -> str | None:
    if not user_id:
        return None
    from ...models.app_user import AppUser

    u = db.query(AppUser).filter(AppUser.id == int(user_id)).first()
    if u is None:
        return None
    return str(getattr(u, "display_name", None) or getattr(u, "username", None) or "").strip() or None


def _barcode_fields(product) -> dict[str, Any]:
    value = product_barcode_value(product)
    return {
        "barcode_value": value,
        "barcode_image_url": code128_png_data_uri(value),
    }


def _component_row(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    component_product_id: int,
    product_name: str,
    product_sku: str | None,
    product_image_url: str | None,
    required: float,
    suggested_location_ids: set[int] | None = None,
    batch_number: str | None = None,
    lot: str | None = None,
    expiry_date: str | None = None,
    suggested_location: str | None = None,
    available_qty: float | None = None,
) -> dict[str, Any]:
    p = db.query(Product).filter(Product.id == int(component_product_id)).first()
    options, wh_total = build_collection_location_options(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        product_id=int(component_product_id),
        preferred_location_ids=suggested_location_ids,
    )
    loc = suggested_location or "—"
    avail = _fmt_qty(available_qty if available_qty is not None else wh_total)
    bn = batch_number or "—"
    lot_val = lot or "—"
    exp = expiry_date or "—"
    if options and suggested_location is None:
        pref = next((o for o in options if o.get("is_preferred")), options[0])
        loc = str(pref.get("location_code") or "—")
        avail = _fmt_qty(float(pref.get("available_qty") or 0))
        lots = list(pref.get("lots") or [])
        if lots and batch_number is None:
            first = lots[0]
            bn = str(first.get("batch_number") or "—")
            lot_val = str(first.get("lot") or bn)
            exp = str(first.get("expiry_date") or "—")
    image_url = (product_image_url or "").strip() or ((getattr(p, "image_url", None) or "").strip() or None)
    bc = _barcode_fields(p)
    return {
        "name": product_name,
        "sku": product_sku or (getattr(p, "sku", None) or getattr(p, "symbol", None)),
        "ean": (getattr(p, "ean", None) or "").strip() or None,
        "image_url": image_url,
        "required_qty": _fmt_qty(required),
        "unit": (getattr(p, "unit", None) or "").strip() or "szt.",
        "suggested_location": loc,
        "available_qty": avail,
        "batch_number": bn,
        "lot": lot_val,
        "expiry_date": exp,
        **bc,
    }


def _batch_card_context(db: Session, *, tenant_id: int, batch_id: int) -> dict[str, Any]:
    batch = _load_batch_entity(db, tenant_id=tenant_id, batch_id=batch_id)
    wh = db.query(Warehouse).filter(Warehouse.id == int(batch.warehouse_id)).first()
    plan = build_batch_pick_plan(db, tenant_id=int(tenant_id), batch_id=int(batch_id))
    full = (
        db.query(ProductionBatch)
        .options(joinedload(ProductionBatch.lines).joinedload(ProductionBatchLine.composition))
        .filter(ProductionBatch.id == int(batch_id))
        .first()
    )

    lines = list(full.lines or []) if full else []
    product_labels: list[str] = []
    header_image: str | None = None
    header_bc_value: str | None = str(batch.number or "").strip() or None
    recipe_versions: list[str] = []
    for ln in lines:
        p = db.query(Product).filter(Product.id == int(ln.product_id)).first()
        name = str(getattr(p, "name", None) or f"Produkt #{ln.product_id}")
        product_labels.append(f"{name} × {_fmt_qty(float(ln.planned_quantity or 0))}")
        if not header_image and p and getattr(p, "image_url", None):
            header_image = str(p.image_url)
        comp = getattr(ln, "composition", None)
        if comp is None and ln.composition_id:
            comp = db.query(ProductComposition).filter(ProductComposition.id == int(ln.composition_id)).first()
        if comp is not None:
            recipe_versions.append(f"{getattr(comp, 'name', '')} v{getattr(comp, 'version', '1')}")
    total_planned = sum(float(ln.planned_quantity or 0) for ln in lines)
    components: list[dict[str, Any]] = []
    from ..reservations.reservation_service import list_material_reservations

    reservations = (
        list_material_reservations(
            db, tenant_id=int(tenant_id), production_batch_id=int(batch_id), active_only=True
        )
        if getattr(batch, "materials_reserved", False)
        else []
    )
    res_by_pid: dict[int, list[dict[str, Any]]] = {}
    for r in reservations:
        res_by_pid.setdefault(int(r["product_id"]), []).append(r)

    for comp in plan.aggregated_components:
        pid = int(comp.component_product_id)
        reserved_rows = res_by_pid.get(pid) or []
        if reserved_rows:
            for rr in reserved_rows:
                components.append(
                    _component_row(
                        db,
                        tenant_id=int(tenant_id),
                        warehouse_id=int(batch.warehouse_id),
                        component_product_id=pid,
                        product_name=str(comp.product_name),
                        product_sku=comp.product_sku,
                        product_image_url=comp.product_image_url,
                        required=float(rr["quantity"]),
                        suggested_location=str(rr.get("location_code") or "—"),
                        available_qty=float(rr["quantity"]),
                        batch_number=rr.get("batch_number"),
                        lot=rr.get("lot"),
                        expiry_date=rr.get("expiry_date"),
                    )
                )
            continue
        pref = {int(s.location_id) for s in comp.suggested_locations if int(s.location_id) > 0}
        components.append(
            _component_row(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(batch.warehouse_id),
                component_product_id=pid,
                product_name=str(comp.product_name),
                product_sku=comp.product_sku,
                product_image_url=comp.product_image_url,
                required=float(comp.required),
                suggested_location_ids=pref or None,
            )
        )
    return {
        "job_number": str(batch.number or ""),
        "job_kind_label": "Partia produkcyjna",
        "printed_at": datetime.utcnow().strftime("%d.%m.%Y %H:%M"),
        "header_image_url": header_image,
        "header_product_line": ", ".join(product_labels) if product_labels else str(batch.number),
        "header_sku": None,
        "header_ean": None,
        "header_planned_qty": _fmt_qty(total_planned),
        "header_date": datetime.utcnow().strftime("%d.%m.%Y"),
        "operator_name": _operator_name(db, getattr(batch, "created_by_user_id", None)),
        "warehouse_name": wh.name if wh else None,
        "recipe_version": ", ".join(dict.fromkeys(recipe_versions)) if recipe_versions else "—",
        "started_at_display": _fmt_ts(getattr(batch, "started_at", None)),
        "completed_at_display": _fmt_ts(getattr(batch, "completed_at", None) or getattr(batch, "production_completed_at", None)),
        "header_barcode_value": header_bc_value,
        "header_barcode_image_url": code128_png_data_uri(header_bc_value),
        "components": components,
    }


def _order_card_context(db: Session, *, tenant_id: int, order_id: int) -> dict[str, Any]:
    order = (
        db.query(ProductionOrder)
        .filter(ProductionOrder.id == int(order_id), ProductionOrder.tenant_id == int(tenant_id))
        .first()
    )
    if order is None:
        raise ProductionOrderError("Zlecenie produkcyjne nie istnieje.", code="not_found")
    wh = db.query(Warehouse).filter(Warehouse.id == int(order.warehouse_id)).first()
    p = db.query(Product).filter(Product.id == int(order.product_id)).first()
    comp = None
    if order.composition_id:
        comp = db.query(ProductComposition).filter(ProductComposition.id == int(order.composition_id)).first()
    plan = build_production_pick_plan(db, tenant_id=int(tenant_id), order_id=int(order_id))
    components: list[dict[str, Any]] = []
    for line in plan.lines:
        pref = {int(s.location_id) for s in line.suggested_locations if int(s.location_id) > 0}
        components.append(
            _component_row(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(order.warehouse_id),
                component_product_id=int(line.component_product_id),
                product_name=str(line.product_name),
                product_sku=line.product_sku,
                product_image_url=line.product_image_url,
                required=float(line.required),
                suggested_location_ids=pref or None,
            )
        )
    header_bc = product_barcode_value(p) or str(order.number or "").strip() or None
    return {
        "job_number": str(order.number or ""),
        "job_kind_label": "Zlecenie produkcyjne (MO)",
        "printed_at": datetime.utcnow().strftime("%d.%m.%Y %H:%M"),
        "header_image_url": (getattr(p, "image_url", None) or "").strip() or None,
        "header_product_line": str(getattr(p, "name", None) or f"Produkt #{order.product_id}"),
        "header_sku": (getattr(p, "sku", None) or getattr(p, "symbol", None)),
        "header_ean": (getattr(p, "ean", None) or "").strip() or None,
        "header_planned_qty": _fmt_qty(float(order.planned_quantity or 0)),
        "header_date": datetime.utcnow().strftime("%d.%m.%Y"),
        "operator_name": _operator_name(db, getattr(order, "created_by_user_id", None)),
        "warehouse_name": wh.name if wh else None,
        "recipe_version": f"{getattr(comp, 'name', '—')} v{getattr(comp, 'version', '1')}" if comp else "—",
        "started_at_display": _fmt_ts(getattr(order, "started_at", None)),
        "completed_at_display": _fmt_ts(getattr(order, "completed_at", None) or getattr(order, "production_completed_at", None)),
        "header_barcode_value": header_bc,
        "header_barcode_image_url": code128_png_data_uri(header_bc),
        "components": components,
    }


def build_batch_production_card_html(db: Session, *, tenant_id: int, batch_id: int) -> str:
    try:
        ctx = _batch_card_context(db, tenant_id=tenant_id, batch_id=batch_id)
    except ProductionBatchError as exc:
        raise ValueError(str(exc)) from exc
    return _jinja_env().get_template("production_card.html.j2").render(**ctx)


def build_order_production_card_html(db: Session, *, tenant_id: int, order_id: int) -> str:
    ctx = _order_card_context(db, tenant_id=tenant_id, order_id=order_id)
    return _jinja_env().get_template("production_card.html.j2").render(**ctx)


def _extract_body_html(full_html: str) -> str:
    match = re.search(r"<body[^>]*>(.*)</body>", full_html, re.DOTALL | re.IGNORECASE)
    return match.group(1).strip() if match else full_html


def _extract_head_styles(full_html: str) -> str:
    match = re.search(r"<head[^>]*>(.*?)</head>", full_html, re.DOTALL | re.IGNORECASE)
    return match.group(1).strip() if match else ""


def _combine_card_html_documents(pages: list[str]) -> str:
    if not pages:
        raise ValueError("Brak kart do wydruku.")
    head = _extract_head_styles(pages[0])
    bodies = []
    for i, page in enumerate(pages):
        if i > 0:
            bodies.append('<div class="page-break"></div>')
        bodies.append(_extract_body_html(page))
    return f"<!DOCTYPE html><html lang=\"pl\"><head>{head}</head><body>{''.join(bodies)}</body></html>"


def generate_batch_production_card_pdf_bytes(db: Session, *, tenant_id: int, batch_id: int) -> bytes:
    html = build_batch_production_card_html(db, tenant_id=tenant_id, batch_id=batch_id)
    return html_document_to_pdf_bytes(html)


def generate_order_production_card_pdf_bytes(db: Session, *, tenant_id: int, order_id: int) -> bytes:
    html = build_order_production_card_html(db, tenant_id=tenant_id, order_id=order_id)
    return html_document_to_pdf_bytes(html)


def generate_bulk_batch_production_cards_pdf_bytes(
    db: Session,
    *,
    tenant_id: int,
    batch_ids: list[int],
) -> bytes:
    pages: list[str] = []
    for bid in batch_ids:
        pages.append(build_batch_production_card_html(db, tenant_id=int(tenant_id), batch_id=int(bid)))
    combined = _combine_card_html_documents(pages)
    return html_document_to_pdf_bytes(combined)


def merge_pdf_bytes(chunks: list[bytes]) -> bytes:
    from PyPDF2 import PdfMerger

    merger = PdfMerger()
    for chunk in chunks:
        merger.append(io.BytesIO(chunk))
    out = io.BytesIO()
    merger.write(out)
    merger.close()
    return out.getvalue()
