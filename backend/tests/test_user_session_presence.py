"""Session presence on user list — separate from account is_active."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base
from backend.models.app_user import AppUser, UserSession
from backend.schemas.app_user import AppUserListItem
from backend.services.app_user_admin_service import (
    app_user_to_list_item,
    user_ids_with_active_session,
)


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[AppUser.__table__, UserSession.__table__])
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _user(db, *, login: str, is_active: bool = True) -> AppUser:
    u = AppUser(
        login=login,
        email=f"{login}@example.com",
        password_hash="x",
        role="user",
        is_active=is_active,
        language="pl",
    )
    db.add(u)
    db.flush()
    return u


def test_user_ids_with_active_session_respects_expiry(db):
    online = _user(db, login="online_u")
    offline = _user(db, login="offline_u")
    inactive_acct = _user(db, login="inactive_acct", is_active=False)

    now = datetime.utcnow()
    db.add(
        UserSession(
            user_id=online.id,
            refresh_token_hash="hash_online",
            expires_at=now + timedelta(days=1),
        )
    )
    db.add(
        UserSession(
            user_id=offline.id,
            refresh_token_hash="hash_expired",
            expires_at=now - timedelta(minutes=1),
        )
    )
    db.add(
        UserSession(
            user_id=inactive_acct.id,
            refresh_token_hash="hash_inactive_acct",
            expires_at=now + timedelta(hours=2),
        )
    )
    db.commit()

    present = user_ids_with_active_session(db, [online.id, offline.id, inactive_acct.id])
    assert online.id in present
    assert offline.id not in present
    assert inactive_acct.id in present  # presence ≠ account active


def test_list_item_has_active_session_flag_independent_of_is_active(db, monkeypatch):
    u = _user(db, login="presence_flag", is_active=False)
    db.add(
        UserSession(
            user_id=u.id,
            refresh_token_hash="hash_presence",
            expires_at=datetime.utcnow() + timedelta(days=3),
        )
    )
    db.commit()

    # Avoid pulling full warehouse/WMS profile graph in unit DB.
    monkeypatch.setattr(
        "backend.services.app_user_admin_service.wms_profile_response",
        lambda *_a, **_k: {"wms_operational_modes": [], "default_warehouse_id": None, "language": "pl"},
    )
    monkeypatch.setattr(
        "backend.services.app_user_admin_service.warehouse_summary",
        lambda *_a, **_k: "",
    )
    monkeypatch.setattr(
        "backend.services.app_user_admin_service.warehouse_names_for_user",
        lambda *_a, **_k: [],
    )
    monkeypatch.setattr(
        "backend.services.app_user_admin_service.primary_workforce_group_badge",
        lambda *_a, **_k: None,
    )

    item = app_user_to_list_item(db, u)
    assert isinstance(item, AppUserListItem)
    assert item.is_active is False
    assert item.has_active_session is True

    item2 = app_user_to_list_item(db, u, has_active_session=False)
    assert item2.has_active_session is False
