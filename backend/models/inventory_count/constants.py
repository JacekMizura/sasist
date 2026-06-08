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
