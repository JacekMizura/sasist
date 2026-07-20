"""Slotting / capacity engine — typed DTOs and canonical constants."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# Packaging
PACKAGING_UNIT = "UNIT"
PACKAGING_CARTON = "CARTON"

# Orientation (canonical)
ORIENTATION_ANY = "ANY"
ORIENTATION_UPRIGHT_ONLY = "UPRIGHT_ONLY"
ORIENTATION_NO_ROTATION = "NO_ROTATION"

# Stacking
STACKING_NONE = "NONE"
STACKING_UNIT_ON_UNIT = "UNIT_ON_UNIT"
STACKING_CARTON_ON_CARTON = "CARTON_ON_CARTON"
STACKING_PALLET_ONLY = "PALLET_ONLY"

# Putaway strategies
STRATEGY_NEAREST_AVAILABLE = "NEAREST_AVAILABLE"
STRATEGY_CONSOLIDATE_SKU = "CONSOLIDATE_SKU"
STRATEGY_MAX_FREE_SPACE = "MAX_FREE_SPACE"
STRATEGY_PICKING_PRIORITY = "PICKING_PRIORITY"
STRATEGY_BALANCED_UTILIZATION = "BALANCED_UTILIZATION"

# Heatmap capacity states
CAPACITY_EMPTY = "EMPTY"
CAPACITY_LOW = "LOW"
CAPACITY_MEDIUM = "MEDIUM"
CAPACITY_HIGH = "HIGH"
CAPACITY_FULL = "FULL"
CAPACITY_OVERFLOW = "OVERFLOW"

# Heuristic defaults (conservative enterprise V1)
DEFAULT_WEIGHT_KG_PER_DM3 = 100.0
MIN_USABLE_VOLUME_DM3 = 0.01
STACK_HEIGHT_MULTIPLIER_UNIT = 3
STACK_HEIGHT_MULTIPLIER_CARTON = 4


@dataclass
class ProductFootprint:
    product_id: int
    length_cm: float
    width_cm: float
    height_cm: float
    weight_kg: float
    volume_dm3: float
    orientation: str = ORIENTATION_ANY
    stacking_mode: str = STACKING_UNIT_ON_UNIT
    compressible: bool = False
    max_stack_weight_kg: float | None = None
    units_per_carton: float = 1.0
    max_stack_count: int | None = None
    compressed_height_cm: float | None = None


@dataclass
class LocationCapacityProfile:
    location_id: int
    location_code: str
    warehouse_id: int
    total_volume_dm3: float
    total_weight_kg: float
    occupied_volume_dm3: float = 0.0
    occupied_weight_kg: float = 0.0
    utilization_percent: float = 0.0
    operational_zone: str | None = None
    picking_priority: int = 100
    pick_sequence: int | None = None
    location_type: str = "pick"
    length_cm: float = 0.0
    width_cm: float = 0.0
    height_cm: float = 0.0


@dataclass
class CapacityCalculationResult:
    fits: bool
    max_units: float
    max_cartons: float
    remaining_units: float
    remaining_volume_dm3: float
    remaining_weight_kg: float
    volume_utilization_percent: float
    weight_utilization_percent: float
    failure_reason: str | None = None
    limiting_factor: str | None = None
    method: str | None = None
    confidence: str | None = None
    explanation: str | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "fits": self.fits,
            "max_units": round(self.max_units, 4),
            "max_cartons": round(self.max_cartons, 4),
            "remaining_units": round(self.remaining_units, 4),
            "remaining_volume_dm3": round(self.remaining_volume_dm3, 4),
            "remaining_weight_kg": round(self.remaining_weight_kg, 4),
            "volume_utilization_percent": round(self.volume_utilization_percent, 2),
            "weight_utilization_percent": round(self.weight_utilization_percent, 2),
            "failure_reason": self.failure_reason,
            "limiting_factor": self.limiting_factor,
        }
        if self.method is not None:
            out["method"] = self.method
        if self.confidence is not None:
            out["confidence"] = self.confidence
        if self.explanation is not None:
            out["explanation"] = self.explanation
        return out


@dataclass
class PutawaySuggestion:
    location_id: int
    location_code: str
    score: float
    max_fit_quantity: float
    remaining_capacity_percent: float
    same_sku_present: bool
    reason_tags: list[str] = field(default_factory=list)
    capacity_result: CapacityCalculationResult | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "location_id": self.location_id,
            "location_code": self.location_code,
            "score": round(self.score, 2),
            "max_fit_quantity": round(self.max_fit_quantity, 4),
            "remaining_capacity_percent": round(self.remaining_capacity_percent, 2),
            "same_sku_present": self.same_sku_present,
            "reason_tags": list(self.reason_tags),
        }
        if self.capacity_result is not None:
            out["capacity"] = self.capacity_result.to_dict()
        return out
