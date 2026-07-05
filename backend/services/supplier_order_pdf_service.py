"""Supplier purchase order (delivery) → HTML → PDF via Puppeteer stdin (see structure_report_pdf_service)."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any, List, Optional

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy.orm import Session

from ..models.supplier import Supplier
from ..models.tenant import Tenant
from ..schemas.delivery import DeliveryRead
from .structure_report_pdf_service import html_document_to_pdf_bytes

BACKEND_ROOT = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = BACKEND_ROOT / "templates"

_STATUS_PL = {
    "draft": "Szkic",
    "ordered": "Zamówione",
    "in_transit": "W drodze",
    "received": "Dostarczone",
    "cancelled": "Anulowane",
}


def _fmt_qty(q: float) -> str:
    qf = float(q)
    if abs(qf - round(qf)) < 1e-6:
        return str(int(round(qf)))
    s = f"{qf:.4f}".rstrip("0").rstrip(".")
    return s or "0"


def _fmt_pl_money(n: Optional[float]) -> str:
    if n is None:
        return "—"
    x = round(float(n), 2)
    s = f"{x:.2f}"
    if "." in s:
        whole, frac = s.split(".", 1)
    else:
        whole, frac = s, ""
    # thousands with space
    if len(whole) > 3:
        parts: List[str] = []
        while whole:
            parts.insert(0, whole[-3:])
            whole = whole[:-3]
        whole = " ".join(parts)
    return f"{whole},{frac}" if frac else whole


def _fmt_dt(dt: Optional[datetime]) -> str:
    if dt is None:
        return "—"
    if isinstance(dt, datetime):
        return dt.strftime("%d.%m.%Y %H:%M")
    return str(dt)


def _fmt_date_only(dt: Optional[datetime]) -> str:
    if dt is None:
        return "—"
    if isinstance(dt, datetime):
        return dt.strftime("%d.%m.%Y")
    return str(dt)


def _strip(s: Optional[str]) -> str:
    return (s or "").strip()


def _address_block(
    street: Optional[str],
    postal_code: Optional[str],
    city: Optional[str],
    country: Optional[str],
    legacy_address: Optional[str],
) -> str:
    lines: List[str] = []
    st = _strip(street)
    if st:
        lines.append(st)
    pc = _strip(postal_code)
    ct = _strip(city)
    line2 = " ".join(p for p in (pc, ct) if p).strip()
    if line2:
        lines.append(line2)
    ctry = _strip(country)
    if ctry:
        lines.append(ctry)
    if lines:
        return "\n".join(lines)
    leg = _strip(legacy_address)
    return leg if leg else "—"


def _contact_block(email: Optional[str], phone: Optional[str]) -> str:
    parts = []
    e = _strip(email)
    if e:
        parts.append(e)
    p = _strip(phone)
    if p:
        parts.append(p)
    return "\n".join(parts) if parts else "—"


def _jinja_env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(["html", "xml"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )


def build_supplier_order_html(
    order: DeliveryRead,
    tenant: Tenant,
    supplier: Supplier,
) -> str:
    buyer_company = _strip(getattr(tenant, "company_name", None)) or _strip(tenant.name) or "—"
    buyer_address = _address_block(
        getattr(tenant, "street", None),
        getattr(tenant, "postal_code", None),
        getattr(tenant, "city", None),
        getattr(tenant, "country", None),
        getattr(tenant, "address", None),
    )
    buyer_tax = _strip(getattr(tenant, "tax_id", None)) or "—"
    buyer_contact = _contact_block(getattr(tenant, "email", None), getattr(tenant, "phone", None))

    sup_name = _strip(supplier.name) or "—"
    sup_company = _strip(getattr(supplier, "company_name", None)) or "—"
    sup_address = _address_block(
        supplier.street,
        supplier.postal_code,
        supplier.city,
        supplier.country,
        supplier.address,
    )
    sup_country = _strip(supplier.country) or "—"
    sup_email = _strip(supplier.email) or "—"
    sup_phone = _strip(supplier.phone) or "—"
    sup_tax = _strip(supplier.tax_id) or "—"

    rows: List[dict[str, Any]] = []
    for i, it in enumerate(order.items, start=1):
        net = it.line_total_net if it.line_total_net is not None else it.line_total_value
        gross = it.line_total_gross if it.line_total_gross is not None else net
        pp = it.purchase_price
        vr = float(it.vat_rate if it.vat_rate is not None else 23.0)
        vat_disp = str(int(vr)) if abs(vr - round(vr)) < 1e-6 else f"{vr:g}"
        nm = _strip(getattr(it, "display_name", None)) or "Pozycja usunięta"
        sku = _strip(getattr(it, "display_sku", None)) or _strip(it.product_symbol) or "—"
        ean = _strip(getattr(it, "display_ean", None)) or _strip(it.product_ean) or "—"
        unit = _strip(getattr(it, "item_unit", None))
        name_parts = [nm]
        if sku and sku != "—":
            name_parts.append(f"SKU {sku}")
        if unit:
            name_parts.append(unit)
        name_cell = " / ".join(name_parts)
        rows.append(
            {
                "lp": i,
                "name": name_cell,
                "ean": ean,
                "sku": sku,
                "qty_fmt": _fmt_qty(it.quantity_ordered),
                "price_net_fmt": _fmt_pl_money(pp),
                "vat_pct": vat_disp,
                "value_net_fmt": _fmt_pl_money(net),
                "value_gross_fmt": _fmt_pl_money(gross),
            }
        )

    created: Optional[datetime] = order.created_at if isinstance(order.created_at, datetime) else None
    if created is None and order.created_at is not None:
        raw = order.created_at
        if isinstance(raw, str):
            try:
                created = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            except ValueError:
                created = None

    expected: Optional[datetime] = order.expected_date if isinstance(order.expected_date, datetime) else None
    if expected is None and order.expected_date is not None:
        raw_e = order.expected_date
        if isinstance(raw_e, str):
            try:
                expected = datetime.fromisoformat(raw_e.replace("Z", "+00:00"))
            except ValueError:
                expected = None

    lead_days = supplier.default_lead_time_days
    lead_str = str(int(lead_days)) if lead_days is not None else "—"

    ctx = {
        "order_id": order.id,
        "status_label": _STATUS_PL.get(order.status, order.status),
        "created_fmt": _fmt_dt(created),
        "buyer_company": buyer_company,
        "buyer_address": buyer_address,
        "buyer_tax": buyer_tax,
        "buyer_contact": buyer_contact,
        "supplier_name": sup_name,
        "supplier_company": sup_company,
        "supplier_address": sup_address,
        "supplier_country": sup_country,
        "supplier_email": sup_email,
        "supplier_phone": sup_phone,
        "supplier_tax": sup_tax,
        "items": rows,
        "total_net_fmt": _fmt_pl_money(order.total_net if order.total_net is not None else order.total_value),
        "total_vat_fmt": _fmt_pl_money(order.total_vat),
        "total_gross_fmt": _fmt_pl_money(order.total_gross),
        "expected_date_fmt": _fmt_date_only(expected),
        "lead_time_days": lead_str,
        "notes": _strip(order.notes) or "—",
    }

    env = _jinja_env()
    tpl = env.get_template("supplier_order.html.j2")
    return tpl.render(**ctx)


def generate_supplier_order_pdf_bytes(db: Session, tenant_id: int, order_id: int) -> bytes:
    from ..api.delivery import _delivery_to_read
    from ..models.inbound_delivery import InboundDelivery

    d = db.query(InboundDelivery).filter(InboundDelivery.id == order_id, InboundDelivery.tenant_id == tenant_id).first()
    if not d:
        raise ValueError("Purchase order not found")

    read = _delivery_to_read(db, d)
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise ValueError("Tenant not found")

    supplier = db.query(Supplier).filter(Supplier.id == d.supplier_id, Supplier.tenant_id == tenant_id).first()
    if not supplier:
        raise ValueError("Supplier not found")

    html = build_supplier_order_html(read, tenant, supplier)

    from ..document_templates.services.erp_document_render_service import render_erp_document_pdf_bytes
    from ..document_templates.services.template_hierarchy_resolver import RenderTemplateContext

    def _legacy_html() -> str:
        return html

    return render_erp_document_pdf_bytes(
        db,
        tenant_id=int(tenant_id),
        kind_code="supplier_order",
        params={"delivery_id": int(order_id), "order_id": int(order_id)},
        legacy_renderer=_legacy_html,
        ctx=RenderTemplateContext(
            tenant_id=int(tenant_id),
            kind_code="supplier_order",
            scope_type="SUPPLIER",
            scope_id=int(d.supplier_id),
        ),
        warehouse_id=getattr(d, "warehouse_id", None),
        log_label=f"supplier_order_id={order_id}",
    )
