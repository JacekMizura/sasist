"""Warehouse-level terminal scan policy for WMS picking."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from ..database import Base


class WmsPickingTerminalSettings(Base):
    __tablename__ = "wms_picking_terminal_settings"
    __table_args__ = (UniqueConstraint("tenant_id", "warehouse_id", name="uq_wms_pick_terminal_tenant_wh"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)

    #: Operator must scan product EAN at least once before confirming a pick (manual qty alone insufficient).
    require_product_scan_at_least_once = Column(Boolean, nullable=False, default=True)
    #: Always require an explicit location scan before pick (even for single-location products).
    require_location_scan = Column(Boolean, nullable=False, default=False)
    #: When true, multi-location products do NOT force location scan (unless require_location_scan).
    disable_force_location_scan_when_many_locations = Column(Boolean, nullable=False, default=False)
    #: When false, reserve/buffer locations are excluded from pick candidates.
    allow_reserve_location_picking = Column(Boolean, nullable=False, default=False)
    #: When true, products without any scannable code (EAN / barcode / SKU) may still be picked.
    allow_products_without_ean = Column(Boolean, nullable=False, default=False)
    #: Lista zbierania — widoczność pól na kafelkach (JSON: show_product_image, show_ean, …).
    list_display_json = Column(Text, nullable=False, default="{}")
    #: Po prawidłowym finalize zbioru: ``assign_new_batch`` | ``back_to_list`` | ``stay_here``.
    after_batch_complete_action = Column(String(32), nullable=False, default="back_to_list")

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)
