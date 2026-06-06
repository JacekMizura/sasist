"""WMS business configuration for direct sales (per tenant / warehouse)."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

DocumentTypeDefault = Literal["PA", "FV"]
AllocationStrategy = Literal["auto", "store_first", "pick_face", "manual"]
PriceDisplayMode = Literal["gross", "net", "both"]


class DirectSalesPaymentMethods(BaseModel):
    cash: bool = True
    card: bool = True
    blik: bool = True
    transfer: bool = False
    mixed: bool = False


class DirectSalesSettingsConfig(BaseModel):
    enabled: bool = False
    #: Panel status assigned after sale complete (``order_ui_statuses.id``).
    default_order_status_id: Optional[int] = Field(None, ge=1)
    #: Optional workflow hooks for future operational automation.
    session_created_order_status_id: Optional[int] = Field(None, ge=1)
    paid_order_status_id: Optional[int] = Field(None, ge=1)
    issued_order_status_id: Optional[int] = Field(None, ge=1)
    cancelled_order_status_id: Optional[int] = Field(None, ge=1)
    default_document_type: DocumentTypeDefault = "PA"
    auto_start_new_session: bool = True
    payment_methods: DirectSalesPaymentMethods = Field(default_factory=DirectSalesPaymentMethods)
    require_cash_received: bool = True
    show_change_amount: bool = True
    allow_incomplete_payment: bool = False
    allow_oversell: bool = False
    allocation_strategy: AllocationStrategy = "store_first"
    hide_empty_locations: bool = True
    price_display: PriceDisplayMode = "gross"
    show_margin: bool = False
    show_stock: bool = True
    show_product_images: bool = True
    allow_anonymous: bool = True
    require_customer_for_invoice: bool = True
    auto_save_customers: bool = True
    quick_create_customer: bool = True
    keyboard_shortcuts: bool = True
    scanner_mode: bool = True
    auto_focus_scan: bool = True
    terminal_sounds: bool = True
    zebra_tablet_mode: bool = False
    extensions: dict[str, Any] = Field(default_factory=dict)


class DirectSalesSettingsRead(BaseModel):
    tenant_id: int
    warehouse_id: int
    resolved: DirectSalesSettingsConfig
    tenant_defaults: DirectSalesSettingsConfig
    warehouse_overrides: DirectSalesSettingsConfig | None = None
    has_warehouse_override: bool = False


class DirectSalesSettingsSave(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: int = Field(..., ge=0, description="0 = tenant defaults, >0 = warehouse override")
    settings: DirectSalesSettingsConfig
