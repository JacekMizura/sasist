"""PDF and generated artifacts linked to a complaint (legal / financial / RMA)."""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base


class ComplaintDocument(Base):
    __tablename__ = "complaint_documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False, index=True)
    #: DECISION | CORRECTION | RMA
    type = Column(String(16), nullable=False, index=True)
    file_url = Column(String(512), nullable=False)
    title = Column(String(256), nullable=True)
    meta_json = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)

    complaint = relationship("Complaint", back_populates="documents")
