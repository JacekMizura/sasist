"""P1 warehouse access enforcement tests."""

from __future__ import annotations

import os

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.auth.deps import get_current_user
from backend.auth.warehouse_deps import enforce_warehouse_access
from backend.database import get_db
from backend.models.app_user import AppUser, UserWmsProfile
from backend.models.user_warehouse_assignment import UserWarehouseAssignment
from backend.models.warehouse import Warehouse
from backend.services.user_warehouse_context_service import (
    UserWarehouseAccessError,
    list_operable_warehouse_ids,
    sync_user_warehouse_assignments,
    user_can_operate_warehouse,
)


@pytest.fixture
def wh_db(monkeypatch):
    monkeypatch.setenv("WMS_ENFORCE_WAREHOUSE_ASSIGNMENTS", "hard")
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))

    AppUser.__table__.create(engine, checkfirst=True)
    UserWmsProfile.__table__.create(engine, checkfirst=True)
    Warehouse.__table__.create(engine, checkfirst=True)
    UserWarehouseAssignment.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()

    def _user(uid: int, login: str, role: str = "user") -> AppUser:
        u = AppUser(
            id=uid,
            login=login,
            email=f"{login}@test.pl",
            password_hash="x",
            role=role,
            is_active=True,
        )
        db.add(u)
        return u

    _user(1, "warsaw_op")
    _user(2, "multi_op")
    _user(3, "no_wh")
    _user(4, "super", role="super_admin")
    for wid, name in ((1, "Warszawa"), (2, "Poznań")):
        db.add(Warehouse(id=wid, tenant_id=1, name=name))
    db.commit()

    sync_user_warehouse_assignments(db, user_id=1, warehouse_ids=[1], default_warehouse_id=1)
    sync_user_warehouse_assignments(db, user_id=2, warehouse_ids=[1, 2], default_warehouse_id=1)
    db.commit()

    try:
        yield db
    finally:
        db.close()


def test_warsaw_operator_can_access_warsaw_only(wh_db):
    db = wh_db
    user = db.query(AppUser).filter(AppUser.id == 1).first()
    assert user is not None
    assert user_can_operate_warehouse(db, user, 1) is True
    assert user_can_operate_warehouse(db, user, 2) is False
    with pytest.raises(UserWarehouseAccessError):
        enforce_warehouse_access(db, user, 2)


def test_multi_warehouse_operator(wh_db):
    db = wh_db
    user = db.query(AppUser).filter(AppUser.id == 2).first()
    assert user is not None
    assert user_can_operate_warehouse(db, user, 1) is True
    assert user_can_operate_warehouse(db, user, 2) is True


def test_user_without_assignments_has_no_operable_warehouses(wh_db):
    db = wh_db
    user = db.query(AppUser).filter(AppUser.id == 3).first()
    assert user is not None
    assert list_operable_warehouse_ids(db, user) == []
    assert user_can_operate_warehouse(db, user, 1) is False


def test_superadmin_all_warehouses(wh_db):
    db = wh_db
    user = db.query(AppUser).filter(AppUser.id == 4).first()
    assert user is not None
    ids = list_operable_warehouse_ids(db, user)
    assert 1 in ids and 2 in ids
    assert user_can_operate_warehouse(db, user, 1) is True
    assert user_can_operate_warehouse(db, user, 2) is True


def test_log_only_mode_allows_unauthorized(monkeypatch, wh_db):
    monkeypatch.setenv("WMS_ENFORCE_WAREHOUSE_ASSIGNMENTS", "log")
    db = wh_db
    user = db.query(AppUser).filter(AppUser.id == 1).first()
    assert user is not None
    enforce_warehouse_access(db, user, 2)


def test_validate_wms_warehouse_profile_operational_requires_wh(wh_db):
    from backend.services.app_user_admin_service import validate_wms_warehouse_profile

    db = wh_db
    with pytest.raises(ValueError, match="WMS_WAREHOUSE_REQUIRED"):
        validate_wms_warehouse_profile(
            db,
            role="user",
            warehouse_ids=[],
            default_warehouse_id=None,
            wms_operational_modes=["picking"],
        )


def test_validate_default_must_be_assigned(wh_db):
    from backend.services.app_user_admin_service import validate_wms_warehouse_profile

    db = wh_db
    with pytest.raises(ValueError, match="DEFAULT_WAREHOUSE_NOT_ASSIGNED"):
        validate_wms_warehouse_profile(
            db,
            role="user",
            warehouse_ids=[1],
            default_warehouse_id=2,
            wms_operational_modes=["picking"],
        )
