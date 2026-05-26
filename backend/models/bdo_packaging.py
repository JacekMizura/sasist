"""BDO — zakupy, spisy, korekty; materiały = asortyment (packaging_materials + cartons)."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint

from ..database import Base


class BdoPackagingPurchase(Base):
    __tablename__ = "bdo_packaging_purchases"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    #: ``packaging`` → packaging_materials.id ; ``carton`` → cartons.id
    wm_kind = Column(String(16), nullable=False, index=True)
    wm_id = Column(String(36), nullable=False, index=True)

    purchase_date = Column(Date, nullable=False, index=True)
    supplier_name = Column(String(512), nullable=False, server_default="")
    qty = Column(Float, nullable=False)
    unit_cost = Column(Float, nullable=True)
    total = Column(Float, nullable=True)
    document_no = Column(String(256), nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class BdoStockCountSession(Base):
    __tablename__ = "bdo_stock_count_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)

    count_date = Column(Date, nullable=False, index=True)
    period_label = Column(String(32), nullable=True)
    notes = Column(Text, nullable=True)
    created_by_label = Column(String(256), nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class BdoStockCountLine(Base):
    __tablename__ = "bdo_stock_count_lines"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("bdo_stock_count_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    wm_kind = Column(String(16), nullable=False, index=True)
    wm_id = Column(String(36), nullable=False, index=True)

    system_stock = Column(Float, nullable=False)
    counted_stock = Column(Float, nullable=False)
    difference = Column(Float, nullable=False)
    notes = Column(Text, nullable=True)

    __table_args__ = (UniqueConstraint("session_id", "wm_kind", "wm_id", name="uq_bdo_count_line_session_wm"),)


class BdoCorrection(Base):
    __tablename__ = "bdo_corrections"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    wm_kind = Column(String(16), nullable=False, index=True)
    wm_id = Column(String(36), nullable=False, index=True)

    correction_date = Column(Date, nullable=False, index=True)
    qty = Column(Float, nullable=False)
    reason = Column(String(64), nullable=False)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class BdoSettings(Base):
    __tablename__ = "bdo_settings"

    tenant_id = Column(Integer, ForeignKey("tenants.id"), primary_key=True)

    reporting_company_name = Column(String(512), nullable=True)
    registration_numbers = Column(Text, nullable=True)
    default_methodology_text = Column(Text, nullable=True)
    allow_negative_stock = Column(Boolean, nullable=False, server_default="0", default=False)

    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class BdoAuditLog(Base):
    __tablename__ = "bdo_audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    action = Column(String(128), nullable=False)
    detail = Column(Text, nullable=True)
    user_label = Column(String(256), nullable=True)
