"""Product sales offers — package exports."""

from .crud_service import (
    create_outlet_offer_preset,
    ensure_default_offer_for_product,
    offer_to_read_dict,
    soft_delete_offer,
    update_offer,
)
from .errors import OfferStockUnavailableError, ProductSalesOfferError
from .price_service import effective_offer_sale_price_net, resolve_effective_offer_price
from .resolution_service import (
    auto_select_offer_if_unique,
    disposition_for_offer,
    get_default_offer_for_product,
    get_offer_by_id,
    list_active_offers_for_product,
    resolve_offer_for_order_line,
)
from .stock_service import assert_offer_quantity_available, offer_available_qty

__all__ = [
    "OfferStockUnavailableError",
    "ProductSalesOfferError",
    "assert_offer_quantity_available",
    "auto_select_offer_if_unique",
    "create_outlet_offer_preset",
    "disposition_for_offer",
    "effective_offer_sale_price_net",
    "ensure_default_offer_for_product",
    "get_default_offer_for_product",
    "get_offer_by_id",
    "list_active_offers_for_product",
    "offer_available_qty",
    "offer_to_read_dict",
    "resolve_effective_offer_price",
    "resolve_offer_for_order_line",
    "soft_delete_offer",
    "update_offer",
]
