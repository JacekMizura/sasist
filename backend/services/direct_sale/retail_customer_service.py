"""Shim — retail helpers live in package-neutral ``retail_customer_service``."""

from __future__ import annotations

from ..retail_customer_service import (
    RETAIL_CUSTOMER_EMAIL_SUFFIX,
    RETAIL_DISPLAY_NAME,
    customer_display_name,
    ensure_retail_customer,
    is_retail_system_customer,
)

__all__ = [
    "RETAIL_CUSTOMER_EMAIL_SUFFIX",
    "RETAIL_DISPLAY_NAME",
    "customer_display_name",
    "ensure_retail_customer",
    "is_retail_system_customer",
]
