"""
MODEL: Printer Profile

Stores printer calibration (offset and scale) per tenant for label export/printing.
Calibration is applied only during export/printing, not in preview or editing.
"""

from sqlalchemy import Column, Float, Integer, String, ForeignKey
from sqlalchemy.orm import relationship

from ..database import Base
from .base import BaseModelMixin


class PrinterProfile(Base, BaseModelMixin):
    __tablename__ = "printer_profiles"

    tenant_id = Column(Integer, nullable=False, index=True)
    name = Column(String(120), nullable=False)
    dpi = Column(Integer, nullable=True)
    offset_x_mm = Column(Float, default=0.0)
    offset_y_mm = Column(Float, default=0.0)
    scale = Column(Float, default=1.0)
    agent_printer_id = Column(
        Integer,
        ForeignKey("agent_printers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    agent_printer = relationship("AgentPrinter", foreign_keys=[agent_printer_id])
