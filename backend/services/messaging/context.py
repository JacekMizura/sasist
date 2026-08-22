"""Safe template context for email rendering (plain dict, no ORM)."""

from __future__ import annotations

import json
from html import escape as html_escape
from typing import Any, Optional

from sqlalchemy.orm import Session

from ...models.complaint import Complaint
from ...models.complaint_ui_status import ComplaintUiStatus
from ...models.customer import Customer
from ...models.order import Order
from ...models.order_item import OrderItem, order_item_is_replaced_line
from ...models.order_ui_status import OrderUiStatus
from ...models.product import Product
from ...models.return_ui_status import ReturnUiStatus
from ...models.sale_document import SaleDocument
from ...models.shipping_method import ShippingMethod
from ...models.tenant import Tenant
from ...models.wms_order_return import WmsOrderReturn
from ..automation.constants import ENTITY_COMPLAINT, ENTITY_ORDER, ENTITY_RETURN
from .recipients import resolve_customer_email


def _first_str(block: dict[str, Any], *keys: str) -> str:
    for key in keys:
        val = block.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
        if isinstance(val, (int, float)) and not isinstance(val, bool):
            return str(val)
    return ""


def _addr_block(root: dict[str, Any], *keys: str) -> dict[str, Any]:
    for k in keys:
        raw = root.get(k)
        if isinstance(raw, dict):
            return raw
    return {}


def _parse_addresses(order: Order) -> tuple[dict[str, Any], dict[str, Any]]:
    root: dict[str, Any] = {}
    raw = getattr(order, "addresses_json", None)
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                root = parsed
        except (json.JSONDecodeError, TypeError):
            root = {}
    bill = _addr_block(root, "billing", "bill", "invoice")
    ship = _addr_block(root, "shipping", "shipment", "delivery")
    return bill, ship


def _map_address(prefix: str, block: dict[str, Any]) -> dict[str, str]:
    fn = _first_str(block, "first_name", "Imię", "name")
    ln = _first_str(block, "last_name", "Nazwisko", "surname")
    if not ln and " " in fn:
        parts = fn.split(None, 1)
        fn, ln = parts[0], parts[1] if len(parts) > 1 else ""
    street = _first_str(block, "street", "street_name", "Ulica", "address")
    house = _first_str(block, "house_number", "home_number", "NrNieruchomosci", "number")
    return {
        f"{prefix}_name": fn,
        f"{prefix}_surname": ln,
        f"{prefix}_street": street,
        f"{prefix}_home_number": house,
        f"{prefix}_postcode": _first_str(block, "postal_code", "postcode", "zip", "Kod pocztowy"),
        f"{prefix}_city": _first_str(block, "city", "Miasto"),
        f"{prefix}_state": _first_str(block, "state", "province", "Województwo"),
        f"{prefix}_phone": _first_str(block, "phone", "mobile", "tel", "Telefon"),
        f"{prefix}_company_name": _first_str(block, "company_name", "company", "firma", "Firma"),
        f"{prefix}_company_nip": _first_str(block, "nip", "NIP", "tax_id", "company_nip"),
        f"{prefix}_country": _first_str(block, "country", "country_code", "Kraj"),
    }


def _fmt_money(val: Any) -> str:
    if val is None:
        return ""
    try:
        return f"{float(val):.2f}"
    except (TypeError, ValueError):
        return str(val)


def _fmt_dt(val: Any) -> str:
    if val is None:
        return ""
    try:
        return val.strftime("%Y-%m-%d %H:%M") if hasattr(val, "strftime") else str(val)
    except Exception:
        return str(val)


def _build_products(db: Session, order_id: int) -> tuple[str, str]:
    try:
        items = (
            db.query(OrderItem)
            .filter(OrderItem.order_id == int(order_id))
            .order_by(OrderItem.id.asc())
            .all()
        )
    except Exception:
        return "", ""
    lines: list[str] = []
    rows_html: list[str] = []
    for it in items:
        if order_item_is_replaced_line(it):
            continue
        name = str(getattr(it, "offer_name_snapshot", None) or "").strip()
        if not name and getattr(it, "product_id", None):
            try:
                p = db.query(Product).filter(Product.id == int(it.product_id)).first()
            except Exception:
                p = None
            name = str(getattr(p, "name", "") or "") if p else ""
        if not name:
            name = f"Produkt #{getattr(it, 'product_id', '')}"
        qty = float(getattr(it, "quantity", 0) or 0)
        lines.append(f"{name} × {qty:g}")
        rows_html.append(
            "<tr>"
            f"<td>{html_escape(name)}</td>"
            f"<td style=\"text-align:right\">{html_escape(f'{qty:g}')}</td>"
            "</tr>"
        )
    text = "\n".join(lines)
    table = (
        '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">'
        "<thead><tr><th>Produkt</th><th>Ilość</th></tr></thead>"
        f"<tbody>{''.join(rows_html)}</tbody></table>"
        if rows_html
        else ""
    )
    return text, table


def _order_weight(db: Session, order_id: int) -> str:
    try:
        items = db.query(OrderItem).filter(OrderItem.order_id == int(order_id)).all()
    except Exception:
        return ""
    total = 0.0
    any_w = False
    for it in items:
        if order_item_is_replaced_line(it):
            continue
        pid = getattr(it, "product_id", None)
        if not pid:
            continue
        try:
            p = db.query(Product).filter(Product.id == int(pid)).first()
        except Exception:
            continue
        w = getattr(p, "weight", None) if p else None
        if w is None:
            continue
        any_w = True
        total += float(w) * float(getattr(it, "quantity", 0) or 0)
    return f"{total:.3f}" if any_w else ""


def _sale_doc_numbers(db: Session, *, tenant_id: int, order_id: int) -> dict[str, str]:
    inv = ""
    receipt = ""
    try:
        rows = (
            db.query(SaleDocument)
            .filter(
                SaleDocument.tenant_id == int(tenant_id),
                SaleDocument.order_id == int(order_id),
            )
            .order_by(SaleDocument.id.desc())
            .all()
        )
    except Exception:
        return {"invoice_number": inv, "receipt_number": receipt}
    for d in rows:
        panel = str(getattr(d, "panel_document_type", None) or "").upper()
        subtype = str(getattr(d, "document_subtype", None) or "").upper()
        num = str(getattr(d, "document_number", None) or "").strip()
        if not num:
            continue
        if not inv and ("INVOICE" in panel or "INVOICE" in subtype or panel == "FV"):
            inv = num
        if not receipt and ("PARAGON" in panel or "RECEIPT" in panel or "RECEIPT" in subtype or panel == "PA"):
            receipt = num
    return {"invoice_number": inv, "receipt_number": receipt}


def build_entity_email_context(
    db: Session,
    *,
    tenant_id: int,
    entity_type: str,
    entity_id: int,
) -> dict[str, Any]:
    et = str(entity_type).upper()
    recipient = resolve_customer_email(db, tenant_id=tenant_id, entity_type=et, entity_id=entity_id)
    tenant = db.query(Tenant).filter(Tenant.id == int(tenant_id)).first()
    shop_name = str(getattr(tenant, "name", "") or "") if tenant else ""

    base: dict[str, Any] = {
        "entity_type": et,
        "entity_id": int(entity_id),
        "tenant_id": int(tenant_id),
        "customer_email": recipient.email or "",
        "order_email": recipient.email or "",
        "shop_name": shop_name,
    }

    if et == ENTITY_ORDER:
        order = (
            db.query(Order)
            .filter(Order.id == int(entity_id), Order.tenant_id == int(tenant_id))
            .first()
        )
        if order is None:
            return base
        status_name = ""
        if getattr(order, "order_ui_status_id", None):
            us = db.query(OrderUiStatus).filter(OrderUiStatus.id == int(order.order_ui_status_id)).first()
            status_name = str(getattr(us, "name", "") or "") if us else ""

        cust_name = ""
        cust_phone = ""
        if getattr(order, "customer_id", None):
            cust = db.query(Customer).filter(Customer.id == int(order.customer_id)).first()
            if cust is not None:
                cust_name = " ".join(
                    p for p in (getattr(cust, "first_name", ""), getattr(cust, "last_name", "")) if p
                ).strip()
                cust_phone = str(getattr(cust, "phone", "") or "")

        bill, ship = _parse_addresses(order)
        products_text, cart_html = _build_products(db, int(order.id))
        docs = _sale_doc_numbers(db, tenant_id=tenant_id, order_id=int(order.id))
        if not docs["invoice_number"] and getattr(order, "sales_document_number", None):
            docs["invoice_number"] = str(order.sales_document_number)

        shipment_name = str(getattr(order, "shipping_method", "") or "")
        if getattr(order, "shipping_method_id", None):
            sm = db.query(ShippingMethod).filter(ShippingMethod.id == str(order.shipping_method_id)).first()
            if sm is not None:
                shipment_name = str(getattr(sm, "name", "") or shipment_name)

        payment_name = ""
        meta_raw = getattr(order, "import_metadata_json", None)
        if meta_raw:
            try:
                meta = json.loads(meta_raw) if isinstance(meta_raw, str) else meta_raw
                if isinstance(meta, dict):
                    payment_name = str(
                        meta.get("panel_payment_method")
                        or meta.get("payment_method")
                        or meta.get("payment_name")
                        or ""
                    )
            except (json.JSONDecodeError, TypeError):
                pass

        order_number = str(getattr(order, "number", "") or "")
        value = getattr(order, "value", None)
        base.update(
            {
                "order_id": order_number or str(order.id),
                "order_number": order_number,
                "external_order_id": str(getattr(order, "external_id", "") or ""),
                "order_date": _fmt_dt(getattr(order, "order_date", None) or getattr(order, "created_at", None)),
                "order_comment": str(
                    getattr(order, "customer_comment", None)
                    or getattr(order, "comment", None)
                    or getattr(order, "notes", None)
                    or ""
                ),
                "sum": _fmt_money(value),
                "to_pay": _fmt_money(value),
                "currency": str(getattr(order, "currency", "") or ""),
                "status": status_name,
                "status_name": status_name,
                "status_id": int(order.order_ui_status_id) if order.order_ui_status_id else None,
                "warehouse_id": int(order.warehouse_id) if order.warehouse_id else None,
                "weight": _order_weight(db, int(order.id)),
                "customer_name": cust_name,
                "customer_phone": cust_phone,
                "payment_name": payment_name,
                "shipment_name": shipment_name,
                "products_with_quantity": products_text,
                "cart": cart_html,
                "invoice_number": docs["invoice_number"],
                "receipt_number": docs["receipt_number"],
            }
        )
        base.update(_map_address("bill_address", bill))
        base.update(_map_address("shipment_address", ship))
        return base

    if et == ENTITY_RETURN:
        row = (
            db.query(WmsOrderReturn)
            .filter(WmsOrderReturn.id == int(entity_id), WmsOrderReturn.tenant_id == int(tenant_id))
            .first()
        )
        if row is None:
            return base
        status_name = ""
        if getattr(row, "ui_status_id", None):
            us = db.query(ReturnUiStatus).filter(ReturnUiStatus.id == int(row.ui_status_id)).first()
            status_name = str(getattr(us, "name", "") or "") if us else ""
        order_number = ""
        if getattr(row, "order_id", None):
            order = db.query(Order).filter(Order.id == int(row.order_id)).first()
            order_number = str(getattr(order, "number", "") or "") if order else ""
            if order is not None:
                nested = build_entity_email_context(
                    db, tenant_id=tenant_id, entity_type=ENTITY_ORDER, entity_id=int(order.id)
                )
                base.update({k: v for k, v in nested.items() if k not in ("entity_type", "entity_id")})
        rmz = str(getattr(row, "rmz_number", "") or "")
        base.update(
            {
                "return_id": rmz or str(row.id),
                "rmz_number": rmz,
                "order_id": order_number or (int(row.order_id) if row.order_id else None),
                "order_number": order_number,
                "status_id": int(row.ui_status_id) if row.ui_status_id else None,
                "status_name": status_name,
                "status": status_name,
                "warehouse_id": int(row.warehouse_id) if row.warehouse_id else None,
            }
        )
        return base

    if et == ENTITY_COMPLAINT:
        c = (
            db.query(Complaint)
            .filter(Complaint.id == int(entity_id), Complaint.tenant_id == int(tenant_id))
            .first()
        )
        if c is None:
            return base
        status_name = ""
        if getattr(c, "complaint_ui_status_id", None):
            us = (
                db.query(ComplaintUiStatus)
                .filter(ComplaintUiStatus.id == int(c.complaint_ui_status_id))
                .first()
            )
            status_name = str(getattr(us, "name", "") or "") if us else ""
        if getattr(c, "order_id", None):
            nested = build_entity_email_context(
                db, tenant_id=tenant_id, entity_type=ENTITY_ORDER, entity_id=int(c.order_id)
            )
            base.update({k: v for k, v in nested.items() if k not in ("entity_type", "entity_id")})
        base.update(
            {
                "complaint_id": int(c.id),
                "complaint_number": str(getattr(c, "reference_code", None) or c.id),
                "order_id": int(c.order_id) if getattr(c, "order_id", None) else None,
                "status_id": int(c.complaint_ui_status_id) if c.complaint_ui_status_id else None,
                "status_name": status_name,
                "status": status_name,
                "warehouse_id": int(c.warehouse_id) if getattr(c, "warehouse_id", None) else None,
                "customer_name": str(getattr(c, "customer_name", "") or base.get("customer_name") or ""),
            }
        )
        return base

    return base
