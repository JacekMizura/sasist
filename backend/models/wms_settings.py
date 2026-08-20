"""
WMS Settings per tenant + warehouse.

Controls which return workflow operator should follow.
"""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from ..database import Base


class WmsSettings(Base):
    __tablename__ = "wms_settings"
    __table_args__ = (UniqueConstraint("tenant_id", "warehouse_id", name="uq_wms_settings_tenant_warehouse"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)

    # simple | two_step | advanced — legacy projection only (SSOT: refund_processing + require_*)
    returns_mode = Column(String(24), nullable=False, default="simple")

    require_photos = Column(Boolean, nullable=False, default=False)
    require_condition = Column(Boolean, nullable=False, default=False)
    enable_refund = Column(Boolean, nullable=False, default=False)
    #: disabled | warehouse | office — live SSOT for refund stage
    refund_processing = Column(String(24), nullable=True)

    z_pz_print_label_on_close = Column(Boolean, nullable=False, default=False)
    z_pz_label_template_id = Column(Integer, nullable=True)

    #: OFF | OPTIONAL | REQUIRED — manufactured FG component recovery on RMZ
    manufactured_component_recovery_mode = Column(String(24), nullable=False, default="OFF")
    #: STANDARD_PUTAWAY | DEFAULT_LOCATION
    manufactured_recovery_receipt_mode = Column(String(32), nullable=False, default="STANDARD_PUTAWAY")
    manufactured_recovery_location_id = Column(
        Integer,
        ForeignKey("locations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # DOCUMENTS_ONLY | HYBRID | EXTERNAL_INVENTORY (reserved — not active in UI)
    inventory_management_mode = Column(String(32), nullable=False, default="HYBRID")

    # Global product validation (WMS receiving master-data + traceability)
    validation_policy_migrated = Column(Boolean, nullable=False, default=False, server_default="false")
    validation_require_dimensions = Column(Boolean, nullable=False, default=False, server_default="false")
    validation_require_weight = Column(Boolean, nullable=False, default=False, server_default="false")
    validation_require_batch = Column(Boolean, nullable=False, default=False, server_default="false")
    validation_require_expiry = Column(Boolean, nullable=False, default=False, server_default="false")
    validation_require_serial = Column(Boolean, nullable=False, default=False, server_default="false")
    validation_require_master_carton = Column(Boolean, nullable=False, default=False, server_default="false")
    validation_require_master_carton_ean = Column(Boolean, nullable=False, default=False, server_default="false")
    validation_require_master_carton_qty = Column(Boolean, nullable=False, default=False, server_default="false")
    validation_require_master_carton_dims = Column(Boolean, nullable=False, default=False, server_default="false")
    validation_require_master_carton_weight = Column(Boolean, nullable=False, default=False, server_default="false")

    production_terminal_display_json = Column(String, nullable=True)
    production_terminal_required_json = Column(String, nullable=True)
    production_forecast_json = Column(String, nullable=True)

    production_reservation_json = Column(String, nullable=True)
    production_traceability_json = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow)
