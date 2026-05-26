"""Stored FX rates (NBP import + manual override) for purchasing / PO valuation."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String

from ..database import Base


class CurrencyExchangeRate(Base):
    """How many PLN for 1 unit of ``currency`` on ``rate_date`` (table A style, mid)."""

    __tablename__ = "currency_exchange_rates"

    id = Column(Integer, primary_key=True)
    #: When set, row applies only to that tenant (manual overrides). NULL = global NBP table.
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    currency = Column(String(8), nullable=False, index=True)
    rate_date = Column(Date, nullable=False, index=True)
    rate_to_pln = Column(Float, nullable=False)
    source = Column(String(16), nullable=False)  # nbp | manual

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
