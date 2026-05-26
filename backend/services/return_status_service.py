"""
Return (RMZ) status rows: defaults, lookup by workflow key, logic uses `type` only.
"""

from __future__ import annotations

from typing import List, Optional, Sequence, Tuple

from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from ..models.return_status import ReturnStatus

# (transition_key, name, color, type)
DEFAULT_STATUSES: Sequence[Tuple[str, str, str, str]] = (
    ("start", "W trakcie", "blue", "in_progress"),
    ("office_pending", "Oczekuje na biuro", "slate", "in_progress"),
    ("qc_complete", "Kontrola zakończona", "amber", "in_progress"),
    ("success", "Zrealizowany", "green", "done_success"),
    ("rejected", "Odrzucony", "red", "done_rejected"),
)


def seed_default_statuses_session(db: Session, tenant_id: int, warehouse_id: int) -> None:
    for tkey, name, color, stype in DEFAULT_STATUSES:
        exists = (
            db.query(ReturnStatus.id)
            .filter(
                ReturnStatus.tenant_id == tenant_id,
                ReturnStatus.warehouse_id == warehouse_id,
                ReturnStatus.transition_key == tkey,
            )
            .first()
        )
        if exists:
            continue
        db.add(
            ReturnStatus(
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                name=name,
                color=color,
                type=stype,
                transition_key=tkey,
            )
        )
    db.commit()


def get_by_transition_key(db: Session, tenant_id: int, warehouse_id: int, key: str) -> Optional[ReturnStatus]:
    return (
        db.query(ReturnStatus)
        .filter(
            ReturnStatus.tenant_id == tenant_id,
            ReturnStatus.warehouse_id == warehouse_id,
            ReturnStatus.transition_key == key,
        )
        .first()
    )


def list_for_warehouse(db: Session, tenant_id: int, warehouse_id: int) -> List[ReturnStatus]:
    return (
        db.query(ReturnStatus)
        .filter(ReturnStatus.tenant_id == tenant_id, ReturnStatus.warehouse_id == warehouse_id)
        .order_by(ReturnStatus.id.asc())
        .all()
    )


def legacy_status_to_transition_key(legacy: str) -> str:
    s = (legacy or "").strip().upper()
    if s in ("NEW", "PENDING", ""):
        return "start"
    if s == "RECEIVED":
        return "office_pending"
    if s in ("QC_DONE", "QC-DONE"):
        return "qc_complete"
    if s in ("FINISHED", "COMPLETED"):
        return "success"
    return "start"


def ensure_defaults_raw_conn(conn: Connection, tenant_id: int, warehouse_id: int) -> None:
    """SQL-only seed (migration); idempotent."""
    for tkey, name, color, stype in DEFAULT_STATUSES:
        conn.execute(
            text(
                """
                INSERT INTO return_statuses (tenant_id, warehouse_id, name, color, type, transition_key)
                SELECT :tid, :wid, :name, :color, :stype, :tkey
                WHERE NOT EXISTS (
                    SELECT 1 FROM return_statuses rs
                    WHERE rs.tenant_id = :tid AND rs.warehouse_id = :wid AND rs.transition_key = :tkey
                )
                """
            ),
            {"tid": tenant_id, "wid": warehouse_id, "name": name, "color": color, "stype": stype, "tkey": tkey},
        )
