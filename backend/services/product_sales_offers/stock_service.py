"""
Canonical offer availability — SSOT for OMS, Direct Sale, and offer API.

Never cross disposition pools (outlet order cannot consume SALEABLE).
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.product_sales_offer import ProductSalesOffer
from ..product_disposition_snapshot_service import (
    _reserved_by_product_and_disposition,
    get_product_disposition_stock,
)
from ..stock_disposition import DEFAULT_STOCK_DISPOSITION, normalize_stock_disposition
from .constants import disposition_on_hand_key
from .errors import OfferStockUnavailableError


def _load_offer(db: Session, offer: ProductSalesOffer | int) -> ProductSalesOffer | None:
    if isinstance(offer, ProductSalesOffer):
        return offer
    return db.query(ProductSalesOffer).filter(ProductSalesOffer.id == int(offer)).first()


def offer_available_qty(
    db: Session,
    *,
    offer: ProductSalesOffer | int,
    tenant_id: int,
    warehouse_id: int,
) -> float:
    """
    Available qty for this offer = on-hand in offer's disposition pool minus active
    reservations tagged with the same ``stock_disposition``.
    """
    row = _load_offer(db, offer)
    if row is None:
        return 0.0
    if int(row.tenant_id) != int(tenant_id):
        return 0.0
    if not bool(getattr(row, "active", True)) or getattr(row, "deleted_at", None) is not None:
        return 0.0

    pid = int(row.product_id)
    sd = normalize_stock_disposition(getattr(row, "stock_disposition", None) or DEFAULT_STOCK_DISPOSITION)
    snap = get_product_disposition_stock(
        db,
        product_id=pid,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
    )

    if sd == DEFAULT_STOCK_DISPOSITION:
        from ..commercial_availability_service import commercially_sellable_qty

        return float(
            commercially_sellable_qty(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                product_id=pid,
            )
        )

    key = disposition_on_hand_key(sd)
    on_hand = float(snap.get(key) or 0.0)
    reserved_map = _reserved_by_product_and_disposition(
        db, int(tenant_id), int(warehouse_id), [pid], sd
    )
    reserved = float(reserved_map.get(pid, 0.0))
    return max(0.0, on_hand - reserved)


def assert_offer_quantity_available(
    db: Session,
    *,
    offer: ProductSalesOffer | int,
    tenant_id: int,
    warehouse_id: int,
    quantity: float,
) -> None:
    row = _load_offer(db, offer)
    if row is None:
        raise OfferStockUnavailableError("Oferta sprzedażowa nie istnieje.")
    need = float(quantity or 0)
    if need <= 0:
        return
    avail = offer_available_qty(
        db,
        offer=row,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
    )
    if avail + 1e-9 < need:
        from ..commercial_availability_service import (
            COMMERCIAL_STOCK_UNAVAILABLE_MSG,
            effective_sales_block_for_product,
        )

        sd = normalize_stock_disposition(row.stock_disposition)
        if sd == DEFAULT_STOCK_DISPOSITION:
            block = effective_sales_block_for_product(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                product_id=int(row.product_id),
            )
            if block > 1e-9:
                raise OfferStockUnavailableError(COMMERCIAL_STOCK_UNAVAILABLE_MSG)
        raise OfferStockUnavailableError(
            f"Brak dostępności w puli {sd}: wymagane {need:g}, dostępne {avail:g} "
            f"(product_id={int(row.product_id)}, offer_id={int(row.id)})."
        )
