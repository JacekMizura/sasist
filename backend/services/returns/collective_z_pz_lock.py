"""Transactional lock for warehouse-scoped collective Z-PZ documents."""

from __future__ import annotations

import hashlib
import logging
from datetime import date
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def collective_z_pz_lock_key(tenant_id: int, warehouse_id: int, business_date: Optional[date] = None) -> int:
    """One open collective Z-PZ per warehouse — date ignored (legacy param kept for callers)."""
    raw = f"z_pz_collective:{int(tenant_id)}:{int(warehouse_id)}"
    return int.from_bytes(hashlib.sha256(raw.encode()).digest()[:8], "big", signed=True)


def acquire_collective_z_pz_lock(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    business_date: Optional[date] = None,
) -> None:
    """PostgreSQL advisory xact lock; no-op on SQLite (partial unique index is fallback)."""
    bind = db.get_bind()
    if bind is not None and bind.dialect.name == "postgresql":
        key = collective_z_pz_lock_key(tenant_id, warehouse_id)
        db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": key})
        logger.debug(
            "[Z-PZ] advisory lock tenant=%s wh=%s key=%s",
            tenant_id,
            warehouse_id,
            key,
        )


def dialect_supports_for_update(db: Session) -> bool:
    bind = db.get_bind()
    return bind is not None and bind.dialect.name == "postgresql"
