"""Persisted packing replacement-label (etykieta zastępcza) state per order."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from ..database import Base

# Lifecycle statuses (canonical)
REPLACEMENT_STATUS_CREATED = "created"
REPLACEMENT_STATUS_AWAITING_COURIER = "awaiting_courier"
REPLACEMENT_STATUS_COURIER_GENERATED = "courier_generated"
REPLACEMENT_STATUS_REGENERATE_FAILED = "regenerate_failed"

REPLACEMENT_STATUSES = frozenset(
    {
        REPLACEMENT_STATUS_CREATED,
        REPLACEMENT_STATUS_AWAITING_COURIER,
        REPLACEMENT_STATUS_COURIER_GENERATED,
        REPLACEMENT_STATUS_REGENERATE_FAILED,
    }
)


class WmsPackingReplacementLabel(Base):
    """
    Awaryjna etykieta zastępcza powiązana z zamówieniem.

    ``snapshot_json`` trzyma wybory pakowania (opakowanie, paczki, metoda dostawy, …)
    potrzebne do późniejszego wygenerowania właściwego listu kurierskiego.
    """

    __tablename__ = "wms_packing_replacement_labels"
    __table_args__ = (
        UniqueConstraint("tenant_id", "barcode", name="uq_wms_pack_repl_label_tenant_barcode"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)

    #: Unique scan code printed on the replacement label (e.g. RPL-000123).
    barcode = Column(String(64), nullable=False, index=True)
    status = Column(String(32), nullable=False, default=REPLACEMENT_STATUS_AWAITING_COURIER, index=True)

    template_id = Column(Integer, ForeignKey("saved_label_templates.id", ondelete="SET NULL"), nullable=True)
    snapshot_json = Column(Text, nullable=False, default="{}")
    last_error = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
