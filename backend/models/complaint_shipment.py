"""
Panel complaint shipments (courier pickup / drop-off — MVP, no carrier API).
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from ..database import Base


class ComplaintShipment(Base):
    __tablename__ = "complaint_shipments"
    __table_args__ = (
        UniqueConstraint("complaint_id", "shipment_role", name="uq_complaint_shipment_role"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False, index=True)

    #: CUSTOMER = zwrot od klienta; SERVICE = wysyłka do serwisu; OUTBOUND = dostawa do klienta z reklamacji
    shipment_role = Column(String(16), nullable=False, default="CUSTOMER", index=True)
    #: EXCHANGE | REPLACEMENT — tylko dla OUTBOUND (zamówienie z reklamacji)
    shipment_business_type = Column(String(24), nullable=True)
    #: DELIVERY_AND_PICKUP | DELIVERY_ONLY — OUTBOUND
    fulfillment_mode = Column(String(32), nullable=True)

    method = Column(String(32), nullable=False)
    carrier = Column(String(16), nullable=False)
    status = Column(String(32), nullable=False, index=True)

    tracking_number = Column(String(64), nullable=False)
    label_url = Column(String(512), nullable=True)

    pickup_date = Column(Date, nullable=True)
    pickup_name = Column(String(256), nullable=True)
    pickup_address = Column(Text, nullable=True)
    pickup_phone = Column(String(64), nullable=True)
    pickup_email = Column(String(256), nullable=True)

    service_rma = Column(String(128), nullable=True)
    destination_line = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)

    complaint = relationship("Complaint", back_populates="shipments")
    events = relationship(
        "ComplaintShipmentEvent",
        back_populates="shipment",
        order_by="ComplaintShipmentEvent.id",
        cascade="all, delete-orphan",
    )


class ComplaintShipmentEvent(Base):
    __tablename__ = "complaint_shipment_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    shipment_id = Column(
        Integer,
        ForeignKey("complaint_shipments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind = Column(String(32), nullable=False)
    title = Column(String(256), nullable=False)
    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)

    shipment = relationship("ComplaintShipment", back_populates="events")
