"""Backfill mail permissions for owner/admin users."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.auth.permission_catalog import PERMISSION_KEYS, ROLE_PERMISSION_PRESETS
from backend.models.app_user import AppUser, UserPermission
from backend.models.tenant import Tenant
from backend.services.mail.permission_backfill import (
    MAIL_MODULE_PERMISSIONS,
    backfill_mail_permissions_for_full_access_users,
)


@pytest.fixture
def perm_db():
    engine = create_engine("sqlite:///:memory:")
    for model in (Tenant, AppUser, UserPermission):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="T1", default_warehouse_id=1))
    db.add(
        AppUser(
            id=1,
            login="owner",
            password_hash="x",
            role="user",
            is_owner=True,
            is_active=True,
        )
    )
    db.add(
        AppUser(
            id=2,
            login="plain",
            password_hash="x",
            role="user",
            is_owner=False,
            is_active=True,
        )
    )
    db.commit()
    yield db
    db.close()


def test_admin_role_preset_includes_mail_permissions():
    admin = set(ROLE_PERMISSION_PRESETS["admin"])
    for key in MAIL_MODULE_PERMISSIONS:
        assert key in admin
        assert key in PERMISSION_KEYS


def test_mail_permission_backfill_grants_owner(perm_db):
    n = backfill_mail_permissions_for_full_access_users(perm_db)
    assert n == 1
    keys = {
        row[0]
        for row in perm_db.query(UserPermission.permission_key)
        .filter(UserPermission.user_id == 1)
        .all()
    }
    for k in MAIL_MODULE_PERMISSIONS:
        assert k in keys


def test_mail_permission_backfill_skips_plain_user(perm_db):
    backfill_mail_permissions_for_full_access_users(perm_db)
    count = perm_db.query(UserPermission).filter(UserPermission.user_id == 2).count()
    assert count == 0
