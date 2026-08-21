"""Returns report — read projection (1 row = 1 RMZLine)."""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Literal, Optional
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, aliased

from ...models.customer import Customer
from ...models.order import Order
from ...models.order_item import OrderItem
from ...models.product import Product
from ...models.return_status import ReturnStatus
from ...models.sale_document import SaleDocument
from ...models.stock_document import StockDocument
from ...models.warehouse import Warehouse
from ...models.wms_order_return import WmsOrderReturn
from ...models.wms_refund import WmsRefund
from ...models.wms_rmz_line import RMZLine

DateField = Literal["created", "warehouse_commit", "refund"]
SortField = Literal[
    "date",
    "return_number",
    "order_number",
    "product",
    "qty",
    "line_value",
    "status",
]

DECISION_LABELS = {
    "OK": "Przyjęty",
    "DAMAGED": "Uszkodzony",
    "REJECTED": "Odrzucony",
}

EXPORT_HEADERS: list[tuple[str, str]] = [
    ("order_number", "Numer zamówienia"),
    ("return_number", "Numer zwrotu"),
    ("product_name", "Nazwa produktu"),
    ("sku", "SKU"),
    ("ean", "EAN"),
    ("qty_returned", "Ilość"),
    ("qty_accepted", "Ilość przyjęta"),
    ("qty_rejected", "Ilość odrzucona"),
    ("qty_damaged_b", "Uszkodzone B"),
    ("qty_damaged_c", "Uszkodzone C"),
    ("line_value", "Wartość towaru"),
    ("currency", "Waluta"),
    ("exchange_rate", "Kurs"),
    ("purchase_cost_net", "Cena zakupu netto PLN (aktualna)"),
    ("customer_name", "Imię i nazwisko"),
    ("customer_phone", "Numer telefonu"),
    ("customer_email", "E-mail"),
    ("return_date", "Data zwrotu"),
    ("status_name", "Status"),
    ("decision_label", "Decyzja produktowa"),
    ("country", "Kraj"),
    ("source", "Źródło"),
    ("warehouse_name", "Magazyn"),
    ("zpz_number", "Z-PZ"),
    ("correction_number", "Numer korekty"),
    ("warehouse_committed", "Przyjęcie magazynowe"),
]


@dataclass(frozen=True)
class ReturnsReportFilters:
    tenant_id: int
    warehouse_id: Optional[int] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    date_field: DateField = "created"
    status_id: Optional[int] = None
    decision: Optional[str] = None
    product_query: Optional[str] = None
    order_query: Optional[str] = None
    source: Optional[str] = None
    country: Optional[str] = None
    sort: SortField = "date"
    direction: Literal["asc", "desc"] = "desc"
    page: int = 1
    limit: int = 50


def _customer_display_name(c: Customer | None) -> str:
    if c is None:
        return ""
    parts = [str(c.first_name or "").strip(), str(c.last_name or "").strip()]
    name = " ".join(p for p in parts if p).strip()
    if name:
        return name
    return str(getattr(c, "company_name", None) or "").strip()


def _default_date_from() -> datetime:
    return datetime.utcnow() - timedelta(days=30)


def _apply_filters(q, filters: ReturnsReportFilters, *, zpz: Any, refund: Any):
    q = q.filter(
        WmsOrderReturn.tenant_id == int(filters.tenant_id),
        WmsOrderReturn.deleted_at.is_(None),
    )
    if filters.warehouse_id is not None:
        q = q.filter(WmsOrderReturn.warehouse_id == int(filters.warehouse_id))

    date_from = filters.date_from or _default_date_from()
    date_to = filters.date_to
    df = filters.date_field or "created"
    if df == "warehouse_commit":
        col = zpz.created_at
        q = q.filter(WmsOrderReturn.warehouse_document_id.isnot(None))
    elif df == "refund":
        col = refund.decided_at
        q = q.filter(refund.id.isnot(None))
    else:
        col = WmsOrderReturn.created_at
    q = q.filter(col.isnot(None), col >= date_from)
    if date_to is not None:
        q = q.filter(col <= date_to)

    if filters.status_id is not None:
        q = q.filter(WmsOrderReturn.status_id == int(filters.status_id))
    if filters.decision:
        q = q.filter(func.upper(RMZLine.decision) == str(filters.decision).strip().upper())
    if filters.product_query:
        pq = f"%{str(filters.product_query).strip()}%"
        q = q.filter(
            or_(
                Product.name.ilike(pq),
                Product.sku.ilike(pq),
                Product.ean.ilike(pq),
                Product.barcode.ilike(pq),
            )
        )
    if filters.order_query:
        oq = f"%{str(filters.order_query).strip()}%"
        q = q.filter(
            or_(
                Order.number.ilike(oq),
                WmsOrderReturn.rmz_number.ilike(oq),
                Order.external_id.ilike(oq),
            )
        )
    if filters.source:
        q = q.filter(Order.source == str(filters.source).strip())
    if filters.country:
        cq = f"%{str(filters.country).strip()}%"
        q = q.filter(or_(Order.country.ilike(cq), Customer.country_code.ilike(cq)))
    return q


def _base_query(db: Session, filters: ReturnsReportFilters):
    zpz = aliased(StockDocument)
    refund = aliased(WmsRefund)

    q = (
        db.query(
            RMZLine,
            WmsOrderReturn,
            Order,
            OrderItem,
            Product,
            Customer,
            ReturnStatus,
            Warehouse,
            zpz,
            refund,
        )
        .select_from(RMZLine)
        .join(WmsOrderReturn, WmsOrderReturn.id == RMZLine.rmz_id)
        .join(Order, Order.id == WmsOrderReturn.order_id)
        .outerjoin(OrderItem, OrderItem.id == RMZLine.order_item_id)
        .outerjoin(Product, Product.id == RMZLine.product_id)
        .outerjoin(Customer, Customer.id == Order.customer_id)
        .outerjoin(ReturnStatus, ReturnStatus.id == WmsOrderReturn.status_id)
        .outerjoin(Warehouse, Warehouse.id == WmsOrderReturn.warehouse_id)
        .outerjoin(zpz, zpz.id == WmsOrderReturn.warehouse_document_id)
        .outerjoin(refund, refund.rmz_id == WmsOrderReturn.id)
    )
    q = _apply_filters(q, filters, zpz=zpz, refund=refund)
    return q, zpz, refund


def _load_corrections_by_return(db: Session, *, tenant_id: int, return_ids: list[int]) -> dict[int, SaleDocument]:
    if not return_ids:
        return {}
    ids_str = [str(i) for i in return_ids]
    rows = (
        db.query(SaleDocument)
        .filter(
            SaleDocument.tenant_id == int(tenant_id),
            SaleDocument.document_kind == "CORRECTION",
            SaleDocument.business_source_type == "RETURN",
            SaleDocument.business_source_id.in_(ids_str),
        )
        .order_by(SaleDocument.created_at.desc(), SaleDocument.id.desc())
        .all()
    )
    out: dict[int, SaleDocument] = {}
    for doc in rows:
        try:
            rid = int(doc.business_source_id)
        except (TypeError, ValueError):
            continue
        if rid not in out:
            out[rid] = doc
    return out


def _sort_column(sort: SortField):
    mapping = {
        "date": WmsOrderReturn.created_at,
        "return_number": WmsOrderReturn.rmz_number,
        "order_number": Order.number,
        "product": Product.name,
        "qty": RMZLine.quantity,
        "line_value": OrderItem.unit_price,
        "status": ReturnStatus.name,
    }
    return mapping.get(sort, WmsOrderReturn.created_at)


def _row_dict(
    *,
    line: RMZLine,
    ret: WmsOrderReturn,
    order: Order,
    oi: OrderItem | None,
    product: Product | None,
    customer: Customer | None,
    status: ReturnStatus | None,
    warehouse: Warehouse | None,
    zpz: StockDocument | None,
    refund: WmsRefund | None,
    corr: SaleDocument | None,
) -> dict[str, Any]:
    accepted = max(0, int(getattr(line, "accepted_qty", None) or 0))
    rejected = max(0, int(getattr(line, "rejected_qty", None) or 0))
    dmg_b = max(0, int(getattr(line, "damaged_b_qty", None) or 0))
    dmg_c = max(0, int(getattr(line, "damaged_c_qty", None) or 0))
    commercial = accepted + dmg_b + dmg_c
    unit = float(oi.unit_price) if oi is not None and oi.unit_price is not None else 0.0
    line_value = round(commercial * unit, 2)
    decision = str(line.decision or "").strip().upper() or None
    purchase = float(product.purchase_price) if product is not None and product.purchase_price is not None else None
    currency = str(getattr(order, "currency", None) or "PLN")
    return {
        "return_line_id": int(line.id),
        "return_id": int(ret.id),
        "return_number": str(ret.rmz_number or ""),
        "order_id": int(order.id),
        "order_number": str(order.number or ""),
        "product_id": int(line.product_id) if line.product_id else None,
        "product_name": str(product.name or "") if product else "",
        "sku": str(product.sku or "") if product else "",
        "ean": str(product.ean or product.barcode or "") if product else "",
        "qty_returned": float(line.quantity or 0),
        "qty_accepted": accepted,
        "qty_rejected": rejected,
        "qty_damaged_b": dmg_b,
        "qty_damaged_c": dmg_c,
        "qty_commercial": commercial,
        "decision": decision,
        "decision_label": DECISION_LABELS.get(decision or "", decision or ""),
        "line_value": line_value,
        "currency": currency,
        "exchange_rate": None,
        "purchase_cost_net": purchase,
        "purchase_cost_is_current": True,
        "status_id": int(status.id) if status else None,
        "status_name": str(status.name or "") if status else "",
        "customer_name": _customer_display_name(customer),
        "customer_phone": str(customer.phone or "") if customer else "",
        "customer_email": str(customer.email or "") if customer else "",
        "return_date": ret.created_at.isoformat() if ret.created_at else None,
        "source": str(getattr(order, "source", None) or "") or None,
        "order_channel": str(getattr(order, "order_channel", None) or "") or None,
        "country": str(getattr(order, "country", None) or getattr(customer, "country_code", None) or "") or None,
        "warehouse_id": int(ret.warehouse_id) if ret.warehouse_id else None,
        "warehouse_name": str(warehouse.name or "") if warehouse else "",
        "warehouse_committed": bool(ret.warehouse_document_id),
        "zpz_number": str(zpz.document_number or "") if zpz else None,
        "correction_number": str(corr.document_number or "") if corr else None,
        "correction_issued": corr is not None,
        "refund_amount_header": float(refund.refund_amount) if refund and refund.refund_amount is not None else None,
        "refund_shipping": bool(refund.refund_shipping) if refund else False,
    }


def query_returns_report(db: Session, filters: ReturnsReportFilters) -> dict[str, Any]:
    q, _zpz, _refund = _base_query(db, filters)
    total = q.with_entities(func.count(RMZLine.id)).scalar() or 0

    sort_col = _sort_column(filters.sort)
    if filters.direction == "asc":
        q = q.order_by(sort_col.asc().nullslast(), RMZLine.id.asc())
    else:
        q = q.order_by(sort_col.desc().nullslast(), RMZLine.id.desc())

    page = max(1, int(filters.page or 1))
    limit = min(100, max(1, int(filters.limit or 50)))
    offset = (page - 1) * limit
    rows_raw = q.offset(offset).limit(limit).all()

    return_ids = [int(ret.id) for _line, ret, *_rest in rows_raw]
    corr_by_return = _load_corrections_by_return(db, tenant_id=filters.tenant_id, return_ids=return_ids)

    items = []
    for line, ret, order, oi, product, customer, status, warehouse, zpz_row, refund_row in rows_raw:
        items.append(
            _row_dict(
                line=line,
                ret=ret,
                order=order,
                oi=oi,
                product=product,
                customer=customer,
                status=status,
                warehouse=warehouse,
                zpz=zpz_row,
                refund=refund_row,
                corr=corr_by_return.get(int(ret.id)),
            )
        )
    pages = (int(total) + limit - 1) // limit if limit else 1
    return {
        "items": items,
        "page": page,
        "limit": limit,
        "total": int(total),
        "pages": pages,
    }


def summarize_returns_report(db: Session, filters: ReturnsReportFilters) -> dict[str, Any]:
    zpz = aliased(StockDocument)
    refund = aliased(WmsRefund)
    slim = (
        db.query(
            RMZLine.id,
            WmsOrderReturn.id,
            RMZLine.accepted_qty,
            RMZLine.damaged_b_qty,
            RMZLine.damaged_c_qty,
            RMZLine.rejected_qty,
            OrderItem.unit_price,
        )
        .select_from(RMZLine)
        .join(WmsOrderReturn, WmsOrderReturn.id == RMZLine.rmz_id)
        .join(Order, Order.id == WmsOrderReturn.order_id)
        .outerjoin(OrderItem, OrderItem.id == RMZLine.order_item_id)
        .outerjoin(Product, Product.id == RMZLine.product_id)
        .outerjoin(Customer, Customer.id == Order.customer_id)
        .outerjoin(zpz, zpz.id == WmsOrderReturn.warehouse_document_id)
        .outerjoin(refund, refund.rmz_id == WmsOrderReturn.id)
    )
    slim = _apply_filters(slim, filters, zpz=zpz, refund=refund)
    rows = slim.all()

    return_ids: set[int] = set()
    pieces = 0
    accepted_wh = 0
    rejected = 0
    value = 0.0
    for _lid, rid, a, b, c, r, unit in rows:
        return_ids.add(int(rid))
        aa = max(0, int(a or 0))
        bb = max(0, int(b or 0))
        cc = max(0, int(c or 0))
        rr = max(0, int(r or 0))
        commercial = aa + bb + cc
        pieces += commercial
        accepted_wh += commercial
        rejected += rr
        value += commercial * float(unit or 0.0)

    return {
        "returns_count": len(return_ids),
        "pieces_commercial": pieces,
        "value_total": round(value, 2),
        "accepted_warehouse_qty": accepted_wh,
        "rejected_qty": rejected,
        "currency": "PLN",
    }


def iter_returns_report_rows(db: Session, filters: ReturnsReportFilters, *, batch: int = 500):
    page = 1
    while True:
        chunk = ReturnsReportFilters(
            tenant_id=filters.tenant_id,
            warehouse_id=filters.warehouse_id,
            date_from=filters.date_from,
            date_to=filters.date_to,
            date_field=filters.date_field,
            status_id=filters.status_id,
            decision=filters.decision,
            product_query=filters.product_query,
            order_query=filters.order_query,
            source=filters.source,
            country=filters.country,
            sort=filters.sort,
            direction=filters.direction,
            page=page,
            limit=batch,
        )
        payload = query_returns_report(db, chunk)
        items = payload["items"]
        if not items:
            break
        yield from items
        if page >= int(payload["pages"]):
            break
        page += 1


def build_returns_report_csv(db: Session, filters: ReturnsReportFilters) -> bytes:
    buf = io.StringIO()
    buf.write("\ufeff")
    writer = csv.writer(buf, delimiter=";")
    writer.writerow([label for _, label in EXPORT_HEADERS])
    for row in iter_returns_report_rows(db, filters):
        out = []
        for key, _ in EXPORT_HEADERS:
            val = row.get(key)
            if key == "warehouse_committed":
                out.append("TAK" if val else "NIE")
            elif val is None:
                out.append("")
            else:
                out.append(val)
        writer.writerow(out)
    return buf.getvalue().encode("utf-8")


def build_returns_report_xlsx(db: Session, filters: ReturnsReportFilters) -> bytes:
    from openpyxl import Workbook
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = "Raport zwrotów"
    ws.append([label for _, label in EXPORT_HEADERS])
    for row in iter_returns_report_rows(db, filters):
        out = []
        for key, _ in EXPORT_HEADERS:
            val = row.get(key)
            if key == "warehouse_committed":
                out.append("TAK" if val else "NIE")
            elif val is None:
                out.append("")
            else:
                out.append(val)
        ws.append(out)
    ws.auto_filter.ref = ws.dimensions
    ws.freeze_panes = "A2"
    for idx, (_, label) in enumerate(EXPORT_HEADERS, start=1):
        ws.column_dimensions[get_column_letter(idx)].width = min(max(len(label) + 2, 12), 36)
    bio = io.BytesIO()
    wb.save(bio)
    bio.seek(0)
    return bio.read()
