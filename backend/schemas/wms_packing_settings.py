"""WMS packing settings — persisted per tenant + warehouse."""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class WmsPackingAutoActions(BaseModel):
    create_document: bool = False
    generate_shipment: bool = False
    print_document: bool = False
    print_label: bool = False
    change_order_status: bool = False


class WmsPackingDocumentSettings(BaseModel):
    #: Ignorowane przez potok „Utwórz dokument” — używane są wyłącznie ``invoice_series_id`` / ``receipt_series_id``.
    series_id: Optional[str] = Field(None, max_length=36, description="deprecated — legacy JSON")
    invoice_series_id: Optional[str] = Field(None, description="Seria faktury (SALE + subtype INVOICE) gdy zamówienie INVOICE")
    receipt_series_id: Optional[str] = Field(None, description="Seria paragonu (SALE + subtype RECEIPT) gdy zamówienie PARAGON")


class WmsPackingFallbackLabel(BaseModel):
    template_id: Optional[int] = Field(None, ge=1, description="saved_label_templates.id")
    delay_seconds: int = Field(0, ge=0, le=120)


class WmsPackingInterfaceDisplay(BaseModel):
    """Ekran pakowania — widoczność pól produktu (Settings → WMS → Pakowanie)."""

    show_stock: bool = True
    show_ean: bool = True
    show_symbol: bool = True
    show_catalog_number: bool = True


class WmsPackingSettingsRead(BaseModel):
    tenant_id: int
    warehouse_id: int
    start_status_id: Optional[int] = None
    packed_status_id: Optional[int] = None
    missing_status_id: Optional[int] = None
    packing_after_finish_action: Literal["STAY", "GO_TO_LIST"] = "STAY"
    auto_actions: WmsPackingAutoActions = Field(default_factory=WmsPackingAutoActions)
    document_settings: WmsPackingDocumentSettings = Field(default_factory=WmsPackingDocumentSettings)
    fallback_label: WmsPackingFallbackLabel = Field(default_factory=WmsPackingFallbackLabel)
    interface_display: WmsPackingInterfaceDisplay = Field(default_factory=WmsPackingInterfaceDisplay)


class WmsPackingSettingsSave(BaseModel):
    tenant_id: int
    warehouse_id: Optional[int] = None
    start_status_id: Optional[int] = None
    packed_status_id: Optional[int] = None
    missing_status_id: Optional[int] = None
    packing_after_finish_action: Literal["STAY", "GO_TO_LIST"] = "STAY"
    auto_actions: WmsPackingAutoActions = Field(default_factory=WmsPackingAutoActions)
    document_settings: WmsPackingDocumentSettings = Field(default_factory=WmsPackingDocumentSettings)
    fallback_label: WmsPackingFallbackLabel = Field(default_factory=WmsPackingFallbackLabel)
    #: Opcjonalne w PATCH — brak = zachowaj istniejące w DB (patrz ``wms_settings._save_wms_packing_settings_impl``).
    interface_display: Optional[WmsPackingInterfaceDisplay] = None


class OrderStatusOptionOut(BaseModel):
    id: int
    name: str
    main_group: str
    subgroup_name: Optional[str] = None
    group_display_name: Optional[str] = None


class OrderStatusesListOut(BaseModel):
    items: List[OrderStatusOptionOut]
