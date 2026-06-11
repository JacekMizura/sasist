"""Schemas: WMS order returns (RMZ)."""

from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

from ..utils.ui_status_color import DEFAULT_PANEL_STATUS_HEX, parse_hex_color_strict

ReturnStatusType = Literal["in_progress", "done_success", "done_rejected"]


class ReturnStatusBrief(BaseModel):
    id: int
    name: str
    color: str
    type: ReturnStatusType
    transition_key: Optional[str] = None


class ReturnStatusRead(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int
    name: str
    color: str
    type: ReturnStatusType
    transition_key: Optional[str] = None


class ReturnStatusCreate(BaseModel):
    name: str
    color: str = "blue"
    type: ReturnStatusType
    transition_key: Optional[str] = None


class ReturnStatusUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    type: Optional[ReturnStatusType] = None
    transition_key: Optional[str] = None


# --- Panel/office UI statuses (separate from RMZ ReturnStatus workflow) ---

ReturnUiMainGroup = Literal["NEW", "IN_PROGRESS", "DONE"]


class ReturnUiPanelSubgroupRead(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int
    main_group: ReturnUiMainGroup
    name: str
    sort_order: int = 0

    model_config = ConfigDict(from_attributes=True)


class ReturnUiPanelSubgroupCreate(BaseModel):
    main_group: ReturnUiMainGroup
    name: str


class ReturnUiPanelSubgroupUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None


class ReturnUiPanelSubgroupReorder(BaseModel):
    main_group: ReturnUiMainGroup
    subgroup_id: int
    direction: Literal["up", "down"]


class ReturnUiStatusBrief(BaseModel):
    id: int
    name: str
    color: str
    main_group: ReturnUiMainGroup
    group_name: Optional[str] = None
    subgroup_name: Optional[str] = None
    badge_color: str = DEFAULT_PANEL_STATUS_HEX
    background_color: str = DEFAULT_PANEL_STATUS_HEX
    text_color: str = "#0f172a"
    image_url: Optional[str] = None
    is_active: bool = True


class ReturnUiStatusRead(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int
    main_group: ReturnUiMainGroup
    name: str
    color: str
    sort_order: int = 0
    group_name: Optional[str] = None
    subgroup_name: Optional[str] = None
    sort_group: int = 0
    sort_subgroup: int = 0
    sort_status: int = 0
    badge_color: str = DEFAULT_PANEL_STATUS_HEX
    background_color: str = DEFAULT_PANEL_STATUS_HEX
    text_color: str = "#0f172a"
    image_url: Optional[str] = None
    is_active: bool = True


class ReturnUiStatusWithCount(ReturnUiStatusRead):
    count: int = 0


class ReturnUiPanelGroupBlock(BaseModel):
    """One fixed main bucket + editable sub-statuses and aggregate count."""

    main_group: ReturnUiMainGroup
    group_display_name: Optional[str] = Field(
        None,
        description="Zarezerwowane; zawsze null — nazwy grup głównych są stałe (UI z mapy main_group).",
    )
    total_count: int = 0
    sub_statuses: List[ReturnUiStatusWithCount] = Field(default_factory=list)


class ReturnUiStatusPanelSummary(BaseModel):
    """Panel sidebar: grouped sub-statuses + returns with no sub-status assigned."""

    groups: List[ReturnUiPanelGroupBlock] = Field(default_factory=list)
    unassigned_count: int = 0


class ReturnUiStatusCreate(BaseModel):
    name: str
    main_group: ReturnUiMainGroup = "NEW"
    color: str = DEFAULT_PANEL_STATUS_HEX
    sort_order: int = 0
    group_name: Optional[str] = None
    subgroup_name: Optional[str] = None
    sort_group: int = 0
    sort_subgroup: int = 0
    sort_status: Optional[int] = None
    badge_color: Optional[str] = None
    background_color: Optional[str] = None
    text_color: Optional[str] = None
    image_url: Optional[str] = None
    is_active: bool = True

    @field_validator("color")
    @classmethod
    def _validate_color_hex(cls, v: str) -> str:
        return parse_hex_color_strict(v)

    @field_validator("badge_color", "background_color", "text_color")
    @classmethod
    def _validate_token_hex(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not str(v).strip():
            return None
        return parse_hex_color_strict(v)


class ReturnUiStatusUpdate(BaseModel):
    name: Optional[str] = None
    main_group: Optional[ReturnUiMainGroup] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None
    group_name: Optional[str] = None
    subgroup_name: Optional[str] = None
    sort_group: Optional[int] = None
    sort_subgroup: Optional[int] = None
    sort_status: Optional[int] = None
    badge_color: Optional[str] = None
    background_color: Optional[str] = None
    text_color: Optional[str] = None
    image_url: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("color")
    @classmethod
    def _validate_color_hex_optional(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return parse_hex_color_strict(v)

    @field_validator("badge_color", "background_color", "text_color")
    @classmethod
    def _validate_token_hex_opt(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not str(v).strip():
            return None
        return parse_hex_color_strict(v)


class WmsReturnUiStatusPatch(BaseModel):
    """Assign `return_ui_statuses` row (sub-status). Stored as `wms_order_returns.ui_status_id`."""

    sub_status_id: Optional[int] = Field(
        default=None,
        validation_alias=AliasChoices("sub_status_id", "ui_status_id"),
    )


class WmsReturnLineIn(BaseModel):
    order_item_id: int
    product_id: int
    quantity: int = Field(ge=1)


class WmsReturnCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    tenant_id: int
    warehouse_id: Optional[int] = None
    order_id: int
    return_type: Optional[Literal["RMA", "UNCLAIMED"]] = "RMA"
    lines: List[WmsReturnLineIn]


class WmsReturnLineDamageEntryRead(BaseModel):
    """One independent damaged chunk on an RMZ line (qty + evidence + reason codes)."""

    model_config = ConfigDict(extra="ignore")

    id: str
    qty: int = Field(ge=1)
    condition: Literal["B", "C"]
    damage_type: Optional[str] = None
    photo_urls: List[str] = Field(default_factory=list)
    note: Optional[str] = None
    operator_name: Optional[str] = Field(default=None, max_length=120)
    created_at: Optional[datetime] = None
    final_disposition: Optional[
        Literal["RESTOCK", "OUTLET", "REPAIR", "DISPOSE", "RETURN_TO_CUSTOMER"]
    ] = None
    disposition: Optional[str] = Field(default=None, max_length=48)
    stock_document_id: Optional[int] = Field(default=None, ge=1)
    stock_document_line_id: Optional[int] = Field(default=None, ge=1)
    location_id: Optional[int] = Field(default=None, ge=1)
    putaway_status: Optional[str] = Field(default=None, max_length=32)
    putaway_completed_at: Optional[datetime] = None


class WmsReturnLineDamageEntryIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1, max_length=80)
    qty: int = Field(ge=1)
    condition: Literal["B", "C"]
    damage_type: Optional[str] = None
    photo_urls: List[str] = Field(default_factory=list)
    note: Optional[str] = Field(default=None, max_length=500)
    operator_name: Optional[str] = Field(default=None, max_length=120)
    created_at: Optional[datetime] = None
    final_disposition: Optional[
        Literal["RESTOCK", "OUTLET", "REPAIR", "DISPOSE", "RETURN_TO_CUSTOMER"]
    ] = None
    disposition: Optional[str] = Field(default=None, max_length=48)
    stock_document_id: Optional[int] = Field(default=None, ge=1)
    stock_document_line_id: Optional[int] = Field(default=None, ge=1)
    location_id: Optional[int] = Field(default=None, ge=1)
    putaway_status: Optional[str] = Field(default=None, max_length=32)
    putaway_completed_at: Optional[datetime] = None


class WmsReturnLineRead(BaseModel):
    id: Optional[int] = None
    order_item_id: int
    product_id: int
    quantity: int
    accepted_qty: Optional[int] = None
    damaged_qty: Optional[int] = None
    damaged_b_qty: Optional[int] = None
    damaged_c_qty: Optional[int] = None
    rejected_qty: Optional[int] = None
    decision: Optional[Literal["OK", "DAMAGED", "REJECTED"]] = None
    condition: Optional[Literal["A", "B", "C"]] = None
    final_disposition: Optional[
        Literal["RESTOCK", "OUTLET", "REPAIR", "DISPOSE", "RETURN_TO_CUSTOMER"]
    ] = None
    processed_at: Optional[datetime] = None
    """Comma-separated RMZ damage type codes (e.g. b_scratches,c_damaged)."""
    damage_type: Optional[str] = None
    """URLs zapisane przy uszkodzeniu (split-process / process); puste gdy brak."""
    photo_urls: Optional[List[str]] = None
    """Niezależne wpisy uszkodzeń (źródło prawdy dla szczegółów); puste = tylko legacy B/C."""
    damage_entries: List[WmsReturnLineDamageEntryRead] = Field(default_factory=list)


class WmsReturnLineListPreview(BaseModel):
    """First N lines for office returns list (product snapshot; lightweight)."""

    quantity: int
    name: Optional[str] = None
    ean: Optional[str] = None
    sku: Optional[str] = None
    image_url: Optional[str] = None


class WmsReturnListItem(BaseModel):
    id: int
    rmz_number: str
    status: ReturnStatusBrief
    order_id: int
    order_number: Optional[str] = None
    sales_document_number: Optional[str] = None
    return_type: Optional[Literal["RMA", "UNCLAIMED"]] = "RMA"
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    source: Optional[str] = None
    shipping_cost: Optional[float] = None
    created_at: Optional[datetime] = None
    lines: List[WmsReturnLineRead] = Field(default_factory=list)
    lines_preview: List[WmsReturnLineListPreview] = Field(default_factory=list)
    # optional refund details for UI (can be omitted from list-heavy views)
    refund: Optional["WmsRefundRead"] = None
    ui_status: Optional[ReturnUiStatusBrief] = None
    total_refund_amount: float = Field(
        default=0.0,
        description="Panel list: refund + shipping when set, else estimate from RMZ lines × order item prices.",
    )
    stock_document_ids: List[int] = Field(default_factory=list)
    warehouse_document_id: Optional[int] = None
    warehouse_document_type: Optional[str] = None
    warehouse_document_number: Optional[str] = None


class WmsReturnQueueCountsRead(BaseModel):
    """Badge counts for operational queue tabs (returns list work queues)."""

    counts: dict[str, int] = Field(default_factory=dict)


class WmsReturnRead(BaseModel):
    id: int
    rmz_number: str
    status: ReturnStatusBrief
    order_id: int
    tenant_id: int
    warehouse_id: int
    return_type: Literal["RMA", "UNCLAIMED"] = "RMA"
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    source: Optional[str] = None
    shipping_cost: Optional[float] = None
    sales_document_number: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    lines: List[WmsReturnLineRead]
    created_at: Optional[datetime] = None
    external_id: Optional[str] = None
    refund: Optional[WmsRefundRead] = None
    ui_status: Optional[ReturnUiStatusBrief] = None
    workflow_finished: bool = Field(
        default=False,
        description="True gdy status workflow to done_success / done_rejected — brak zapisów linii (split/process).",
    )
    workflow_editable: bool = Field(
        default=True,
        description="Przeciwieństwo workflow_finished; źródło prawdy dla UI WMS.",
    )
    stock_document_ids: List[int] = Field(
        default_factory=list,
        description="Powiązane dokumenty Z-PZ / PZ_RT utworzone po finalizacji RMZ.",
    )
    warehouse_document_id: Optional[int] = Field(
        default=None,
        description="Główny dokument magazynowy Z-PZ powiązany z tym RMZ.",
    )
    warehouse_document_type: Optional[str] = Field(
        default=None,
        description="Typ dokumentu magazynowego (np. Z_PZ).",
    )
    warehouse_document_number: Optional[str] = Field(
        default=None,
        description="Numer dokumentu Z-PZ (np. Z-PZ-2026-000001).",
    )


class OrderLookupHit(BaseModel):
    id: int
    number: Optional[str] = None
    status: Optional[str] = None
    barcode: Optional[str] = None
    external_id: Optional[str] = None
    sales_document_number: Optional[str] = None
    """Gdy trafienie nastąpiło przez ID dokumentu RMZ — do podświetlenia na liście zwrotów."""
    matched_return_id: Optional[int] = None


class ActiveZPzRead(BaseModel):
    """Aktywny (OPEN) zbiorczy dokument Z-PZ — jeden nośnik zwrotów."""

    stock_document_id: int
    document_number: str
    document_type: str = "Z_PZ"
    status: str = "OPEN"
    line_count: int = 0
    unit_sum: float = 0.0
    created_at: Optional[datetime] = None
    warehouse_id: Optional[int] = None
    barcode_value: str
    detail_path: str


class ActiveZPzCloseRead(BaseModel):
    stock_document_id: int
    document_number: str
    status: str = "CLOSED"
    line_count: int = 0
    unit_sum: float = 0.0


ReturnsMode = Literal["simple", "two_step", "advanced"]


class WmsSettingsRead(BaseModel):
    tenant_id: int
    warehouse_id: int
    returns_mode: ReturnsMode = "simple"
    require_photos: bool = False
    require_condition: bool = False
    enable_refund: bool = False


class WmsSettingsUpsert(BaseModel):
    """tenant_id / warehouse_id opcjonalne — backend używa domyślnego tenanta (np. id=1) i magazynu tenanta."""

    tenant_id: Optional[int] = None
    warehouse_id: Optional[int] = None
    returns_mode: ReturnsMode


class WmsSettingsSave(BaseModel):
    """Full persists: mode + flags (admin panel); independent of preset derivation."""

    tenant_id: int
    warehouse_id: Optional[int] = None
    returns_mode: ReturnsMode = "simple"
    require_photos: bool = False
    require_condition: bool = False
    enable_refund: bool = False


class WmsReturnLineProcess(BaseModel):
    model_config = ConfigDict(extra="ignore")

    decision: Literal["OK", "DAMAGED", "REJECTED"]
    condition: Optional[Literal["A", "B", "C"]] = None
    photo_urls: Optional[List[str]] = None
    damage_type: Optional[str] = None
    """Opcjonalna notatka operacyjna (np. panel); dla REJECTED łączona z `damage_type` w zapisie."""
    note: Optional[str] = Field(default=None, max_length=500)


class WmsReturnLineSplitProcess(BaseModel):
    product_id: int
    accepted_qty: int = Field(ge=0)
    damaged_qty: int = Field(ge=0)
    damaged_b_qty: int = Field(ge=0)
    damaged_c_qty: int = Field(ge=0)
    rejected_qty: int = Field(ge=0)
    condition: Optional[Literal["A", "B", "C"]] = None
    photo_urls: Optional[List[str]] = None
    damage_type: Optional[str] = None
    """Gdy niepusta — nadpisuje zagregowane damaged_*; każdy wpis ma własną ilość i dowody."""
    damage_entries: List[WmsReturnLineDamageEntryIn] = Field(default_factory=list)


class WmsReturnFinalizeLineIn(WmsReturnLineSplitProcess):
    order_item_id: int = Field(ge=1)


class WmsReturnFinalizeBody(BaseModel):
    """POST /wms/returns/id/{id}/finalize — atomowy zapis linii + Z-PZ + status + refund."""

    lines: List[WmsReturnFinalizeLineIn] = Field(..., min_length=1)
    process_refund: bool = False
    refund: Optional[WmsRefundCreate] = None


class WmsReturnWorkflowStatusPatch(BaseModel):
    """Manual workflow step: set `ReturnStatus` for this RMZ (tenant + warehouse must match)."""

    status_id: int = Field(ge=1)


class WmsRefundCreate(BaseModel):
    refund_type: Literal["FULL", "PARTIAL", "NONE"] = "NONE"
    refund_amount: Optional[float] = None
    refund_shipping: bool = False
    refund_shipping_amount: Optional[float] = None
    decided_by: Optional[str] = None


class WmsRefundRead(BaseModel):
    id: int
    rmz_id: int
    refund_type: Literal["FULL", "PARTIAL", "NONE"]
    refund_amount: Optional[float] = None
    refund_shipping: bool = False
    refund_shipping_amount: Optional[float] = None
    decided_by: Optional[str] = None
    decided_at: Optional[datetime] = None


# Optional single refund snapshot included in reads.
WmsReturnRefundRead = Optional[WmsRefundRead]

CustomerRiskTier = Literal["normal", "elevated", "high"]


class CustomerInsightsRead(BaseModel):
    """Aggregate orders / RMZ counts for a customer email within tenant + warehouse."""

    matched_email: str
    total_orders_count: int
    total_returns_count: int
    return_rate: float
    risk_label: str
    risk_tier: CustomerRiskTier


class WmsReturnsBulkArchiveBody(BaseModel):
    """POST /wms/returns/bulk-archive — archiwizacja wielu RMZ (tenant + magazyn)."""

    tenant_id: int = Field(..., ge=1)
    warehouse_id: int = Field(..., ge=1)
    ids: List[int] = Field(..., min_length=1)
