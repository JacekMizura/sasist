"""
Model: Label Template Group

Groups label templates by type (e.g. Product → Standard, Promotion, Cartons).
"""

from sqlalchemy import Column, String, ForeignKey, Integer
from sqlalchemy.orm import relationship
from ..database import Base
from .base import BaseModelMixin


class LabelTemplateGroup(Base, BaseModelMixin):
    __tablename__ = "label_template_groups"

    tenant_id = Column(
        Integer,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    template_type = Column(String(32), nullable=False, index=True)  # location | product | cart | basket | order
    name = Column(String(128), nullable=False)

    templates = relationship(
        "SavedLabelTemplate",
        back_populates="group",
        foreign_keys="SavedLabelTemplate.group_id",
    )
