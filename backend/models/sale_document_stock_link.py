"""Many-to-many link between commercial sale documents (PA/FV) and warehouse documents (WZ)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from ..database import Base


class SaleDocumentStockLink(Base):
    __tablename__ = "sale_document_stock_links"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sale_document_id = Column(
        String(36),
        ForeignKey("sale_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    stock_document_id = Column(
        Integer,
        ForeignKey("stock_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    #: WZ | CORRECTION | PARTIAL — supports multiple warehouse docs per sale document.
    link_type = Column(String(16), nullable=False, default="WZ", index=True)
    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
