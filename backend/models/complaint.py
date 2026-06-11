"""
Office/panel complaints (minimal entity for triage + panel UI status).

Does not define operational workflow columns beyond storage for future use.
"""

from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base


class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)

    # Reklamacja musi dotyczyć zamówienia (nowe rekordy — wymagane przez API from-order).
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    #: Powiązanie reklamacji (np. częściowa / kontynuacja) — bez cykli.
    parent_complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="SET NULL"), nullable=True, index=True)

    reference_code = Column(String(64), nullable=True, index=True)
    title = Column(String(256), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    # Ustawiane przy utworzeniu: created_at + 14 dni (konsument — termin odpowiedzi sprzedawcy).
    response_deadline = Column(DateTime, nullable=True, index=True)
    auto_accepted = Column(Boolean, nullable=False, default=False)
    deleted_at = Column(DateTime, nullable=True, index=True)

    # JSON array of public paths, e.g. ["/uploads/complaints/{id}/{uuid}.jpg"] (legacy: data URLs).
    photo_urls_json = Column(Text, nullable=True)
    # WMS warehouse photos (kept separate from customer photos).
    warehouse_photo_urls_json = Column(Text, nullable=True)

    # Legacy panel etykieta (nieużywane w API reklamacji — źródłem prawdy jest status).
    complaint_ui_status_id = Column(
        Integer,
        ForeignKey("complaint_ui_statuses.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Jedyny status reklamacji (panel + lista): NOWE | WERYFIKACJA | DECYZJA | ZAAKCEPTOWANA | ODRZUCONA
    status = Column(
        "complaint_process_status",
        String(24),
        nullable=True,
        default="NOWE",
        index=True,
    )

    # JSON array of defect tag ids (np. ["factory","transport"]) — spójne z panelem szczegółów.
    defects_json = Column(Text, nullable=True)
    # Krótki powód od klienta (osobno od notatki w description).
    customer_reason = Column(Text, nullable=True)
    #: Snapshot z zamówienia przy utworzeniu from-order (lista bez JOIN na addresses_json).
    customer_name = Column(String(256), nullable=True)
    customer_phone = Column(String(128), nullable=True)
    customer_email = Column(String(256), nullable=True)
    customer_address = Column(Text, nullable=True)

    #: Gdy status = OCZEKIWANIE_NA_PRODUKT — od kiedy czekamy na towar.
    waiting_for_product_since = Column(DateTime, nullable=True)
    waiting_reminder_sent_at = Column(DateTime, nullable=True)

    #: Zdarzenia audytu (JSON list): status, decyzje, kurier, …
    audit_events_json = Column(Text, nullable=True)

    # Hierarchia decyzji (zgodność z kolejnością naprawa / wymiana przed zwrotem lub obniżeniem).
    major_defect = Column(Boolean, nullable=False, default=False)
    repair_failed = Column(Boolean, nullable=False, default=False)
    replacement_failed = Column(Boolean, nullable=False, default=False)
    operational_decision = Column(String(32), nullable=True)
    financial_decision = Column(String(32), nullable=True)

    #: Rozliczenie z klientem: REPLACEMENT | REFUND | PARTIAL_REFUND | REJECTION
    resolution_type = Column(String(24), nullable=True, index=True)
    #: PENDING | COMPLETED (wymiana do momentu utworzenia zamówienia)
    resolution_status = Column(String(24), nullable=True)
    resolution_amount = Column(Float, nullable=True)
    resolution_currency = Column(String(8), nullable=True)

    # Logistyka / serwis — osobno od complaint.status (obrót prawny).
    logistics_status = Column(String(32), nullable=True, index=True)
    logistics_service_rma = Column(String(128), nullable=True)
    logistics_expected_return_date = Column(Date, nullable=True)
    logistics_in_service_since = Column(DateTime, nullable=True)

    #: Sposób fizycznego obiegu towaru: WAREHOUSE | SERVICE_FORWARD | DIRECT_SERVICE
    physical_receipt_mode = Column(String(24), nullable=False, default="WAREHOUSE", index=True)

    #: Powiązany dokument magazynowy Z-PZ (przyjęcie towaru reklamacyjnego).
    warehouse_document_id = Column(
        Integer,
        ForeignKey("stock_documents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    warehouse_document_type = Column(String(32), nullable=True)

    tenant = relationship("Tenant")
    warehouse = relationship("Warehouse")
    order = relationship("Order", foreign_keys=[order_id])
    complaint_ui_status = relationship("ComplaintUiStatus", foreign_keys=[complaint_ui_status_id])
    shipments = relationship(
        "ComplaintShipment",
        back_populates="complaint",
        cascade="all, delete-orphan",
    )
    lines = relationship(
        "ComplaintLine",
        back_populates="complaint",
        cascade="all, delete-orphan",
        order_by="ComplaintLine.id",
    )
    documents = relationship(
        "ComplaintDocument",
        back_populates="complaint",
        cascade="all, delete-orphan",
    )
