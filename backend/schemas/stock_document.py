"""Stock documents (PZ) — request/response models."""

import math
from datetime import date, datetime
from typing import List, Literal, Optional

ReceiptLineType = Literal["product", "carton", "packaging_material"]

from pydantic import BaseModel, Field, computed_field, field_validator

from .document_creator import DocumentCreatedByRead

MAX_RECEIVED_QTY = 1e9


class CreatePzResult(BaseModel):
    """Minimal response from POST /deliveries/{id}/create-pz."""

    id: int
    number: str
    status: str = "draft"


class StockDocumentHardDeleteResult(BaseModel):
    ok: bool = True
    id: int


class PutawayAllocationRead(BaseModel):
    location_id: int
    location_code: str = ""
    location_type: str = Field(
        default="PICK",
        description="WMS badge kind: PICK | BUFFER | BULK | INBOUND | OUTBOUND (same as GET /warehouses/{id}/locations type).",
    )
    storage_type: str = Field(
        default="unknown",
        description="Canonical bin storage type (matches layout Bin.storage_type / frontend normalizeStorageType).",
    )
    quantity: float = 0.0
    location_name: str = ""
    zone: Optional[str] = Field(default=None, description="Optional zone / rack grouping (e.g. rack_name).")
    capacity_type: Optional[str] = Field(default=None, description="Location.type: pick | reserve | floor.")


class ReceivingScanLogRead(BaseModel):
    """Single audit entry for a WMS receiving quantity save (nested under line read)."""

    id: int
    admin_id: int
    admin_display_name: str = Field(
        default="",
        description="Resolved operator label (first + last or login) for WMS cards without user-directory permission.",
    )
    quantity_added: float
    packaging_type: str
    cartons_added: Optional[int] = None
    loose_units_added: Optional[int] = None
    created_at: datetime


class ReceivingPzCarrierRead(BaseModel):
    """Nośnik przypisany do dokumentu PZ (lista pod nagłówkiem przyjęcia)."""

    carrier_id: int = Field(..., ge=1)
    code: str = ""
    barcode: str = ""


class StockDocumentItemRead(BaseModel):
    id: int
    product_id: Optional[int] = None
    receipt_line_type: Optional[ReceiptLineType] = Field(
        default=None,
        description="product | carton | packaging_material — UI / PDF type badge.",
    )
    item_type: Optional[ReceiptLineType] = Field(
        default=None,
        description="Same values as receipt_line_type — explicit WMS / client field.",
    )
    item_id: Optional[str] = Field(
        default=None,
        description="Catalog id as string: numeric product id or WM uuid.",
    )
    line_unit: Optional[str] = Field(None, description="Unit from purchase line snapshot (e.g. szt., rolka).")
    product_name: Optional[str] = None
    product_image_url: Optional[str] = None
    image_url: Optional[str] = Field(
        default=None,
        description="Resolved photo: delivery snapshot first, then live catalog (WMS / PDF).",
    )
    product_ean: Optional[str] = None
    product_sku: Optional[str] = None
    ordered_quantity: float = 0.0
    received_quantity: float = 0.0
    quantity: float = 0.0
    cartons_count: int = Field(default=0, description="Persisted full-carton count for this line (WMS receiving).")
    loose_units_count: int = Field(default=0, description="Persisted loose-unit count for this line (WMS receiving).")
    purchase_price_net: Optional[float] = None
    vat_rate: float = 23.0
    delivery_item_id: Optional[int] = None
    batch_number: str = ""
    expiry_date: Optional[date] = None  # None when not tracked / sentinel
    track_batch: bool = False
    track_expiry: bool = False
    track_serial: bool = False
    quantity_putaway: float = 0.0
    putaway_updated_at: Optional[datetime] = None
    putaway_last_location_name: Optional[str] = None
    putaway_last_location_type: Optional[str] = None
    putaway_last_admin_id: Optional[int] = Field(
        default=None,
        description="Operator who performed the last putaway on this line.",
    )
    putaway_last_operator_name: Optional[str] = Field(
        default=None,
        description="Display name for putaway_last_admin_id (resolved server-side).",
    )
    putaway_last_quantity: Optional[float] = Field(
        default=None,
        description="Quantity from the last putaway save at putaway_last_location_name.",
    )
    putaway_allocations: List[PutawayAllocationRead] = Field(default_factory=list)
    mm_line_from_location_id: Optional[int] = Field(
        default=None,
        description="MM draft: source bin for this line (putaway assigns destination).",
    )
    mm_line_from_location_name: Optional[str] = Field(default=None, description="Display name for mm_line_from_location_id.")
    stock_disposition: Optional[str] = Field(
        default=None,
        description="Warehouse quality bucket (SALEABLE, OUTLET_B, SERVICE_C, …) persisted after putaway.",
    )
    receiving_scan_logs: List[ReceivingScanLogRead] = Field(
        default_factory=list,
        description="Chronological audit of WMS receiving saves for this line (may be empty).",
    )
    suggested_warehouse_carrier_id: Optional[int] = Field(
        default=None,
        description="Sugestia przyjęcia na nośnik (z panelu PZ).",
    )
    suggested_warehouse_carrier_barcode: Optional[str] = Field(
        default=None,
        description="Kod kreskowy sugerowanego nośnika.",
    )
    warehouse_carrier_id: Optional[int] = Field(
        default=None,
        description="Nośnik, na który przyjęto tę linię (musi być na liście nośników PZ).",
    )
    warehouse_carrier_code: Optional[str] = Field(
        default=None,
        description="Kod nośnika (PAL-…) dla wyświetlenia na karcie linii.",
    )
    wms_extra_item: bool = Field(
        default=False,
        description="Linia dodana w WMS (brak pozycji na imporcie PZ): ordered=0, bez delivery_item_id.",
    )
    wms_line_status: Optional[str] = Field(
        default=None,
        description="EXTRA_ITEM dla pozycji spoza dokumentu źródłowego.",
    )
    wms_line_source: Optional[str] = Field(
        default=None,
        description="WMS_SCAN | WMS_MANUAL — skąd dodano linię (jeśli wms_extra_item).",
    )
    serial_numbers: List[str] = Field(
        default_factory=list,
        description="Numery seryjne powiązane z tą linią PZ (track_serial).",
    )
    serial_range_label: Optional[str] = Field(
        default=None,
        description="Skrót zakresu seriali np. SN-001 → SN-005.",
    )
    source_rmz_id: Optional[int] = Field(
        default=None,
        description="Źródłowy zwrot RMZ (linie Z-PZ).",
    )
    source_rmz_number: Optional[str] = Field(
        default=None,
        description="Numer RMZ do wyświetlenia (np. RMZ-2026-1).",
    )
    return_decision: Optional[str] = Field(
        default=None,
        description="Decyzja zwrotu: ACCEPTED | DAMAGED_B | DAMAGED_C.",
    )
    return_decision_label: Optional[str] = Field(
        default=None,
        description="Etykieta decyzji zwrotu dla operatora: A | B | C.",
    )
    sales_blocked_qty: float = Field(
        0,
        ge=0,
        description="Qty blocked from sale by purchasing (raw line value).",
    )
    sales_block_effective_qty: float = Field(
        0,
        ge=0,
        description="Effective sales block after virtual line consumption (LIFO).",
    )
    sales_block_reason_code: Optional[str] = None
    sales_block_reason_label: Optional[str] = None
    sales_block_note: Optional[str] = None
    sales_blocked_at: Optional[datetime] = None
    sales_blocked_by_user_id: Optional[int] = None
    line_commercial_available_qty: float = Field(
        0,
        ge=0,
        description="received_quantity minus effective sales block for this line.",
    )
    line_remaining_qty: float = Field(
        0,
        ge=0,
        description="Remaining received qty on this PZ line after LIFO virtual consumption (sales block).",
    )

    @computed_field
    @property
    def putaway_remaining(self) -> float:
        return max(0.0, float(self.received_quantity) - float(self.quantity_putaway))

    @computed_field
    @property
    def putaway_completed(self) -> bool:
        return float(self.received_quantity) <= 1e-5 or float(self.quantity_putaway) + 1e-5 >= float(self.received_quantity)

    @computed_field
    @property
    def difference(self) -> float:
        return float(self.received_quantity) - float(self.ordered_quantity)

    @computed_field
    @property
    def value_net(self) -> Optional[float]:
        if self.purchase_price_net is None:
            return None
        rec = float(self.received_quantity or 0)
        ordq = float(self.ordered_quantity or 0)
        qty = rec if rec > 1e-9 else ordq
        if qty <= 1e-12:
            return None
        return round(qty * float(self.purchase_price_net), 2)

    @computed_field
    @property
    def unit_price_gross(self) -> Optional[float]:
        if self.purchase_price_net is None:
            return None
        vr = float(self.vat_rate or 0)
        if not math.isfinite(vr):
            vr = 0.0
        return round(float(self.purchase_price_net) * (1.0 + vr / 100.0), 2)

    @computed_field
    @property
    def value_gross(self) -> Optional[float]:
        ug = self.unit_price_gross
        if ug is None:
            return None
        rec = float(self.received_quantity or 0)
        ordq = float(self.ordered_quantity or 0)
        qty = rec if rec > 1e-9 else ordq
        if qty <= 1e-12:
            return None
        return round(qty * float(ug), 2)


class StockDocumentItemPatchLine(BaseModel):
    id: int = Field(..., ge=1)
    received_quantity: float
    suggested_warehouse_carrier_id: Optional[int] = Field(
        default=None,
        description="Opcjonalnie: ustaw sugerowany nośnik dla receiving (pomiń pole, by nie zmieniać).",
    )

    @field_validator("suggested_warehouse_carrier_id")
    @classmethod
    def carrier_id_positive(cls, v: Optional[int]) -> Optional[int]:
        if v is None:
            return None
        if int(v) < 1:
            raise ValueError("suggested_warehouse_carrier_id must be >= 1")
        return int(v)

    @field_validator("received_quantity")
    @classmethod
    def received_ok(cls, v: float) -> float:
        if not math.isfinite(v) or v < 0:
            raise ValueError("received_quantity must be a non-negative finite number")
        if v > MAX_RECEIVED_QTY:
            raise ValueError("received_quantity exceeds maximum allowed")
        return v


class PatchStockDocumentItemsBody(BaseModel):
    items: List[StockDocumentItemPatchLine] = Field(..., min_length=1)


class PatchStockDocumentReceivingTargetBody(BaseModel):
    """Set receiving bin for draft PZ. Omit warehouse_id only when the document already has one or the tenant has exactly one warehouse."""

    warehouse_id: Optional[int] = Field(None, ge=1)
    location_id: int = Field(..., ge=1)


class PatchStockDocumentMetadataBody(BaseModel):
    """Financial / header fields only — does not touch lines or stock operations."""

    currency: Optional[str] = Field(None, min_length=3, max_length=8)
    total_net: Optional[float] = None
    total_gross: Optional[float] = None
    purchase_workflow_status: Optional[str] = Field(
        None,
        description="P2.5A purchase axis: PENDING_INVOICE | COST_REVIEW | COST_DISPUTE | VERIFIED",
    )

    @field_validator("total_net", "total_gross")
    @classmethod
    def finite_optional(cls, v: Optional[float]) -> Optional[float]:
        if v is None:
            return None
        if not math.isfinite(v):
            raise ValueError("must be a finite number")
        return v


class DocumentSeriesBriefRead(BaseModel):
    id: Optional[str] = None
    code: str
    name: Optional[str] = None
    prefix: Optional[str] = None


class StockDocumentLinkedSaleDocumentRead(BaseModel):
    id: str
    document_number: str = ""
    document_subtype: Optional[str] = None
    detail_path: str = ""


class StockDocumentRead(BaseModel):
    id: int
    tenant_id: int
    document_type: str
    document_number: Optional[str] = Field(None, description="Numer z serii dokumentu (np. WZ/1/2026).")
    document_series_prefix: Optional[str] = Field(None, description="Prefiks serii (np. WZ).")
    series: Optional[DocumentSeriesBriefRead] = Field(None, description="Seria dokumentu (code/name).")
    order_id: Optional[int] = Field(None, description="Powiązane zamówienie OMS.")
    order_number: Optional[str] = Field(None, description="Numer zamówienia OMS.")
    customer_name: Optional[str] = Field(None, description="Klient z powiązanego zamówienia (WZ).")
    source_sale_document_id: Optional[str] = Field(None, description="PA/FV źródłowe dla WZ.")
    linked_sale_document: Optional[StockDocumentLinkedSaleDocumentRead] = Field(
        None,
        description="Powiązany dokument sprzedaży (paragon/faktura).",
    )
    production_order_id: Optional[int] = Field(None, description="Zlecenie produkcyjne (RW/PW z produkcji).")
    production_order_number: Optional[str] = Field(None, description="Numer MO zlecenia produkcyjnego.")
    production_order_path: Optional[str] = Field(None, description="Ścieżka UI do zlecenia produkcyjnego.")
    production_batch_id: Optional[int] = Field(None, description="Partia produkcyjna (RW/PW z produkcji falowej).")
    production_batch_number: Optional[str] = Field(None, description="Numer partii produkcyjnej.")
    production_batch_path: Optional[str] = Field(None, description="Ścieżka UI do partii produkcyjnej.")
    supplier_id: Optional[int] = None
    supplier_name: str = ""
    delivery_id: Optional[int] = None
    creation_source: str = "PANEL"
    warehouse_id: Optional[int] = None
    warehouse_name: str = ""
    location_id: Optional[int] = None
    location_name: str = ""
    mm_from_location_id: Optional[int] = None
    mm_to_location_id: Optional[int] = None
    mm_from_location_name: str = ""
    mm_to_location_name: str = ""
    source_warehouse_id: Optional[int] = None
    destination_warehouse_id: Optional[int] = None
    source_warehouse_name: str = ""
    destination_warehouse_name: str = ""
    status: str
    """WMS przyjęcie (workflow): NEW | IN_PROGRESS | DONE."""
    receiving_status: str = "NEW"
    """WMS rozlokowanie: NOT_STARTED | IN_PROGRESS | DONE."""
    putaway_status: str = "NOT_STARTED"
    """WMS zamknięcie listy rozlokowania: OPEN | DONE."""
    relocation_status: str = "OPEN"
    warehouse_workflow_status: str = Field(
        default="NEW",
        description="P2.5A warehouse axis: NEW | COUNTING | COUNTED | PUTAWAY_IN_PROGRESS | PUTAWAY_COMPLETED | CLOSED",
    )
    purchase_workflow_status: str = Field(
        default="PENDING_INVOICE",
        description="P2.5A purchase axis (independent): PENDING_INVOICE | COST_REVIEW | COST_DISPUTE | VERIFIED",
    )
    is_fully_received: bool = False
    is_fully_putaway: bool = False
    total_ordered: float = 0.0
    total_received: float = 0.0
    total_putaway: float = 0.0
    putaway_target_quantity: float = 0.0
    currency: str = "PLN"
    total_net: Optional[float] = None
    total_gross: Optional[float] = None
    total_vat: Optional[float] = Field(
        default=None,
        description="Suma VAT z pozycji (dla PZ wyliczana z linii: netto × stawka).",
    )
    edit_mode: Literal["full", "metadata", "none"] = "none"
    can_cancel: bool = False
    created_at: datetime
    updated_at: datetime
    closed_at: Optional[datetime] = Field(
        default=None,
        description="Data zamknięcia dokumentu (Z-PZ CLOSED → updated_at).",
    )
    created_by: DocumentCreatedByRead = Field(default_factory=DocumentCreatedByRead)
    # Flat list: one row per (product × batch × expiry) line on the PZ — not grouped by product.
    items: List[StockDocumentItemRead] = Field(default_factory=list)
    receiving_carriers: List[ReceivingPzCarrierRead] = Field(
        default_factory=list,
        description="Nośniki dodane do tego PZ (WMS receiving — operator + „Dodaj nośnik”).",
    )


class StockDocumentListRow(BaseModel):
    id: int
    tenant_id: int
    document_type: str
    document_number: Optional[str] = None
    document_series_prefix: Optional[str] = None
    series: Optional[DocumentSeriesBriefRead] = None
    order_id: Optional[int] = None
    order_number: Optional[str] = None
    customer_name: Optional[str] = None
    production_order_id: Optional[int] = None
    production_order_number: Optional[str] = None
    production_batch_id: Optional[int] = None
    production_batch_number: Optional[str] = None
    delivery_id: Optional[int] = None
    supplier_id: Optional[int] = None
    supplier_name: str
    warehouse_id: Optional[int] = None
    warehouse_name: str = ""
    location_id: Optional[int] = None
    location_name: str = ""
    mm_from_location_name: str = ""
    mm_to_location_name: str = ""
    source_warehouse_id: Optional[int] = None
    destination_warehouse_id: Optional[int] = None
    source_warehouse_name: str = ""
    destination_warehouse_name: str = ""
    creation_source: str = "PANEL"
    status: str
    created_at: datetime
    created_by: DocumentCreatedByRead = Field(default_factory=DocumentCreatedByRead)
    line_count: int
    # Sum of ordered / received across lines (WMS partial receiving).
    total_ordered: float = 0.0
    total_received: float = 0.0
    # WMS workflow + line progress (see StockDocumentRead).
    receiving_status: str = "NEW"
    putaway_status: str = "NOT_STARTED"
    relocation_status: str = "OPEN"
    warehouse_workflow_status: str = "NEW"
    purchase_workflow_status: str = "PENDING_INVOICE"
    is_fully_received: bool = False
    is_fully_putaway: bool = False
    currency: str = "PLN"
    total_net: Optional[float] = None
    total_gross: Optional[float] = None
    total_vat: Optional[float] = Field(
        default=None,
        description="Suma VAT z pozycji (PZ — z linii dokumentu).",
    )
    edit_mode: Literal["full", "metadata", "none"] = "none"
    can_cancel: bool = False


