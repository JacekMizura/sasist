"""Canonical request contracts for operational direct-sales mutations."""

from .add_product_request import AddDirectSalesProductRequest
from .set_customer_request import SetDirectSalesCustomerRequest

__all__ = [
    "AddDirectSalesProductRequest",
    "SetDirectSalesCustomerRequest",
]
