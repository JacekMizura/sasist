"""
MODEL: ProductSubstitution

Historia zamian produktów dla braków magazynowych.
"""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import relationship

from ..database import Base
from .base import BaseModelMixin


class ProductSubstitution(Base, BaseModelMixin):
    __tablename__ = "product_substitutions"
    __table_args__ = (
        UniqueConstraint(
            "source_product_id",
            "target_product_id",
            "warehouse_id",
            "used_by_user_id",
            name="uq_product_substitution_usage",
        ),
    )

    source_product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    target_product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    used_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)
    usage_count = Column(Integer, nullable=False, default=1)
    last_used_at = Column(DateTime, nullable=False)

    source_product = relationship("Product", foreign_keys=[source_product_id])
    target_product = relationship("Product", foreign_keys=[target_product_id])
    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])
    used_by_user = relationship("AppUser", foreign_keys=[used_by_user_id])
