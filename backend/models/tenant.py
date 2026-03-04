"""
MODEL: Tenant

Najwyższy poziom w architekturze SaaS.
Każdy klient systemu to osobny tenant.
"""

from sqlalchemy import Column, String
from sqlalchemy.orm import relationship
from ..database import Base
from .base import BaseModelMixin


class Tenant(Base, BaseModelMixin):
    __tablename__ = "tenants"

    name = Column(String, nullable=False)

    # =============================
    # RELACJE
    # =============================

    warehouses = relationship(
        "Warehouse",
        back_populates="tenant",
        cascade="all, delete"
    )

    carts = relationship(
        "Cart",
        back_populates="tenant",
        cascade="all, delete"
    )

    # --------------------------------------
    # RELACJA DO STORAGE UNITS
    # --------------------------------------
    storage_units = relationship(
        "StorageUnit",
        back_populates="tenant",
        cascade="all, delete"
    )

    saved_label_templates = relationship(
        "SavedLabelTemplate",
        back_populates="tenant",
        cascade="all, delete-orphan",
    )

