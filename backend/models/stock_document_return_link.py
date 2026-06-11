"""RMZ ↔ Z-PZ (stock document) many-to-many link."""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import relationship

from ..database import Base


class StockDocumentReturnLink(Base):
    __tablename__ = "stock_document_return_links"
    __table_args__ = (
        UniqueConstraint(
            "stock_document_id",
            "rmz_id",
            name="uq_stock_document_return_links_doc_rmz",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    stock_document_id = Column(
        Integer,
        ForeignKey("stock_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    rmz_id = Column(
        Integer,
        ForeignKey("wms_order_returns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    stock_document = relationship("StockDocument", foreign_keys=[stock_document_id])
    rmz_return = relationship("WmsOrderReturn", foreign_keys=[rmz_id])
