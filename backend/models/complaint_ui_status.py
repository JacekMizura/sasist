"""
Panel-only complaint labels (office / biuro).

Tenant-scoped sub-statuses under fixed main groups (NEW / IN_PROGRESS / DONE).
Separate from any future operational complaint workflow fields on Complaint.
"""

from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint

from ..database import Base


class ComplaintUiStatus(Base):
    __tablename__ = "complaint_ui_statuses"
    __table_args__ = (
        UniqueConstraint("tenant_id", "main_group", "name", name="uq_complaint_ui_tenant_group_name"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    main_group = Column(String(24), nullable=False, default="NEW", index=True)
    name = Column(String(128), nullable=False)
    color = Column(String(32), nullable=False, default="#64748b")
    sort_order = Column(Integer, nullable=False, default=0)
