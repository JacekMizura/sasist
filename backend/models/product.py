"""
MODEL: Product

Produkt należy do konkretnego tenant.
Może być używany w wielu zamówieniach.
"""

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.orm import relationship
from ..database import Base


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (UniqueConstraint("tenant_id", "ean", name="uq_product_tenant_ean"),)

    id = Column(Integer, primary_key=True)

    # =============================
    # RELACJE SAAS
    # =============================

    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)

    #: Soft delete — ukrycie z listy asortymentu; rekord pozostaje dla historii zamówień / dokumentów.
    deleted_at = Column(DateTime, nullable=True, index=True)

    tenant = relationship("Tenant", back_populates="products")

    # =============================
    # DANE PRODUKTU
    # =============================

    name = Column(String)
    sku = Column(String, index=True)
    ean = Column(String, index=True)
    symbol = Column(String)  # legacy alias for sku
    barcode = Column(String(64), unique=True, nullable=True, index=True)  # PRD-000001 (Code128, scan)

    length = Column(Float)
    width = Column(Float)
    height = Column(Float)

    weight = Column(Float)

    volume = Column(Float)

    location = Column(String)

    purchase_price = Column(Numeric(10, 2), nullable=True)
    extra_cost_packaging_net = Column(Numeric(12, 2), nullable=False, default=0)
    extra_cost_commission_percent = Column(Numeric(8, 2), nullable=False, default=0)
    extra_cost_other_net = Column(Numeric(12, 2), nullable=False, default=0)
    previous_purchase_price = Column(Numeric(10, 2), nullable=True)
    #: Optional original unit price in purchase currency (for FX revaluation flows).
    purchase_price_original = Column(Numeric(12, 4), nullable=True)
    #: Currency for ``purchase_price_original`` (e.g. EUR).
    purchase_currency = Column(String(8), nullable=True)
    #: Ostatnie zaksięgowane przyjęcie (PZ) — data wpisu ceny z linii dokumentu.
    last_purchased_at = Column(DateTime, nullable=True, index=True)
    #: Alias business field expected by purchasing UI/domain.
    last_purchase_date = Column(DateTime, nullable=True, index=True)
    last_supplier_id = Column(Integer, ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True, index=True)
    last_supplier = relationship("Supplier", foreign_keys=[last_supplier_id])
    last_purchase_currency = Column(String(8), nullable=True)
    sale_price = Column(Numeric(10, 2), nullable=True)
    manufacturer = Column(String, nullable=True)
    manufacturer_id = Column(
        Integer,
        ForeignKey("manufacturers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    manufacturer_row = relationship("Manufacturer", back_populates="products", foreign_keys=[manufacturer_id])
    default_supplier_id = Column(
        Integer,
        ForeignKey("suppliers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    default_supplier_row = relationship("Supplier", back_populates="default_for_products", foreign_keys=[default_supplier_id])
    supplier_catalog_links = relationship(
        "SupplierProduct",
        back_populates="product",
        cascade="all, delete-orphan",
    )
    unit = Column(String, nullable=True)

    # Numer katalogowy (dopasowanie importu / zamówień)
    catalog_number = Column(String, nullable=True, index=True)
    # Pełny zrzut kolumn CSV spoza mapowania rdzeniowego (JSON obiektu)
    metadata_json = Column(Text, nullable=True)

    image_url = Column(String)

    # Przypisania do lokalizacji magazynowych (JSON: [{"locationUUID": "...", "quantity": n}, ...])
    assigned_locations = Column(Text, nullable=True)

    # Orientacja przy pakowaniu: any | upright | no_stack
    orientation_type = Column(String(20), nullable=True)
    # Kształt: box | cylinder (cylinder = średnica w width, wysokość w height)
    shape_type = Column(String(20), nullable=True)
    # Układanie w stos: kompresja (np. poduszki, koce) i limit wagi
    stack_compressible = Column(Boolean, nullable=True)
    compressed_height_cm = Column(Float, nullable=True)
    max_stack_weight = Column(Float, nullable=True)
    # Układanie w stos: stackable (domyślnie) | no_stack
    stack_behavior = Column(String(20), nullable=True)

    # Poziomy uzupełnienia lokacji pick-face (WMS replenishment — ilości szt.).
    min_pick_quantity = Column(Float, nullable=True)
    max_pick_quantity = Column(Float, nullable=True)

    # Poziomy uzupełniania lokalizacji zapasowych / rezerwy (ilości szt.).
    min_reserve_quantity = Column(Float, nullable=True)
    max_reserve_quantity = Column(Float, nullable=True)

    # Alarm: łączny stan (SUM inventory) poniżej progu — logika powiadomień poza tym modelem
    enable_stock_alert = Column(Boolean, nullable=True)
    min_total_stock = Column(Float, nullable=True)

    # WMS: wymagaj partii / daty ważności przy przyjęciu i śledź stany per partia+termin
    track_batch = Column(Boolean, nullable=False, default=False)
    track_expiry = Column(Boolean, nullable=False, default=False)
    track_serial = Column(Boolean, nullable=False, default=False)

    # WMS: wymagane pola master-data przy przyjęciu (konfiguracja per produkt)
    require_recv_height = Column(Boolean, nullable=False, default=False, server_default=text("0"))
    require_recv_width = Column(Boolean, nullable=False, default=False, server_default=text("0"))
    require_recv_length = Column(Boolean, nullable=False, default=False, server_default=text("0"))
    require_recv_weight = Column(Boolean, nullable=False, default=False, server_default=text("0"))
    require_recv_master_carton = Column(Boolean, nullable=False, default=False, server_default=text("0"))
    require_recv_master_carton_ean = Column(Boolean, nullable=False, default=False, server_default=text("0"))
    require_recv_master_carton_qty = Column(Boolean, nullable=False, default=False, server_default=text("0"))
    require_recv_master_carton_dims = Column(Boolean, nullable=False, default=False, server_default=text("0"))
    require_recv_master_carton_weight = Column(Boolean, nullable=False, default=False, server_default=text("0"))

    # Opakowanie zbiorcze (kartony) — osobno od wymiarów pojedynczej sztuki (length/width/height/weight/volume)
    bulk_ean = Column(String, nullable=True)
    units_per_carton = Column(Float, nullable=True)
    carton_length_cm = Column(Float, nullable=True)
    carton_width_cm = Column(Float, nullable=True)
    carton_height_cm = Column(Float, nullable=True)
    carton_weight_kg = Column(Float, nullable=True)
    carton_volume_dm3 = Column(Float, nullable=True)

    # Orientacja / stos — opakowanie zbiorcze (osobno od pojedynczej sztuki poniżej)
    carton_orientation_type = Column(String(20), nullable=True)  # any | upright | no_stack
    carton_shape_type = Column(String(20), nullable=True)  # box | cylinder
    carton_stack_behavior = Column(String(20), nullable=True)  # stackable | no_stack
    carton_stack_compressible = Column(Boolean, nullable=True)
    carton_compressed_height_cm = Column(Float, nullable=True)
    carton_max_stack_weight = Column(Float, nullable=True)

    # Szablon etykiety produktu (jeśli ustawiony, używany przy generowaniu etykiet)
    label_template_id = Column(
        Integer,
        ForeignKey("saved_label_templates.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    label_template = relationship("SavedLabelTemplate", foreign_keys=[label_template_id])

    # =============================
    # RELACJA DO POZYCJI ZAMÓWIENIA
    # =============================

    order_items = relationship(
        "OrderItem",
        back_populates="product"
    )

    inventory = relationship(
        "Inventory",
        back_populates="product",
        cascade="all, delete-orphan",
    )

    inventory_units = relationship(
        "InventoryUnit",
        back_populates="product",
        cascade="all, delete-orphan",
    )

    picks = relationship(
        "Pick",
        back_populates="product",
        cascade="all, delete-orphan",
    )

    inventory_movements = relationship(
        "InventoryMovement",
        back_populates="product",
        cascade="all, delete-orphan",
    )

    stock = relationship(
        "Stock",
        back_populates="product",
        cascade="all, delete-orphan",
    )
    stock_reservations = relationship(
        "StockReservation",
        back_populates="product",
        cascade="all, delete-orphan",
    )
    stock_movements = relationship(
        "StockMovement",
        back_populates="product",
        cascade="all, delete-orphan",
    )
    pick_tasks = relationship(
        "PickTask",
        back_populates="product",
        cascade="all, delete-orphan",
    )

    bundle_items = relationship(
        "BundleItem",
        back_populates="product",
        cascade="all, delete-orphan",
    )

    delivery_items = relationship(
        "DeliveryItem",
        back_populates="product",
        foreign_keys="DeliveryItem.product_id",
    )
    purchase_order_items = relationship(
        "PurchaseOrderItem",
        back_populates="product",
        foreign_keys="PurchaseOrderItem.product_id",
    )
    extra_barcodes = relationship(
        "ProductBarcode",
        back_populates="product",
        cascade="all, delete-orphan",
    )