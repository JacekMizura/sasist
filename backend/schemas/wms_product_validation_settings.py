from pydantic import BaseModel


class WmsProductValidationSettingsRead(BaseModel):
    tenant_id: int
    warehouse_id: int
    validation_policy_migrated: bool = False
    require_dimensions: bool = False
    require_weight: bool = False
    require_batch: bool = False
    require_expiry: bool = False
    require_serial: bool = False
    require_master_carton: bool = False
    require_master_carton_ean: bool = False
    require_master_carton_qty: bool = False
    require_master_carton_dims: bool = False
    require_master_carton_weight: bool = False


class WmsProductValidationSettingsSave(BaseModel):
    tenant_id: int
    warehouse_id: int | None = None
    require_dimensions: bool = False
    require_weight: bool = False
    require_batch: bool = False
    require_expiry: bool = False
    require_serial: bool = False
    require_master_carton: bool = False
    require_master_carton_ean: bool = False
    require_master_carton_qty: bool = False
    require_master_carton_dims: bool = False
    require_master_carton_weight: bool = False
