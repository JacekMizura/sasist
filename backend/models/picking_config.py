"""
Reguły zbierania per status panelu zamówień (Order UI status) dla magazynu.

Izolowany moduł — nie wpływa na istniejące przypisania zamówień ani MM.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from ..database import Base


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
    #: ``bulk`` | ``scanned`` | ``baskets`` | ``mobile``
    single_mode = Column(String(32), nullable=False)
    multi_mode = Column(String(32), nullable=False)

    max_single_orders = Column(Integer, nullable=True)
    max_multi_orders = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    tenant = relationship("Tenant")
    warehouse = relationship("Warehouse")
    source_status = relationship("OrderUiStatus", foreign_keys=[source_status_id])
    target_status = relationship("OrderUiStatus", foreign_keys=[target_status_id])
    shortage_status = relationship("OrderUiStatus", foreign_keys=[status_on_shortage_id])
