"""
MODEL: Label Pack and Label Pack Item

Label packs define groups of templates with quantity rules (e.g. 1 cart label + N basket labels).
"""

from sqlalchemy import Column, String, ForeignKey, Integer
from sqlalchemy.orm import relationship
from ..database import Base
from .base import BaseModelMixin


class LabelPack(Base, BaseModelMixin):
    __tablename__ = "label_packs"

    name = Column(String, nullable=False)
    tenant_id = Column(
        Integer,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    tenant = relationship("Tenant", back_populates="label_packs")
    items = relationship(
        "LabelPackItem",
        back_populates="pack",
        cascade="all, delete-orphan",
        order_by="LabelPackItem.id",
    )


class LabelPackItem(Base, BaseModelMixin):
    __tablename__ = "label_pack_items"

    pack_id = Column(
        Integer,
        ForeignKey("label_packs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    template_id = Column(
        Integer,
        ForeignKey("saved_label_templates.id", ondelete="CASCADE"),
        nullable=False,
    )
    # cart | basket | location | product
    object_type = Column(String(32), nullable=False)
    # single | per_basket | per_location | per_product
    quantity_type = Column(String(32), nullable=False)

    pack = relationship("LabelPack", back_populates="items")
    template = relationship("SavedLabelTemplate", foreign_keys=[template_id])
