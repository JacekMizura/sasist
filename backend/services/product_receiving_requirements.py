"""Shared validation: required product master data at WMS receiving."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, List, Optional

from ..models.product import Product
from ..models.wms_settings import WmsSettings
from .product_logistics_normalizer import (
    dimension_provided,
    master_weight_complete_for_receiving,
)
from .product_validation_policy import (
    EffectiveReceivingRequirements,
    resolve_effective_receiving_requirements,
)


def _positive_float(v: object) -> bool:
    try:
        return float(v or 0) > 1e-9
    except (TypeError, ValueError):
        return False


def _non_empty_str(v: object) -> bool:
    return bool(str(v or "").strip())


def product_created_in_wms(product: Product) -> bool:
    raw = getattr(product, "metadata_json", None)
    if not raw:
        return False
    try:
        meta = json.loads(str(raw)) if isinstance(raw, str) else raw
    except (TypeError, ValueError, json.JSONDecodeError):
        return False
    if not isinstance(meta, dict):
        return False
    src = str(meta.get("creation_source") or "").strip().upper()
    return src == "WMS_RECEIVING" or meta.get("is_incomplete") is True


@dataclass
class MissingReceivingField:
    key: str
    label: str
    group: str  # basic | carton


@dataclass
class ProductReceivingDataValidation:
    complete: bool
    missing: List[MissingReceivingField] = field(default_factory=list)
    badge_labels: List[str] = field(default_factory=list)
    show_completion_modal: bool = False
    force_wms_completion: bool = False


RECEIVING_REQUIREMENT_FLAG_NAMES: tuple[str, ...] = (
    "require_recv_height",
    "require_recv_width",
    "require_recv_length",
    "require_recv_weight",
    "require_recv_master_carton",
    "require_recv_master_carton_ean",
    "require_recv_master_carton_qty",
    "require_recv_master_carton_dims",
    "require_recv_master_carton_weight",
)


def _effective(product: Product, wms_settings: WmsSettings | None) -> EffectiveReceivingRequirements:
    return resolve_effective_receiving_requirements(product, wms_settings)


def product_has_active_receiving_requirements(
    product: Product,
    wms_settings: WmsSettings | None = None,
) -> bool:
    eff = _effective(product, wms_settings)
    return any(getattr(eff, name) for name in RECEIVING_REQUIREMENT_FLAG_NAMES)


def get_missing_required_fields(
    product: Product,
    wms_settings: WmsSettings | None = None,
) -> list[str]:
    return [m.key for m in validate_required_product_data(product, wms_settings).missing]


def validate_required_product_data(
    product: Product,
    wms_settings: WmsSettings | None = None,
) -> ProductReceivingDataValidation:
    """Return missing required fields and whether receiving should prompt completion."""
    eff = _effective(product, wms_settings)
    missing: List[MissingReceivingField] = []
    force_wms = product_created_in_wms(product)

    if eff.require_recv_height and not dimension_provided(getattr(product, "height", None)):
        missing.append(MissingReceivingField("height", "Wysokość", "basic"))
    if eff.require_recv_width and not dimension_provided(getattr(product, "width", None)):
        missing.append(MissingReceivingField("width", "Szerokość", "basic"))
    if eff.require_recv_length and not dimension_provided(getattr(product, "length", None)):
        missing.append(MissingReceivingField("length", "Długość", "basic"))
    # Weight: must be explicitly set on master. Runtime technical default 0 kg does NOT count.
    if eff.require_recv_weight and not master_weight_complete_for_receiving(product):
        missing.append(MissingReceivingField("weight", "Waga", "basic"))

    has_carton = _non_empty_str(getattr(product, "bulk_ean", None)) or _positive_float(
        getattr(product, "units_per_carton", None)
    )
    if eff.require_recv_master_carton and not has_carton:
        missing.append(MissingReceivingField("master_carton", "Opakowanie zbiorcze", "carton"))
    if eff.require_recv_master_carton_ean and not _non_empty_str(getattr(product, "bulk_ean", None)):
        missing.append(MissingReceivingField("bulk_ean", "EAN opakowania zbiorczego", "carton"))
    if eff.require_recv_master_carton_qty and not _positive_float(getattr(product, "units_per_carton", None)):
        missing.append(MissingReceivingField("units_per_carton", "Ilość w opakowaniu zbiorczym", "carton"))

    dims_ok = (
        _positive_float(getattr(product, "carton_length_cm", None))
        and _positive_float(getattr(product, "carton_width_cm", None))
        and _positive_float(getattr(product, "carton_height_cm", None))
    )
    if eff.require_recv_master_carton_dims and not dims_ok:
        missing.append(MissingReceivingField("carton_dimensions", "Wymiary opakowania zbiorczego", "carton"))
    if eff.require_recv_master_carton_weight and not _positive_float(getattr(product, "carton_weight_kg", None)):
        missing.append(MissingReceivingField("carton_weight_kg", "Waga opakowania zbiorczego", "carton"))

    badge_labels = _badge_labels_from_missing(missing)
    has_requirements = product_has_active_receiving_requirements(product, wms_settings)
    complete = len(missing) == 0
    show_modal = force_wms or (has_requirements and len(missing) > 0)

    return ProductReceivingDataValidation(
        complete=complete,
        missing=missing,
        badge_labels=badge_labels,
        show_completion_modal=show_modal,
        force_wms_completion=force_wms,
    )


def _badge_labels_from_missing(missing: List[MissingReceivingField]) -> List[str]:
    keys = {m.key for m in missing}
    labels: List[str] = []
    if keys & {"height", "width", "length"}:
        labels.append("Brak wymiarów")
    if "weight" in keys:
        labels.append("Brak wagi")
    if keys & {"master_carton", "bulk_ean", "units_per_carton", "carton_dimensions", "carton_weight_kg"}:
        if "bulk_ean" in keys and len(keys) == 1:
            labels.append("Brak EAN kartonu")
        elif "master_carton" in keys:
            labels.append("Brak kartonu")
        else:
            labels.append("Brak danych kartonu")
    return labels


def product_to_receiving_data_dict(
    product: Product,
    wms_settings: WmsSettings | None = None,
) -> dict[str, Any]:
    """Snapshot for API / frontend completion modal."""
    eff = _effective(product, wms_settings)
    v = validate_required_product_data(product, wms_settings)
    return {
        "complete": v.complete,
        "show_completion_modal": v.show_completion_modal,
        "force_wms_completion": v.force_wms_completion,
        "missing_fields": [{"key": m.key, "label": m.label, "group": m.group} for m in v.missing],
        "badge_labels": v.badge_labels,
        "values": {
            "height": getattr(product, "height", None),
            "width": getattr(product, "width", None),
            "length": getattr(product, "length", None),
            "weight": getattr(product, "weight", None),
            "bulk_ean": (getattr(product, "bulk_ean", None) or "").strip() or None,
            "units_per_carton": getattr(product, "units_per_carton", None),
            "carton_length_cm": getattr(product, "carton_length_cm", None),
            "carton_width_cm": getattr(product, "carton_width_cm", None),
            "carton_height_cm": getattr(product, "carton_height_cm", None),
            "carton_weight_kg": getattr(product, "carton_weight_kg", None),
        },
        "requirements": eff.as_dict(),
        "validation_skips": {
            "validation_skip_dimensions": bool(getattr(product, "validation_skip_dimensions", False)),
            "validation_skip_weight": bool(getattr(product, "validation_skip_weight", False)),
            "validation_skip_batch": bool(getattr(product, "validation_skip_batch", False)),
            "validation_skip_expiry": bool(getattr(product, "validation_skip_expiry", False)),
            "validation_skip_serial": bool(getattr(product, "validation_skip_serial", False)),
            "validation_skip_master_carton": bool(getattr(product, "validation_skip_master_carton", False)),
            "validation_skip_master_carton_ean": bool(getattr(product, "validation_skip_master_carton_ean", False)),
            "validation_skip_master_carton_qty": bool(getattr(product, "validation_skip_master_carton_qty", False)),
            "validation_skip_master_carton_dims": bool(getattr(product, "validation_skip_master_carton_dims", False)),
            "validation_skip_master_carton_weight": bool(
                getattr(product, "validation_skip_master_carton_weight", False)
            ),
        },
    }
