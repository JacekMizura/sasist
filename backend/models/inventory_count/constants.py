"""Inventory / stock count module — canonical string constants."""

from __future__ import annotations

# Document types
INV_TYPE_FULL = "FULL"
INV_TYPE_PARTIAL = "PARTIAL"
INV_TYPE_CYCLE = "CYCLE"
INV_TYPE_CONTROL = "CONTROL"

INV_TYPES = (
    INV_TYPE_FULL,
    INV_TYPE_PARTIAL,
    INV_TYPE_CYCLE,
    INV_TYPE_CONTROL,
)

# Document lifecycle (ERP)
INV_STATUS_DRAFT = "draft"
INV_STATUS_PLANNED = "planned"
INV_STATUS_IN_PROGRESS = "in_progress"
INV_STATUS_AWAITING_APPROVAL = "awaiting_approval"
INV_STATUS_APPROVED = "approved"
INV_STATUS_POSTED = "posted"
INV_STATUS_ARCHIVED = "archived"
INV_STATUS_CANCELLED = "cancelled"

ACTIVE_DOCUMENT_STATUSES = (
    INV_STATUS_PLANNED,
    INV_STATUS_IN_PROGRESS,
    INV_STATUS_AWAITING_APPROVAL,
)

# Counting strategy
COUNT_MODE_BLIND = "blind"
COUNT_MODE_VISIBLE = "visible"

LOCK_MODE_SOFT = "soft"
LOCK_MODE_HARD = "hard"
LOCK_MODE_SNAPSHOT = "snapshot"

SCAN_MODE_INCREMENT = "scan_increment"
SCAN_MODE_MANUAL = "manual_quantity"
SCAN_MODE_CONTINUOUS = "continuous_scan"
SCAN_MODE_WEIGHTED = "weighted"

# Line status
LINE_STATUS_OPEN = "open"
LINE_STATUS_IN_PROGRESS = "in_progress"
LINE_STATUS_COUNTED = "counted"
LINE_STATUS_RECOUNT = "recount"
LINE_STATUS_APPROVED = "approved"
LINE_STATUS_SKIPPED = "skipped"

# WMS task status
TASK_STATUS_OPEN = "open"
TASK_STATUS_ASSIGNED = "assigned"
TASK_STATUS_IN_PROGRESS = "in_progress"
TASK_STATUS_DONE = "done"
TASK_STATUS_CANCELLED = "cancelled"

TASK_ACTIVE_STATUSES = (TASK_STATUS_OPEN, TASK_STATUS_ASSIGNED, TASK_STATUS_IN_PROGRESS)

# WMS session status
SESSION_STATUS_ACTIVE = "active"
SESSION_STATUS_PAUSED = "paused"
SESSION_STATUS_CLOSED = "closed"

# Count entry source
ENTRY_SOURCE_SCANNER = "scanner"
ENTRY_SOURCE_MANUAL = "manual"
ENTRY_SOURCE_IMPORT = "import"
ENTRY_SOURCE_RECOUNT = "recount"

# Snapshot kinds
SNAPSHOT_KIND_STOCK = "stock"
SNAPSHOT_KIND_RESERVATION = "reservation"
SNAPSHOT_KIND_LOT = "lot"
SNAPSHOT_KIND_SERIAL = "serial"
SNAPSHOT_KIND_LOCATION = "location"

# Adjustment status
ADJ_STATUS_DRAFT = "draft"
ADJ_STATUS_PENDING = "pending"
ADJ_STATUS_POSTED = "posted"
ADJ_STATUS_CANCELLED = "cancelled"

# Audit actions
AUDIT_DOC_CREATED = "document.created"
AUDIT_DOC_STATUS = "document.status_changed"
AUDIT_SNAPSHOT = "snapshot.created"
AUDIT_TASK_GENERATED = "tasks.generated"
AUDIT_SCAN = "count.scan"
AUDIT_QTY_CHANGED = "count.quantity_changed"
AUDIT_LINE_CONFIRMED = "line.confirmed"
AUDIT_RECOUNT = "line.recount_requested"
AUDIT_APPROVAL = "document.approved"
AUDIT_POSTED = "document.posted"
AUDIT_ADJUSTMENT = "adjustment.generated"
AUDIT_LOCK = "location.locked"
AUDIT_UNLOCK = "location.unlocked"
AUDIT_SUBMIT_APPROVAL = "document.submitted_for_approval"
AUDIT_REJECT = "document.rejected"
AUDIT_EXPORT = "report.exported"
AUDIT_RECOUNT_COMPLETE = "recount.completed"
AUDIT_AUDIT_PACKAGE = "audit_package.generated"

# Approval actions
APPROVAL_ACTION_SUBMIT = "submit"
APPROVAL_ACTION_APPROVE = "approve"
APPROVAL_ACTION_REJECT = "reject"

# Recount status
RECOUNT_STATUS_OPEN = "open"
RECOUNT_STATUS_ASSIGNED = "assigned"
RECOUNT_STATUS_IN_PROGRESS = "in_progress"
RECOUNT_STATUS_DONE = "done"
RECOUNT_STATUS_CANCELLED = "cancelled"

RECOUNT_ACTIVE_STATUSES = (RECOUNT_STATUS_OPEN, RECOUNT_STATUS_ASSIGNED, RECOUNT_STATUS_IN_PROGRESS)

# Report formats
REPORT_FORMAT_PDF = "pdf"
REPORT_FORMAT_XLSX = "xlsx"

# WMS scan discrepancy (reality-first counting)
DISC_EXPECTED = "EXPECTED"
DISC_EXTRA_PRODUCT = "EXTRA_PRODUCT"
DISC_UNPLANNED_PRODUCT = "UNPLANNED_PRODUCT"
DISC_WRONG_LOCATION = "WRONG_LOCATION"
DISC_UNKNOWN_PRODUCT = "UNKNOWN_PRODUCT"

# Difference classification
DIFF_CLASS_NONE = "none"
DIFF_CLASS_AUTO = "auto_approve"
DIFF_CLASS_REVIEW = "supervisor_review"
DIFF_CLASS_VARIANCE = "variance"
# Legacy alias — do NOT assign from expected-vs-counted thresholds (operator conflict only).
DIFF_CLASS_RECOUNT = "mandatory_recount"

# Recount lifecycle (operator conflict workflow)
RECOUNT_STATE_NONE = "none"
RECOUNT_STATE_REQUIRED = "required"
RECOUNT_STATE_RESOLVED = "resolved"

DEFAULT_DIFF_THRESHOLDS = {
    "auto_approve_percent": 1.0,
    "supervisor_review_percent": 5.0,
    "mandatory_recount_percent": 10.0,
}
