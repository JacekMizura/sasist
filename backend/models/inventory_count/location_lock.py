"""Location locks during inventory — soft / hard / snapshot modes."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from ...database import Base
from .constants import LOCK_MODE_SOFT


class InventoryLocationLock(Base):
    __tablename__ = "inventory_location_locks"
    __table_args__ = (
        UniqueConstraint(
            "inventory_document_id",
            "location_id",
            name="uq_inv_loc_locks_doc_location",
        ),
    )

    id = Column(Integer, primary_key=True)
    inventory_document_id = Column(
        Integer,
        ForeignKey("inventory_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="CASCADE"), nullable=False, index=True)
    lock_mode = Column(String(32), nullable=False, default=LOCK_MODE_SOFT)
    locked_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)
    locked_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    released_at = Column(DateTime, nullable=True)
    metadata_json = Column(Text, nullable=True)
