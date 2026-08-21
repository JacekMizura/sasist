"""Sale documents domain package — corrections + item snapshots."""

from .errors import SaleCorrectionError
from .issue_service import (
    SaleCorrectionIssueResult,
    find_primary_sale_document_for_order,
    issue_sale_correction,
    issue_sale_correction_for_return,
    list_corrections_for_source,
)
from .readiness import assert_return_ready_for_sale_correction

__all__ = [
    "SaleCorrectionError",
    "SaleCorrectionIssueResult",
    "assert_return_ready_for_sale_correction",
    "find_primary_sale_document_for_order",
    "issue_sale_correction",
    "issue_sale_correction_for_return",
    "list_corrections_for_source",
]
