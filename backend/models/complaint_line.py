"""Lines on a panel complaint (linked to order items)."""

from sqlalchemy import Column, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base


class ComplaintLine(Base):
    __tablename__ = "complaint_lines"

    id = Column(Integer, primary_key=True, autoincrement=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False, index=True)
    order_item_id = Column(Integer, ForeignKey("order_items.id", ondelete="CASCADE"), nullable=False, index=True)
    quantity = Column(Integer, nullable=False)
    reason = Column(Text, nullable=True)
    note_warehouse = Column(Text, nullable=True)
    defect_ids_json = Column(Text, nullable=True)
    photo_urls_json = Column(Text, nullable=True)
    #: Przebieg operacyjny pozycji (jak complaint.status): NOWE | WERYFIKACJA | …
    line_status = Column(String(24), nullable=False, default="NOWE", index=True)
    #: Decyzja dla pozycji: repair | exchange | reject
    line_decision = Column(String(32), nullable=True)
    #: Etap operacji fizycznych (łańcuch zależny od line_decision)
    operation_status = Column(String(32), nullable=True)
    #: Przy decyzji exchange: EXCHANGE = wymiana + odbiór u klienta; REPLACEMENT = tylko dostawa
    exchange_kind = Column(String(16), nullable=True)
    #: Rozliczenie pozycji (zwrot / część) — nadrzędne wobec pola resolution na reklamacji.
    settlement_type = Column(String(24), nullable=True)
    settlement_amount = Column(Float, nullable=True)
    settlement_currency = Column(String(8), nullable=True)

    complaint = relationship("Complaint", back_populates="lines")
    order_item = relationship("OrderItem")
