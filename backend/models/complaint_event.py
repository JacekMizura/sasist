"""
Append-only audit journal for complaints: full history, structured payloads only.

Human-readable text is produced in the client (or export) — not stored in payload_json.
Actor defaults to System; real user ids/names can be stored later.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base


class ComplaintEvent(Base):
    __tablename__ = "complaint_events"

    id = Column(String(36), primary_key=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False, index=True)
    line_id = Column(Integer, ForeignKey("complaint_lines.id", ondelete="SET NULL"), nullable=True, index=True)
    event_type = Column(String(64), nullable=False, index=True)
    payload_json = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    actor = Column(String(128), nullable=False, default="System")

    complaint = relationship("Complaint", backref="complaint_events")
    line = relationship("ComplaintLine", foreign_keys=[line_id])
