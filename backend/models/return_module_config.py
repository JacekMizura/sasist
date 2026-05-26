"""
Konfiguracja modułu zwrotów (magazyn + panel): klasy i typy uszkodzeń, decyzje pozycji,
rodzaje zwrotów klienta, źródła zamówień, układ strony szczegółów zwrotu.

Oddzielne od ReturnUiStatus (etykiety panelu RMZ) oraz od ReturnStatus (workflow WMS).
"""

from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text, UniqueConstraint

from ..database import Base


class ReturnDamageClass(Base):
    __tablename__ = "return_damage_classes"
    __table_args__ = (
        UniqueConstraint("tenant_id", "warehouse_id", "code", name="uq_ret_dmg_class_wh_code"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)
    code = Column(String(32), nullable=False)
    label = Column(String(128), nullable=False)
    color_hex = Column(String(32), nullable=False, default="#64748b")
    description = Column(Text, nullable=True)
    warehouse_behavior = Column(String(64), nullable=True)
    resale_allowed = Column(Boolean, nullable=False, default=True)
    visible_wms = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)


class ReturnDamageReason(Base):
    __tablename__ = "return_damage_reasons"
    __table_args__ = (
        UniqueConstraint("tenant_id", "warehouse_id", "code", name="uq_ret_dmg_reason_wh_code"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)
    class_code = Column(String(32), nullable=False, index=True)
    code = Column(String(64), nullable=False)
    label = Column(String(256), nullable=False)
    visible_wms = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)


class ReturnProductDecision(Base):
    """Decyzje produktowe (panel/WMS). category: ACCEPTED | REJECTED."""

    __tablename__ = "return_product_decisions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "warehouse_id", "category", "code", name="uq_ret_prod_dec_wh_cat_code"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)
    category = Column(String(24), nullable=False, index=True)
    code = Column(String(64), nullable=False)
    label = Column(String(256), nullable=False)
    visible_wms = Column(Boolean, nullable=False, default=False)
    sort_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    #: Gdy REJECTED i True — fizycznie jest towar do przyjęcia na PZ_RT (np. niezgodny produkt).
    creates_stock_document = Column(Boolean, nullable=False, default=False)


class ReturnCustomerReturnType(Base):
    """Rodzaj zwrotu wybierany przez klienta (nie status magazynowy)."""

    __tablename__ = "return_customer_return_types"
    __table_args__ = (UniqueConstraint("tenant_id", "warehouse_id", "code", name="uq_ret_cust_type_wh_code"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)
    code = Column(String(64), nullable=False)
    label = Column(String(256), nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)


class ReturnOrderSource(Base):
    __tablename__ = "return_order_sources"
    __table_args__ = (UniqueConstraint("tenant_id", "warehouse_id", "code", name="uq_ret_src_wh_code"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)
    code = Column(String(64), nullable=False)
    label = Column(String(256), nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)


class ReturnDetailLayout(Base):
    """Układ sekcji strony edycji zwrotu (dwie kolumny, lista identyfikatorów sekcji)."""

    __tablename__ = "return_detail_layouts"
    __table_args__ = (UniqueConstraint("tenant_id", "warehouse_id", name="uq_ret_detail_layout_wh"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)
    layout_json = Column(Text, nullable=False, default='{"left_column":[],"right_column":[]}')
