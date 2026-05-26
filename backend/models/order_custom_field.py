"""Konfigurowalne dodatkowe pola nagłówka zamówienia (nie atrybuty produktów)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from ..database import Base


class OrderCustomField(Base):
    """Definicja pola — globalna w obrębie tenant + warehouse."""

    __tablename__ = "order_custom_fields"
    __table_args__ = (UniqueConstraint("tenant_id", "warehouse_id", "slug", name="uq_ocf_tenant_wh_slug"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)

    name = Column(String(256), nullable=False)
    slug = Column(String(128), nullable=False, index=True)
    #: TEXT | NUMBER | FILES | SELECT_SINGLE | SELECT_MULTI | SALES_DOCUMENT | SHIPPING_LABEL
    type = Column(String(32), nullable=False, index=True)

    settings_json = Column(Text, nullable=True)
    icon_file_id = Column(Integer, nullable=True)

    sort_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)

    options = relationship(
        "OrderCustomFieldOption",
        back_populates="field",
        cascade="all, delete-orphan",
        order_by="OrderCustomFieldOption.sort_order",
    )
    values = relationship("OrderCustomFieldValue", back_populates="field", cascade="all, delete-orphan")


class OrderCustomFieldOption(Base):
    """Opcje dla SELECT_* — osobna tabela."""

    __tablename__ = "order_custom_field_options"

    id = Column(Integer, primary_key=True, autoincrement=True)
    field_id = Column(Integer, ForeignKey("order_custom_fields.id", ondelete="CASCADE"), nullable=False, index=True)

    label = Column(String(512), nullable=False)
    icon_file_id = Column(Integer, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)

    field = relationship("OrderCustomField", back_populates="options")


class OrderCustomFieldValue(Base):
    """Wartość pola dla konkretnego zamówienia."""

    __tablename__ = "order_custom_field_values"
    __table_args__ = (UniqueConstraint("order_id", "field_id", name="uq_ocfv_order_field"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    field_id = Column(Integer, ForeignKey("order_custom_fields.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)

    value_string = Column(Text, nullable=True)
    value_number = Column(Float, nullable=True)
    #: JSON: multi-select ids, file descriptors, document picks, przyszłe reguły
    value_json = Column(Text, nullable=True)

    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)

    order = relationship("Order", back_populates="custom_field_values")
    field = relationship("OrderCustomField", back_populates="values")
