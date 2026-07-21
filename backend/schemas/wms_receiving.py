"""WMS receiving (counting PZ lines only — no inventory / locations)."""

import math
from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from .document_creator import DocumentCreatedByRead
from .wms_carriers import WarehouseCarrierBulkCreate


class WmsReceiveLineBody(BaseModel):
    pz_item_id: int = Field(..., ge=1)
    quantity: float = Field(..., ge=0, description="Amount to add to received_quantity for this line")
    warehouse_carrier_id: Optional[int] = Field(
        default=None,
        description="Jeśli ustawione — przyjęcie fizycznie na nośnik (stan na lokacji przyjęcia + carrier_id).",
    )

    @field_validator("warehouse_carrier_id")
    @classmethod
    def warehouse_carrier_line_ok(cls, v: Optional[int]) -> Optional[int]:
        if v is None:
            return None
        if int(v) < 1:
            raise ValueError("warehouse_carrier_id must be >= 1")
        return int(v)

    @field_validator("quantity")
    @classmethod
    def finite_qty(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("quantity must be finite")
        if v > 1e9:
            raise ValueError("quantity exceeds maximum allowed")
        return v


class WmsReceiveBody(BaseModel):
    pz_id: int = Field(..., ge=1)
    lines: List[WmsReceiveLineBody] = Field(..., min_length=1)


class ReceivingValidationFieldRequirement(BaseModel):
    required: bool = False
    satisfied: bool = True


class ReceivingValidationRequirements(BaseModel):
    """Effective receiving policy for one SKU (global ∧ ¬product_skip). Frontend presents only."""

    dimensions: ReceivingValidationFieldRequirement = Field(
        default_factory=ReceivingValidationFieldRequirement
    )
    weight: ReceivingValidationFieldRequirement = Field(
        default_factory=ReceivingValidationFieldRequirement
    )
    master_carton: ReceivingValidationFieldRequirement = Field(
        default_factory=ReceivingValidationFieldRequirement
    )
    batch: ReceivingValidationFieldRequirement = Field(
        default_factory=ReceivingValidationFieldRequirement
    )
    expiry_date: ReceivingValidationFieldRequirement = Field(
        default_factory=ReceivingValidationFieldRequirement
    )
    serial_number: ReceivingValidationFieldRequirement = Field(
        default_factory=ReceivingValidationFieldRequirement
    )


class ReceivingScanResolveOut(BaseModel):
    """Result of resolving a scanned code for WMS receiving (PZ line pick by product_id on client)."""

    found: bool
    product_id: Optional[int] = None
    default_quantity: int = 1
    match_kind: Optional[str] = None  # product_barcode | bulk_ean | product_ean | gs1 | serial
    product_name: Optional[str] = None
    product_ean: Optional[str] = None
    image_url: Optional[str] = None
    track_batch: bool = False
    track_expiry: bool = False
    track_serial: bool = False
    parsed_serial: Optional[str] = None
    parsed_batch: Optional[str] = None
    parsed_expiry: Optional[date] = None
    is_gs1: bool = False
    requires_data_completion: bool = False
    receiving_data_complete: bool = True
    missing_data_labels: List[str] = Field(default_factory=list)
    validation_requirements: Optional[ReceivingValidationRequirements] = None


class WmsReceiveSerialBody(BaseModel):
    """Receive exactly one unit identified by serial (track_serial products)."""

    product_id: int = Field(..., ge=1)
    serial_number: str = Field(..., min_length=1, max_length=128)
    batch_number: Optional[str] = None
    expiry_date: Optional[date] = None
    warehouse_carrier_id: Optional[int] = Field(default=None, ge=1)
    raw_scan: Optional[str] = Field(default=None, max_length=512)

    @field_validator("serial_number")
    @classmethod
    def strip_serial(cls, v: str) -> str:
        s = (v or "").strip()
        if not s:
            raise ValueError("serial_number is required")
        return s


class ReceivingPzCarriersAttachBody(BaseModel):
    """Przypisz istniejący nośnik do PZ albo utwórz nową serię i przypisz wszystkie do PZ."""

    warehouse_carrier_id: Optional[int] = Field(default=None, ge=1)
    bulk_create: Optional[WarehouseCarrierBulkCreate] = Field(default=None)

    @model_validator(mode="after")
    def exactly_one_mode(self):
        has_id = self.warehouse_carrier_id is not None
        has_bulk = self.bulk_create is not None
        if has_id == has_bulk:
            raise ValueError("Podaj dokładnie jedno: warehouse_carrier_id (istniejący) albo bulk_create (nowe).")
        return self


class WmsCreateReceivingPzBody(BaseModel):
    """WMS „Nowa dostawa” — pusta PZ z dostawcą (istniejącym id lub jawne utworzenie)."""

    supplier_name: str = Field(..., min_length=1, max_length=256)
    supplier_id: Optional[int] = Field(default=None, ge=1)
    create_supplier: bool = Field(
        default=False,
        description="True tylko po jawnej akcji „Utwórz nowego dostawcę” — bez auto-create z samego tekstu.",
    )
    warehouse_id: Optional[int] = Field(
        default=None,
        ge=1,
        description="Magazyn docelowy; domyślnie aktywny magazyn operatora.",
    )

    @field_validator("supplier_name")
    @classmethod
    def strip_supplier_name(cls, v: str) -> str:
        s = (v or "").strip()
        if not s:
            raise ValueError("supplier_name is required")
        return s


class WmsEnsureProductLineBody(BaseModel):
    product_id: int = Field(..., ge=1)


class WmsEnsureProductLineResponse(BaseModel):
    """PZ po dodaniu / powiązaniu produktu spoza dokumentu (linia widoczna w odpowiedzi)."""

    document: "StockDocumentRead"
    item_id: int = Field(..., ge=1)
    auto_received: bool = False


# Forward ref resolved after stock_document import cycle
from .stock_document import StockDocumentRead  # noqa: E402

WmsEnsureProductLineResponse.model_rebuild()


class WmsCreateReceivingProductBody(BaseModel):
    """Minimalny produkt z WMS przyjęcia — nazwa wymagana, EAN opcjonalny."""

    name: str = Field(..., min_length=1, max_length=512)
    ean: Optional[str] = Field(default=None, max_length=64)
    sku: Optional[str] = Field(default=None, max_length=128)
    unit: str = Field(default="szt.", max_length=32)
    create_in_assortment: bool = True

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        s = (v or "").strip()
        if not s:
            raise ValueError("name is required")
        return s

    @field_validator("ean", mode="before")
    @classmethod
    def strip_ean(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = "".join(str(v).split())
        return s or None

    @field_validator("sku", "unit", mode="before")
    @classmethod
    def strip_optional(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = str(v).strip()
        return s or None


class WmsReceivingPzListRow(BaseModel):
    """Minimal fields for warehouse terminal list (no warehouse/location joins)."""

    id: int
    number: str
    status: str
    created_at: datetime
    updated_at: datetime
    total_ordered: float
    total_received: float
    receiving_status: str
    putaway_status: str = "NOT_STARTED"
    relocation_status: str = "OPEN"
    is_fully_received: bool = False
    is_fully_putaway: bool = False
    carrier_count: int = 0
    total_putaway: float = 0.0
    putaway_target_quantity: float = 0.0
    creation_source: str = "PANEL"
    supplier_name: str = ""
    document_type: str = "PZ"
    is_return_receipt: bool = False
    has_rmz_source: bool = False
    has_complaint_source: bool = False
    created_by: DocumentCreatedByRead = Field(default_factory=DocumentCreatedByRead)
    warehouse_workflow_status: str = "NEW"
    purchase_workflow_status: str = "PENDING_INVOICE"


class WmsReceivingLineCommercialBody(BaseModel):
    """Manual overrides for document qty / purchase net / VAT (draft PZ line snapshot)."""

    ordered_quantity: Optional[float] = Field(default=None, ge=0)
    purchase_price_net: Optional[float] = Field(default=None, ge=0)
    vat_rate: Optional[float] = Field(default=None, ge=0)

    @field_validator("ordered_quantity", "purchase_price_net", "vat_rate")
    @classmethod
    def finite_optional(cls, v: Optional[float]) -> Optional[float]:
        if v is None:
            return None
        if not math.isfinite(float(v)):
            raise ValueError("value must be finite")
        return float(v)


class WmsReceivingPzSupplierBody(BaseModel):
    supplier_id: int = Field(..., ge=1)


class WmsReceivingItemQuantityBody(BaseModel):
    """Add received qty to an existing lot row or create a new lot row (same delivery line group).

    `quantity_received` is the amount to add on this save (not the line's running total).
    Negative delta = cofnięcie przyjęcia (append-only audit; original receive remains).
    Send `batch_number` / `expiry_date` as null when the product does not track them.
    """

    quantity_received: float = Field(
        ...,
        description="Pieces to add (positive) or reverse (negative) for this batch/expiry on this save",
    )
    batch_number: Optional[str] = None
    expiry_date: Optional[date] = None
    cartons_count: int = Field(default=0, ge=0, description="Full cartons counted on this save (delta).")
    loose_units_count: int = Field(default=0, ge=0, description="Loose units counted on this save (delta).")
    warehouse_carrier_id: Optional[int] = Field(
        default=None,
        description="Jeśli ustawione — przyjęcie na nośnik (stan na lokacji przyjęcia PZ + carrier_id).",
    )

    @field_validator("quantity_received")
    @classmethod
    def qty_nonzero_finite(cls, v: float) -> float:
        if not math.isfinite(float(v)):
            raise ValueError("quantity_received must be finite")
        if abs(float(v)) <= 1e-12:
            raise ValueError("quantity_received must be non-zero")
        if abs(float(v)) > 1e9:
            raise ValueError("quantity_received exceeds maximum allowed")
        return float(v)

    @field_validator("warehouse_carrier_id")
    @classmethod
    def warehouse_carrier_id_ok(cls, v: Optional[int]) -> Optional[int]:
        if v is None:
            return None
        if int(v) < 1:
            raise ValueError("warehouse_carrier_id must be >= 1")
        return int(v)

    @field_validator("cartons_count", "loose_units_count")
    @classmethod
    def split_counters_sane(cls, v: int) -> int:
        if v > 1_000_000_000:
            raise ValueError("split counter exceeds maximum allowed")
        return v


class WmsReceivingSplitSegmentBody(BaseModel):
    quantity_received: float = Field(..., ge=0)
    batch_number: Optional[str] = None
    expiry_date: Optional[date] = None

    @field_validator("quantity_received")
    @classmethod
    def finite_qty(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("quantity must be finite")
        if v > 1e9:
            raise ValueError("quantity exceeds maximum allowed")
        return v


class WmsReceivingMoveCarrierBody(BaseModel):
    """Move all received qty on a PZ line to another carrier (or luzem)."""

    warehouse_carrier_id: Optional[int] = Field(
        default=None,
        description="Target carrier on this PZ; null = luzem (loose on dock).",
    )

    @field_validator("warehouse_carrier_id")
    @classmethod
    def carrier_ok(cls, v: Optional[int]) -> Optional[int]:
        if v is None:
            return None
        if int(v) < 1:
            raise ValueError("warehouse_carrier_id must be >= 1")
        return int(v)


class WmsReceivingMarkDamagedBody(BaseModel):
    """Move qty from saleable received stock into a damaged bucket line (REJECTED_STOCK) on the same PZ."""

    quantity: float = Field(..., gt=0, description="Pieces to mark as damaged (from already-received saleable qty).")
    damage_type: Optional[str] = Field(default=None, max_length=64)
    description: Optional[str] = Field(default=None, max_length=2000)
    photo_urls: Optional[List[str]] = Field(default=None, description="Optional /uploads/… paths for damage evidence.")

    @field_validator("quantity")
    @classmethod
    def finite_qty(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("quantity must be finite")
        if v > 1e9:
            raise ValueError("quantity exceeds maximum allowed")
        return v


class WmsReceivingSplitBody(BaseModel):
    segments: List[WmsReceivingSplitSegmentBody] = Field(..., min_length=1)


class WmsPutawayHandlingBody(BaseModel):
    """STANDARD putaway vs BEZ ROZLOKOWANIA (crossdock) — line and/or document default."""

    requires_putaway: bool = Field(
        ...,
        description="True = standardowe rozlokowanie w magazynie; False = bez rozlokowania.",
    )
    item_ids: Optional[List[int]] = Field(
        default=None,
        description="Opcjonalnie konkretne linie; None = wszystkie linie produktowe + default dokumentu.",
    )


class WmsCancelPutawayObligationBody(BaseModel):
    mark_no_putaway: bool = Field(
        default=True,
        description="True = anuluj obowiązek putaway i oznacz BEZ ROZLOKOWANIA (tylko gdy quantity_putaway=0).",
    )
