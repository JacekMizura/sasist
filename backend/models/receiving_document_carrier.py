"""PZ ↔ nośniki przypisane do przyjęcia (nie mylić z ``warehouse_carrier_id`` na linii = gdzie leży towar)."""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import relationship

from ..database import Base


class ReceivingDocumentCarrier(Base):
    """Łączy dokument PZ (stock_documents) z nośnikami dostępnymi na tym przyjęciu."""

    __tablename__ = "receiving_document_carriers"
    __table_args__ = (UniqueConstraint("document_id", "warehouse_carrier_id", name="uq_receiving_doc_carrier"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id = Column(Integer, ForeignKey("stock_documents.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_carrier_id = Column(
        Integer,
        ForeignKey("warehouse_carriers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    document = relationship("StockDocument", back_populates="receiving_carrier_links")
