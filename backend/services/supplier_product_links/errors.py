"""Supplier product link domain errors."""

from __future__ import annotations


class SupplierProductLinkError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: str = "SUPPLIER_PRODUCT_LINK_CREATE_FAILED",
        details: str = "",
        http_status: int = 400,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details or message
        self.http_status = http_status

    def as_detail(self) -> dict[str, str]:
        return {
            "message": self.message,
            "code": self.code,
            "details": self.details,
        }
