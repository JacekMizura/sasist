"""Szablony eksportu CSV — konfiguracja pól per typ encji (tenant)."""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text

from ..database import Base


class ExportTemplate(Base):
    __tablename__ = "export_templates"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(256), nullable=False)
    type = Column(String(32), nullable=False, index=True)
    fields_json = Column(Text, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
