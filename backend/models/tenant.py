"""
MODEL: Tenant

Najwyższy poziom w architekturze SaaS.
Każdy klient systemu to osobny tenant.
"""

from sqlalchemy import Column, String, Integer, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base
from .base import BaseModelMixin


class Tenant(Base, BaseModelMixin):
    __tablename__ = "tenants"

    name = Column(String, nullable=False)

    # Default label templates (optional; if null, legacy barcode PDF is used)
    default_cart_template_id = Column(
        Integer,
        ForeignKey("saved_label_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    default_basket_template_id = Column(
        Integer,
        ForeignKey("saved_label_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    default_location_template_id = Column(
        Integer,
        ForeignKey("saved_label_templates.id", ondelete="SET NULL"),
        nullable=True,
    )

    # =============================
    # RELACJE
    # =============================

    tenant_warehouses = relationship(
        "TenantWarehouse",
        back_populates="tenant",
        cascade="all, delete-orphan",
        foreign_keys="TenantWarehouse.tenant_id",
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
        foreign_keys="SavedLabelTemplate.tenant_id",
        back_populates="tenant",
        cascade="all, delete-orphan",
    )

    label_packs = relationship(
        "LabelPack",
        back_populates="tenant",
        cascade="all, delete-orphan",
    )

    products = relationship(
        "Product",
        back_populates="tenant",
        cascade="all, delete-orphan",
    )

    inventory = relationship(
        "Inventory",
        back_populates="tenant",
        cascade="all, delete-orphan",
    )

    inventory_units = relationship(
        "InventoryUnit",
        back_populates="tenant",
        cascade="all, delete-orphan",
    )

    picks = relationship(
        "Pick",
        back_populates="tenant",
        cascade="all, delete-orphan",
    )

    pick_waves = relationship(
        "PickWave",
        back_populates="tenant",
        cascade="all, delete-orphan",
    )

    inventory_movements = relationship(
        "InventoryMovement",
        back_populates="tenant",
        cascade="all, delete-orphan",
    )

    stock = relationship(
        "Stock",
        back_populates="tenant",
        cascade="all, delete-orphan",
    )
    stock_reservations = relationship(
        "StockReservation",
        back_populates="tenant",
        cascade="all, delete-orphan",
    )
    stock_movements = relationship(
        "StockMovement",
        back_populates="tenant",
        cascade="all, delete-orphan",
    )
    pick_tasks = relationship(
        "PickTask",
        back_populates="tenant",
        cascade="all, delete-orphan",
    )

