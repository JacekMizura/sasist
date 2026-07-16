"""Resolve and manage system_labels dictionary."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from ..models.system_label import SystemLabel
from .system_label_catalog import SYSTEM_LABEL_SEED


def resolve_label_value(row: SystemLabel) -> str:
    custom = (row.custom_value or "").strip()
    if custom:
        return custom
    return row.default_value or ""


def get_label(db: Session, key: str, fallback: str = "", *, tenant_id: int | None = None) -> str:
    """Prefer tenant override, then global row, then fallback."""
    q = db.query(SystemLabel).filter(SystemLabel.key == key)
    if tenant_id is not None:
        row = q.filter(SystemLabel.tenant_id == tenant_id).first()
        if row is not None:
            return resolve_label_value(row) or fallback
    row = q.filter(SystemLabel.tenant_id.is_(None)).first()
    if row is not None:
        return resolve_label_value(row) or fallback
    return fallback


def seed_system_labels(db: Session) -> int:
    """Insert missing global catalog keys. Returns number of inserted rows."""
    existing = {
        r.key
        for r in db.query(SystemLabel.key).filter(SystemLabel.tenant_id.is_(None)).all()
    }
    inserted = 0
    for key, default_value, category, description in SYSTEM_LABEL_SEED:
        if key in existing:
            # Keep default_value in sync with catalog when never customized.
            row = (
                db.query(SystemLabel)
                .filter(SystemLabel.key == key, SystemLabel.tenant_id.is_(None))
                .first()
            )
            if row is not None and not (row.custom_value or "").strip():
                if row.default_value != default_value:
                    row.default_value = default_value
                    row.updated_at = datetime.utcnow()
            continue
        db.add(
            SystemLabel(
                key=key,
                default_value=default_value,
                custom_value=None,
                tenant_id=None,
                description=description,
                category=category,
            )
        )
        inserted += 1
        existing.add(key)
    if inserted:
        db.commit()
    else:
        db.commit()
    return inserted


def list_labels(
    db: Session,
    *,
    tenant_id: int | None = None,
    category: str | None = None,
    q: str | None = None,
) -> list[SystemLabel]:
    query = db.query(SystemLabel).filter(SystemLabel.tenant_id.is_(None))
    if tenant_id is not None:
        # Merge: tenant overrides listed separately in admin; list global for dictionary UI.
        pass
    if category:
        query = query.filter(SystemLabel.category == category)
    rows = query.order_by(SystemLabel.category.asc(), SystemLabel.key.asc()).all()
    if q:
        needle = q.strip().lower()
        if needle:
            rows = [
                r
                for r in rows
                if needle in (r.key or "").lower()
                or needle in (r.default_value or "").lower()
                or needle in (r.custom_value or "").lower()
                or needle in (r.description or "").lower()
            ]
    return rows


def resolved_map(db: Session, *, tenant_id: int | None = None) -> dict[str, str]:
    rows = db.query(SystemLabel).filter(SystemLabel.tenant_id.is_(None)).all()
    out = {r.key: resolve_label_value(r) for r in rows}
    if tenant_id is not None:
        overrides = (
            db.query(SystemLabel).filter(SystemLabel.tenant_id == tenant_id).all()
        )
        for r in overrides:
            out[r.key] = resolve_label_value(r)
    return out


def update_custom_value(db: Session, label_id: int, custom_value: str | None) -> SystemLabel:
    row = db.query(SystemLabel).filter(SystemLabel.id == label_id).first()
    if row is None:
        raise LookupError("NOT_FOUND")
    if custom_value is None or not str(custom_value).strip():
        row.custom_value = None
    else:
        row.custom_value = str(custom_value).strip()
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row
