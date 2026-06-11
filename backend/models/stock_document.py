"""Warehouse stock documents (e.g. PZ — przyjęcie z zewnątrz) linked to supplier deliveries."""

from datetime import date, datetime

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text, text
from sqlalchemy.orm import relationship

from ..database import Base


class StockDocument(Base):
    __tablename__ = "stock_documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    # PZ = przyjęcie towaru; Z_PZ = PZ zwrotna (RMZ); PZ_RT / RETURN_RECEIPT = legacy zwrot z RMZ.
    document_type = Column(String(32), nullable=False, default="PZ", index=True)
    document_series_id = Column(String(36), ForeignKey("document_series.id", ondelete="SET NULL"), nullable=True, index=True)
    document_number = Column(String(128), nullable=True, index=True)
    #: Zwrot z RMZ → przyjęcie zwrotne (PZ_RT); FK dla idempotentnego powiązania z dokumentem biznesowym.
    rmz_id = Column(Integer, ForeignKey("wms_order_returns.id", ondelete="SET NULL"), nullable=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=True, index=True)
    delivery_id = Column(Integer, ForeignKey("deliveries.id", ondelete="RESTRICT"), nullable=True, index=True)
    #: PANEL = z zamówienia / panelu; WMS = ad-hoc przyjęcie magazynowe (pusta PZ); DIRECT_SALE = sprzedaż bezpośrednia.
    creation_source = Column(String(16), nullable=False, default="PANEL", server_default=text("'PANEL'"), index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    source_sale_document_id = Column(
        String(36),
        ForeignKey("sale_documents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    direct_sale_session_id = Column(
        Integer,
        ForeignKey("direct_sale_sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    production_order_id = Column(
        Integer,
        ForeignKey("production_orders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    production_batch_id = Column(
        Integer,
        ForeignKey("production_batches.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    production_batch_line_id = Column(
        Integer,
        ForeignKey("production_batch_lines.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="RESTRICT"), nullable=True, index=True)
    # MM (internal transfer): source / target bins (header audit; lines + stock_operations carry lots).
    mm_from_location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True)
    mm_to_location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True)
    status = Column(String(32), nullable=False, default="draft")
    # WMS przyjęcie (workflow): NEW | IN_PROGRESS | DONE — operator closes receiving explicitly.
    receiving_status = Column(String(32), nullable=False, default="NEW", index=True)
    # WMS rozlokowanie: NOT_STARTED | IN_PROGRESS | DONE — derived from line putaway vs received.
    putaway_status = Column(String(32), nullable=False, default="NOT_STARTED", index=True)
    # WMS „zamknięcie” rozlokowania (lista / proces) — OPEN | DONE; nie modyfikuje stanów magazynowych.
    relocation_status = Column(String(32), nullable=False, default="OPEN", index=True)
    # Financial snapshot (editing these does not touch inventory or stock_operations).
    currency = Column(String(8), nullable=False, default="PLN")
    total_net = Column(Float, nullable=True)
    total_gross = Column(Float, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by_user_name = Column(String(256), nullable=True)

    #: Z-PZ zbiorczy: lista źródłowych RMZ (JSON array of int ids) — legacy, prefer stock_document_return_links.
    source_rmz_ids_json = Column(Text, nullable=True)
    #: Z-PZ zbiorczy dzienny — guard unikalności per magazyn / dzień.
    is_collective_return_receipt = Column(
        Boolean, nullable=False, default=False, server_default=text("0"), index=True
    )
    collective_business_date = Column(Date, nullable=True, index=True)

    rmz_return = relationship("WmsOrderReturn", foreign_keys=[rmz_id])
    created_by_user = relationship("AppUser", foreign_keys=[created_by_user_id])
    tenant = relationship("Tenant", back_populates="stock_documents", foreign_keys=[tenant_id])
    supplier = relationship("Supplier", foreign_keys=[supplier_id])
    delivery = relationship("InboundDelivery", back_populates="stock_documents", foreign_keys=[delivery_id])
    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])
    location = relationship("Location", foreign_keys=[location_id])
    mm_from_location = relationship("Location", foreign_keys=[mm_from_location_id])
    mm_to_location = relationship("Location", foreign_keys=[mm_to_location_id])
    items = relationship(
        "StockDocumentItem",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="StockDocumentItem.id",
    )
    receiving_carrier_links = relationship(
        "ReceivingDocumentCarrier",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="ReceivingDocumentCarrier.id",
    )


class StockDocumentItem(Base):
    __tablename__ = "stock_document_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_id = Column(Integer, ForeignKey("stock_documents.id", ondelete="CASCADE"), nullable=False, index=True)
    delivery_item_id = Column(Integer, ForeignKey("delivery_items.id", ondelete="SET NULL"), nullable=True, index=True)
    #: Null when the line is warehouse material (``wm_kind`` + ``wm_id``) instead of a catalog product.
    product_id = Column(Integer, ForeignKey("products.id", ondelete="RESTRICT"), nullable=True, index=True)
    #: ``carton`` | ``packaging`` — mutually exclusive with ``product_id`` (same semantics as ``delivery_items``).
    wm_kind = Column(String(16), nullable=True, index=True)
    wm_id = Column(String(36), nullable=True, index=True)
    # MM draft / putaway: pick face this line is staged from (no stock move until rozlokowanie).
    mm_line_from_location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True)
    # Planned qty on this PZ line vs physically received (inventory uses received_quantity only on accept).
    ordered_quantity = Column(Float, nullable=False, default=0)
    received_quantity = Column(Float, nullable=False, default=0)
    #: Cumulative full cartons recorded on this line during WMS receiving (operator-facing split).
    cartons_count = Column(Integer, nullable=False, default=0, server_default=text("0"))
    #: Cumulative loose retail units recorded on this line during WMS receiving (operator-facing split).
    loose_units_count = Column(Integer, nullable=False, default=0, server_default=text("0"))
    # Draft PZ: cumulative qty moved to storage bins via WMS putaway (≤ received_quantity).
    quantity_putaway = Column(Float, nullable=False, default=0)
    putaway_updated_at = Column(DateTime, nullable=True)
    putaway_last_location_name = Column(String(256), nullable=True)
    putaway_last_location_type = Column(String(20), nullable=True)
    putaway_last_admin_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)
    putaway_last_quantity = Column(Float, nullable=True)
    # Legacy: kept in sync with received_quantity for older queries / migrations.
    quantity = Column(Float, nullable=False, default=0)
    purchase_price_net = Column(Float, nullable=True)
    vat_rate = Column(Float, nullable=False, default=23.0)
    # WMS receipt lot (unique per document line split). Empty batch + sentinel expiry when not tracked.
    batch_number = Column(String(128), nullable=False, default="")
    # Sentinel when product does not track expiry (matches inventory_lot_keys.NO_EXPIRY_SENTINEL).
    expiry_date = Column(Date, nullable=False, default=date(9999, 12, 31))
    #: Ścieżka magazynowa dla zwrotów (PZ_RT) — SALEABLE | OUTLET_B | SERVICE_C | REJECTED_STOCK.
    return_disposition = Column(String(32), nullable=True, index=True)
    #: Jakość / przeznaczenie stanu magazynowego (niezależne od widoku RMZ); przetrwa putaway i ``inventory``.
    stock_disposition = Column(
        String(32),
        nullable=False,
        default="SALEABLE",
        server_default=text("'SALEABLE'"),
        index=True,
    )
    #: Powiązanie z wpisem uszkodzenia RMZ (`damage_entries_json[].id`) albo syntetyczne dla odrzutu.
    rmz_damage_entry_id = Column(String(96), nullable=True, index=True)
    #: RMZ źródłowy (wymagane przy Z-PZ zbiorczym; opcjonalnie przy pojedynczym).
    source_rmz_id = Column(
        Integer,
        ForeignKey("wms_order_returns.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    #: Decyzja zwrotu przy finalizacji RMZ: ACCEPTED | DAMAGED_B | DAMAGED_C.
    return_decision = Column(String(24), nullable=True, index=True)
    #: Reklamacja źródłowa (Z-PZ — ten sam dokument co RMZ).
    source_complaint_id = Column(
        Integer,
        ForeignKey("complaints.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    source_complaint_line_id = Column(
        Integer,
        ForeignKey("complaint_lines.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    #: Sugestia WMS: przyjęcie na wskazany nośnik (operator może zignorować i przyjąć luzem).
    suggested_warehouse_carrier_id = Column(
        Integer,
        ForeignKey("warehouse_carriers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    #: Faktyczne przyjęcie tej linii partii na nośnik (musi być na liście ``receiving_document_carriers`` dla PZ).
    warehouse_carrier_id = Column(
        Integer,
        ForeignKey("warehouse_carriers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    #: Pozycja dodana w WMS spoza importu PZ: WMS_SCAN | WMS_MANUAL.
    wms_line_source = Column(String(32), nullable=True, index=True)

    document = relationship("StockDocument", back_populates="items", foreign_keys=[document_id])
    delivery_item = relationship("DeliveryItem", foreign_keys=[delivery_item_id])
    product = relationship("Product", foreign_keys=[product_id])
    mm_line_from_location = relationship("Location", foreign_keys=[mm_line_from_location_id])
    putaway_locations = relationship(
        "StockItemLocation",
        back_populates="document_item",
        cascade="all, delete-orphan",
        order_by="StockItemLocation.location_id",
    )
    stock_operations = relationship(
        "StockOperation",
        back_populates="document_line",
        cascade="all, delete-orphan",
        order_by="StockOperation.id",
    )
