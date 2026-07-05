"""
Document series (serie dokumentów) — numbering, templates, company block, status hooks.

Status FKs reference ``order_ui_statuses`` (panel order statuses), same as WMS packing settings.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import relationship

from ..database import Base


class DocumentSeries(Base):
    __tablename__ = "document_series"
    __table_args__ = (
        UniqueConstraint("tenant_id", "warehouse_id", "name", name="uq_document_series_tenant_wh_name"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)

    name = Column(String(256), nullable=False)
    prefix = Column(String(64), nullable=False, default="")
    suffix = Column(String(64), nullable=False, default="")
    color = Column(String(16), nullable=False, default="#64748b")

    #: SALE | WAREHOUSE | CORRECTION (DB column ``type`` — Python attr ``series_type``).
    series_type = Column("type", String(24), nullable=False, index=True)
    #: Subtype depends on ``type`` (INVOICE/RECEIPT, WZ/PZ/…, CORRECTION)
    subtype = Column(String(32), nullable=False, index=True)

    correction_series_id = Column(
        String(36),
        ForeignKey("document_series.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    #: Linked WZ series for SALE series (Seria dokumentu magazynowego).
    warehouse_document_series_id = Column(
        String(36),
        ForeignKey("document_series.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    print_template = Column(String(512), nullable=False, default="")
    #: Preset document layout id for PDF/HTML generation (optional; falls back to ``print_template`` path/slug).
    print_template_id = Column(Integer, nullable=True, index=True)
    #: Optional override — published Document Template version for PDF/HTML (DTE).
    document_template_version_id = Column(Integer, nullable=True, index=True)
    document_template_variant_code = Column(String(32), nullable=True)

    email_notification_enabled = Column(Boolean, nullable=False, default=False)

    #: ALWAYS_DELETE | ASK
    delete_mode = Column(String(24), nullable=False, default="ASK")

    #: Optional VAT logic key (nullable)
    vat_source = Column(String(32), nullable=True)
    #: How VAT is applied to shipping / payment fee lines (Sellasist-style presets).
    vat_calc_shipping = Column(String(32), nullable=False, default="DEFAULT")
    vat_calc_payment = Column(String(32), nullable=False, default="DEFAULT")
    #: Optional default VAT rate for this series when using fixed/manual VAT (percent 0–100).
    vat_rate_percent = Column(Integer, nullable=True)
    #: ORDER_DATE | DOCUMENT_DATE | DELIVERY_DATE | MANUAL
    sale_date_source = Column(String(32), nullable=False, default="ORDER_DATE")

    count_shipping_cost_always = Column(Boolean, nullable=False, default=False)
    shipping_cost_name = Column(String(128), nullable=False, default="Koszt wysyłki")

    payment_term_default = Column(String(128), nullable=False, default="")

    #: ORDER | SERIES | MANUAL
    currency_source = Column(String(24), nullable=False, default="ORDER")
    auto_currency_conversion = Column(Boolean, nullable=False, default=False)

    additional_fields_template = Column(Text, nullable=True)

    disable_customer_validation = Column(Boolean, nullable=False, default=False)
    allow_empty_customer = Column(Boolean, nullable=False, default=False)

    warehouse_effect = Column(Boolean, nullable=False, default=False)

    #: Panel order status (``order_ui_statuses``) — same concept as /order-statuses list.
    status_on_create_id = Column(Integer, ForeignKey("order_ui_statuses.id", ondelete="SET NULL"), nullable=True)
    status_on_delete_id = Column(Integer, ForeignKey("order_ui_statuses.id", ondelete="SET NULL"), nullable=True)
    status_on_error_id = Column(Integer, ForeignKey("order_ui_statuses.id", ondelete="SET NULL"), nullable=True)
    status_on_update_id = Column(Integer, ForeignKey("order_ui_statuses.id", ondelete="SET NULL"), nullable=True)

    numbering_start = Column(Integer, nullable=False, default=1)
    numbering_format = Column(String(256), nullable=False, default="{PREFIX}{NUMBER}")
    reset_each_period = Column(Boolean, nullable=False, default=False)
    #: Short warehouse/location code for {WAREHOUSE}/{CODE} tokens in numbering_format.
    code = Column(String(32), nullable=False, default="")
    padding_length = Column(Integer, nullable=False, default=0)
    yearly_reset = Column(Boolean, nullable=False, default=False)
    monthly_reset = Column(Boolean, nullable=False, default=False)
    is_default = Column(Boolean, nullable=False, default=False, index=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    last_number_period = Column(String(16), nullable=True)

    notes = Column(Text, nullable=True)

    #: Z-PZ only: gdy True — jeden dokument Z-PZ na dzień, dopisywanie pozycji ze wszystkich RMZ.
    collective_return_receipt = Column(Boolean, nullable=False, default=True, server_default=text("1"))

    company_name = Column(String(256), nullable=True)
    company_street = Column(String(256), nullable=True)
    company_house_number = Column(String(32), nullable=True)
    company_apartment_number = Column(String(32), nullable=True)
    company_address = Column(String(512), nullable=True)
    company_city = Column(String(128), nullable=True)
    company_zip = Column(String(32), nullable=True)
    company_country = Column(String(128), nullable=True)
    company_nip = Column(String(32), nullable=True)
    company_regon = Column(String(32), nullable=True)
    company_bank = Column(String(256), nullable=True)
    company_iban = Column(String(64), nullable=True)
    company_bic = Column(String(32), nullable=True)
    company_email = Column(String(256), nullable=True)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)

    tenant = relationship("Tenant")
    warehouse = relationship("Warehouse")
    correction_series = relationship("DocumentSeries", remote_side=[id], foreign_keys=[correction_series_id])
    warehouse_document_series = relationship(
        "DocumentSeries",
        remote_side=[id],
        foreign_keys=[warehouse_document_series_id],
    )
    status_on_create = relationship("OrderUiStatus", foreign_keys=[status_on_create_id])
    status_on_delete = relationship("OrderUiStatus", foreign_keys=[status_on_delete_id])
    status_on_error = relationship("OrderUiStatus", foreign_keys=[status_on_error_id])
    status_on_update = relationship("OrderUiStatus", foreign_keys=[status_on_update_id])
