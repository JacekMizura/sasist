"""Automation Engine public package."""

from .constants import (
    EFFECT_CHANGE_STATUS,
    ENTITY_COMPLAINT,
    ENTITY_ORDER,
    ENTITY_RETURN,
    MAX_AUTOMATION_DEPTH,
    TRIGGER_ENTITY_STATUS_ENTERED,
)
from .runner import (
    emit_order_status_entered_and_run,
    idempotency_key,
    run_automations_for_status_entered,
)

__all__ = [
    "EFFECT_CHANGE_STATUS",
    "ENTITY_COMPLAINT",
    "ENTITY_ORDER",
    "ENTITY_RETURN",
    "MAX_AUTOMATION_DEPTH",
    "TRIGGER_ENTITY_STATUS_ENTERED",
    "emit_order_status_entered_and_run",
    "idempotency_key",
    "run_automations_for_status_entered",
]
