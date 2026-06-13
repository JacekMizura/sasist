"""P5.2 — consolidation exception alerts."""

from __future__ import annotations

from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base
from .base import BaseModelMixin


class OrderConsolidationAlert(Base, BaseModelMixin):
    __tablename__ = "order_consolidation_alerts"

    plan_id = Column(
        Integer, ForeignKey("order_consolidation_plans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_item_id = Column(
        Integer,
        ForeignKey("order_consolidation_plan_items.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    severity = Column(String(16), nullable=False, default="INFO", index=True)
    code = Column(String(64), nullable=False, index=True)
    message = Column(Text, nullable=False)
    resolved = Column(Boolean, nullable=False, default=False, index=True)

    plan = relationship("OrderConsolidationPlan", backref="alerts")
    plan_item = relationship("OrderConsolidationPlanItem", backref="alerts")
