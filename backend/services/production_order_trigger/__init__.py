"""Order-driven production trigger (Phase 2) + material validation (Phase 3)."""

from .material_validation_service import (
    apply_material_validation_to_orders_mo,
    retry_order_driven_production_shortages,
)
from .trigger_service import (
    RESULT_AGGREGATED,
    RESULT_ALREADY_FULFILLED,
    RESULT_COMPONENT_SHORTAGE,
    RESULT_CREATED,
    RESULT_IDEMPOTENT,
    RESULT_NO_ACTIVE_MANUFACTURING_COMPOSITION,
    RESULT_REACTIVATED,
    RESULT_UNSUPPORTED_MULTI_ITEM,
    RESULT_WITHDRAWAL_BLOCKED,
    RESULT_WITHDRAWN,
    on_order_panel_status_changed_production,
)

__all__ = [
    "on_order_panel_status_changed_production",
    "apply_material_validation_to_orders_mo",
    "retry_order_driven_production_shortages",
    "RESULT_CREATED",
    "RESULT_AGGREGATED",
    "RESULT_IDEMPOTENT",
    "RESULT_REACTIVATED",
    "RESULT_WITHDRAWN",
    "RESULT_WITHDRAWAL_BLOCKED",
    "RESULT_UNSUPPORTED_MULTI_ITEM",
    "RESULT_NO_ACTIVE_MANUFACTURING_COMPOSITION",
    "RESULT_COMPONENT_SHORTAGE",
    "RESULT_ALREADY_FULFILLED",
]
