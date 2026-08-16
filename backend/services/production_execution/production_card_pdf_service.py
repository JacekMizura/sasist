"""Production card PDF — informational document for WMS and ERP (same workflow)."""

from __future__ import annotations

import io
import logging
import re
from datetime import date, datetime
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
from ..structure_report_pdf_service import BACKEND_ROOT, html_document_to_pdf_bytes
from .barcode_html import code128_png_data_uri, product_barcode_value
from .collection_location_service import build_collection_location_options

logger = logging.getLogger(__name__)

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


def _fmt_optional_date(value: date | datetime | str | None) -> str:
    if value is None:
        return "—"
    if isinstance(value, datetime):
        return value.strftime("%d.%m.%Y")
    if isinstance(value, date):
        if value >= date(9999, 1, 1):
            return "—"
        return value.strftime("%d.%m.%Y")
    text = str(value).strip()
    return text or "—"


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
    exp = _fmt_optional_date(expiry_date)
    if options and suggested_location is None:
        pref = next((o for o in options if o.get("is_preferred")), options[0])
        loc = str(pref.get("location_code") or "—")
        avail = _fmt_qty(float(pref.get("available_qty") or 0))
        lots = list(pref.get("lots") or [])
        if lots and batch_number is None:
            first = lots[0]
            bn = str(first.get("batch_number") or "—")
            lot_val = str(first.get("lot") or bn)
            exp = _fmt_optional_date(first.get("expiry_date"))
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
        "source_orders": [],
        "show_source_orders": False,
        "header_status_label": str(batch.status or ""),
        "header_config_label": None,
    }


def _order_card_context(db: Session, *, tenant_id: int, order_id: int) -> dict[str, Any]:
    from ...models.order import Order
    from ...models.production import PRODUCTION_ORDER_SOURCE_ORDERS, ProductionOrderSourceItem
    from ..reservations.reservation_service import list_material_reservations

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

    status_label = str(order.status or "")
    config_label = None
    if getattr(order, "picking_config_id", None):
        from ...models.order_ui_status import OrderUiStatus
        from ..production_config_query import get_production_config_by_id

        cfg = get_production_config_by_id(db, int(order.picking_config_id), require_active=False)
        if cfg is not None:
            st = db.query(OrderUiStatus).filter(OrderUiStatus.id == int(cfg.source_status_id)).first()
            if st is not None:
                config_label = str(st.name)
                status_label = str(st.name)

    reservations = (
        list_material_reservations(
            db, tenant_id=int(tenant_id), production_order_id=int(order_id), active_only=True
        )
        if getattr(order, "materials_reserved", False)
        else []
    )
    res_by_pid: dict[int, list[dict[str, Any]]] = {}
    for r in reservations:
        res_by_pid.setdefault(int(r["product_id"]), []).append(r)

    components: list[dict[str, Any]] = []
    if res_by_pid:
        # Group by component: total + per-location allocations (never global stock as pick qty).
        plan = build_production_pick_plan(db, tenant_id=int(tenant_id), order_id=int(order_id))
        plan_by_pid = {int(ln.component_product_id): ln for ln in plan.lines}
        for pid, rows in res_by_pid.items():
            line = plan_by_pid.get(pid)
            prod = db.query(Product).filter(Product.id == int(pid)).first()
            name = str(
                (line.product_name if line else None)
                or getattr(prod, "name", None)
                or f"Produkt #{pid}"
            )
            sku = (line.product_sku if line else None) or (
                getattr(prod, "sku", None) or getattr(prod, "symbol", None)
            )
            image_url = (line.product_image_url if line else None) or (
                (getattr(prod, "image_url", None) or "").strip() or None
            )
            total_qty = sum(float(rr.get("quantity") or 0) for rr in rows)
            allocations = [
                {
                    "location_code": str(rr.get("location_code") or "—"),
                    "quantity": _fmt_qty(float(rr.get("quantity") or 0)),
                    "batch_number": rr.get("batch_number") or "—",
                }
                for rr in rows
            ]
            loc_summary = "; ".join(
                f"{a['location_code']} — {a['quantity']}" for a in allocations
            )
            bc = _barcode_fields(prod)
            components.append(
                {
                    "name": name,
                    "sku": sku,
                    "ean": (getattr(prod, "ean", None) or "").strip() or None,
                    "image_url": image_url,
                    "required_qty": _fmt_qty(total_qty),
                    "unit": (getattr(prod, "unit", None) or "").strip() or "szt.",
                    "suggested_location": loc_summary or "—",
                    "available_qty": _fmt_qty(total_qty),
                    "batch_number": allocations[0]["batch_number"] if allocations else "—",
                    "lot": "—",
                    "expiry_date": "—",
                    "location_allocations": allocations,
                    **bc,
                }
            )
    else:
        plan = build_production_pick_plan(db, tenant_id=int(tenant_id), order_id=int(order_id))
        for line in plan.lines:
            pref = {int(s.location_id) for s in line.suggested_locations if int(s.location_id) > 0}
            row = _component_row(
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
            row["location_allocations"] = (
                [{"location_code": row["suggested_location"], "quantity": row["required_qty"], "batch_number": row.get("batch_number") or "—"}]
                if row.get("suggested_location") and row["suggested_location"] != "—"
                else []
            )
            components.append(row)

    source_orders: list[dict[str, Any]] = []
    if str(getattr(order, "source_type", "") or "") == PRODUCTION_ORDER_SOURCE_ORDERS:
        src_rows = (
            db.query(ProductionOrderSourceItem)
            .filter(
                ProductionOrderSourceItem.production_order_id == int(order.id),
                ProductionOrderSourceItem.status != "cancelled",
            )
            .order_by(ProductionOrderSourceItem.id.asc())
            .all()
        )
        order_ids = {int(s.order_id) for s in src_rows if s.order_id}
        orders_map = (
            {o.id: o for o in db.query(Order).filter(Order.id.in_(order_ids)).all()} if order_ids else {}
        )
        for s in src_rows:
            so = orders_map.get(int(s.order_id)) if s.order_id else None
            pc = (getattr(so, "priority_color", None) or "").strip().lower() if so else ""
            is_priority = pc in ("red", "orange", "yellow")
            source_orders.append(
                {
                    "order_number": str(getattr(so, "number", None) or f"#{s.order_id}"),
                    "quantity": _fmt_qty(float(getattr(s, "requested_quantity", None) or 0)),
                    "is_priority": is_priority,
                }
            )

    # MO barcode for scan-open (not product EAN).
    header_bc = str(order.number or "").strip() or None
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
        "header_status_label": status_label or "—",
        "header_config_label": config_label,
        "operator_name": _operator_name(db, getattr(order, "created_by_user_id", None)),
        "warehouse_name": wh.name if wh else None,
        "recipe_version": f"{getattr(comp, 'name', '—')} v{getattr(comp, 'version', '1')}" if comp else "—",
        "started_at_display": _fmt_ts(getattr(order, "started_at", None)),
        "completed_at_display": _fmt_ts(getattr(order, "completed_at", None) or getattr(order, "production_completed_at", None)),
        "header_barcode_value": header_bc,
        "header_barcode_image_url": code128_png_data_uri(header_bc),
        "components": components,
        "source_orders": source_orders,
        "show_source_orders": bool(source_orders),
    }


def build_batch_production_card_html(
    db: Session,
    *,
    tenant_id: int,
    batch_id: int,
    template_version_id: int | None = None,
) -> str:
    from ...document_templates.adapters.production_card_adapter import (
        document_engine_available,
        render_batch_production_card_html,
    )

    try:
        if document_engine_available(db, tenant_id=int(tenant_id)):
            logger.info(
                "production_card HTML via DTE tenant_id=%s batch_id=%s",
                tenant_id,
                batch_id,
            )
            return render_batch_production_card_html(
                db,
                tenant_id=tenant_id,
                batch_id=batch_id,
                template_version_id=template_version_id,
            )
        logger.info(
            "production_card HTML via legacy Jinja tenant_id=%s batch_id=%s",
            tenant_id,
            batch_id,
        )
        try:
            ctx = _batch_card_context(db, tenant_id=tenant_id, batch_id=batch_id)
        except ProductionBatchError as err:
            raise ValueError(str(err)) from err
        return _jinja_env().get_template("production_card.html.j2").render(**ctx)
    except Exception:
        logger.exception(
            "build_batch_production_card_html failed tenant_id=%s batch_id=%s",
            tenant_id,
            batch_id,
        )
        raise


def build_order_production_card_html(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    template_version_id: int | None = None,
) -> str:
    from ...document_templates.adapters.production_card_adapter import (
        document_engine_available,
        render_order_production_card_html,
    )

    try:
        if document_engine_available(db, tenant_id=int(tenant_id)):
            logger.info(
                "production_card HTML via DTE tenant_id=%s order_id=%s",
                tenant_id,
                order_id,
            )
            return render_order_production_card_html(
                db,
                tenant_id=tenant_id,
                order_id=order_id,
                template_version_id=template_version_id,
            )
        logger.info(
            "production_card HTML via legacy Jinja tenant_id=%s order_id=%s",
            tenant_id,
            order_id,
        )
        ctx = _order_card_context(db, tenant_id=tenant_id, order_id=order_id)
        return _jinja_env().get_template("production_card.html.j2").render(**ctx)
    except Exception:
        logger.exception(
            "build_order_production_card_html failed tenant_id=%s order_id=%s",
            tenant_id,
            order_id,
        )
        raise


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


def generate_batch_production_card_pdf_bytes(
    db: Session,
    *,
    tenant_id: int,
    batch_id: int,
    template_version_id: int | None = None,
) -> bytes:
    try:
        html = build_batch_production_card_html(
            db,
            tenant_id=tenant_id,
            batch_id=batch_id,
            template_version_id=template_version_id,
        )
        logger.info(
            "production_card PDF html_ready tenant_id=%s batch_id=%s html_bytes=%s",
            tenant_id,
            batch_id,
            len(html or ""),
        )
        pdf = html_document_to_pdf_bytes(html)
        logger.info(
            "production_card PDF ok tenant_id=%s batch_id=%s pdf_bytes=%s",
            tenant_id,
            batch_id,
            len(pdf or b""),
        )
        return pdf
    except Exception:
        logger.exception(
            "generate_batch_production_card_pdf_bytes failed tenant_id=%s batch_id=%s",
            tenant_id,
            batch_id,
        )
        raise


def generate_order_production_card_pdf_bytes(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    template_version_id: int | None = None,
) -> bytes:
    try:
        html = build_order_production_card_html(
            db,
            tenant_id=tenant_id,
            order_id=order_id,
            template_version_id=template_version_id,
        )
        return html_document_to_pdf_bytes(html)
    except Exception:
        logger.exception(
            "generate_order_production_card_pdf_bytes failed tenant_id=%s order_id=%s",
            tenant_id,
            order_id,
        )
        raise


def generate_batch_material_pick_list_pdf_bytes(
    db: Session,
    *,
    tenant_id: int,
    batch_id: int,
    template_version_id: int | None = None,
) -> bytes:
    from ...document_templates.adapters.production_card_adapter import (
        PICK_LIST_KIND_CODE,
        generate_batch_material_pick_list_pdf_bytes as dte_pdf,
        render_batch_production_card_html,
    )

    try:
        if template_version_id is not None:
            html = render_batch_production_card_html(
                db,
                tenant_id=tenant_id,
                batch_id=batch_id,
                template_version_id=template_version_id,
                kind_code=PICK_LIST_KIND_CODE,
            )
            return html_document_to_pdf_bytes(html)
        return dte_pdf(db, tenant_id=tenant_id, batch_id=batch_id)
    except Exception:
        logger.exception(
            "generate_batch_material_pick_list_pdf_bytes failed tenant_id=%s batch_id=%s",
            tenant_id,
            batch_id,
        )
        # Same component context as production card (legacy fallback).
        html = build_batch_production_card_html(db, tenant_id=tenant_id, batch_id=batch_id)
        return html_document_to_pdf_bytes(html)


def generate_order_material_pick_list_pdf_bytes(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    template_version_id: int | None = None,
) -> bytes:
    from ...document_templates.adapters.production_card_adapter import (
        PICK_LIST_KIND_CODE,
        generate_order_material_pick_list_pdf_bytes as dte_pdf,
        render_order_production_card_html,
    )

    try:
        if template_version_id is not None:
            html = render_order_production_card_html(
                db,
                tenant_id=tenant_id,
                order_id=order_id,
                template_version_id=template_version_id,
                kind_code=PICK_LIST_KIND_CODE,
            )
            return html_document_to_pdf_bytes(html)
        return dte_pdf(db, tenant_id=tenant_id, order_id=order_id)
    except Exception:
        logger.exception(
            "generate_order_material_pick_list_pdf_bytes failed tenant_id=%s order_id=%s",
            tenant_id,
            order_id,
        )
        html = build_order_production_card_html(db, tenant_id=tenant_id, order_id=order_id)
        return html_document_to_pdf_bytes(html)


def generate_bulk_batch_production_cards_pdf_bytes(
    db: Session,
    *,
    tenant_id: int,
    batch_ids: list[int],
) -> bytes:
    try:
        pages: list[str] = []
        for bid in batch_ids:
            pages.append(build_batch_production_card_html(db, tenant_id=int(tenant_id), batch_id=int(bid)))
        combined = _combine_card_html_documents(pages)
        return html_document_to_pdf_bytes(combined)
    except Exception:
        logger.exception(
            "generate_bulk_batch_production_cards_pdf_bytes failed tenant_id=%s batch_ids=%s",
            tenant_id,
            batch_ids,
        )
        raise


def merge_pdf_bytes(chunks: list[bytes]) -> bytes:
    from PyPDF2 import PdfMerger

    merger = PdfMerger()
    for chunk in chunks:
        merger.append(io.BytesIO(chunk))
    out = io.BytesIO()
    merger.write(out)
    merger.close()
    return out.getvalue()
