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
EFFECT_GENERATE_CORRECTION = "generate_correction"
EFFECT_ADD_TAG = "add_tag"
EFFECT_PRINT = "print"

#: Runtime-executable in v1.
SUPPORTED_EFFECT_TYPES = frozenset({EFFECT_CHANGE_STATUS})

#: Known future adapters — may be stored, rejected at runtime until implemented.
KNOWN_EFFECT_TYPES = frozenset(
    {
        EFFECT_CHANGE_STATUS,
        EFFECT_SEND_EMAIL,
        EFFECT_SEND_SMS,
        EFFECT_OFFICE_REFUND,
        EFFECT_WAREHOUSE_COMMIT,
        EFFECT_GENERATE_CORRECTION,
        EFFECT_ADD_TAG,
        EFFECT_PRINT,
    }
)

EXEC_PENDING = "PENDING"
EXEC_RUNNING = "RUNNING"
EXEC_SUCCEEDED = "SUCCEEDED"
EXEC_FAILED = "FAILED"
EXEC_SKIPPED = "SKIPPED"

SOURCE_USER = "USER"
SOURCE_USER_AUTOMATION = "USER_AUTOMATION"
SOURCE_SYSTEM = "SYSTEM"
SOURCE_STATUS_ACTION = "STATUS_ACTION"

#: Max nested automation depth from a root status-enter event (loop protection).
MAX_AUTOMATION_DEPTH = 8
