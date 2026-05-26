"""Słownik podgrup panelu zamówień (office) — nazwy wielokrotnego użytku dla statusów."""

from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint

from ..database import Base


class OrderUiPanelSubgroup(Base):
    __tablename__ = "order_ui_panel_subgroups"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "warehouse_id",
            "main_group",
            "name",
            name="uq_order_ui_panel_sg_wh_mg_name",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)
    main_group = Column(String(24), nullable=False, default="NEW", index=True)
    name = Column(String(128), nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
