"""Polish display defaults for direct-sale (stationary retail) orders."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, Optional, Tuple

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from ...models.order import Order

from ..operational_labels import (
    PAID_STATUS_LABEL,
    PICKUP_DELIVERY_LABEL,
    RETAIL_CUSTOMER_LABEL,
    STATIONARY_SALE_LABEL,
    payment_method_label_pl,
)

DIRECT_SALE_CHANNEL = "DIRECT_SALE"


def is_direct_sale_order(order: "Order") -> bool:
    ch = str(getattr(order, "order_channel", None) or "").strip().upper()
    src = str(getattr(order, "source", None) or "").strip().lower()
    return ch == DIRECT_SALE_CHANNEL or src in ("direct-sales", "direct_sales")


def direct_sale_customer_names(order: "Order") -> Tuple[Optional[str], Optional[str]]:
    """Retail POS: anonymous buyer label when no named customer."""
    if not is_direct_sale_order(order):
        return None, None
    if getattr(order, "customer_id", None):
        return None, None
    return RETAIL_CUSTOMER_LABEL, None


def direct_sale_shipping_display(order: "Order") -> Tuple[Optional[str], Optional[str], Optional[str]]:
    if not is_direct_sale_order(order):
        return None, None, None
    return PICKUP_DELIVERY_LABEL, None, None


def direct_sale_source_display(order: "Order") -> Optional[str]:
    if is_direct_sale_order(order):
        return STATIONARY_SALE_LABEL
    return None


def _order_import_meta(order: "Order") -> dict[str, Any]:
    raw = getattr(order, "import_metadata_json", None) or ""
    if not str(raw).strip():
        return {}
    try:
        d = json.loads(raw)
        return d if isinstance(d, dict) else {}
    except json.JSONDecodeError:
        return {}


def _order_set_import_meta(order: "Order", meta: dict[str, Any]) -> None:
    if not meta:
        order.import_metadata_json = None
    else:
        order.import_metadata_json = json.dumps(meta, ensure_ascii=False)


def apply_direct_sale_order_panel_metadata(
    order: "Order",
    *,
    payment_method: str,
    document_subtype: str | None = None,
) -> None:
    """Panel fields for completed stationary retail orders."""
    meta = _order_import_meta(order)
    meta["panel_payment_status"] = PAID_STATUS_LABEL
    meta["panel_payment_method"] = payment_method_label_pl(payment_method)
    if document_subtype:
        sub = str(document_subtype).strip().upper()
        meta["panel_document_type"] = "INVOICE" if sub == "INVOICE" else "PARAGON"
    _order_set_import_meta(order, meta)


def direct_sale_panel_payment_status(order: "Order", db: "Session") -> Optional[str]:
    meta = _order_import_meta(order)
    ps = meta.get("panel_payment_status")
    if isinstance(ps, str) and ps.strip():
        return ps.strip()
    if not is_direct_sale_order(order):
        return None
    from ...models.commerce_operational import Payment

    pay = (
        db.query(Payment)
        .filter(Payment.order_id == int(order.id))
        .order_by(Payment.id.desc())
        .first()
    )
    if pay is not None and str(pay.status or "").strip().upper() in ("PAID", "SETTLED", "CAPTURED"):
        return PAID_STATUS_LABEL
    return PAID_STATUS_LABEL if is_direct_sale_order(order) else None


def linked_documents_for_order(db: "Session", order: "Order") -> list[dict[str, Any]]:
    """PA/FV ↔ WZ relations for order detail and print actions."""
    from ...models.sale_document import SaleDocument
    from ...models.sale_document_stock_link import SaleDocumentStockLink
    from ...models.stock_document import StockDocument
    from ..document_number_service import stock_document_display_label

    sale_docs = (
        db.query(SaleDocument)
        .filter(SaleDocument.order_id == int(order.id))
        .order_by(SaleDocument.created_at.desc(), SaleDocument.id.desc())
        .all()
    )
    if not sale_docs:
        wz_only = (
            db.query(StockDocument)
            .filter(
                StockDocument.order_id == int(order.id),
                StockDocument.document_type == "WZ",
            )
            .order_by(StockDocument.created_at.desc(), StockDocument.id.desc())
            .all()
        )
        out: list[dict[str, Any]] = []
        for wz in wz_only:
            label = stock_document_display_label(wz)
            out.append(
                {
                    "id": str(int(wz.id)),
                    "kind": "warehouse",
                    "document_type": "WZ",
                    "document_subtype": "WZ",
                    "document_number": label,
                    "detail_path": f"/documents/warehouse/wz?id={int(wz.id)}",
                    "print_kind": "WZ",
                    "stock_document_id": int(wz.id),
                    "sale_document_id": str(getattr(wz, "source_sale_document_id", None) or "") or None,
                }
            )
        return out

    linked_wz_ids: set[int] = set()
    out = []
    for sd in sale_docs:
        panel_type = str(sd.panel_document_type or "").strip().upper()
        subtype = str(sd.document_subtype or "").strip().upper()
        if not subtype:
            subtype = "INVOICE" if panel_type == "INVOICE" else "RECEIPT"
        doc_type = "FV" if subtype == "INVOICE" or panel_type == "INVOICE" else "PA"
        print_kind = "INVOICE" if doc_type == "FV" else "RECEIPT"
        out.append(
            {
                "id": str(sd.id),
                "kind": "sale",
                "document_type": doc_type,
                "document_subtype": subtype,
                "document_number": str(sd.document_number or "").strip() or "—",
                "detail_path": f"/documents/sales/{sd.id}",
                "print_kind": print_kind,
                "sale_document_id": str(sd.id),
                "stock_document_id": None,
            }
        )
        links = (
            db.query(SaleDocumentStockLink)
            .filter(SaleDocumentStockLink.sale_document_id == str(sd.id))
            .order_by(SaleDocumentStockLink.id.asc())
            .all()
        )
        stock_ids = [int(lnk.stock_document_id) for lnk in links]
        if not stock_ids:
            continue
        wz_rows = (
            db.query(StockDocument)
            .filter(StockDocument.id.in_(stock_ids))
            .all()
        )
        by_id = {int(w.id): w for w in wz_rows}
        for lnk in links:
            wz_id = int(lnk.stock_document_id)
            if wz_id in linked_wz_ids:
                continue
            wz = by_id.get(wz_id)
            if wz is None:
                continue
            linked_wz_ids.add(wz_id)
            label = stock_document_display_label(wz)
            out.append(
                {
                    "id": str(wz_id),
                    "kind": "warehouse",
                    "document_type": "WZ",
                    "document_subtype": "WZ",
                    "document_number": label,
                    "detail_path": f"/documents/warehouse/wz?id={wz_id}",
                    "print_kind": "WZ",
                    "stock_document_id": wz_id,
                    "sale_document_id": str(sd.id),
                }
            )
    return out
