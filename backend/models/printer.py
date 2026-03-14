"""
MODEL: Printer

Represents a physical printer. Links to a PrinterProfile for calibration (offset/scale).
Optional warehouse association. Calibration is applied only during export/printing.
"""

from sqlalchemy import Column, Integer, String, Text, ForeignKey
from sqlalchemy.orm import relationship

from ..database import Base
from .base import BaseModelMixin


class Printer(Base, BaseModelMixin):
    __tablename__ = "printers"

    tenant_id = Column(Integer, nullable=False, index=True)
    name = Column(String(120), nullable=False)
    profile_id = Column(Integer, ForeignKey("printer_profiles.id", ondelete="SET NULL"), nullable=True, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True)
    connection_type = Column(String(60), nullable=True)
    description = Column(Text, nullable=True)
    provider = Column(String(32), nullable=True)
    system_printer_name = Column(String(120), nullable=True)

    profile = relationship("PrinterProfile", backref="printers", foreign_keys=[profile_id])
    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])
