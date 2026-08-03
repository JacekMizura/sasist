"""Supply Flow package — orchestration layer over existing WMS SSOT."""

from .config_service import (
    SupplyFlowConfigError,
    get_or_create_warehouse_config,
    update_warehouse_config,
)
from .constants import (
    DEFAULT_OPTIMIZATION_GOAL,
    DEFAULT_PLANNING_HORIZON_HOURS,
    PURCHASE_OPERATIONAL_PHASE_MATRIX,
    SUPPLY_FLOW_OPTIMIZATION_GOALS,
    SUPPLY_FLOW_PHASES,
    SUPPLY_FLOW_RECOMPUTE_TRIGGERS,
)
from .engine import SupplyFlowEngine, SupplyFlowEngineContext
from .events import (
    EVENT_NEW_DELIVERY,
    EVENT_PUTAWAY_FINISHED,
    EVENT_UNLOAD_FINISHED,
    SUPPLY_FLOW_EVENT_TYPES,
    SupplyFlowEventDispatcher,
    describe_pipeline,
    dispatch_pending_events,
    publish_supply_flow_event,
)
from .lifecycle import (
    SupplyFlowLifecycleError,
    assert_purchase_phase_combination_allowed,
    can_transition,
    is_purchase_phase_combination_allowed,
    set_operational_phase,
)
from .orchestration import advance_toward_phase
from .recompute import RecomputeRequest, request_recompute

__all__ = [
    "DEFAULT_OPTIMIZATION_GOAL",
    "DEFAULT_PLANNING_HORIZON_HOURS",
    "EVENT_NEW_DELIVERY",
    "EVENT_PUTAWAY_FINISHED",
    "EVENT_UNLOAD_FINISHED",
    "PURCHASE_OPERATIONAL_PHASE_MATRIX",
    "SUPPLY_FLOW_EVENT_TYPES",
    "SUPPLY_FLOW_OPTIMIZATION_GOALS",
    "SUPPLY_FLOW_PHASES",
    "SUPPLY_FLOW_RECOMPUTE_TRIGGERS",
    "SupplyFlowConfigError",
    "SupplyFlowEngine",
    "SupplyFlowEngineContext",
    "SupplyFlowEventDispatcher",
    "SupplyFlowLifecycleError",
    "RecomputeRequest",
    "advance_toward_phase",
    "assert_purchase_phase_combination_allowed",
    "can_transition",
    "describe_pipeline",
    "dispatch_pending_events",
    "get_or_create_warehouse_config",
    "is_purchase_phase_combination_allowed",
    "publish_supply_flow_event",
    "request_recompute",
    "set_operational_phase",
    "update_warehouse_config",
]
