"""Direct sale domain package — one module per responsibility."""

from .complete_service import (
    DirectSaleCompleteResult,
    complete_direct_sale_session,
    start_direct_sale_payment,
)
from .constants import (
    RESERVATION_KIND_SOFT_HOLD,
    RESERVATION_STATUS_ACTIVE,
    RESERVATION_STATUS_CONSUMED,
    legacy_status_to_lifecycle,
    lifecycle_to_legacy_status,
    reservation_expires_at,
    soft_hold_expires_at,
)
from .document_pipeline_service import (
    DirectSaleDocumentRequest,
    DirectSaleDocumentResult,
    enqueue_direct_sale_documents,
    process_direct_sale_document_job,
)
from .errors import DirectSaleError
from .issue_plan_service import IssueAllocation, plan_issue_allocations
from .order_service import create_order_from_session
from .payment_service import orchestrate_direct_sale_payment
from .scan_service import session_scan_add_line
from .session_service import (
    cancel_session,
    create_session,
    get_session,
    list_suspended_sessions,
    resume_session,
    set_session_customer,
    suspend_session,
)
from .soft_hold_service import create_soft_hold_for_scan, soft_hold_enabled
from .stock_issue_service import (
    create_reservations_for_order,
    issue_stock_for_allocations,
    release_session_reservations,
)

__all__ = [
    "DirectSaleCompleteResult",
    "DirectSaleDocumentRequest",
    "DirectSaleDocumentResult",
    "DirectSaleError",
    "IssueAllocation",
    "RESERVATION_KIND_SOFT_HOLD",
    "RESERVATION_STATUS_ACTIVE",
    "RESERVATION_STATUS_CONSUMED",
    "complete_direct_sale_session",
    "create_order_from_session",
    "create_reservations_for_order",
    "cancel_session",
    "create_session",
    "create_soft_hold_for_scan",
    "enqueue_direct_sale_documents",
    "get_session",
    "list_suspended_sessions",
    "resume_session",
    "issue_stock_for_allocations",
    "legacy_status_to_lifecycle",
    "lifecycle_to_legacy_status",
    "orchestrate_direct_sale_payment",
    "plan_issue_allocations",
    "process_direct_sale_document_job",
    "release_session_reservations",
    "reservation_expires_at",
    "session_scan_add_line",
    "set_session_customer",
    "soft_hold_enabled",
    "soft_hold_expires_at",
    "start_direct_sale_payment",
    "suspend_session",
]
