"""
Canonical sale document mapper — single source for list, detail, exports, Direct Sales summary.

Never expose stale persisted totals when order lines are available.
"""

from __future__ import annotations

import re
from typing import Any, Literal

from sqlalchemy.orm import Session, joinedload

from ..models.commerce_operational import Payment, PaymentTransaction
from ..models.customer import Customer
from ..models.document_series import DocumentSeries
from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.sale_document import SaleDocument
from ..models.tenant import Tenant
from ..models.warehouse import Warehouse
from ..models.sale_document_stock_link import SaleDocumentStockLink
from ..models.stock_document import StockDocument
from ..models.warehouse_inventory_movement import WarehouseInventoryMovement
from .document_number_service import stock_document_display_label
from .sale_document_financials import compute_sale_totals_from_order

_LEGACY_NUMBER_RE = re.compile(r"\{[A-Z_]+\}")

from .operational_labels import payment_method_label_pl, payment_status_label_pl  # noqa: F401 — re-export


def is_legacy_document_number(document_number: str | None) -> bool:
    raw = str(document_number or "").strip()
    return bool(raw and _LEGACY_NUMBER_RE.search(raw))


def resolve_document_number_fields(document_number: str | None) -> dict[str, Any]:
    raw = str(document_number or "").strip()
    if is_legacy_document_number(raw):
        return {
            "document_number_raw": raw,
            "document_number": "Numer legacy (wymaga korekty)",
            "numbering_status": "legacy",
            "numbering_legacy": True,
        }
    return {
        "document_number_raw": raw,
        "document_number": raw or "—",
        "numbering_status": "valid",
        "numbering_legacy": False,
    }


def _paid_from_status(status: str | None) -> bool:
    st = str(status or "").strip().upper()
    return st in ("PAID", "SETTLED", "CAPTURED")


def _load_order_with_lines(db: Session, order_id: int) -> Order | None:
    return (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == int(order_id))
        .first()
    )


def compute_canonical_financials(order: Order) -> dict[str, Any]:
    """Always derive totals from order lines — never read stale sale_documents columns."""
    totals = compute_sale_totals_from_order(order)
    return {
        "total_net": float(totals["total_net"]),
        "total_gross": float(totals["total_gross"]),
        "total_vat": float(totals["total_vat"]),
        "lines": totals["lines"],
        "vat_rows": totals["vat_rows"],
    }


def refresh_persisted_financials(db: Session, doc: SaleDocument, financials: dict[str, Any]) -> None:
    """Keep DB cache aligned with canonical engine (silent repair on read)."""
    changed = False
    net = float(financials["total_net"])
    gross = float(financials["total_gross"])
    vat = float(financials["total_vat"])
    if doc.total_net != net:
        doc.total_net = net
        changed = True
    if doc.total_gross != gross:
        doc.total_gross = gross
        changed = True
    if doc.total_vat != vat:
        doc.total_vat = vat
        changed = True
    if changed:
        db.flush()


def _resolve_payment(db: Session, doc: SaleDocument | None, order: Order, *, gross: float) -> dict[str, Any]:
    pay: Payment | None = None
    if doc is not None and doc.payment_id:
        pay = db.query(Payment).filter(Payment.id == int(doc.payment_id)).first()
    if pay is None:
        pay = (
            db.query(Payment)
            .filter(Payment.order_id == int(order.id))
            .order_by(Payment.id.desc())
            .first()
        )

    method: str | None = None
    status: str | None = None
    if pay is not None:
        method = str(pay.method or "").strip().upper() or None
        status = str(pay.status or "").strip().upper() or None
    if not method:
        method = (
            str(doc.payment_method or "").strip().upper() or None
            if doc is not None
            else str(getattr(order, "panel_payment_method", None) or "").strip().upper() or None
        )
    if not status:
        status = (
            str(doc.payment_status or "").strip().upper() or None
            if doc is not None
            else str(getattr(order, "panel_payment_status", None) or "").strip().upper() or None
        )

    label_pl = payment_method_label_pl(method)
    paid = _paid_from_status(status)

    if pay is None:
        return {
            "payment_id": doc.payment_id if doc is not None else None,
            "method": method,
            "status": status,
            "payment_method": method,
            "payment_status": status,
            "payment_label_pl": label_pl,
            "paid": paid,
            "amount": gross,
            "currency": str(order.currency or "PLN"),
            "captured_at": doc.payment_captured_at.isoformat() if doc is not None and doc.payment_captured_at else None,
            "external_transaction_id": doc.payment_external_transaction_id if doc is not None else None,
            "authorization_reference": None,
            "transactions": [],
        }

    txns = (
        db.query(PaymentTransaction)
        .filter(PaymentTransaction.payment_id == int(pay.id))
        .order_by(PaymentTransaction.id.asc())
        .all()
    )
    captured = (doc.payment_captured_at if doc is not None else None) or pay.captured_at
    return {
        "payment_id": int(pay.id),
        "method": method,
        "status": status,
        "payment_method": method,
        "payment_status": status,
        "payment_label_pl": label_pl,
        "paid": paid,
        "amount": float(pay.amount or gross),
        "currency": str(pay.currency or "PLN"),
        "captured_at": captured.isoformat() if captured else None,
        "external_transaction_id": (
            str(doc.payment_external_transaction_id or pay.external_transaction_id or "").strip() or None
            if doc is not None
            else str(pay.external_transaction_id or "").strip() or None
        ),
        "authorization_reference": str(pay.authorization_reference or "").strip() or None,
        "transactions": [
            {
                "id": int(t.id),
                "method": str(t.method or ""),
                "amount": float(t.amount or 0),
                "status": str(t.status or ""),
                "external_ref": str(t.external_ref or "").strip() or None,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in txns
        ],
    }


def map_order_for_print(
    db: Session,
    *,
    order: Order,
    customer: Customer | None = None,
) -> dict[str, Any]:
    """Order-only print payload (picking list, confirmation) — no SaleDocument required."""
    order_full = order
    if not getattr(order, "items", None):
        loaded = _load_order_with_lines(db, int(order.id))
        if loaded is not None:
            order_full = loaded

    financials = compute_canonical_financials(order_full)
    payment = _resolve_payment(db, None, order_full, gross=float(financials["total_gross"]))
    buyer = _customer_display(customer, order_full)
    created = order_full.order_date or order_full.created_at

    return {
        "order_number": str(order_full.number or order_full.id),
        "document_number": str(order_full.number or order_full.id),
        "created_at": created.isoformat() if hasattr(created, "isoformat") else created,
        "order_date": order_full.order_date.isoformat() if getattr(order_full, "order_date", None) else None,
        "status": str(getattr(order_full, "status", None) or "—"),
        "client": buyer["name"],
        "buyer": buyer,
        "financials": financials,
        "lines": financials["lines"],
        "payment": payment,
        "delivery": {
            "street": str(getattr(order_full, "street", None) or "").strip() or None,
            "city": str(getattr(order_full, "city", None) or "").strip() or None,
            "postal_code": str(getattr(order_full, "postal_code", None) or "").strip() or None,
        },
        "shipping": {
            "carrier": str(getattr(order_full, "shipping_method", None) or "").strip() or None,
            "tracking_number": str(getattr(order_full, "tracking_number", None) or "").strip() or None,
        },
    }


def _customer_display(customer: Customer | None, order: Order) -> dict[str, Any]:
    if customer is not None:
        name = str(customer.company_name or "").strip()
        if not name:
            name = " ".join(p for p in (customer.first_name, customer.last_name) if p).strip()
        return {
            "id": int(customer.id),
            "name": name or "—",
            "nip": str(customer.nip or "").strip() or None,
            "email": str(customer.email or "").strip() or None,
            "phone": str(customer.phone or "").strip() or None,
            "address": None,
            "city": None,
            "zip": None,
            "country": str(customer.country_code or "").strip() or None,
        }
    return {
        "id": getattr(order, "customer_id", None),
        "name": str(getattr(order, "customer_name", None) or "").strip() or "—",
        "nip": None,
        "email": None,
        "phone": None,
        "address": None,
        "city": str(getattr(order, "city", None) or "").strip() or None,
        "zip": None,
        "country": str(getattr(order, "country", None) or "").strip() or None,
    }


def _seller_from_series(series: DocumentSeries | None, tenant: Tenant | None) -> dict[str, Any]:
    if series is not None and str(getattr(series, "company_name", None) or "").strip():
        return {
            "name": str(series.company_name or "").strip(),
            "nip": str(series.company_nip or "").strip() or None,
            "address": str(series.company_address or "").strip() or None,
            "city": str(series.company_city or "").strip() or None,
            "zip": str(series.company_zip or "").strip() or None,
            "country": str(series.company_country or "").strip() or None,
            "email": str(series.company_email or "").strip() or None,
            "bank": str(series.company_bank or "").strip() or None,
            "iban": str(series.company_iban or "").strip() or None,
        }
    if tenant is not None:
        return {
            "name": str(getattr(tenant, "company_name", None) or tenant.name or "").strip() or "—",
            "nip": str(getattr(tenant, "tax_id", None) or "").strip() or None,
            "address": None,
            "city": None,
            "zip": None,
            "country": None,
            "email": None,
            "bank": None,
            "iban": None,
        }
    return {"name": "—"}


def _linked_warehouse_documents(db: Session, sale_document_id: str) -> list[dict[str, Any]]:
    links = (
        db.query(SaleDocumentStockLink)
        .filter(SaleDocumentStockLink.sale_document_id == str(sale_document_id))
        .order_by(SaleDocumentStockLink.id.asc())
        .all()
    )
    if not links:
        return []
    stock_ids = [int(lnk.stock_document_id) for lnk in links]
    docs = (
        db.query(StockDocument)
        .filter(StockDocument.id.in_(stock_ids))
        .all()
    )
    by_id = {int(d.id): d for d in docs}
    out: list[dict[str, Any]] = []
    for lnk in links:
        sd = by_id.get(int(lnk.stock_document_id))
        if sd is None:
            continue
        label = stock_document_display_label(sd)
        created = getattr(sd, "created_at", None)
        out.append(
            {
                "id": int(sd.id),
                "document_type": str(getattr(sd, "document_type", None) or "WZ"),
                "document_number": label,
                "link_type": str(getattr(lnk, "link_type", None) or "WZ"),
                "status": str(getattr(sd, "status", None) or ""),
                "created_at": created.isoformat() if created else None,
                "detail_path": f"/documents/warehouse/wz?id={int(sd.id)}",
            }
        )
    return out


def _warehouse_movements_for_wz(db: Session, wz_ids: list[int]) -> list[dict[str, Any]]:
    if not wz_ids:
        return []
    rows = (
        db.query(WarehouseInventoryMovement)
        .filter(
            WarehouseInventoryMovement.source_document_type == "WZ",
            WarehouseInventoryMovement.source_document_id.in_(wz_ids),
        )
        .order_by(WarehouseInventoryMovement.id.asc())
        .all()
    )
    out: list[dict[str, Any]] = []
    for m in rows:
        out.append(
            {
                "id": int(m.id),
                "movement_type": str(getattr(m, "movement_type", None) or ""),
                "quantity": float(getattr(m, "quantity", 0) or 0),
                "product_id": int(m.product_id) if getattr(m, "product_id", None) else None,
                "location_id": int(m.from_location_id) if getattr(m, "from_location_id", None) else None,
                "wz_id": int(m.source_document_id) if getattr(m, "source_document_id", None) else None,
                "created_at": m.created_at.isoformat() if getattr(m, "created_at", None) else None,
            }
        )
    return out


def _warehouse_movements_for_order(db: Session, order: Order) -> list[dict[str, Any]]:
    movement_ids = [
        int(it.source_movement_id)
        for it in (order.items or [])
        if getattr(it, "source_movement_id", None) is not None
    ]
    if not movement_ids:
        return []
    rows = (
        db.query(WarehouseInventoryMovement)
        .filter(WarehouseInventoryMovement.id.in_(movement_ids))
        .order_by(WarehouseInventoryMovement.id.asc())
        .all()
    )
    out: list[dict[str, Any]] = []
    for m in rows:
        out.append(
            {
                "id": int(m.id),
                "movement_type": str(getattr(m, "movement_type", None) or ""),
                "quantity": float(getattr(m, "quantity", 0) or 0),
                "product_id": int(m.product_id) if getattr(m, "product_id", None) else None,
                "location_id": int(m.from_location_id) if getattr(m, "from_location_id", None) else None,
                "created_at": m.created_at.isoformat() if getattr(m, "created_at", None) else None,
            }
        )
    return out


def map_sale_document(
    db: Session,
    *,
    doc: SaleDocument,
    order: Order,
    customer: Customer | None = None,
    mode: Literal["list", "detail"] = "list",
    refresh_db: bool = True,
) -> dict[str, Any]:
    """Unified normalized sale document DTO."""
    order_full = order
    if not getattr(order, "items", None):
        loaded = _load_order_with_lines(db, int(order.id))
        if loaded is not None:
            order_full = loaded

    financials = compute_canonical_financials(order_full)
    if refresh_db:
        refresh_persisted_financials(db, doc, financials)

    payment = _resolve_payment(db, doc, order_full, gross=float(financials["total_gross"]))
    number_fields = resolve_document_number_fields(doc.document_number)

    panel_type = str(doc.panel_document_type or "").upper()
    doc_type = "FV" if panel_type == "INVOICE" else "PA"
    client = _customer_display(customer, order_full)["name"]

    base: dict[str, Any] = {
        "id": str(doc.id),
        "order_id": int(doc.order_id),
        "order_number": str(order_full.number or ""),
        "tenant_id": int(doc.tenant_id),
        "warehouse_id": int(doc.warehouse_id),
        "document_series_id": str(doc.document_series_id or ""),
        "document_type_id": str(doc.document_type_id or doc.document_series_id or ""),
        "document_subtype": str(doc.document_subtype or "").strip().upper()
        or ("INVOICE" if panel_type == "INVOICE" else "RECEIPT"),
        "panel_document_type": panel_type,
        "doc_type": doc_type,
        "series_type": str(doc.series_type or "SALE"),
        "series": doc_type,
        "client": client,
        "source": str(order_full.source or "").strip() or None,
        "order_channel": str(getattr(order_full, "order_channel", None) or "").strip() or None,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
        "date": doc.created_at.isoformat() if doc.created_at else None,
        "currency": str(order_full.currency or "PLN"),
        **number_fields,
        "financials": {
            "total_net": financials["total_net"],
            "total_gross": financials["total_gross"],
            "total_vat": financials["total_vat"],
            "lines": financials["lines"],
            "vat_rows": financials["vat_rows"],
        },
        "total_net": financials["total_net"],
        "total_gross": financials["total_gross"],
        "total_vat": financials["total_vat"],
        "net": financials["total_net"],
        "gross": financials["total_gross"],
        "vat": financials["total_vat"],
        "payment": payment,
        "payment_method": payment["payment_method"],
        "payment_status": payment["payment_status"],
        "payment_label_pl": payment["payment_label_pl"],
        "paid": payment["paid"],
        "external_status": "NOWE",
        "detail_path": f"/documents/sales/{doc.id}",
    }

    if mode == "list":
        return base

    series = (
        db.query(DocumentSeries)
        .filter(DocumentSeries.id == str(doc.document_series_id))
        .first()
    )
    tenant = db.query(Tenant).filter(Tenant.id == int(doc.tenant_id)).first()
    warehouse = db.query(Warehouse).filter(Warehouse.id == int(doc.warehouse_id)).first()
    linked_wz = _linked_warehouse_documents(db, str(doc.id))
    wz_ids = [int(w["id"]) for w in linked_wz]
    movements = _warehouse_movements_for_wz(db, wz_ids) if wz_ids else _warehouse_movements_for_order(db, order_full)

    base.update(
        {
            "warehouse_name": str(getattr(warehouse, "name", None) or "").strip() or None,
            "lines": financials["lines"],
            "vat_rows": financials["vat_rows"],
            "buyer": _customer_display(customer, order_full),
            "seller": _seller_from_series(series, tenant),
            "series_meta": {
                "id": str(series.id) if series else None,
                "name": str(series.name or "").strip() if series else None,
                "prefix": str(series.prefix or "").strip() if series else None,
                "subtype": str(series.subtype or "").strip() if series else None,
                "warehouse_effect": bool(getattr(series, "warehouse_effect", False)) if series else False,
            },
            "warehouse_effects": {
                "enabled": bool(linked_wz) or bool(getattr(series, "warehouse_effect", False)) if series else bool(linked_wz),
                "order_fulfillment_mode": str(getattr(order_full, "fulfillment_mode", None) or "").strip() or None,
                "movements": movements,
            },
            "related": {
                "order_id": int(order_full.id),
                "order_number": str(order_full.number or ""),
                "order_path": f"/orders/{order_full.id}",
                "warehouse_documents": linked_wz,
                "sale_document_id": str(doc.id),
            },
            "history": [
                {
                    "at": doc.created_at.isoformat() if doc.created_at else None,
                    "action": "created",
                    "source": str(order_full.source or "system"),
                    "detail": f"Dokument {doc_type} {number_fields['document_number']}",
                },
                *[
                    {
                        "at": wz.get("created_at"),
                        "action": "wz_linked",
                        "source": "wms",
                        "detail": f"WZ {wz.get('document_number') or wz.get('id')}",
                        "warehouse_document_id": wz.get("id"),
                        "detail_path": wz.get("detail_path"),
                    }
                    for wz in linked_wz
                ],
                *[
                    {
                        "at": m.get("created_at"),
                        "action": "warehouse_issue",
                        "source": "wms",
                        "detail": f"Wydanie WZ #{m.get('wz_id')} · ruch #{m.get('id')}",
                        "warehouse_document_id": m.get("wz_id"),
                    }
                    for m in movements
                ],
            ],
            "print": {
                "available": True,
                "template_id": getattr(series, "print_template_id", None) if series else None,
            },
            "export": {"available": True},
            "status_badges": {
                "doc_type": doc_type,
                "payment_status": payment["payment_status"],
                "paid": payment["paid"],
                "numbering_status": number_fields["numbering_status"],
                "external_status": "NOWE",
            },
        }
    )
    return base
