"""
MODEL: OrderItem

Reprezentuje pozycję w zamówieniu.

Order 1 ---< OrderItem >--- 1 Product
"""

from sqlalchemy import Boolean, Column, Integer, Float, ForeignKey, String, Text, text
from sqlalchemy.orm import relationship
from ..database import Base

# OMS: linia zarchiwizowana po zamianie produktu (pozostaje z Pickami / historią).
OMS_LINE_STATUS_REPLACED = "REPLACED"
# Nowa linia po zamianie — do zbierania od zera (wprowadzana z powrotem do kolejki).
OMS_LINE_STATUS_TO_PICK = "TO_PICK"


def order_item_is_replaced_line(item: "OrderItem") -> bool:
    st = (getattr(item, "oms_line_status", None) or "").strip().upper()
    return st == OMS_LINE_STATUS_REPLACED


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True)

    # ================================
    # RELACJA DO ORDER
    # ================================

    order_id = Column(
        Integer,
        ForeignKey("orders.id"),
        nullable=False
    )

    order = relationship(
        "Order",
        back_populates="items"
    )

    # ================================
    # RELACJA DO PRODUCT
    # ================================

    product_id = Column(
        Integer,
        ForeignKey("products.id"),
        nullable=False
    )

    product = relationship("Product", back_populates="order_items")
    picks = relationship("Pick", back_populates="order_item")
    fulfillment_events = relationship(
        "FulfillmentEvent",
        back_populates="order_item",
        cascade="all, delete-orphan",
    )

    # ================================
    # ILOŚĆ
    # ================================

    quantity = Column(Integer, nullable=False)

    #: Wymagana pula magazynowa do rezerwacji / pickingu (Etap 2).
    required_stock_disposition = Column(
        String(32),
        nullable=False,
        default="SALEABLE",
        server_default=text("'SALEABLE'"),
        index=True,
    )

    #: Ilość „spakowana” na stanowisku pakowania WMS (osobno od zbierania / Pick).
    packing_quantity_packed = Column(Integer, nullable=False, server_default=text("0"), default=0)

    #: WMS: zgłoszona / wyliczona ilość braku na linii (dla widoku braków); 0 = brak braku.
    wms_picking_line_missing_qty = Column(Float, nullable=True, server_default=text("0"), default=0)
    #: WMS: status linii w sesji zbierania (np. ``missing`` po zgłoszeniu braku — bez zmiany statusu zamówienia).
    wms_picking_line_status = Column(String(32), nullable=True)

    #: Kumulatywne zgłoszenie braku z WMS (sesja zbierania); ``wms_picking_line_missing_qty`` = wyjście po recompute.
    wms_shortage_declared_qty = Column(Float, nullable=True, server_default=text("0"), default=0)
    #: Skąd wydano / sprzedano towar (lokalizacja magazynowa).
    source_location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True)
    source_movement_id = Column(
        Integer,
        ForeignKey("warehouse_inventory_movements.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    issue_session_id = Column(
        Integer,
        ForeignKey("direct_sale_sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    issued_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)

    #: OMS: ilość zdjęta z braku (np. częściowe usunięcie z realizacji).
    oms_removed_qty = Column(Float, nullable=True, server_default=text("0"), default=0)
    #: OMS: ilość uznana za zastąpioną (odejmowana od braku).
    oms_replaced_qty = Column(Float, nullable=True, server_default=text("0"), default=0)

    #: Ślad zamiany produktu na linii (snapshot; bez FK — poprzednia linia mogła zostać usunięta).
    replaced_from_order_item_id = Column(Integer, nullable=True, index=True)
    replaced_from_product_name = Column(String(255), nullable=True)

    #: OMS: ``REPLACED`` = linia po zamianie (tylko historia pobrań); ``TO_PICK`` = nowa linia czekająca na zbieranie.
    oms_line_status = Column(String(32), nullable=True, index=True)

    # ================================
    # CENNIK (dla importu i analityki)
    # ================================

    unit_price = Column(Float, nullable=True)
    total_price = Column(Float, nullable=True)
    unit = Column(String, nullable=True)

    # Line VAT (percent, e.g. 23.0), list price before discounts — from CSV import
    vat_percent = Column(Float, nullable=True)
    list_price = Column(Float, nullable=True)

    # Import: unmapped / extra CSV columns per line (JSON object)
    metadata_json = Column(Text, nullable=True)

    # ================================
    # BUNDLE TRACEABILITY (exploded lines only)
    # ================================

    source_bundle_id = Column(Integer, ForeignKey("bundles.id", ondelete="SET NULL"), nullable=True, index=True)
    bundle_instance_id = Column(String(36), nullable=True, index=True)
    #: Linia nagłówkowa zestawu (komercja); komponenty mają ustawione ``parent_bundle_order_item_id``.
    is_bundle_parent = Column(Boolean, nullable=False, server_default=text("false"), default=False)
    #: FK do nagłówka zestawu — komponent z eksplozji (operacyjny).
    parent_bundle_order_item_id = Column(Integer, ForeignKey("order_items.id", ondelete="CASCADE"), nullable=True, index=True)

    source_bundle = relationship("Bundle", foreign_keys=[source_bundle_id])
    parent_bundle_line = relationship(
        "OrderItem",
        remote_side="OrderItem.id",
        foreign_keys=[parent_bundle_order_item_id],
    )

    # ================================
    # CACHE OBJĘTOŚCI (opcjonalne)
    # ================================

    total_volume = Column(Float)
