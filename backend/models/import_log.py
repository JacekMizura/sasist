"""
MODEL: ImportLog

Records the result of each CSV import (products or orders) for display in the UI.
"""

from datetime import datetime

from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text
from ..database import Base


class ImportLog(Base):
    __tablename__ = "import_logs"

    id = Column(Integer, primary_key=True)

    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=True, index=True)

    type = Column(String, nullable=False)  # "products" or "orders"

    total_rows = Column(Integer, default=0)
    created = Column(Integer, default=0)
    updated = Column(Integer, default=0)
    skipped = Column(Integer, default=0)

    warnings = Column(Integer, default=0)
    errors = Column(Integer, default=0)

    message = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
