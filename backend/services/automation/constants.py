"""Automation Engine constants and shared types."""

from __future__ import annotations

ENTITY_ORDER = "ORDER"
ENTITY_RETURN = "RETURN"
ENTITY_COMPLAINT = "COMPLAINT"

ENTITY_TYPES = frozenset({ENTITY_ORDER, ENTITY_RETURN, ENTITY_COMPLAINT})

TRIGGER_ENTITY_STATUS_ENTERED = "entity_status_entered"

EFFECT_CHANGE_STATUS = "change_status"
EFFECT_SEND_EMAIL = "send_email"
EFFECT_SEND_SMS = "send_sms"
EFFECT_OFFICE_REFUND = "office_refund"
EFFECT_WAREHOUSE_COMMIT = "warehouse_commit"
EFFECT_GENERATE_SALE_CORRECTION = "generate_sale_correction"
#: Legacy placeholder slug — normalize → generate_sale_correction.
EFFECT_GENERATE_CORRECTION = "generate_correction"
EFFECT_ADD_TAG = "add_tag"
EFFECT_PRINT = "print"

#: Runtime-executable.
SUPPORTED_EFFECT_TYPES = frozenset(
    {
        EFFECT_CHANGE_STATUS,
        EFFECT_SEND_EMAIL,
        EFFECT_WAREHOUSE_COMMIT,
        EFFECT_GENERATE_SALE_CORRECTION,
    }
)
#: Persistable effect types (editor catalog + future adapters). Unsupported at runtime → FAILED.
EFFECT_SEND_MESSAGE = "send_message"
EFFECT_GENERATE_DOCUMENT = "generate_document"
EFFECT_ASSIGN_COURIER = "assign_courier"
EFFECT_WMS_ACTION = "wms_action"

KNOWN_EFFECT_TYPES = frozenset(
    {
        EFFECT_CHANGE_STATUS,
        EFFECT_SEND_EMAIL,
        EFFECT_SEND_SMS,
        EFFECT_SEND_MESSAGE,
        EFFECT_OFFICE_REFUND,
        EFFECT_WAREHOUSE_COMMIT,
        EFFECT_GENERATE_SALE_CORRECTION,
        EFFECT_GENERATE_CORRECTION,
        EFFECT_GENERATE_DOCUMENT,
        EFFECT_ASSIGN_COURIER,
        EFFECT_ADD_TAG,
        EFFECT_PRINT,
        EFFECT_WMS_ACTION,
    }
)

EXEC_PENDING = "PENDING"
EXEC_RUNNING = "RUNNING"
EXEC_SUCCEEDED = "SUCCEEDED"
EXEC_FAILED = "FAILED"
EXEC_SKIPPED = "SKIPPED"
EXEC_BLOCKED = "BLOCKED"

RUN_KIND_AUTO = "AUTO"
RUN_KIND_MANUAL = "MANUAL"
RUN_KIND_TEST = "TEST"

SOURCE_USER = "USER"
SOURCE_USER_AUTOMATION = "USER_AUTOMATION"
SOURCE_SYSTEM = "SYSTEM"
SOURCE_STATUS_ACTION = "STATUS_ACTION"

#: Max nested automation depth from a root status-enter event (loop protection).
MAX_AUTOMATION_DEPTH = 8
