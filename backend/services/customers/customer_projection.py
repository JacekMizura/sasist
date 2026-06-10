"""Serialize Customer ORM rows for API responses."""

from __future__ import annotations

import logging
from typing import Dict, List

from sqlalchemy.orm import Session

from ...models.customer import Customer, CustomerAddress, CustomerProductDiscount
from ...models.customer_analytics import CustomerSalesStats
from ...models.product import Product
from ...schemas.customer import (
    CustomerAddressOut,
    CustomerDetailOut,
    CustomerFlagsOut,
    CustomerListOut,
    CustomerProductDiscountOut,
    CustomerSummaryOut,
)
from .customer_constants import infer_customer_type, normalize_customer_status, parse_customer_flags
from .stats_refresh_service import ensure_customer_stats_fresh

logger = logging.getLogger(__name__)


def display_name(c: Customer) -> str:
    comp = (c.company_name or "").strip()
    if comp:
        return comp
    fn = (c.first_name or "").strip()
    ln = (c.last_name or "").strip()
    full = f"{fn} {ln}".strip()
    return full or f"#{c.id}"


def flags_out(c: Customer) -> CustomerFlagsOut:
    raw = parse_customer_flags(getattr(c, "flags_json", None))
    return CustomerFlagsOut(
        vip=bool(raw.get("vip")),
        debtor=bool(raw.get("debtor")),
        priority=bool(raw.get("priority")),
        suspicious=bool(raw.get("suspicious")),
    )


def _load_customer_stats_map(
    db: Session,
    *,
    customer_ids: List[int],
    tenant_id: int,
) -> Dict[int, CustomerSalesStats]:
    if not customer_ids:
        return {}
    try:
        stats_rows = (
            db.query(CustomerSalesStats)
            .filter(
                CustomerSalesStats.customer_id.in_(customer_ids),
                CustomerSalesStats.tenant_id == int(tenant_id),
            )
            .all()
        )
        return {int(s.customer_id): s for s in stats_rows}
    except Exception:
        logger.exception(
            "[customers.list] stats projection failed tenant_id=%s customer_count=%s",
            tenant_id,
            len(customer_ids),
        )
        return {}


def summary_out(db: Session, *, customer_id: int, tenant_id: int) -> CustomerSummaryOut:
    try:
        stats = ensure_customer_stats_fresh(db, customer_id=int(customer_id), tenant_id=int(tenant_id))
    except Exception:
        logger.exception(
            "[customers.detail] stats projection failed customer_id=%s tenant_id=%s",
            customer_id,
            tenant_id,
        )
        return CustomerSummaryOut()
    return CustomerSummaryOut(
        order_count=int(stats.order_count or 0),
        total_gross=round(float(stats.total_gross or 0), 2),
        total_net=round(float(stats.total_net or 0), 2),
        avg_basket_gross=round(float(stats.avg_basket_gross or 0), 2),
        last_order_at=stats.last_order_at,
        returns_count=int(stats.returns_corrections_count or 0),
    )


def customer_to_detail_out(
    db: Session,
    row: Customer,
    *,
    include_summary: bool = False,
) -> CustomerDetailOut:
    addr_rows = sorted(row.addresses or [], key=lambda a: a.id or 0)
    addresses = [
        CustomerAddressOut(
            id=int(a.id),
            customer_id=int(a.customer_id),
            first_name=a.first_name or "",
            last_name=a.last_name or "",
            company_name=a.company_name,
            street=a.street or "",
            house_number=a.house_number or "",
            apartment_number=a.apartment_number,
            postal_code=a.postal_code or "",
            city=a.city or "",
            country_code=a.country_code or "PL",
            is_default=bool(a.is_default),
        )
        for a in addr_rows
    ]
    disc_out: List[CustomerProductDiscountOut] = []
    for d in row.product_discounts or []:
        pname = None
        psku = None
        if d.product_id:
            p = db.query(Product).filter(Product.id == int(d.product_id)).first()
            if p:
                pname = (p.name or "").strip() or None
                psku = (p.sku or "").strip() or None
        disc_out.append(
            CustomerProductDiscountOut(
                id=int(d.id),
                customer_id=int(d.customer_id),
                product_id=int(d.product_id),
                discount_percent=float(d.discount_percent or 0),
                product_name=pname,
                product_sku=psku,
            )
        )
    dt = str(row.default_document_type or "RECEIPT").strip().upper()
    if dt not in ("RECEIPT", "INVOICE"):
        dt = "RECEIPT"
    ctype = infer_customer_type(row)  # type: ignore[assignment]
    status = normalize_customer_status(getattr(row, "customer_status", None))
    return CustomerDetailOut(
        id=int(row.id),
        tenant_id=int(row.tenant_id),
        first_name=row.first_name or "",
        last_name=row.last_name or "",
        phone=row.phone,
        email=row.email,
        company_name=row.company_name,
        nip=row.nip,
        country_code=(row.country_code or "PL").strip().upper()[:8] or "PL",
        default_document_type=dt,  # type: ignore[arg-type]
        preferred_shipping_method_id=str(row.preferred_shipping_method_id).strip()
        if row.preferred_shipping_method_id
        else None,
        preferred_payment_method=(row.preferred_payment_method or "").strip() or None,
        global_discount_percent=float(row.global_discount_percent or 0),
        customer_type=ctype,  # type: ignore[arg-type]
        customer_status=status,  # type: ignore[arg-type]
        flags=flags_out(row),
        credit_limit_gross=float(row.credit_limit_gross)
        if getattr(row, "credit_limit_gross", None) is not None
        else None,
        payment_terms_days=int(row.payment_terms_days)
        if getattr(row, "payment_terms_days", None) is not None
        else None,
        account_manager_user_id=int(row.account_manager_user_id)
        if getattr(row, "account_manager_user_id", None)
        else None,
        summary=summary_out(db, customer_id=int(row.id), tenant_id=int(row.tenant_id))
        if include_summary
        else None,
        created_at=getattr(row, "created_at", None),
        updated_at=getattr(row, "updated_at", None),
        addresses=addresses,
        product_discounts=disc_out,
    )


def customers_to_list_out(
    db: Session,
    rows: List[Customer],
    *,
    tenant_id: int,
) -> List[CustomerListOut]:
    if not rows:
        return []
    ids = [int(r.id) for r in rows]
    stats_map = _load_customer_stats_map(db, customer_ids=ids, tenant_id=int(tenant_id))
    out: List[CustomerListOut] = []
    for r in rows:
        stats = stats_map.get(int(r.id))
        ctype = infer_customer_type(r)  # type: ignore[assignment]
        status = normalize_customer_status(getattr(r, "customer_status", None))
        out.append(
            CustomerListOut(
                id=int(r.id),
                tenant_id=int(r.tenant_id),
                display_name=display_name(r),
                email=r.email,
                phone=r.phone,
                nip=r.nip,
                country_code=(r.country_code or "PL").strip().upper()[:8] or "PL",
                customer_type=ctype,  # type: ignore[arg-type]
                customer_status=status,  # type: ignore[arg-type]
                flags=flags_out(r),
                order_count=int(stats.order_count or 0) if stats else 0,
                total_gross=round(float(stats.total_gross or 0), 2) if stats else 0.0,
            )
        )
    return out
