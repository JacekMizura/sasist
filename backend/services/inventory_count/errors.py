"""Inventory count module — domain errors."""

from __future__ import annotations


class InventoryCountError(Exception):
    code: str = "inventory_count_error"

    def __init__(self, message: str, *, code: str | None = None) -> None:
        super().__init__(message)
        if code:
            self.code = code


class InventoryDocumentNotFoundError(InventoryCountError):
    code = "document_not_found"


class InventoryInvalidTransitionError(InventoryCountError):
    code = "invalid_status_transition"


class InventoryTaskNotFoundError(InventoryCountError):
    code = "task_not_found"


class InventorySessionNotFoundError(InventoryCountError):
    code = "session_not_found"


class InventoryLocationMismatchError(InventoryCountError):
    code = "location_mismatch"


class InventoryBlindCountViolationError(InventoryCountError):
    code = "blind_count_violation"
