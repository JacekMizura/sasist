"""WMS business configuration for direct sales (per tenant / warehouse)."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

DocumentTypeDefault = Literal["PA", "FV"]
AllocationStrategy = Literal["auto_split", "single_location", "manual"]
PriceDisplayMode = Literal["gross", "net", "both"]


class DirectSalesDiscountSettings(BaseModel):
    allow_line_discounts: bool = True
    allow_order_discounts: bool = True
    max_discount_percent: float = Field(50.0, ge=0, le=100)
    show_discount_buttons: bool = True
    quick_discount_percents: list[float] = Field(
        default_factory=lambda: [5.0, 10.0, 15.0, 20.0],
    )


class DirectSalesPaymentMethods(BaseModel):
    cash: bool = True
    card: bool = True
    blik: bool = True
    transfer: bool = True
    mixed: bool = False


class DirectSalesSettingsConfig(BaseModel):
    enabled: bool = False
    #: Panel status assigned when the sale order is created at complete (``order_ui_statuses.id``).
    default_order_status_id: Optional[int] = Field(None, ge=1)
    default_document_type: DocumentTypeDefault = "PA"
    auto_start_new_session: bool = True
    payment_methods: DirectSalesPaymentMethods = Field(default_factory=DirectSalesPaymentMethods)
    require_cash_received: bool = True
    show_change_amount: bool = True
    allow_incomplete_payment: bool = False
    allocation_strategy: AllocationStrategy = "auto_split"
    hide_empty_locations: bool = True
    price_display: PriceDisplayMode = "gross"
    show_ean: bool = True
    show_sku: bool = True
    show_catalog_number: bool = True
    show_margin: bool = False
    show_stock: bool = True
    show_product_images: bool = True
    prefer_store_locations: bool = True
    allow_anonymous: bool = True
    require_customer_for_invoice: bool = True
    auto_save_customers: bool = True
    quick_create_customer: bool = True
    discounts: DirectSalesDiscountSettings = Field(default_factory=DirectSalesDiscountSettings)
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
    #: Effective business ON/OFF for terminal / new-work gate (legacy fail-open when unstamped).
    enabled_effective: bool = True
    #: True once ``extensions.ds_enabled_v1`` governs this scope — checkbox is binding.
    enabled_enforced: bool = False
    settings_version: str = ""
    updated_at: Optional[str] = None


class DirectSalesSettingsSave(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: int = Field(..., ge=0, description="0 = tenant defaults, >0 = warehouse override")
    settings: DirectSalesSettingsConfig
