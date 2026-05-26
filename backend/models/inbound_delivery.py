"""Inbound delivery (dostawa) + line items — future-ready for PO / replenishment."""

from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text, Float, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime

from ..database import Base


class InboundDelivery(Base):
    __tablename__ = "deliveries"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False, index=True)
    #: Optional link to formal purchase order (Generator → PO → inbound delivery).
    purchase_order_id = Column(Integer, ForeignKey("purchase_orders.id", ondelete="SET NULL"), nullable=True, index=True)

    name = Column(String(512), nullable=True)
    status = Column(String(32), nullable=False, default="draft", index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    expected_date = Column(DateTime, nullable=True)
    received_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)

    tenant = relationship("Tenant", back_populates="inbound_deliveries", foreign_keys=[tenant_id])
    supplier = relationship("Supplier", back_populates="deliveries", foreign_keys=[supplier_id])
    purchase_order = relationship(
        "PurchaseOrder",
        back_populates="linked_deliveries",
        foreign_keys=[purchase_order_id],
    )
    items = relationship(
        "DeliveryItem",
        back_populates="delivery",
        cascade="all, delete-orphan",
        order_by="DeliveryItem.id",
    )
    stock_documents = relationship(
        "StockDocument",
        back_populates="delivery",
        foreign_keys="StockDocument.delivery_id",
    )


class DeliveryItem(Base):
    __tablename__ = "delivery_items"

    id = Column(Integer, primary_key=True)
    delivery_id = Column(Integer, ForeignKey("deliveries.id", ondelete="CASCADE"), nullable=False, index=True)
    #: Set when line is a catalog product; null when ``wm_kind`` + ``wm_id`` reference warehouse materials.
    product_id = Column(Integer, ForeignKey("products.id", ondelete="RESTRICT"), nullable=True, index=True)
    #: ``carton`` | ``packaging`` — mutually exclusive with ``product_id``.
    wm_kind = Column(String(16), nullable=True, index=True)
    wm_id = Column(String(36), nullable=True, index=True)

    quantity_ordered = Column(Float, nullable=False)
    quantity_received = Column(Float, nullable=False, default=0)
    purchase_price = Column(Float, nullable=True)
    #: When True, quantity changes do not auto-adjust ``purchase_price`` (user override).
    purchase_price_manual = Column(Boolean, nullable=False, default=False)

    #: product | carton | packaging_material | unknown — denormalized for reporting / PDF.
    line_item_type = Column(String(32), nullable=True)
    line_item_ref_id = Column(String(64), nullable=True)
    #: Frozen catalog labels at line creation (survives later catalog edits).
    item_name = Column(String(512), nullable=True)
    item_sku = Column(String(256), nullable=True)
    item_ean = Column(String(128), nullable=True)
    item_photo_url = Column(String(512), nullable=True)
    item_unit = Column(String(64), nullable=True)
    source_label = Column(String(64), nullable=True)

    delivery = relationship("InboundDelivery", back_populates="items", foreign_keys=[delivery_id])
    product = relationship("Product", back_populates="delivery_items", foreign_keys=[product_id])
