"""Inventory count module — domain errors."""

from __future__ import annotations

from typing import Any


class InventoryCountError(Exception):
    code: str = "inventory_count_error"

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        if code:
            self.code = code
        self.details: dict[str, Any] = dict(details or {})


class InventoryDocumentNotFoundError(InventoryCountError):
    code = "document_not_found"


class InventoryInvalidTransitionError(InventoryCountError):
    code = "invalid_status_transition"


class InventoryIncompleteCountError(InventoryCountError):
    code = "incomplete_count"


class InventoryPartialSubmitNotReadyError(InventoryCountError):
    code = "partial_submit_not_ready"


class InventoryActiveCountingTasksError(InventoryCountError):
    code = "active_counting_tasks"


class InventoryPendingRecountsError(InventoryCountError):
    code = "pending_recounts"


class InventoryTaskNotFoundError(InventoryCountError):
    code = "task_not_found"


class InventorySessionNotFoundError(InventoryCountError):
    code = "session_not_found"


class InventoryLocationMismatchError(InventoryCountError):
    code = "location_mismatch"


class InventoryBlindCountViolationError(InventoryCountError):
    code = "blind_count_violation"


class InventoryConcurrentUpdateError(InventoryCountError):
    code = "concurrent_update"


class InventoryLineLockedError(InventoryCountError):
    code = "line_locked"


class InventoryDuplicatePostError(InventoryCountError):
    code = "duplicate_post"


class InventoryPostingInProgressError(InventoryCountError):
    code = "posting_in_progress"


class InventoryPermissionDeniedError(InventoryCountError):
    code = "permission_denied"


class InventoryBarcodeNotFoundError(InventoryCountError):
    code = "barcode_not_found"

    def __init__(
        self,
        message: str,
        *,
        barcode: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message, code=self.code, details=details)
        self.barcode = barcode


class InventoryBarcodeLineNotFoundError(InventoryCountError):
    code = "line_not_found_for_barcode"

    def __init__(
        self,
        message: str,
        *,
        barcode: str | None = None,
        product_id: int | None = None,
        task_id: int | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        merged = dict(details or {})
        if barcode is not None:
            merged.setdefault("barcode", barcode)
        if product_id is not None:
            merged.setdefault("product_id", product_id)
        if task_id is not None:
            merged.setdefault("task_id", task_id)
        super().__init__(message, code=self.code, details=merged)
        self.barcode = barcode
        self.product_id = product_id
        self.task_id = task_id


class InventoryBarcodeAmbiguousError(InventoryCountError):
    code = "barcode_ambiguous"

    def __init__(
        self,
        message: str,
        *,
        barcode: str | None = None,
        product_ids: list[int] | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        merged = dict(details or {})
        if barcode is not None:
            merged.setdefault("barcode", barcode)
        if product_ids:
            merged.setdefault("product_ids", product_ids)
        super().__init__(message, code=self.code, details=merged)
        self.barcode = barcode
        self.product_ids = product_ids or []
