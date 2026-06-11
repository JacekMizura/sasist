"""Transactional lock for daily collective Z-PZ documents."""

from __future__ import annotations

import hashlib
import logging
from datetime import date
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def collective_z_pz_lock_key(tenant_id: int, warehouse_id: int, business_date: date) -> int:
    raw = f"z_pz_collective:{int(tenant_id)}:{int(warehouse_id)}:{business_date.isoformat()}"
    return int.from_bytes(hashlib.sha256(raw.encode()).digest()[:8], "big", signed=True)


def acquire_collective_z_pz_lock(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    business_date: date,
) -> None:
    """PostgreSQL advisory xact lock; no-op on SQLite (unique index is fallback)."""
    bind = db.get_bind()
    if bind is not None and bind.dialect.name == "postgresql":
        key = collective_z_pz_lock_key(tenant_id, warehouse_id, business_date)
        db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": key})
        logger.debug(
            "[Z-PZ] advisory lock tenant=%s wh=%s date=%s key=%s",
            tenant_id,
            warehouse_id,
            business_date,
            key,
        )


def dialect_supports_for_update(db: Session) -> bool:
    bind = db.get_bind()
    return bind is not None and bind.dialect.name == "postgresql"
