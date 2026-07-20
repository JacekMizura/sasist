"""DTO models for shared physical fit core — no ORM."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class FitMethod(str, Enum):
    GEOMETRIC = "GEOMETRIC"
    VOLUME_ESTIMATE = "VOLUME_ESTIMATE"
    ESTIMATED_MIXED_SKU = "ESTIMATED_MIXED_SKU"
    UNKNOWN = "UNKNOWN"


class FitConfidence(str, Enum):
    EXACT = "EXACT"
    ESTIMATED = "ESTIMATED"
    UNKNOWN = "UNKNOWN"


class OrientationMode(str, Enum):
    ANY = "any"
    UPRIGHT_ONLY = "upright_only"
    NO_ROTATION = "no_rotation"


class StackingMode(str, Enum):
    NO_STACK = "no_stack"
    STACKABLE = "stackable"


@dataclass(frozen=True)
class FitContainer:
    """Generic physical space (location, carton, basket, cart, …)."""

    container_id: str
    length_cm: float
    width_cm: float
    height_cm: float
    max_weight_kg: Optional[float] = None
    occupied_volume_dm3: float = 0.0
    occupied_weight_kg: float = 0.0
    label: str = ""
    kind: str = "generic"  # location | carton | basket | cart | …
    #: False when carton falls back to external dims (usable/internal not set)
    dimensions_are_usable: bool = True
    warnings: tuple[str, ...] = ()

    @property
    def volume_cm3(self) -> float:
        if self.length_cm <= 0 or self.width_cm <= 0 or self.height_cm <= 0:
            return 0.0
        return float(self.length_cm) * float(self.width_cm) * float(self.height_cm)

    @property
    def volume_dm3(self) -> float:
        return self.volume_cm3 / 1000.0

    @property
    def remaining_volume_dm3(self) -> float:
        return max(0.0, self.volume_dm3 - float(self.occupied_volume_dm3 or 0))

    @property
    def remaining_weight_kg(self) -> float:
        if self.max_weight_kg is None or self.max_weight_kg <= 0:
            return float("inf")
        return max(0.0, float(self.max_weight_kg) - float(self.occupied_weight_kg or 0))


@dataclass(frozen=True)
class FitItem:
    """One SKU physical unit (product piece or master carton as unit)."""

    product_id: int
    length_cm: float
    width_cm: float
    height_cm: float
    weight_kg: float = 0.0
    volume_dm3: float = 0.0
    orientation: OrientationMode = OrientationMode.ANY
    stacking: StackingMode = StackingMode.STACKABLE
    compressible: bool = False
    compressed_height_cm: Optional[float] = None
    max_stack_count: Optional[int] = None  # max units IN ONE STACK (not whole container)
    max_stack_weight_kg: Optional[float] = None
    shape_type: str = "box"  # box | cylinder
    fragile: bool = False  # no weight on top (treated like no_stack for loaders)
    label: str = ""
    #: Runtime technical defaults were applied (not persisted master provenance)
    used_defaults: bool = False
    defaulted_fields: tuple[str, ...] = ()
    data_quality: str = "REAL"  # REAL | PARTIAL_DEFAULTS | ALL_DEFAULTS

    @property
    def unit_volume_dm3(self) -> float:
        if self.volume_dm3 > 0:
            return float(self.volume_dm3)
        if self.length_cm > 0 and self.width_cm > 0 and self.height_cm > 0:
            return (self.length_cm * self.width_cm * self.height_cm) / 1000.0
        return 0.0


@dataclass(frozen=True)
class IdenticalUnitLayout:
    capacity: int
    orientation_index: int
    box_l_cm: float
    box_w_cm: float
    box_h_cm: float
    count_x: int
    count_y: int
    count_z: int
    stacks_count: int
    units_per_stack: int
    limiting_factor: Optional[str] = None
    method: FitMethod = FitMethod.GEOMETRIC
    confidence: FitConfidence = FitConfidence.EXACT
    explanation: str = ""


@dataclass
class PlacementBox:
    """Axis-aligned placed unit inside a container (cm, origin at container corner)."""

    product_id: int
    x: float
    y: float
    z: float
    l: float
    w: float
    h: float
    weight_kg: float = 0.0
    stackable_on_top: bool = True
