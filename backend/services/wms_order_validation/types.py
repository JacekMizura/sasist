from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Optional

WmsValidationStatus = Literal["PASS", "FAIL", "ERROR"]

# Błędy techniczne / input — NIE są issues produktowymi, NIE emitują WMS_VALIDATION_FAILED.
ERROR_ORDER_NOT_FOUND = "ORDER_NOT_FOUND"
ERROR_ORDER_TENANT_MISMATCH = "ORDER_TENANT_MISMATCH"


@dataclass(frozen=True)
class WmsOrderValidationIssue:
    reason_code: str
    reason_label: str
    product_id: Optional[int] = None
    order_item_id: Optional[int] = None
    ean: Optional[str] = None
    sku: Optional[str] = None
    product_name: Optional[str] = None
    required_qty: Optional[float] = None
    available_qty: Optional[float] = None
    allocatable_qty: Optional[float] = None
    location_id: Optional[int] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "reason_code": self.reason_code,
            "reason_label": self.reason_label,
            "product_id": self.product_id,
            "order_item_id": self.order_item_id,
            "ean": self.ean,
            "sku": self.sku,
            "product_name": self.product_name,
            "required_qty": self.required_qty,
            "available_qty": self.available_qty,
            "allocatable_qty": self.allocatable_qty,
            "location_id": self.location_id,
        }


@dataclass
class WmsOrderValidationResult:
    order_id: int
    validation_status: WmsValidationStatus
    issues: list[WmsOrderValidationIssue] = field(default_factory=list)
    #: Tylko przy validation_status=ERROR (input / tenant) — nie mieszać z reason_code produktu.
    error_code: Optional[str] = None
    error_message: Optional[str] = None

    @property
    def ok(self) -> bool:
        return self.validation_status == "PASS"

    @property
    def is_technical_error(self) -> bool:
        return self.validation_status == "ERROR"

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "order_id": self.order_id,
            "validation_status": self.validation_status,
            "issues": [i.to_dict() for i in self.issues],
        }
        if self.error_code:
            out["error_code"] = self.error_code
        if self.error_message:
            out["error_message"] = self.error_message
        return out
