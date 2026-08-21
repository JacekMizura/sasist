"""Sale document line snapshot — immutable commercial lines for FV/PA and KOR."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import relationship

from ..database import Base

LINE_KIND_PRODUCT = "PRODUCT"
LINE_KIND_SHIPPING = "SHIPPING"


class SaleDocumentItem(Base):
    """
    Persisted line for a sale document.

    Value model for CORRECTION rows: **signed delta**
    (quantity/line_* negative = credit reducing the original sale).
    PRIMARY rows use positive quantities matching the original invoice.

    ``line_kind``:
    - PRODUCT — commercial product line (may have order_item_id)
    - SHIPPING — immutable shipping cost snapshot (no order_item_id)
    """

    __tablename__ = "sale_document_items"
    __table_args__ = (
        UniqueConstraint(
            "sale_document_id",
            "order_item_id",
            "position",
            name="uq_sale_document_items_doc_order_item_pos",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    sale_document_id = Column(
        String(36),
        ForeignKey("sale_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    #: PRODUCT | SHIPPING — legacy rows without column migrate to PRODUCT.
    line_kind = Column(
        String(16),
        nullable=False,
        default=LINE_KIND_PRODUCT,
        server_default=text("'PRODUCT'"),
        index=True,
    )
    #: Stable link to original order line (required for product correction mapping).
    #: NULL for SHIPPING lines.
    order_item_id = Column(Integer, ForeignKey("order_items.id", ondelete="SET NULL"), nullable=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True)
    position = Column(Integer, nullable=False, default=0)
    name = Column(String(512), nullable=False, default="")
    sku = Column(String(128), nullable=True)
    #: Signed: primary > 0; correction delta typically < 0.
    quantity = Column(Float, nullable=False, default=0.0)
    unit_net = Column(Float, nullable=True)
    unit_gross = Column(Float, nullable=True)
    vat_percent = Column(Float, nullable=False, default=23.0)
    line_net = Column(Float, nullable=False, default=0.0)
    line_vat = Column(Float, nullable=False, default=0.0)
    line_gross = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)

    sale_document = relationship("SaleDocument", back_populates="items")
