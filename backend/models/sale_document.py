"""Issued sale documents (FV/paragon/KOR) — persisted header per issuance."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import relationship

from ..database import Base


class SaleDocument(Base):
    """One row per sales document issuance (primary FV/PA or correction KOR)."""

    __tablename__ = "sale_documents"
    __table_args__ = (
        UniqueConstraint(
            "source_sale_document_id",
            "business_source_type",
            "business_source_id",
            "correction_scope_hash",
            name="uq_sale_documents_correction_idempotency",
        ),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    document_series_id = Column(String(36), ForeignKey("document_series.id"), nullable=False, index=True)
    document_type_id = Column(String(36), ForeignKey("document_series.id"), nullable=True, index=True)
    document_number = Column(String(128), nullable=False)
    #: Panel metadata: INVOICE | PARAGON (paragon = receipt subtype). Corrections keep source panel type.
    panel_document_type = Column(String(16), nullable=False)
    #: INVOICE | RECEIPT | CORRECTION — matches document_series.subtype for the issued series.
    document_subtype = Column(String(16), nullable=True)
    #: SALE | CORRECTION
    series_type = Column(String(24), nullable=False, default="SALE")
    #: PRIMARY | CORRECTION — explicit kind (never overload INVOICE/RECEIPT alone).
    document_kind = Column(
        String(24),
        nullable=False,
        default="PRIMARY",
        server_default=text("'PRIMARY'"),
        index=True,
    )
    #: Parent FV/PA for corrections; NULL for primary documents.
    source_sale_document_id = Column(
        String(36),
        ForeignKey("sale_documents.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    correction_reason = Column(Text, nullable=True)
    #: e.g. RETURN
    business_source_type = Column(String(32), nullable=True, index=True)
    #: e.g. WmsOrderReturn.id as string
    business_source_id = Column(String(64), nullable=True, index=True)
    #: Hash of correction line scope for idempotent reuse.
    correction_scope_hash = Column(String(64), nullable=True, index=True)

    total_net = Column(Float, nullable=True)
    total_gross = Column(Float, nullable=True)
    total_vat = Column(Float, nullable=True)
    payment_id = Column(Integer, ForeignKey("payments.id", ondelete="SET NULL"), nullable=True, index=True)
    payment_method = Column(String(24), nullable=True)
    payment_status = Column(String(24), nullable=True)
    payment_captured_at = Column(DateTime, nullable=True)
    payment_external_transaction_id = Column(String(128), nullable=True)
    #: Immutable buyer snapshot at issuance — NULL = legacy live fallback on read.
    buyer_json = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)

    order = relationship("Order", foreign_keys=[order_id])
    document_series = relationship("DocumentSeries", foreign_keys=[document_series_id])
    document_type = relationship("DocumentSeries", foreign_keys=[document_type_id])
    payment = relationship("Payment", foreign_keys=[payment_id])
    source_document = relationship(
        "SaleDocument",
        remote_side=[id],
        foreign_keys=[source_sale_document_id],
        backref="corrections",
    )
    items = relationship(
        "SaleDocumentItem",
        back_populates="sale_document",
        cascade="all, delete-orphan",
        order_by="SaleDocumentItem.position",
    )
