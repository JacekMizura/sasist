"""
Limit paczek bez potwierdzenia kierownika (umowa własna).

  python -m pytest backend/tests/test_packing_multi_parcel_manager_gate.py -q
"""

from __future__ import annotations

import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.app_user import AppUser, UserWmsProfile
from backend.models.order import Order
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_packing_settings import WmsPackingSettings
from backend.services.packing_multi_parcel_gate import (
    MANAGER_APPROVAL_REQUIRED,
    approve_multi_parcel_by_manager_barcode,
    assert_finish_packaging_count_allowed,
    evaluate_extra_parcel_gate,
    load_multi_parcel_settings,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for m in (Tenant, Warehouse, AppUser, UserWmsProfile, Order, WmsPackingSettings):
        m.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(
        AppUser(
            id=10,
            login="worker",
            email="w@x.pl",
            password_hash="x",
            role="user",
            is_active=True,
            language="pl",
        )
    )
    session.add(
        AppUser(
            id=20,
            login="manager",
            email="m@x.pl",
            password_hash="x",
            role="admin",
            is_active=True,
            language="pl",
        )
    )
    session.add(
        UserWmsProfile(
            user_id=10,
            barcode_login_code="WRK001",
            packing_permissions_json=None,
            language="pl",
            timezone="Europe/Warsaw",
        )
    )
    session.add(
        UserWmsProfile(
            user_id=20,
            barcode_login_code="MGR001",
            packing_permissions_json=json.dumps(["kierownik"]),
            language="pl",
            timezone="Europe/Warsaw",
        )
    )
    session.add(
        WmsPackingSettings(
            tenant_id=1,
            warehouse_id=1,
            multi_parcel_json=json.dumps(
                {"enable_multi_parcel": True, "parcel_limit_without_manager_confirm": 1}
            ),
        )
    )
    session.commit()
    try:
        yield session
    finally:
        session.close()


def _order(db, *, number: str = "A1") -> Order:
    o = Order(
        tenant_id=1,
        warehouse_id=1,
        number=number,
        status="PACKING",
        fulfillment_state="READY_TO_PACK",
    )
    db.add(o)
    db.flush()
    return o


def _worker(db) -> AppUser:
    return db.query(AppUser).filter(AppUser.id == 10).one()


def _manager(db) -> AppUser:
    return db.query(AppUser).filter(AppUser.id == 20).one()


def test_limit_1_first_parcel_ok(db):
    o = _order(db)
    gate = evaluate_extra_parcel_gate(
        db,
        tenant_id=1,
        warehouse_id=1,
        order=o,
        current_user=_worker(db),
        intended_packaging_count=1,
    )
    assert gate["allowed"] is True
    assert gate["requires_manager_approval"] is False


def test_limit_1_second_parcel_blocked_for_worker(db):
    o = _order(db)
    gate = evaluate_extra_parcel_gate(
        db,
        tenant_id=1,
        warehouse_id=1,
        order=o,
        current_user=_worker(db),
        intended_packaging_count=2,
    )
    assert gate["allowed"] is False
    assert gate["requires_manager_approval"] is True
    with pytest.raises(ValueError, match=MANAGER_APPROVAL_REQUIRED):
        assert_finish_packaging_count_allowed(
            db,
            tenant_id=1,
            warehouse_id=1,
            order=o,
            current_user=_worker(db),
            packaging_carton_ids=["c1", "c2"],
        )


def test_limit_1_second_parcel_ok_after_manager_scan(db):
    o = _order(db)
    approve_multi_parcel_by_manager_barcode(db, order=o, barcode="MGR001")
    db.commit()
    gate = evaluate_extra_parcel_gate(
        db,
        tenant_id=1,
        warehouse_id=1,
        order=o,
        current_user=_worker(db),
        intended_packaging_count=2,
    )
    assert gate["allowed"] is True
    assert_finish_packaging_count_allowed(
        db,
        tenant_id=1,
        warehouse_id=1,
        order=o,
        current_user=_worker(db),
        packaging_carton_ids=["c1", "c2"],
    )


def test_after_approval_third_and_fourth_ok_without_rescan(db):
    o = _order(db)
    approve_multi_parcel_by_manager_barcode(db, order=o, barcode="MGR001")
    db.commit()
    for n in (3, 4, 5):
        gate = evaluate_extra_parcel_gate(
            db,
            tenant_id=1,
            warehouse_id=1,
            order=o,
            current_user=_worker(db),
            intended_packaging_count=n,
        )
        assert gate["allowed"] is True


def test_worker_cannot_bypass_via_finish_api_logic(db):
    o = _order(db)
    with pytest.raises(ValueError, match=MANAGER_APPROVAL_REQUIRED):
        assert_finish_packaging_count_allowed(
            db,
            tenant_id=1,
            warehouse_id=1,
            order=o,
            current_user=_worker(db),
            packaging_carton_ids=["a", "b", "c"],
        )


def test_manager_operator_can_exceed_limit(db):
    o = _order(db)
    gate = evaluate_extra_parcel_gate(
        db,
        tenant_id=1,
        warehouse_id=1,
        order=o,
        current_user=_manager(db),
        intended_packaging_count=4,
    )
    assert gate["allowed"] is True
    # Admin bez tagu kierownik — NIE
    admin_no_tag = AppUser(
        id=30,
        login="admin2",
        email="a2@x.pl",
        password_hash="x",
        role="admin",
        is_active=True,
        language="pl",
    )
    db.add(admin_no_tag)
    db.add(
        UserWmsProfile(
            user_id=30,
            barcode_login_code="ADM001",
            packing_permissions_json=None,
            language="pl",
            timezone="Europe/Warsaw",
        )
    )
    db.commit()
    gate2 = evaluate_extra_parcel_gate(
        db,
        tenant_id=1,
        warehouse_id=1,
        order=o,
        current_user=admin_no_tag,
        intended_packaging_count=4,
    )
    assert gate2["allowed"] is False


def test_approval_does_not_transfer_to_other_order(db):
    o1 = _order(db, number="O1")
    o2 = _order(db, number="O2")
    approve_multi_parcel_by_manager_barcode(db, order=o1, barcode="MGR001")
    db.commit()
    g1 = evaluate_extra_parcel_gate(
        db, tenant_id=1, warehouse_id=1, order=o1, current_user=_worker(db), intended_packaging_count=3
    )
    g2 = evaluate_extra_parcel_gate(
        db, tenant_id=1, warehouse_id=1, order=o2, current_user=_worker(db), intended_packaging_count=3
    )
    assert g1["allowed"] is True
    assert g2["allowed"] is False


def test_multi_parcel_disabled_does_not_gate(db):
    row = db.query(WmsPackingSettings).one()
    row.multi_parcel_json = json.dumps(
        {"enable_multi_parcel": False, "parcel_limit_without_manager_confirm": 1}
    )
    db.commit()
    enabled, limit = load_multi_parcel_settings(db, tenant_id=1, warehouse_id=1)
    assert enabled is False
    assert limit == 1
    o = _order(db)
    gate = evaluate_extra_parcel_gate(
        db,
        tenant_id=1,
        warehouse_id=1,
        order=o,
        current_user=_worker(db),
        intended_packaging_count=9,
    )
    assert gate["allowed"] is True
    assert_finish_packaging_count_allowed(
        db,
        tenant_id=1,
        warehouse_id=1,
        order=o,
        current_user=_worker(db),
        packaging_carton_ids=["1", "2", "3", "4"],
    )
