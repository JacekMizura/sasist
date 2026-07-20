"""Product logistics runtime normalizer — single SSOT for warehouse + packing fit.

TECHNICAL DEFAULTS (runtime only — never auto-written to master data):
  length/width/height missing → 1 cm
  weight missing → 0 kg
  compressible → False; compressed_height ignored unless compressible
  fragile → False; max_stack_weight/count → NULL; orientation/stack from legacy enums

REAL vs DEFAULT:
  A field is PROVIDED when master data has an explicit value (dims > 0, weight is not None).
  Real products may be exactly 1×1×1 cm — that is PROVIDED, not a default.
  Never infer default from numeric equality with 1×1×1.

Receiving validation uses master ORM values (NULL/missing), not runtime defaults.
Technical defaults therefore NEVER satisfy required receiving fields.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Optional

from .fit_engine.orientations import normalize_orientation_mode
from .fit_engine.stacking import normalize_stacking_mode
from .fit_engine.models import OrientationMode, StackingMode

TECHNICAL_DEFAULT_DIM_CM = 1.0
TECHNICAL_DEFAULT_WEIGHT_KG = 0.0


def _raw_float(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def dimension_provided(v: Any) -> bool:
    """Master has an explicit positive dimension (includes real 1 cm)."""
    f = _raw_float(v)
    return f is not None and f > 1e-9


def weight_provided(v: Any) -> bool:
    """Master has an explicit weight including verified 0 kg (NULL = not provided)."""
    if v is None or v == "":
        return False
    try:
        float(v)
        return True
    except (TypeError, ValueError):
        return False


@dataclass
class NormalizedProductLogistics:
    length_cm: float
    width_cm: float
    height_cm: float
    weight_kg: float
    orientation: OrientationMode
    stack_behavior: StackingMode
    max_stack_count: Optional[int]
    compressible: bool
    compressed_height_cm: Optional[float]
    max_stack_weight: Optional[float]
    fragile: bool
    shape_type: str
    volume_dm3: float
    used_defaults: bool
    defaulted_fields: list[str] = field(default_factory=list)
    data_quality: str = "REAL"  # REAL | PARTIAL_DEFAULTS | ALL_DEFAULTS
    dimensions_provided: bool = False
    weight_provided: bool = False

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["orientation"] = self.orientation.value
        d["stack_behavior"] = self.stack_behavior.value
        return d


def normalize_product_logistics(product: Any, *, packaging_mode: str = "UNIT") -> NormalizedProductLogistics:
    """
    Runtime normalization for fit_engine. Does not mutate ``product``.
    packaging_mode=CARTON uses master-carton fields when units_per_carton > 0.
    """
    use_carton = str(packaging_mode or "UNIT").upper() == "CARTON"
    has_carton = use_carton and float(getattr(product, "units_per_carton", 0) or 0) > 0

    defaulted: list[str] = []

    if has_carton:
        raw_l = getattr(product, "carton_length_cm", None)
        raw_w = getattr(product, "carton_width_cm", None)
        raw_h = getattr(product, "carton_height_cm", None)
        raw_wt = getattr(product, "carton_weight_kg", None)
        # Fall back to unit dims if carton dims missing
        if not dimension_provided(raw_l):
            raw_l = getattr(product, "length", None)
        if not dimension_provided(raw_w):
            raw_w = getattr(product, "width", None)
        if not dimension_provided(raw_h):
            raw_h = getattr(product, "height", None)
        if not weight_provided(raw_wt):
            raw_wt = getattr(product, "weight", None)
        orient_raw = getattr(product, "carton_orientation_type", None) or getattr(product, "orientation_type", None)
        stack_raw = getattr(product, "carton_stack_behavior", None) or getattr(product, "stack_behavior", None)
        compressible = bool(
            getattr(product, "carton_stack_compressible", None)
            if getattr(product, "carton_stack_compressible", None) is not None
            else getattr(product, "stack_compressible", False)
        )
        comp_h = getattr(product, "carton_compressed_height_cm", None)
        if comp_h is None:
            comp_h = getattr(product, "compressed_height_cm", None)
        max_sw = getattr(product, "carton_max_stack_weight", None)
        if max_sw is None:
            max_sw = getattr(product, "max_stack_weight", None)
        max_sc = getattr(product, "carton_max_stack_count", None)
        if max_sc is None:
            max_sc = getattr(product, "max_stack_count", None)
        shape = str(getattr(product, "carton_shape_type", None) or getattr(product, "shape_type", None) or "box")
        vol_raw = getattr(product, "carton_volume_dm3", None)
    else:
        raw_l = getattr(product, "length", None)
        raw_w = getattr(product, "width", None)
        raw_h = getattr(product, "height", None)
        raw_wt = getattr(product, "weight", None)
        orient_raw = getattr(product, "orientation_type", None)
        stack_raw = getattr(product, "stack_behavior", None)
        compressible = bool(getattr(product, "stack_compressible", False))
        comp_h = getattr(product, "compressed_height_cm", None)
        max_sw = getattr(product, "max_stack_weight", None)
        max_sc = getattr(product, "max_stack_count", None)
        shape = str(getattr(product, "shape_type", None) or "box")
        vol_raw = getattr(product, "volume", None)

    dims_ok = dimension_provided(raw_l) and dimension_provided(raw_w) and dimension_provided(raw_h)
    wt_ok = weight_provided(raw_wt)

    if dimension_provided(raw_l):
        length = float(raw_l)
    else:
        length = TECHNICAL_DEFAULT_DIM_CM
        defaulted.append("length")

    if dimension_provided(raw_w):
        width = float(raw_w)
    else:
        width = TECHNICAL_DEFAULT_DIM_CM
        defaulted.append("width")

    if dimension_provided(raw_h):
        height = float(raw_h)
    else:
        height = TECHNICAL_DEFAULT_DIM_CM
        defaulted.append("height")

    if wt_ok:
        weight = float(raw_wt)
    else:
        weight = TECHNICAL_DEFAULT_WEIGHT_KG
        defaulted.append("weight")

    orientation = normalize_orientation_mode(orient_raw)
    stacking = normalize_stacking_mode(stack_raw)

    if not compressible:
        comp_h_out: Optional[float] = None
    else:
        ch = _raw_float(comp_h)
        comp_h_out = ch if ch is not None and ch > 0 else None
        if compressible and comp_h_out is None:
            defaulted.append("compressed_height_cm")

    msw = _raw_float(max_sw)
    max_stack_weight = msw if msw is not None and msw > 0 else None

    try:
        max_stack_count = int(max_sc) if max_sc is not None and str(max_sc).strip() != "" else None
        if max_stack_count is not None and max_stack_count <= 0:
            max_stack_count = None
    except (TypeError, ValueError):
        max_stack_count = None

    if stacking == StackingMode.NO_STACK:
        max_stack_count = 1 if max_stack_count is None else min(1, max_stack_count)

    fragile = bool(getattr(product, "fragile", False) or getattr(product, "is_fragile", False))

    vol = _raw_float(vol_raw) or 0.0
    if vol <= 0:
        vol = (length * width * height) / 1000.0

    used = len(defaulted) > 0
    if not used:
        quality = "REAL"
    elif dims_ok and not ("length" in defaulted or "width" in defaulted or "height" in defaulted):
        quality = "PARTIAL_DEFAULTS"
    elif not dims_ok and not wt_ok and set(defaulted) >= {"length", "width", "height", "weight"}:
        quality = "ALL_DEFAULTS"
    else:
        quality = "PARTIAL_DEFAULTS"

    return NormalizedProductLogistics(
        length_cm=length,
        width_cm=width,
        height_cm=height,
        weight_kg=weight,
        orientation=orientation,
        stack_behavior=stacking,
        max_stack_count=max_stack_count,
        compressible=compressible,
        compressed_height_cm=comp_h_out,
        max_stack_weight=max_stack_weight,
        fragile=fragile,
        shape_type=(shape or "box").lower().strip() or "box",
        volume_dm3=vol,
        used_defaults=used,
        defaulted_fields=defaulted,
        data_quality=quality,
        dimensions_provided=dims_ok,
        weight_provided=wt_ok,
    )


def master_dimensions_complete_for_receiving(product: Any) -> bool:
    """Receiving SSOT: technical runtime defaults do NOT count."""
    return (
        dimension_provided(getattr(product, "length", None))
        and dimension_provided(getattr(product, "width", None))
        and dimension_provided(getattr(product, "height", None))
    )


def master_weight_complete_for_receiving(product: Any) -> bool:
    """Weight must be explicitly set on master (including verified 0)."""
    return weight_provided(getattr(product, "weight", None))
