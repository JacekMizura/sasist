"""Direct sale scan commands — add line + soft-hold."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from ...models.commerce_operational import DirectSaleSession, DirectSaleSessionLine
from ...models.product import Product
from ..location_stock_service import resolve_product_id, suggest_issue_locations_for_sales
from ..product_sales_offers import (
    assert_offer_quantity_available,
    auto_select_offer_if_unique,
    disposition_for_offer,
    list_active_offers_for_product,
    resolve_effective_offer_price,
    resolve_offer_for_order_line,
)
from ..product_sales_offers.crud_service import ensure_default_offer_for_product
from ..product_sales_offers.errors import OfferStockUnavailableError
from .errors import DirectSaleError
from .soft_hold_service import create_soft_hold_for_scan


def _resolve_product_from_scan(
    db: Session,
    *,
    tenant_id: int,
    code: str,
) -> int:
    raw = (code or "").strip()
    if not raw:
        raise DirectSaleError("Pusty kod skanu.", code="empty_scan")
    pid = resolve_product_id(db, tenant_id=tenant_id, ean=raw)
    if pid is None:
        pid = resolve_product_id(db, tenant_id=tenant_id, sku=raw)
    if pid is None and raw.isdigit():
        pid = resolve_product_id(db, tenant_id=tenant_id, product_id=int(raw))
    if pid is None:
        raise DirectSaleError(f"Nie rozpoznano produktu: {raw}", code="product_not_found", http_status=404)
    return int(pid)


def _resolve_offer_for_line(
    db: Session,
    *,
    tenant_id: int,
    product: Product,
    offer_id: int | None,
) -> "ProductSalesOffer":
    from ...models.product_sales_offer import ProductSalesOffer

    if offer_id is not None and int(offer_id) > 0:
        offer = resolve_offer_for_order_line(db, tenant_id=int(tenant_id), offer_id=int(offer_id))
        if int(offer.product_id) != int(product.id):
            raise DirectSaleError(
                "Oferta nie należy do tego produktu.",
                code="offer_product_mismatch",
                http_status=400,
            )
        return offer

    offers = list_active_offers_for_product(
        db, tenant_id=int(tenant_id), product_id=int(product.id)
    )
    if not offers:
        offer = ensure_default_offer_for_product(db, product=product)
        db.flush()
        return offer
    picked = auto_select_offer_if_unique(offers)
    if picked is None:
        raise DirectSaleError(
            "Wybierz ofertę — produkt ma wiele aktywnych ofert sprzedażowych.",
            code="offer_selection_required",
            http_status=409,
        )
    return picked


def _effective_unit_price(db: Session, *, product: Product, offer) -> float | None:
    return resolve_effective_offer_price(db, offer)


def session_add_product_line(
    db: Session,
    sess: DirectSaleSession,
    *,
    product_id: int,
    quantity: float,
    source_location_id: int | None = None,
    offer_id: int | None = None,
) -> tuple[DirectSaleSessionLine, list[dict]]:
    if sess.status not in ("ACTIVE", "SUSPENDED", "CHECKOUT"):
        raise DirectSaleError("Sesja nie przyjmuje pozycji.", code="session_closed")
    if sess.status == "SUSPENDED":
        sess.status = "ACTIVE"
        sess.suspended_at = None
    pid = int(product_id)
    pr = db.query(Product).filter(Product.id == pid, Product.tenant_id == int(sess.tenant_id)).first()
    if pr is None:
        raise DirectSaleError("Produkt niedostępny.", code="product_not_found", http_status=404)
    return _add_line_for_product(
        db,
        sess,
        product_id=pid,
        product=pr,
        quantity=quantity,
        source_location_id=source_location_id,
        offer_id=offer_id,
    )


def session_scan_add_line(
    db: Session,
    sess: DirectSaleSession,
    *,
    code: str,
    quantity: float,
    source_location_id: int | None = None,
    offer_id: int | None = None,
) -> tuple[DirectSaleSessionLine, list[dict]]:
    if sess.status not in ("ACTIVE", "SUSPENDED", "CHECKOUT"):
        raise DirectSaleError("Sesja nie przyjmuje skanów.", code="session_closed")
    if sess.status == "SUSPENDED":
        sess.status = "ACTIVE"
        sess.suspended_at = None
    pid = _resolve_product_from_scan(db, tenant_id=int(sess.tenant_id), code=code)
    pr = db.query(Product).filter(Product.id == pid).first()
    return _add_line_for_product(
        db,
        sess,
        product_id=pid,
        product=pr,
        quantity=quantity,
        source_location_id=source_location_id,
        offer_id=offer_id,
    )


def _add_line_for_product(
    db: Session,
    sess: DirectSaleSession,
    *,
    product_id: int,
    product: Product | None,
    quantity: float,
    source_location_id: int | None,
    offer_id: int | None = None,
) -> tuple[DirectSaleSessionLine, list[dict]]:
    pid = int(product_id)
    qty = float(quantity)
    if qty <= 0:
        raise DirectSaleError("Ilość musi być > 0.", code="invalid_qty")
    if product is None:
        raise DirectSaleError("Produkt niedostępny.", code="product_not_found", http_status=404)

    offer = _resolve_offer_for_line(
        db,
        tenant_id=int(sess.tenant_id),
        product=product,
        offer_id=offer_id,
    )
    try:
        assert_offer_quantity_available(
            db,
            offer=offer,
            tenant_id=int(sess.tenant_id),
            warehouse_id=int(sess.warehouse_id),
            quantity=qty,
        )
    except OfferStockUnavailableError as exc:
        raise DirectSaleError(str(exc.detail), code="offer_stock_unavailable", http_status=400) from exc

    suggestions = suggest_issue_locations_for_sales(
        db,
        tenant_id=int(sess.tenant_id),
        warehouse_id=int(sess.warehouse_id),
        product_id=pid,
        quantity=qty,
    )
    suggested_lid = int(suggestions[0]["location_id"]) if suggestions else None
    src_lid = int(source_location_id) if source_location_id else suggested_lid
    sort_order = len(sess.lines or [])
    line = DirectSaleSessionLine(
        session_id=int(sess.id),
        product_id=pid,
        product_sales_offer_id=int(offer.id),
        quantity=qty,
        unit_price=_effective_unit_price(db, product=product, offer=offer),
        source_location_id=src_lid,
        suggested_location_id=suggested_lid,
        sort_order=sort_order,
    )
    db.add(line)
    sess.last_activity_at = datetime.utcnow()
    db.flush()
    create_soft_hold_for_scan(
        db,
        sess=sess,
        line=line,
        performed_by_user_id=sess.operator_user_id,
        stock_disposition=disposition_for_offer(offer),
    )
    return line, suggestions
