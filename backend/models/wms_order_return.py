"""
WMS order-linked return (RMZ) — operational returns tied to an order, not a global list.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from ..database import Base


class WmsOrderReturn(Base):
    __tablename__ = "wms_order_returns"
    __table_args__ = (
        UniqueConstraint("tenant_id", "warehouse_id", "rmz_number", name="uq_wms_order_returns_tenant_wh_rmz"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)

    # External id of the underlying order (e.g. Sellasist stable identifier)
    external_id = Column(String(128), nullable=True, index=True)

    rmz_number = Column(String(48), nullable=False, index=True)
    return_type = Column(String(24), nullable=False, default="RMA", index=True)
    status_id = Column(Integer, ForeignKey("return_statuses.id"), nullable=False, index=True)
    # Panel/office triage label — NOT workflow ReturnStatus (see return_ui_statuses).
    ui_status_id = Column(Integer, ForeignKey("return_ui_statuses.id", ondelete="SET NULL"), nullable=True, index=True)
    lines_json = Column(Text, nullable=False, default="[]")

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    #: Archiwizacja zwrotu (linie RMZ/refund kasowane w serwisie); NULL = aktywny.
    deleted_at = Column(DateTime, nullable=True, index=True)

    order = relationship("Order", foreign_keys=[order_id])
    return_status = relationship("ReturnStatus", foreign_keys=[status_id])
    ui_status = relationship("ReturnUiStatus", foreign_keys=[ui_status_id])

    rmz_lines = relationship("RMZLine", backref="rmz_return", cascade="all, delete-orphan")
    refund = relationship("WmsRefund", backref="rmz_return", uselist=False, cascade="all, delete-orphan")
