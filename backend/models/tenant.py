"""
MODEL: Tenant

Najwyższy poziom w architekturze SaaS.
Każdy klient systemu to osobny tenant.
"""

from sqlalchemy import Column, String, Integer, ForeignKey, Text
from sqlalchemy.orm import relationship
from ..database import Base
from .base import BaseModelMixin


class Tenant(Base, BaseModelMixin):
    __tablename__ = "tenants"

    name = Column(String, nullable=False)

    # Single-warehouse UX: when set, WMS resolves this id (must be linked via tenant_warehouses).
    default_warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True)

    # Optional business profile (buyer on supplier-order PDF, etc.)
    company_name = Column(String, nullable=True)
    tax_id = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    country = Column(String, nullable=True)
    city = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)
    street = Column(Text, nullable=True)
    address = Column(Text, nullable=True)

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

    bundles = relationship(
        "Bundle",
        back_populates="tenant",
        cascade="all, delete-orphan",
    )

    # Child rows use Manufacturer.tenant_id → tenants.id (not a self-referential link).
    manufacturers = relationship(
        "Manufacturer",
        back_populates="tenant",
        foreign_keys="Manufacturer.tenant_id",
        cascade="all, delete-orphan",
    )

    customers = relationship(
        "Customer",
        back_populates="tenant",
        foreign_keys="Customer.tenant_id",
        cascade="all, delete-orphan",
    )

    suppliers = relationship(
        "Supplier",
        back_populates="tenant",
        foreign_keys="Supplier.tenant_id",
        cascade="all, delete-orphan",
    )

    inbound_deliveries = relationship(
        "InboundDelivery",
        back_populates="tenant",
        foreign_keys="InboundDelivery.tenant_id",
        cascade="all, delete-orphan",
    )
    purchase_orders = relationship(
        "PurchaseOrder",
        back_populates="tenant",
        foreign_keys="PurchaseOrder.tenant_id",
        cascade="all, delete-orphan",
    )
    purchasing_alert_rules = relationship(
        "PurchasingAlertRule",
        back_populates="tenant",
        foreign_keys="PurchasingAlertRule.tenant_id",
        cascade="all, delete-orphan",
    )
    purchasing_alert_events = relationship(
        "PurchasingAlertEvent",
        back_populates="tenant",
        foreign_keys="PurchasingAlertEvent.tenant_id",
        cascade="all, delete-orphan",
    )
    purchasing_auto_drafts = relationship(
        "PurchasingAutoDraft",
        back_populates="tenant",
        foreign_keys="PurchasingAutoDraft.tenant_id",
        cascade="all, delete-orphan",
    )
    purchase_auto_rules = relationship(
        "PurchaseAutoRule",
        back_populates="tenant",
        foreign_keys="PurchaseAutoRule.tenant_id",
        cascade="all, delete-orphan",
    )
    purchase_auto_runs = relationship(
        "PurchaseAutoRun",
        back_populates="tenant",
        foreign_keys="PurchaseAutoRun.tenant_id",
        cascade="all, delete-orphan",
    )

    stock_documents = relationship(
        "StockDocument",
        back_populates="tenant",
        foreign_keys="StockDocument.tenant_id",
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

