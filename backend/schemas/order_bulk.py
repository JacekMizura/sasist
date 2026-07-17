"""Bulk order actions: shared list-filter snapshot for replay on the server."""

from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


class OrderBulkListFilters(BaseModel):
    """Mirrors GET /orders/ list filters (tenant/warehouse passed separately on endpoints)."""

    search: Optional[str] = None
    order_type: Optional[str] = None
    order_id: Optional[str] = None
    volume_min: Optional[float] = None
    volume_max: Optional[float] = None
    status: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    filter_shipping_method_id: Optional[str] = None
    source_contains: Optional[str] = None
    order_value_min: Optional[float] = Field(None, ge=0)
    order_value_max: Optional[float] = Field(None, ge=0)
    panel_order_ui_status_ids: Optional[str] = None
    panel_order_ui_unassigned: bool = False
    panel_order_ui_status_id: Optional[int] = None
    panel_order_ui_main_group: Optional[str] = None
    payment_status: Optional[str] = None
    paid_only: bool = False
    unpaid_only: bool = False
    with_document: bool = False
    without_document: bool = False
    include_archived_orders: bool = Field(
        False,
        description="Gdy true — bulk na liście uwzględnia także zamówienia zarchiwizowane (deleted_at)",
    )


class BulkOrdersSelection(BaseModel):
    mode: Literal["explicit_ids", "filtered_query"] = "explicit_ids"
    ids: List[int] = Field(default_factory=list)
    filters: Optional[OrderBulkListFilters] = None

    @model_validator(mode="after")
    def _validate_mode(self) -> "BulkOrdersSelection":
        if self.mode == "explicit_ids":
            if not self.ids:
                raise ValueError("ids required for explicit_ids mode")
        else:
            if self.filters is None:
                raise ValueError("filters required for filtered_query mode")
        return self


class BulkOrderPanelStatusPayload(BaseModel):
    """POST /orders/bulk-status — string ids for backward compatibility or filtered_query."""

    status: str = Field("", description="Sub-status id, or empty to clear")
    selection_mode: Literal["explicit_ids", "filtered_query"] = "explicit_ids"
    ids: List[str] = Field(default_factory=list)
    filters: Optional[OrderBulkListFilters] = None

    @model_validator(mode="after")
    def _validate_selection(self) -> "BulkOrderPanelStatusPayload":
        if self.selection_mode == "explicit_ids":
            if not self.ids:
                raise ValueError("ids required for explicit_ids mode")
        elif self.filters is None:
            raise ValueError("filters required for filtered_query mode")
        return self


class BulkOrdersDeleteBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: Optional[int] = Field(
        None,
        ge=1,
        description="Opcjonalny filtr magazynu; usuwanie zamówień to operacja OMS (nie wymaga WH).",
    )
    selection: BulkOrdersSelection


class BulkOrdersDeleteResult(BaseModel):
    """Odpowiedź POST /orders/bulk-delete — bez surowego 500 przy częściowym sukcesie."""

    deleted: int = Field(0, description="Liczba usuniętych (alias kompatybilności wstecznej)")
    deleted_count: int = 0
    success_count: int = Field(0, description="Równoważne deleted_count (twarde usunięcie)")
    soft_deleted_count: int = Field(0, description="Dla zamówień zwykle 0 — pole wspólne z innymi encjami")
    blocked_count: int = 0
    blocked: List[dict[str, Any]] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    skipped_not_found: int = 0
    messages: List[str] = Field(default_factory=list)


class BulkOrdersPatchBody(BaseModel):
    """Subset of OrderPatchBody fields applied to each matching order (bulk)."""

    tenant_id: int = Field(..., ge=1)
    warehouse_id: Optional[int] = Field(
        None,
        ge=1,
        description="Wymagany dla filtered_query; opcjonalny dla explicit_ids (operacje workflow bez bramki magazynu).",
    )
    selection: BulkOrdersSelection
    document_type: Optional[str] = None
    shipping_method_id: Optional[str] = None
    internal_note_append: Optional[str] = None
    customer_note_append: Optional[str] = None
    operational_note_append: Optional[str] = None
    priority_color: Optional[str] = None
    payment_method: Optional[str] = None
    payment_status: Optional[str] = None

    @model_validator(mode="after")
    def _at_least_one_patch(self) -> "BulkOrdersPatchBody":
        fs = getattr(self, "model_fields_set", set()) or set()
        if not fs.intersection(
            {
                "document_type",
                "shipping_method_id",
                "internal_note_append",
                "customer_note_append",
                "operational_note_append",
                "priority_color",
                "payment_method",
                "payment_status",
            }
        ):
            raise ValueError(
                "Provide at least one patch field (document_type, shipping_method_id, notes, priority_color, payment_*)"
            )
        if self.selection.mode == "filtered_query" and self.warehouse_id is None:
            # Workflow OMS (priority, notes, …) may run filtered_query without warehouse scope.
            pass
        return self


class ProductBulkListFilters(BaseModel):
    """Mirrors GET /products/ when using server-side filters only (tenant_id comes from the endpoint)."""

    manufacturer_id: Optional[int] = Field(None, ge=1)
    name: Optional[str] = None
    ean: Optional[str] = None
    symbol: Optional[str] = None
    search: Optional[str] = None
    volume_min: Optional[float] = None
    volume_max: Optional[float] = None
    weight_min: Optional[float] = None
    weight_max: Optional[float] = None
    default_supplier_id: Optional[int] = Field(None, ge=1)


class BulkProductsSelection(BaseModel):
    mode: Literal["explicit_ids", "filtered_query"] = "explicit_ids"
    ids: List[int] = Field(default_factory=list)
    filters: Optional[ProductBulkListFilters] = None

    @model_validator(mode="after")
    def _validate_mode(self) -> "BulkProductsSelection":
        if self.mode == "explicit_ids":
            if not self.ids:
                raise ValueError("ids required for explicit_ids mode")
        else:
            if self.filters is None:
                raise ValueError("filters required for filtered_query mode")
        return self


class BulkProductsDeleteBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    selection: BulkProductsSelection


class ProductBulkUpdateExtendedBody(BaseModel):
    """POST /products/bulk-update — either explicit ids or filtered_query (server replay)."""

    action: str = Field(..., min_length=1)
    value: Optional[object] = None
    selection_mode: Literal["explicit_ids", "filtered_query"] = "explicit_ids"
    product_ids: List[int] = Field(default_factory=list)
    filters: Optional[ProductBulkListFilters] = None

    @field_validator("product_ids")
    @classmethod
    def _ids_positive(cls, v: List[int]) -> List[int]:
        for i in v:
            if not isinstance(i, int) or i < 1:
                raise ValueError("Each product_id must be a positive integer")
        return v

    @model_validator(mode="after")
    def _validate_selection(self) -> "ProductBulkUpdateExtendedBody":
        if self.selection_mode == "explicit_ids":
            if not self.product_ids:
                raise ValueError("product_ids required for explicit_ids mode")
            if len(self.product_ids) > 3000:
                raise ValueError("At most 3000 product_ids per request")
        elif self.filters is None:
            raise ValueError("filters required for filtered_query mode")
        return self
