"""
Reguły zbierania per status panelu zamówień (Order UI status) dla magazynu.

Izolowany moduł — nie wpływa na istniejące przypisania zamówień ani MM.

Konfiguracje produkcji (``is_production_mode=True``) dzielą tę samą tabelę storage
ze zbieraniem ze względu na FK ``production_orders.picking_config_id``.
SSOT odczytu/zapisu produkcji: ``production_config_query`` / ``production_config_service``
oraz API ``/wms/settings/production-configs`` — nie Konfigurator zbierania.
"""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import relationship

from ..database import Base

#: Order-driven production trigger scope (extensible later; only SINGLE_ELEMENT for now).
PRODUCTION_ORDER_TRIGGER_SCOPE_SINGLE_ELEMENT = "SINGLE_ELEMENT"
PRODUCTION_ORDER_TRIGGER_SCOPES = frozenset({PRODUCTION_ORDER_TRIGGER_SCOPE_SINGLE_ELEMENT})

#: How ORDERS MOs from this config are executed (interface, not a separate lifecycle).
PRODUCTION_EXECUTION_METHOD_WMS = "WMS"
PRODUCTION_EXECUTION_METHOD_PRINT = "PRINT"
PRODUCTION_EXECUTION_METHODS = frozenset(
    {PRODUCTION_EXECUTION_METHOD_WMS, PRODUCTION_EXECUTION_METHOD_PRINT}
)

#: Operator UI hint after source fulfillment (backend stores preference; redirect is FE-only).
AFTER_PRODUCTION_ACTION_STATUS_ONLY = "STATUS_ONLY"
AFTER_PRODUCTION_ACTION_OPEN_PACKING = "OPEN_PACKING"
AFTER_PRODUCTION_ACTIONS = frozenset(
    {AFTER_PRODUCTION_ACTION_STATUS_ONLY, AFTER_PRODUCTION_ACTION_OPEN_PACKING}
)


class PickingConfig(Base):
    __tablename__ = "picking_config"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "warehouse_id",
            "source_status_id",
            name="uq_picking_config_tenant_wh_source_status",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)

    source_status_id = Column(
        Integer,
        ForeignKey("order_ui_statuses.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    target_status_id = Column(
        Integer,
        ForeignKey("order_ui_statuses.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    #: Status panelu zamówień po zgłoszeniu braku podczas zbierania (WMS).
    status_on_shortage_id = Column(
        Integer,
        ForeignKey("order_ui_statuses.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    #: Kolejność / strategia zadań: ``locations`` | ``orders`` (zsynchronizowane z pick_unit + order_sort)
    strategy = Column(String(32), nullable=False)
    #: ``orders`` = zbiórka zamówienie po zamówieniu; ``products`` = agregat po produktach (jak lista produktów WMS)
    pick_unit = Column(String(32), nullable=False, default="products")
    #: Przy ``pick_unit=orders``: ``date`` | ``location`` | ``courier`` (courier — placeholder API)
    order_sort = Column(String(32), nullable=False, default="date")
    #: ``bulk`` | ``scanned`` | ``baskets`` | ``mobile`` | ``consolidation_rack``
    single_mode = Column(String(32), nullable=False)
    multi_mode = Column(String(32), nullable=False)
    #: Osobny wariant „Wszystkie zamówienia” — tylko tryby kompatybilne z single+multi:
    #: ``bulk`` | ``scanned`` | ``baskets``. NULL = brak trwałej wartości (runtime default).
    all_mode = Column(String(32), nullable=True)
    #: Osobna kolejność doboru dla ``all`` (date|location|courier). NULL → fallback na ``order_sort``.
    all_order_sort = Column(String(32), nullable=True)

    max_single_orders = Column(Integer, nullable=True)
    max_multi_orders = Column(Integer, nullable=True)
    max_all_orders = Column(Integer, nullable=True)

    #: Gdy True — konfiguracja produkcyjna (nie standardowe zbieranie).
    is_production_mode = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
        index=True,
    )
    #: Nazwa wyświetlana (głównie konfiguracje produkcji).
    name = Column(String(128), nullable=True)
    #: Soft-disable (produkcja); zbieranie zwykle kasuje wiersz.
    is_active = Column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
        index=True,
    )
    #: Status zamówienia po wykonaniu przypisanej ilości produkcji (tylko production mode).
    status_after_production_id = Column(
        Integer,
        ForeignKey("order_ui_statuses.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    #: Status przy braku komponentów do produkcji (tylko production mode).
    status_on_component_shortage_id = Column(
        Integer,
        ForeignKey("order_ui_statuses.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    #: Lokalizacja buforowa wyrobu gotowego (tylko production mode; przyjęcie później).
    finished_goods_buffer_location_id = Column(
        Integer,
        ForeignKey("locations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    #: Zakres triggera produkcji z zamówień: obecnie tylko SINGLE_ELEMENT.
    production_order_trigger_scope = Column(
        String(32),
        nullable=True,
        default=None,
    )
    #: Sposób realizacji MO z zamówień: WMS (terminal) | PRINT (wydruk zlecenia).
    production_execution_method = Column(
        String(16),
        nullable=False,
        default="WMS",
        server_default=text("'WMS'"),
    )
    #: Po wyprodukowaniu (hint UI): STATUS_ONLY | OPEN_PACKING.
    after_production_action = Column(
        String(32),
        nullable=False,
        default="STATUS_ONLY",
        server_default=text("'STATUS_ONLY'"),
    )

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    tenant = relationship("Tenant")
    warehouse = relationship("Warehouse")
    source_status = relationship("OrderUiStatus", foreign_keys=[source_status_id])
    target_status = relationship("OrderUiStatus", foreign_keys=[target_status_id])
    shortage_status = relationship("OrderUiStatus", foreign_keys=[status_on_shortage_id])
    status_after_production = relationship("OrderUiStatus", foreign_keys=[status_after_production_id])
    status_on_component_shortage = relationship(
        "OrderUiStatus", foreign_keys=[status_on_component_shortage_id]
    )
    finished_goods_buffer_location = relationship(
        "Location", foreign_keys=[finished_goods_buffer_location_id]
    )
