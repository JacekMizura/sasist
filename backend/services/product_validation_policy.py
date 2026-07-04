"""Resolve effective WMS product validation: global settings + per-product skip overrides."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from ..models.product import Product
from ..models.wms_settings import WmsSettings


@dataclass(frozen=True)
class EffectiveReceivingRequirements:
    require_recv_height: bool = False
    require_recv_width: bool = False
    require_recv_length: bool = False
    require_recv_weight: bool = False
    require_recv_master_carton: bool = False
    require_recv_master_carton_ean: bool = False
    require_recv_master_carton_qty: bool = False
    require_recv_master_carton_dims: bool = False
    require_recv_master_carton_weight: bool = False
    track_batch: bool = False
    track_expiry: bool = False
    track_serial: bool = False

    def as_dict(self) -> dict[str, bool]:
        return {
            "require_recv_height": self.require_recv_height,
            "require_recv_width": self.require_recv_width,
            "require_recv_length": self.require_recv_length,
            "require_recv_weight": self.require_recv_weight,
            "require_recv_master_carton": self.require_recv_master_carton,
            "require_recv_master_carton_ean": self.require_recv_master_carton_ean,
            "require_recv_master_carton_qty": self.require_recv_master_carton_qty,
            "require_recv_master_carton_dims": self.require_recv_master_carton_dims,
            "require_recv_master_carton_weight": self.require_recv_master_carton_weight,
            "track_batch": self.track_batch,
            "track_expiry": self.track_expiry,
            "track_serial": self.track_serial,
        }


def _flag(obj: Any, name: str) -> bool:
    return bool(getattr(obj, name, False))


def _legacy_requirements(product: Product) -> EffectiveReceivingRequirements:
    return EffectiveReceivingRequirements(
        require_recv_height=_flag(product, "require_recv_height"),
        require_recv_width=_flag(product, "require_recv_width"),
        require_recv_length=_flag(product, "require_recv_length"),
        require_recv_weight=_flag(product, "require_recv_weight"),
        require_recv_master_carton=_flag(product, "require_recv_master_carton"),
        require_recv_master_carton_ean=_flag(product, "require_recv_master_carton_ean"),
        require_recv_master_carton_qty=_flag(product, "require_recv_master_carton_qty"),
        require_recv_master_carton_dims=_flag(product, "require_recv_master_carton_dims"),
        require_recv_master_carton_weight=_flag(product, "require_recv_master_carton_weight"),
        track_batch=_flag(product, "track_batch"),
        track_expiry=_flag(product, "track_expiry"),
        track_serial=_flag(product, "track_serial"),
    )


def resolve_effective_receiving_requirements(
    product: Product,
    wms_settings: WmsSettings | None = None,
) -> EffectiveReceivingRequirements:
    if wms_settings is None or not _flag(wms_settings, "validation_policy_migrated"):
        return _legacy_requirements(product)

    req_dims = _flag(wms_settings, "validation_require_dimensions") and not _flag(
        product, "validation_skip_dimensions"
    )

    def master(global_name: str, skip_name: str) -> bool:
        return _flag(wms_settings, global_name) and not _flag(product, skip_name)

    return EffectiveReceivingRequirements(
        require_recv_height=req_dims,
        require_recv_width=req_dims,
        require_recv_length=req_dims,
        require_recv_weight=master("validation_require_weight", "validation_skip_weight"),
        require_recv_master_carton=master(
            "validation_require_master_carton", "validation_skip_master_carton"
        ),
        require_recv_master_carton_ean=master(
            "validation_require_master_carton_ean", "validation_skip_master_carton_ean"
        ),
        require_recv_master_carton_qty=master(
            "validation_require_master_carton_qty", "validation_skip_master_carton_qty"
        ),
        require_recv_master_carton_dims=master(
            "validation_require_master_carton_dims", "validation_skip_master_carton_dims"
        ),
        require_recv_master_carton_weight=master(
            "validation_require_master_carton_weight", "validation_skip_master_carton_weight"
        ),
        track_batch=master("validation_require_batch", "validation_skip_batch"),
        track_expiry=master("validation_require_expiry", "validation_skip_expiry"),
        track_serial=master("validation_require_serial", "validation_skip_serial"),
    )


def effective_track_batch(product: Product, wms_settings: WmsSettings | None = None) -> bool:
    return resolve_effective_receiving_requirements(product, wms_settings).track_batch


def effective_track_expiry(product: Product, wms_settings: WmsSettings | None = None) -> bool:
    return resolve_effective_receiving_requirements(product, wms_settings).track_expiry


def effective_track_serial(product: Product, wms_settings: WmsSettings | None = None) -> bool:
    return resolve_effective_receiving_requirements(product, wms_settings).track_serial


def load_wms_settings_for_product(
    db,
    *,
    tenant_id: int,
    warehouse_id: Optional[int] = None,
) -> WmsSettings | None:
    from .inventory_management_policy_service import get_or_create_wms_settings_row
    from .tenant_default_warehouse import resolve_tenant_default_warehouse_id

    try:
        wh = int(warehouse_id) if warehouse_id is not None else resolve_tenant_default_warehouse_id(db, tenant_id)
    except ValueError:
        return None
    return get_or_create_wms_settings_row(db, tenant_id=int(tenant_id), warehouse_id=wh)
