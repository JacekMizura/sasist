"""
Panel-only order labels (office / biuro).

Separate from Order.status (workflow / system). Used for filtering and triage in the orders list UI.
"""

from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, UniqueConstraint, text

from ..database import Base


class OrderUiStatus(Base):
    __tablename__ = "order_ui_statuses"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "warehouse_id", "main_group", "name", name="uq_order_ui_wh_group_name"
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)
    main_group = Column(String(24), nullable=False, default="NEW", index=True)
    name = Column(String(128), nullable=False)
    color = Column(String(32), nullable=False, default="#64748b")
    sort_order = Column(Integer, nullable=False, default=0)
    is_system = Column(Boolean, nullable=False, default=False, server_default=text("false"))

    #: Etykieta głównej grupy (np. „Nowe”) — opcjonalna nadpisana nazwa widoczna w panelu.
    group_name = Column(String(128), nullable=True)
    subgroup_name = Column(String(128), nullable=True)
    sort_group = Column(Integer, nullable=False, default=0)
    sort_subgroup = Column(Integer, nullable=False, default=0)
    sort_status = Column(Integer, nullable=False, default=0)
    badge_color = Column(String(32), nullable=True)
    background_color = Column(String(32), nullable=True)
    text_color = Column(String(32), nullable=True)
    image_url = Column(String(512), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default=text("true"))
