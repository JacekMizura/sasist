"""Document creator display — full name, login, System fallback."""

from __future__ import annotations

from typing import Dict, Optional, Set

from sqlalchemy.orm import Session

from ..models.app_user import AppUser
from ..models.stock_document import StockDocument
from ..schemas.document_creator import DocumentCreatedByRead


def app_user_full_name(user: AppUser | None) -> str:
    if user is None:
        return "System"
    parts = [
        (getattr(user, "first_name", None) or "").strip(),
        (getattr(user, "last_name", None) or "").strip(),
    ]
    name = " ".join(p for p in parts if p).strip()
    if name:
        return name
    login = (getattr(user, "login", None) or "").strip()
    if login:
        return login
    return "System"


def stamp_document_creator(doc: StockDocument, user: AppUser | None) -> None:
    """Persist creator on document at insert time (denormalized name for list/PDF)."""
    if user is not None:
        doc.created_by_user_id = int(user.id)
        doc.created_by_user_name = app_user_full_name(user)[:256]
    else:
        doc.created_by_user_id = None
        doc.created_by_user_name = None


def batch_load_app_users(db: Session, user_ids: Set[int]) -> Dict[int, AppUser]:
    if not user_ids:
        return {}
    rows = db.query(AppUser).filter(AppUser.id.in_(sorted(user_ids))).all()
    return {int(u.id): u for u in rows}


def created_by_read_for_document(
    doc: StockDocument, users_by_id: Optional[Dict[int, AppUser]] = None
) -> DocumentCreatedByRead:
    uid_raw = getattr(doc, "created_by_user_id", None)
    uid = int(uid_raw) if uid_raw is not None else None
    stored = (getattr(doc, "created_by_user_name", None) or "").strip()
    u = users_by_id.get(uid) if users_by_id is not None and uid is not None else None
    if u is not None:
        full = stored or app_user_full_name(u)
        login = (getattr(u, "login", None) or "").strip() or None
        return DocumentCreatedByRead(id=uid, login=login, full_name=full)
    if stored:
        return DocumentCreatedByRead(id=uid, login=None, full_name=stored)
    return DocumentCreatedByRead(id=None, login=None, full_name="System")
