"""User warehouse assignments + active warehouse context."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.app_user import AppUser, UserWmsProfile
from backend.models.user_warehouse_assignment import UserWarehouseAssignment
from backend.models.warehouse import Warehouse
from backend.services.user_warehouse_context_service import (
    resolve_active_warehouse_id,
    set_active_warehouse,
    sync_user_warehouse_assignments,
    user_can_operate_warehouse,
    UserWarehouseAccessError,
)


@pytest.fixture
def uwa_db():
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

    user = AppUser(id=1, login="jan", email="jan@test.pl", password_hash="x", role="user", is_active=True)
    db.add(user)
    for wid, name in ((1, "Warszawa"), (2, "Poznań"), (3, "Gdańsk")):
        db.add(Warehouse(id=wid, tenant_id=1, name=name))
    db.commit()

    try:
        yield db, user
    finally:
        db.close()


def test_login_default_warehouse_warsaw(uwa_db):
    db, user = uwa_db
    sync_user_warehouse_assignments(
        db,
        user_id=1,
        warehouse_ids=[1, 2],
        default_warehouse_id=1,
    )
    db.commit()

    active = resolve_active_warehouse_id(db, user)
    db.commit()

    assert active == 1


def test_switch_warsaw_to_poznan(uwa_db):
    db, user = uwa_db
    sync_user_warehouse_assignments(db, user_id=1, warehouse_ids=[1, 2], default_warehouse_id=1)
    db.commit()

    resolve_active_warehouse_id(db, user)
    set_active_warehouse(db, user, 2)
    db.commit()

    profile = db.query(UserWmsProfile).filter(UserWmsProfile.user_id == 1).first()
    assert profile is not None
    assert int(profile.active_warehouse_id) == 2


def test_cannot_switch_to_gdansk_without_assignment(uwa_db):
    db, user = uwa_db
    sync_user_warehouse_assignments(db, user_id=1, warehouse_ids=[1, 2], default_warehouse_id=1)
    db.commit()

    with pytest.raises(UserWarehouseAccessError):
        set_active_warehouse(db, user, 3)

    from backend.services.user_warehouse_context_service import user_can_operate_warehouse

    assert user_can_operate_warehouse(db, user, 3) is False
