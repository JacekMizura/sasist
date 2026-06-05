"""
MODEL: Order

Nagłówek zamówienia.
Prawdziwa objętość liczona jest z OrderItem.
"""

from datetime import datetime

from sqlalchemy import Column, Integer, String, ForeignKey, Float, DateTime, UniqueConstraint, Text
from sqlalchemy.orm import relationship
from ..database import Base


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("tenant_id", "warehouse_id", "number", name="uq_order_tenant_warehouse_number"),
        UniqueConstraint("tenant_id", "warehouse_id", "external_id", name="uq_order_tenant_warehouse_external_id"),
    )

    id = Column(Integer, primary_key=True)

    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True)

    number = Column(String)
    # Sellasist / marketplace stable id (e.g. "Zewnętrzny identyfikator"); upsert key with tenant + warehouse
    external_id = Column(String(128), nullable=True, index=True)
    # Numer dokumentu sprzedaży z importu (FS/…); nigdy nie nadpisuje wewnętrznego order.number
    sales_document_number = Column(String(128), nullable=True, index=True)

    # Data przyjęcia zamówienia do systemu (domyślnie przy tworzeniu)
    order_date = Column(DateTime, nullable=True, default=datetime.utcnow)

    value = Column(Float, nullable=True)
    discount_type = Column(String(16), nullable=True)  # percent | amount
    discount_value = Column(Float, nullable=True)
    created_at = Column(DateTime, nullable=True)
    source = Column(String)
    #: Kanał sprzedaży (enum) — niezależny od ``source`` (etykieta importu).
    order_channel = Column(String(32), nullable=True, index=True)
    #: Tryb realizacji: WMS | IMMEDIATE | PICKUP | DELIVERY | RESERVATION.
    fulfillment_mode = Column(String(32), nullable=True, index=True)
    #: Legacy free-text label (imports); display name should prefer ``shipping_method_row``.
    shipping_method = Column(String, nullable=True)
    shipping_method_id = Column(
        String(36),
        ForeignKey("shipping_methods.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    currency = Column(String)
    city = Column(String)
    country = Column(String)

    status = Column(String, default="NEW")
    barcode = Column(String(64), unique=True, nullable=True, index=True)  # ORD-000123 (Code128, scan)
    #: Wewnętrzny kod skanowania zamówienia (ESP:O:id); unikat globalnie — indeks w schema_upgrade.
    scan_code = Column(String(80), nullable=True, index=True)

    #: WMS: jednolity stan realizacji (zbieranie / braki / pakowanie) — patrz ``order_fulfillment_state``.
    fulfillment_state = Column(String(32), nullable=True, index=True)
    #: Opcjonalna sesja klienta zbierania (czyszczona przy zmianie statusu).
    picking_session_id = Column(Integer, nullable=True, index=True)

    #: WMS — znaczniki czasu osi realizacji (nie nadpisywać gdy już ustawione).
    picking_started_at = Column(DateTime, nullable=True)
    #: Koniec zbierania (np. „Zakończ zbieranie” / domknięcie wózka) — źródło fazy READY_TO_PACK.
    picking_finished_at = Column(DateTime, nullable=True)
    picked_at = Column(DateTime, nullable=True)
    packing_started_at = Column(DateTime, nullable=True)
    packed_at = Column(DateTime, nullable=True)
    #: Koniec potoku pakowania (dokument / etykieta / sync) — nie ``packed_at`` (kompletacja fizyczna).
    wms_packing_automation_finished_at = Column(DateTime, nullable=True)

    # Przypisanie do wózka (BULK: cart_id; MULTI: cart_id + basket_id)
    cart_id = Column(Integer, ForeignKey("carts.id", ondelete="SET NULL"), nullable=True)
    basket_id = Column(Integer, ForeignKey("cart_baskets.id", ondelete="SET NULL"), nullable=True)
    #: Karton wybrany na stanowisku pakowania WMS (słownik cartons).
    selected_carton_id = Column(String(36), ForeignKey("cartons.id", ondelete="SET NULL"), nullable=True, index=True)
    total_volume_dm3 = Column(Float, nullable=True)  # objętość zamówienia (dm³) – ustawiana przy przypisaniu

    # Fala kompletacji (wave picking). NULL = gotowe do przypisania do fali.
    wave_id = Column(Integer, ForeignKey("waves.id", ondelete="SET NULL"), nullable=True)

    # Panel/office triage label — NOT system Order.status (see order_ui_statuses).
    order_ui_status_id = Column(
        Integer, ForeignKey("order_ui_statuses.id", ondelete="SET NULL"), nullable=True, index=True
    )

    #: Wizualna flaga priorytetu (panel): gray | blue | green | yellow | orange | red — bez wpływu na status.
    priority_color = Column(String(32), nullable=True)

    # Wymiana z reklamacji (formularz „Nowe zamówienie” z prefillem)
    order_origin = Column(String(32), nullable=True, index=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="SET NULL"), nullable=True, index=True)
    original_order_id = Column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    #: Gdy order_origin=COMPLAINT: EXCHANGE (wymiana + odbiór) albo REPLACEMENT (tylko dostawa)
    complaint_order_type = Column(String(24), nullable=True, index=True)

    # Import: JSON blobs for CSV columns not mapped to first-class fields (no data loss)
    import_metadata_json = Column(Text, nullable=True)
    # JSON: { "billing": {...}, "shipping": {...} } from duplicate address blocks
    addresses_json = Column(Text, nullable=True)

    #: Archiwizacja nagłówka — ukrycie z listy; wiersz pozostaje (FK ze zwrotów/dokumentów).
    deleted_at = Column(DateTime, nullable=True, index=True)

    # ================================
    # RELACJE
    # ================================

    tenant = relationship("Tenant")
    customer = relationship("Customer", foreign_keys=[customer_id])
    wave = relationship("Wave", back_populates="orders", foreign_keys=[wave_id])
    warehouse = relationship("Warehouse")
    order_ui_status = relationship("OrderUiStatus", foreign_keys=[order_ui_status_id])
    cart = relationship("Cart", back_populates="assigned_orders", foreign_keys=[cart_id])
    # One-to-Many: one basket, many orders (Order.basket_id -> CartBasket.id)
    basket = relationship("CartBasket", back_populates="orders", foreign_keys=[basket_id])
    shipping_method_row = relationship("ShippingMethod", foreign_keys=[shipping_method_id])
    selected_carton = relationship("Carton", foreign_keys=[selected_carton_id])

    items = relationship(
        "OrderItem",
        back_populates="order",
        cascade="all, delete"
    )

    order_documents = relationship(
        "OrderDocument",
        back_populates="order",
        cascade="all, delete-orphan",
    )
    order_activity_logs = relationship(
        "OrderActivityLog",
        back_populates="order",
        cascade="all, delete-orphan",
    )
    order_notes = relationship(
        "OrderNote",
        back_populates="order",
        cascade="all, delete-orphan",
    )
    operational_notes = relationship(
        "OrderOperationalNote",
        back_populates="order",
        cascade="all, delete-orphan",
    )
    custom_field_values = relationship(
        "OrderCustomFieldValue",
        back_populates="order",
        cascade="all, delete-orphan",
    )

    picks = relationship(
        "Pick",
        back_populates="order",
        cascade="all, delete-orphan",
    )
    stock_reservations = relationship(
        "StockReservation",
        back_populates="order",
        cascade="all, delete-orphan",
    )
    pick_tasks = relationship(
        "PickTask",
        back_populates="order",
        cascade="all, delete-orphan",
    )

    # Baskets that contain this order (CartBasket.order_id -> Order.id)
    baskets = relationship(
        "CartBasket",
        back_populates="order",
        foreign_keys="CartBasket.order_id",
    )

    # Strefy gabarytowe – jedno zamówienie może obejmować wiele stref
    picking_zones = relationship(
        "PickingZone",
        secondary="order_zone",
        back_populates="orders",
    )

    wms_order_events = relationship(
        "WmsOrderEvent",
        back_populates="order",
        cascade="all, delete-orphan",
    )

    wms_packing_sessions = relationship(
        "WmsPackingSession",
        back_populates="order",
        cascade="all, delete-orphan",
    )
