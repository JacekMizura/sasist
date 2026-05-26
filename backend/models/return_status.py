"""
Configurable RMZ (return) statuses per tenant + warehouse.

`type` drives business logic (never use `name` in code).
`transition_key` wires workflow automation to a stable row per (tenant, warehouse).
"""

from sqlalchemy import Column, ForeignKey, Integer, String

from ..database import Base


class ReturnStatus(Base):
    __tablename__ = "return_statuses"
    # Uniqueness of transition_key per (tenant, warehouse) enforced in API + partial index in SQLite migration

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)

    name = Column(String(128), nullable=False)
    color = Column(String(32), nullable=False, default="blue")
    # in_progress | done_success | done_rejected
    type = Column(String(24), nullable=False, index=True)

    # Workflow hook: start | office_pending | qc_complete | success | rejected (nullable for cosmetic-only rows)
    transition_key = Column(String(32), nullable=True, index=True)
