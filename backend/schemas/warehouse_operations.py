"""Warehouse operations control center schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


WarehouseOperationsMainMode = Literal["KOMPLETACJA", "PAKOWANIE", "OPERACJE MAGAZYNOWE", "BRAKI"]
WarehouseOperationsStatusColor = Literal["green", "gray", "red"]
WarehouseOperationsAlertLevel = Literal["info", "warning", "critical"]


class WarehouseOperationsConfigOut(BaseModel):
    short_break_minutes: int = 5
    long_break_minutes: int = 10


class WarehouseOperationsSummaryOut(BaseModel):
    active_operators: int = 0
    picking: int = 0
    packing: int = 0
    warehouse_operations: int = 0
    shortages: int = 0
    idle_operators: int = 0
    orders_completed_today: int = 0
    warehouse_efficiency_percent: int = 0
    average_picking_minutes: int | None = None
    average_packing_minutes: int | None = None
    products_waiting_putaway: int = 0
    inbound_deliveries_waiting: int = 0
    delayed_operations: int = 0
    blocked_orders: int = 0
    sla_risk_percent: int = 0
    generated_at: str


class WarehouseOperatorIdleStatsOut(BaseModel):
    total_idle_minutes: int = 0
    total_idle_label: str = "0m"
    short_idle_periods: int = 0
    long_idle_periods: int = 0


class WarehouseOperatorTimelineEventOut(BaseModel):
    at: str
    time_label: str
    title: str
    main_mode: WarehouseOperationsMainMode
    submode: str
    location: str | None = None
    metadata: dict = Field(default_factory=dict)


class WarehouseOperatorOrderProgressOut(BaseModel):
    order_id: int | None = None
    order_number: str
    picked_products: int = 0
    total_products: int = 0
    products_completed: float = 0
    products_total: float = 0
    progress_percent: int = 0
    status: Literal["completed", "active", "blocked", "inactive"] = "active"
    status_label: str = "W toku"
    progress_tone: Literal["blue", "green", "amber", "red"] = "blue"
    last_activity_at: str | None = None
    last_activity_label: str | None = None
    navigation_path: str | None = None
    navigation_state: dict = Field(default_factory=dict)


class WarehouseOperatorCardOut(BaseModel):
    user_id: int
    user_name: str
    initials: str
    main_mode: WarehouseOperationsMainMode
    submode: str
    last_activity_at: str
    last_activity_label: str
    minutes_since_activity: int
    status_color: WarehouseOperationsStatusColor
    activity_status_label: str
    device_name: str | None = None
    cart_code: str | None = None
    assigned_order: str | None = None
    assigned_orders: list[str] = Field(default_factory=list)
    document: str | None = None
    carrier: str | None = None
    current_location: str | None = None
    progress_percent: int | None = None
    progress_tone: Literal["blue", "green", "amber", "red"] = "blue"
    products_completed: float = 0
    products_total: float = 0
    orders_completed: int = 0
    orders_total: int = 0
    active_reference_type: Literal["order", "document", "task"] | None = None
    active_reference_id: str | None = None
    active_reference_label: str | None = None
    orders_picked: int = 0
    products_picked: int = 0
    first_activity_at: str | None = None
    idle: WarehouseOperatorIdleStatsOut
    packing_progress_percent: int | None = None
    last_packed_order: str | None = None
    packed_orders_per_hour: float | None = None
    operation_count: int = 0
    timeline: list[WarehouseOperatorTimelineEventOut] = Field(default_factory=list)
    order_progress: list[WarehouseOperatorOrderProgressOut] = Field(default_factory=list)


class WarehouseOperationsQueueOut(BaseModel):
    key: str
    label: str
    value: int | float
    detail: str | None = None
    tone: Literal["neutral", "blue", "amber", "red", "green"] = "neutral"


WarehouseOperationsAlertCategory = Literal[
    "Braki",
    "Kompletacja",
    "Pakowanie",
    "Rozlokowanie",
    "Dostawy",
    "Przewoźnicy",
    "Operatorzy",
    "System",
]
WarehouseOperationsAlertPriorityGroup = Literal["critical_now", "requires_action", "informational"]


class WarehouseOperationsAlertImpactOut(BaseModel):
    label: str
    value: str
    detail: str | None = None
    tone: Literal["neutral", "blue", "amber", "red", "green"] = "neutral"


class WarehouseOperationsAlertActionOut(BaseModel):
    label: str
    action_type: Literal["navigate", "switch_tab", "create_task", "assign_operator", "review"] = "navigate"
    target_path: str | None = None
    target_tab: str | None = None
    tone: Literal["primary", "secondary", "warning", "danger"] = "secondary"
    payload: dict = Field(default_factory=dict)


class WarehouseOperationsAlertEntityOut(BaseModel):
    kind: Literal["order", "product", "sku", "zone", "operator", "document", "carrier", "task"]
    label: str
    id: str | None = None


class WarehouseOperationsAlertOut(BaseModel):
    id: str
    level: WarehouseOperationsAlertLevel
    message: str
    created_at: str
    minutes_ago: int = 0
    area: str | None = None
    affected_users: list[int] = Field(default_factory=list)
    affected_orders: list[int] = Field(default_factory=list)
    resolution_status: str = "open"
    title: str | None = None
    description: str | None = None
    category: WarehouseOperationsAlertCategory = "System"
    priority_group: WarehouseOperationsAlertPriorityGroup = "informational"
    severity_label: str | None = None
    responsible_area: str | None = None
    responsible_operator: str | None = None
    recommended_action: str | None = None
    impact: list[WarehouseOperationsAlertImpactOut] = Field(default_factory=list)
    context: list[WarehouseOperationsAlertImpactOut] = Field(default_factory=list)
    actions: list[WarehouseOperationsAlertActionOut] = Field(default_factory=list)
    related_entities: list[WarehouseOperationsAlertEntityOut] = Field(default_factory=list)
    prediction_label: str | None = None
    manager_focus: bool = False


class WarehouseReplenishmentAlertOut(BaseModel):
    id: str
    product_id: int
    product_name: str
    sku: str | None = None
    ean: str | None = None
    image_url: str | None = None
    source_location: str | None = None
    target_location: str | None = None
    missing_quantity: float = 0
    """Original replenishment need (min_pick − pick stock), before source/capacity caps."""
    move_quantity: float = 0
    """Executable qty to move now (≤ need, source, trusted destination capacity)."""
    unresolved_shortage_qty: float = 0
    """Need that cannot be covered by available source stock (after caps)."""
    current_picking_stock: float = 0
    reserve_stock: float = 0
    """Available source stock (BUFFER / moveable) — not order reservations."""
    source_available_qty: float = 0
    """Alias of reserve_stock for clear semantics (available_to_move across sources)."""
    blocked_orders: int = 0
    classification: Literal["ACTIONABLE", "NO_SOURCE_STOCK", "IN_PROGRESS"] = "ACTIONABLE"
    priority: Literal["red", "orange", "blue"] = "orange"
    priority_label: str = "Niski stan"
    minutes_since_detected: int = 0
    zone: str | None = None
    assigned_operator: str | None = None
    category: str | None = None
    action_label: str = "Utwórz przesunięcie"
    instruction_label: str | None = None
    """Operator-facing one-liner, e.g. „Przenieś 8 szt. B1 → A9”."""


class WarehouseInboundDeliveryOut(BaseModel):
    id: str
    supplier: str
    eta: str | None = None
    status_label: str
    status_color: Literal["green", "orange", "red"] = "green"
    sku_count: int = 0
    total_quantity: float = 0
    carriers_count: int = 0
    receiving_progress_percent: int = 0
    assigned_operator: str | None = None
    waiting_minutes: int = 0


class WarehouseInboundSummaryOut(BaseModel):
    active_deliveries: int = 0
    delayed_deliveries: int = 0
    products_waiting_receiving: int = 0
    products_waiting_putaway: int = 0
    oldest_waiting_minutes: int = 0


class WarehousePutawayZoneLoadOut(BaseModel):
    zone: str
    waiting_products: int = 0
    waiting_quantity: float = 0
    heat_percent: int = 0
    tone: Literal["green", "orange", "red"] = "green"


class WarehousePutawayLoadOut(BaseModel):
    products_waiting: int = 0
    pallets_waiting: int = 0
    oldest_unprocessed_carrier_minutes: int = 0
    active_putaway_operators: int = 0
    average_putaway_minutes: int | None = None
    queue_growth_trend: int = 0
    zones: list[WarehousePutawayZoneLoadOut] = Field(default_factory=list)


class WarehouseCarrierIssueOut(BaseModel):
    id: str
    order_id: int | None = None
    carrier: str | None = None
    error_message: str
    time: str
    retry_count: int = 0
    current_status: str = "open"
    severity: Literal["warning", "critical", "blocked"] = "warning"


class WarehouseEmployeeRankingOut(BaseModel):
    user_id: int
    user_name: str
    mode: WarehouseOperationsMainMode
    products_per_hour: float = 0
    orders_per_hour: float = 0
    average_operation_minutes: float | None = None
    inactivity_minutes: int = 0
    errors_count: int = 0
    shortages_created: int = 0
    successful_completions: int = 0
    packing_quality_percent: int | None = None
    return_ratio_percent: int | None = None
    scan_efficiency_percent: int = 0
    efficiency_score: int = 0


class WarehouseBottleneckOut(BaseModel):
    id: str
    area: str
    message: str
    level: WarehouseOperationsAlertLevel = "info"
    average_waiting_minutes: int = 0
    queue_growth: int = 0
    oldest_waiting_minutes: int = 0
    processing_speed: float = 0
    sla_risk_percent: int = 0
    pressure_percent: int = 0
    trend_label: str | None = None


class WarehouseReplenishmentRelocationCreateIn(BaseModel):
    product_id: int
    quantity_required: float = 0
    source_location: str | None = None
    target_location: str | None = None
    priority: Literal["red", "orange", "blue"] = "orange"


class WarehouseReplenishmentRelocationCreateOut(BaseModel):
    task_id: int
    status: str
    created: bool = False


PriorityTaskType = Literal[
    "replenishment",
    "priority_picking",
    "priority_packing",
    "putaway",
    "stock_movement",
    "shortage_resolution",
    "inventory_verification",
    "quality_check",
]
PriorityTaskStatus = Literal["NOWE", "PRZYJĘTE", "W_TRAKCIE", "WYKONANE", "ODRZUCONE", "ESKALOWANE"]


class WarehousePriorityTaskCreateIn(BaseModel):
    alert_id: str
    task_type: PriorityTaskType
    title: str
    description: str | None = None
    assigned_operator_id: int | None = None
    assigned_operator_name: str | None = None
    priority: Literal["critical", "high", "normal"] = "high"
    deadline_at: str | None = None
    comment: str | None = None
    target_path: str | None = None
    payload: dict = Field(default_factory=dict)


class WarehousePriorityTaskActionIn(BaseModel):
    action: Literal["accept", "start", "complete", "reject", "escalate"]
    rejection_reason: str | None = None
    comment: str | None = None


class WarehousePriorityTaskOut(BaseModel):
    id: int
    alert_id: str | None = None
    task_type: PriorityTaskType | str
    title: str
    description: str | None = None
    status: PriorityTaskStatus
    priority: Literal["critical", "high", "normal"] = "high"
    assigned_operator_id: int | None = None
    assigned_operator_name: str | None = None
    assigned_by_user_id: int | None = None
    assigned_by_name: str | None = None
    assigned_at: str | None = None
    accepted_at: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    rejected_at: str | None = None
    rejection_reason: str | None = None
    escalated_at: str | None = None
    deadline_at: str | None = None
    escalation_state: str | None = None
    sla_countdown_minutes: int | None = None
    target_path: str | None = None
    recommended_action: str | None = None
    comment: str | None = None
    history: list[dict] = Field(default_factory=list)
    payload: dict = Field(default_factory=dict)


class WarehouseOperationsSnapshotOut(BaseModel):
    config: WarehouseOperationsConfigOut
    summary: WarehouseOperationsSummaryOut
    operators: list[WarehouseOperatorCardOut]
    picking_operators: list[WarehouseOperatorCardOut]
    packing_operators: list[WarehouseOperatorCardOut]
    warehouse_operation_operators: list[WarehouseOperatorCardOut]
    shortage_operators: list[WarehouseOperatorCardOut]
    queues: list[WarehouseOperationsQueueOut]
    alerts: list[WarehouseOperationsAlertOut]
    activity_stream: list[WarehouseOperatorTimelineEventOut]
    replenishments: list[WarehouseReplenishmentAlertOut] = Field(default_factory=list)
    inbound_summary: WarehouseInboundSummaryOut = Field(default_factory=WarehouseInboundSummaryOut)
    inbound_deliveries: list[WarehouseInboundDeliveryOut] = Field(default_factory=list)
    putaway_load: WarehousePutawayLoadOut = Field(default_factory=WarehousePutawayLoadOut)
    carrier_issues: list[WarehouseCarrierIssueOut] = Field(default_factory=list)
    employee_rankings: list[WarehouseEmployeeRankingOut] = Field(default_factory=list)
    bottlenecks: list[WarehouseBottleneckOut] = Field(default_factory=list)
