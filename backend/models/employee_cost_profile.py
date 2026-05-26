"""Employer-side cost assumptions for operational analytics (not payroll)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint

from ..database import Base


class EmployeeCostProfile(Base):
    __tablename__ = "employee_cost_profiles"
    __table_args__ = (UniqueConstraint("user_id", name="uq_employee_cost_profile_user"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True, index=True)

    #: uop | zlecenie | b2b
    contract_type = Column(String(16), nullable=False, default="uop")

    gross_monthly_pln = Column(Float, nullable=True)
    #: Total monthly cost to employer (stored; may be auto-calculated).
    employer_total_monthly_pln = Column(Float, nullable=True)
    net_monthly_pln = Column(Float, nullable=True)

    default_hours_per_month = Column(Float, nullable=False, default=168.0)
    hourly_pln = Column(Float, nullable=True)
    employer_hourly_pln = Column(Float, nullable=True)

    ppk_enabled = Column(Boolean, nullable=False, default=False)
    #: Optional override for bundled employer-side rate on top of gross (UoP).
    employer_side_rate_override = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)
