"""
Panel-only return labels (office / biuro).

Separate from ReturnStatus (RMZ workflow). Used for filtering and triage in the orders UI.
"""

from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, UniqueConstraint, text

from ..database import Base


class ReturnUiStatus(Base):
    __tablename__ = "return_ui_statuses"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "warehouse_id", "main_group", "name", name="uq_return_ui_wh_group_name"
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)
    # Fixed panel buckets: NEW | IN_PROGRESS | DONE (not editable as rows — only on sub-status).
    main_group = Column(String(24), nullable=False, default="NEW", index=True)
    name = Column(String(128), nullable=False)
    color = Column(String(32), nullable=False, default="#64748b")
    sort_order = Column(Integer, nullable=False, default=0)

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
