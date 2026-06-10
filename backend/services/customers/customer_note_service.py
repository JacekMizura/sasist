"""Notatki handlowe klienta."""

from __future__ import annotations

from datetime import datetime
from typing import List

from sqlalchemy.orm import Session

from ...models.app_user import AppUser
from ...models.customer import Customer
from ...models.customer_crm import CustomerNote


class CustomerNoteError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


def _author_name(db: Session, user_id: int | None) -> str | None:
    if not user_id:
        return None
    user = db.query(AppUser).filter(AppUser.id == int(user_id)).first()
    if not user:
        return None
    fn = (user.first_name or "").strip()
    ln = (user.last_name or "").strip()
    full = f"{fn} {ln}".strip()
    return full or (user.email or user.username or f"#{user.id}")


def _assert_customer(db: Session, *, customer_id: int, tenant_id: int) -> Customer:
    row = (
        db.query(Customer)
        .filter(
            Customer.id == int(customer_id),
            Customer.tenant_id == int(tenant_id),
            Customer.deleted_at.is_(None),
        )
        .first()
    )
    if row is None:
        raise CustomerNoteError("not_found", "Nie znaleziono klienta.")
    return row


def list_customer_notes(db: Session, *, customer_id: int, tenant_id: int) -> List[dict]:
    _assert_customer(db, customer_id=customer_id, tenant_id=tenant_id)
    rows = (
        db.query(CustomerNote)
        .filter(
            CustomerNote.customer_id == int(customer_id),
            CustomerNote.tenant_id == int(tenant_id),
            CustomerNote.deleted_at.is_(None),
        )
        .order_by(CustomerNote.is_pinned.desc(), CustomerNote.updated_at.desc())
        .all()
    )
    return [
        {
            "id": int(n.id),
            "customer_id": int(n.customer_id),
            "body": n.body,
            "is_pinned": bool(n.is_pinned),
            "author_name": _author_name(db, n.created_by_user_id),
            "created_at": n.created_at,
            "updated_at": n.updated_at,
        }
        for n in rows
    ]


def create_customer_note(
    db: Session,
    *,
    customer_id: int,
    tenant_id: int,
    body: str,
    is_pinned: bool = False,
    user_id: int | None = None,
) -> dict:
    _assert_customer(db, customer_id=customer_id, tenant_id=tenant_id)
    row = CustomerNote(
        tenant_id=int(tenant_id),
        customer_id=int(customer_id),
        body=str(body).strip(),
        is_pinned=bool(is_pinned),
        created_by_user_id=int(user_id) if user_id else None,
    )
    db.add(row)
    db.flush()
    return {
        "id": int(row.id),
        "customer_id": int(row.customer_id),
        "body": row.body,
        "is_pinned": bool(row.is_pinned),
        "author_name": _author_name(db, row.created_by_user_id),
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def update_customer_note(
    db: Session,
    *,
    note_id: int,
    customer_id: int,
    tenant_id: int,
    body: str | None = None,
    is_pinned: bool | None = None,
) -> dict:
    _assert_customer(db, customer_id=customer_id, tenant_id=tenant_id)
    row = (
        db.query(CustomerNote)
        .filter(
            CustomerNote.id == int(note_id),
            CustomerNote.customer_id == int(customer_id),
            CustomerNote.tenant_id == int(tenant_id),
            CustomerNote.deleted_at.is_(None),
        )
        .first()
    )
    if row is None:
        raise CustomerNoteError("note_not_found", "Nie znaleziono notatki.")
    if body is not None:
        row.body = str(body).strip()
    if is_pinned is not None:
        row.is_pinned = bool(is_pinned)
    row.updated_at = datetime.utcnow()
    db.flush()
    return {
        "id": int(row.id),
        "customer_id": int(row.customer_id),
        "body": row.body,
        "is_pinned": bool(row.is_pinned),
        "author_name": _author_name(db, row.created_by_user_id),
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def soft_delete_customer_note(
    db: Session,
    *,
    note_id: int,
    customer_id: int,
    tenant_id: int,
) -> None:
    _assert_customer(db, customer_id=customer_id, tenant_id=tenant_id)
    row = (
        db.query(CustomerNote)
        .filter(
            CustomerNote.id == int(note_id),
            CustomerNote.customer_id == int(customer_id),
            CustomerNote.tenant_id == int(tenant_id),
            CustomerNote.deleted_at.is_(None),
        )
        .first()
    )
    if row is None:
        raise CustomerNoteError("note_not_found", "Nie znaleziono notatki.")
    row.deleted_at = datetime.utcnow()
