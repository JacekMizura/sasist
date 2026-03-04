"""
MODEL: Saved Label Template

Stores label template JSON per tenant for "Biblioteka szablonów".
"""

from sqlalchemy import Column, String, ForeignKey, Integer, Text
from sqlalchemy.orm import relationship
from ..database import Base
from .base import BaseModelMixin


class SavedLabelTemplate(Base, BaseModelMixin):
    __tablename__ = "saved_label_templates"

    tenant_id = Column(
        Integer,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String, nullable=False)
    template_json = Column(Text, nullable=False)  # JSON string of LabelTemplate

    tenant = relationship("Tenant", back_populates="saved_label_templates")

