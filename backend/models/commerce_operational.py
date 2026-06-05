"""Operational sales models — sessions, workstations, payments (no POS naming)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base


class OperationalWorkstation(Base):
    """Counter / showroom / mobile terminal registry."""

    __tablename__ = "operational_workstations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    code = Column(String(64), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    operational_zone_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True)
    device_type = Column(String(32), nullable=True)  # scanner | printer | terminal | tablet
    printer_id = Column(Integer, nullable=True)
    scanner_type = Column(String(32), nullable=True)  # zebra | camera | keyboard
    fiscal_terminal_id = Column(Integer, nullable=True)
    zone_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True)
    is_active = Column(Integer, nullable=False, default=1)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class DirectSaleSession(Base):
    """Backend operational sales session — not a frontend-only cart."""

    __tablename__ = "direct_sale_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    operator_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)
    workstation_id = Column(Integer, ForeignKey("operational_workstations.id", ondelete="SET NULL"), nullable=True)
    operational_zone_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(16), nullable=False, default="ACTIVE", index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True)
    payment_context_json = Column(Text, nullable=True)
    expires_at = Column(DateTime, nullable=True, index=True)
    issue_strategy = Column(String(32), nullable=False, default="STRICT_LOCATION")
    reservation_scope = Column(String(16), nullable=False, default="SESSION")
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    suspended_at = Column(DateTime, nullable=True)
    last_activity_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    metadata_json = Column(Text, nullable=True)

    lines = relationship(
        "DirectSaleSessionLine",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="DirectSaleSessionLine.sort_order",
    )


class DirectSaleSessionLine(Base):
    __tablename__ = "direct_sale_session_lines"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(
        Integer,
        ForeignKey("direct_sale_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    quantity = Column(Float, nullable=False, default=1.0)
    unit_price = Column(Float, nullable=True)
    discount_amount = Column(Float, nullable=False, default=0.0)
    source_location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    suggested_location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    stock_reservation_id = Column(Integer, ForeignKey("stock_reservations.id", ondelete="SET NULL"), nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    metadata_json = Column(Text, nullable=True)

    session = relationship("DirectSaleSession", back_populates="lines")


class Payment(Base):
    """Order payment header — state machine, not boolean flags."""

    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    direct_sale_session_id = Column(Integer, ForeignKey("direct_sale_sessions.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(24), nullable=False, default="PENDING", index=True)
    method = Column(String(24), nullable=False, default="CASH")
    amount = Column(Float, nullable=False, default=0.0)
    currency = Column(String(8), nullable=False, default="PLN")
    captured_at = Column(DateTime, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    performed_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    device_id = Column(Integer, ForeignKey("operational_workstations.id", ondelete="SET NULL"), nullable=True)
    payment_provider = Column(String(32), nullable=True)  # CASH | STRIPE | PAYU | TERMINAL
    external_transaction_id = Column(String(128), nullable=True)
    terminal_id = Column(String(64), nullable=True)
    authorization_reference = Column(String(128), nullable=True)
    settlement_state = Column(String(24), nullable=True)  # PENDING | AUTHORIZED | SETTLED | FAILED
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    transactions = relationship("PaymentTransaction", back_populates="payment", cascade="all, delete-orphan")


class PaymentTransaction(Base):
    """Tender lines — cash, card, BLIK, split, gateway refs."""

    __tablename__ = "payment_transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    payment_id = Column(Integer, ForeignKey("payments.id", ondelete="CASCADE"), nullable=False, index=True)
    method = Column(String(24), nullable=False)
    amount = Column(Float, nullable=False)
    status = Column(String(24), nullable=False, default="PENDING")
    external_ref = Column(String(128), nullable=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    payment = relationship("Payment", back_populates="transactions")
