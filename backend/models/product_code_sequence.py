"""Per-tenant counters for SKU / catalog number templates."""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint, func

from ..database import Base


class ProductCodeSequence(Base):
    """
    One row per (tenant, kind, sequence_key).
    sequence_key encodes kind-specific template identity after {CODE} substitution,
    e.g. ``sku|WAN-{NNNNN}``.
    """

    __tablename__ = "product_code_sequences"
    __table_args__ = (
        UniqueConstraint("tenant_id", "kind", "sequence_key", name="uq_product_code_sequence"),
    )

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    #: ``sku`` | ``catalog``
    kind = Column(String(16), nullable=False)
    sequence_key = Column(String(255), nullable=False)
    last_value = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
