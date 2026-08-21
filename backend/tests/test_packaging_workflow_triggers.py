"""Packaging workflow trigger split: Smart vs 3D status intents + assign policy."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.carton import Carton, carton_shipping_method_links
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.order_ui_status import OrderUiStatus
from backend.models.product import Product
from backend.models.shipping_method import ShippingMethod
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_smart_matching import WmsSmartMatchingSettings
from backend.models.wms_three_d_matching import WmsThreeDMatchingEvent
from backend.schemas.packaging_intelligence import PackagingSuggestionOut
from backend.services.packaging_engine.packaging_assign import (
    CARTON_SOURCE_MANUAL,
    CARTON_SOURCE_SMART,
    CARTON_SOURCE_THREE_D,
    set_order_selected_carton,
)
from backend.services.packaging_engine.smart_matching_store import (
    effective_smart_proposal_init_status_id,
    effective_three_d_proposal_init_status_id,
    get_or_create_settings,
    save_settings,
    settings_to_out,
)
from backend.services.packaging_engine.smart_matching_triggers import (
    on_order_status_changed_packaging,
    on_order_status_changed_smart_matching,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        OrderUiStatus,
        Product,
        ShippingMethod,
        Carton,
        Order,
        OrderItem,
        WmsSmartMatchingSettings,
        WmsThreeDMatchingEvent,
    ):
        model.__table__.create(engine, checkfirst=True)
    with engine.begin() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS wm_price_tiers ("
            "id VARCHAR(36) PRIMARY KEY, tenant_id INTEGER, warehouse_id INTEGER, "
            "carton_id VARCHAR(36), packaging_material_id VARCHAR(36), sort_index INTEGER, "
            "qty_from FLOAT, package_qty FLOAT, package_net_total FLOAT, "
            "package_gross_total FLOAT, created_at DATETIME, updated_at DATETIME)"
        )
    carton_shipping_method_links.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(Warehouse(id=2, tenant_id=1, name="WH2"))
    for sid, name in ((10, "Nowe"), (20, "Do pakowania"), (30, "Etykieta")):
        session.add(
            OrderUiStatus(
                id=sid,
                tenant_id=1,
                warehouse_id=1,
                name=name,
                main_group="NEW",
                is_active=True,
            )
        )
    session.add(
        Product(
            id=1,
            tenant_id=1,
            name="P",
            sku="P1",
            length=10,
            width=10,
            height=10,
            weight=0.5,
        )
    )
    session.add(
        Carton(
            id="carton-s",
            tenant_id=1,
            warehouse_id=1,
            name="S",
            length_cm=12,
            width_cm=12,
            height_cm=12,
            weight_kg=0.1,
            is_active=True,
            max_payload_kg=5,
        )
    )
    session.add(
        Carton(
            id="carton-l",
            tenant_id=1,
            warehouse_id=1,
            name="L",
            length_cm=40,
            width_cm=40,
            height_cm=40,
            weight_kg=0.2,
            is_active=True,
            max_payload_kg=20,
        )
    )
    session.commit()
    yield session
    session.close()


def _save(db, **kw):
    defaults = dict(
        tenant_id=1,
        warehouse_id=1,
        identical_orders_threshold=3,
        smart_enabled=True,
        three_d_enabled=True,
        packaging_strategy="SMART_THEN_3D",
        use_split_workflow=True,
        smart_proposal_init_status_id=10,
        three_d_proposal_init_status_id=20,
        smart_auto_label_enabled=False,
        smart_auto_label_status_ids=[],
        three_d_auto_label_enabled=False,
        three_d_auto_label_status_ids=[],
    )
    defaults.update(kw)
    return save_settings(db=db, **defaults)


def _order(db, oid=100, carton=None, source=None):
    o = Order(
        id=oid,
        tenant_id=1,
        warehouse_id=1,
        number=f"O-{oid}",
        status="new",
        selected_carton_id=carton,
        selected_carton_source=source,
    )
    db.add(o)
    db.flush()
    db.add(OrderItem(order_id=oid, product_id=1, quantity=1))
    db.commit()
    return db.query(Order).filter(Order.id == oid).first()


def _primary(engine: str, carton: str) -> PackagingSuggestionOut:
    return PackagingSuggestionOut(
        order_id=1,
        source_engine=engine,
        suggested_package_id=carton,
        package_name=carton,
        confidence_score=0.9,
        reason="TEST",
    )


def test_A_different_status_intents(db):
    _save(db)
    order = _order(db, 201)
    with patch(
        "backend.services.packaging_engine.engine.build_packaging_suggestions_for_order",
        return_value=([_primary("SMART_MATCHING", "carton-s")], _primary("SMART_MATCHING", "carton-s"), [], None),
    ) as m:
        r = on_order_status_changed_packaging(db, order=order, new_status_id=10)
        assert r["want_smart"] is True
        assert r["want_3d"] is False
        assert m.call_args.kwargs.get("want_smart") is True
        assert m.call_args.kwargs.get("want_3d") is False
    order2 = _order(db, 202)
    with patch(
        "backend.services.packaging_engine.engine.build_packaging_suggestions_for_order",
        return_value=([_primary("THREE_D_MATCHING", "carton-l")], _primary("THREE_D_MATCHING", "carton-l"), [], None),
    ) as m2:
        r2 = on_order_status_changed_packaging(db, order=order2, new_status_id=20)
        assert r2["want_smart"] is False
        assert r2["want_3d"] is True
        assert m2.call_args.kwargs.get("want_smart") is False
        assert m2.call_args.kwargs.get("want_3d") is True


def test_B_same_status_both_intents(db):
    _save(db, smart_proposal_init_status_id=10, three_d_proposal_init_status_id=10)
    order = _order(db, 203)
    with patch(
        "backend.services.packaging_engine.engine.build_packaging_suggestions_for_order",
        return_value=([_primary("SMART_MATCHING", "carton-s")], _primary("SMART_MATCHING", "carton-s"), [], None),
    ) as m:
        r = on_order_status_changed_packaging(db, order=order, new_status_id=10)
        assert r["want_smart"] is True
        assert r["want_3d"] is True
        assert m.call_count == 1


def test_C_D_E_engine_enable_gates(db):
    _save(db, smart_enabled=True, three_d_enabled=False)
    order = _order(db, 204)
    with patch(
        "backend.services.packaging_engine.engine.build_packaging_suggestions_for_order",
        return_value=([], None, [], None),
    ) as m:
        r = on_order_status_changed_packaging(db, order=order, new_status_id=10)
        assert r["want_smart"] is True
        assert r["want_3d"] is False
        assert m.called
        r2 = on_order_status_changed_packaging(db, order=order, new_status_id=20)
        assert r2["want_smart"] is False
        assert r2["want_3d"] is False
        assert r2["proposal"] is None

    _save(db, smart_enabled=False, three_d_enabled=True)
    with patch(
        "backend.services.packaging_engine.engine.build_packaging_suggestions_for_order",
        return_value=([], None, [], None),
    ) as m3:
        r3 = on_order_status_changed_packaging(db, order=order, new_status_id=20)
        assert r3["want_3d"] is True
        assert m3.called

    _save(db, smart_enabled=False, three_d_enabled=False)
    with patch(
        "backend.services.packaging_engine.engine.build_packaging_suggestions_for_order",
        return_value=([], None, [], None),
    ) as m4:
        r4 = on_order_status_changed_packaging(db, order=order, new_status_id=10)
        assert r4["want_smart"] is False
        assert not m4.called


def test_J_smart_then_3d_keeps_smart_carton(db):
    _save(db, packaging_strategy="SMART_THEN_3D")
    order = _order(db, 210)
    set_order_selected_carton(order, carton_id="carton-s", source=CARTON_SOURCE_SMART)
    db.commit()
    with patch(
        "backend.services.packaging_engine.engine.build_packaging_suggestions_for_order",
    ) as m:
        r = on_order_status_changed_packaging(db, order=order, new_status_id=20)
        assert r["skipped"] == "late_3d_skip_existing_smart_or_protected"
        assert not m.called
    db.refresh(order)
    assert order.selected_carton_id == "carton-s"


def test_K_override_matched_overwrites_smart(db):
    _save(db, packaging_strategy="THREE_D_OVERRIDE_SMART")
    order = _order(db, 211)
    set_order_selected_carton(order, carton_id="carton-s", source=CARTON_SOURCE_SMART)
    db.commit()
    with patch(
        "backend.services.packaging_engine.engine.build_packaging_suggestions_for_order",
        return_value=(
            [_primary("THREE_D_MATCHING", "carton-l")],
            _primary("THREE_D_MATCHING", "carton-l"),
            [],
            None,
        ),
    ):
        r = on_order_status_changed_packaging(db, order=order, new_status_id=20)
        assert r["proposal"]["assigned"] is True
    db.refresh(order)
    assert order.selected_carton_id == "carton-l"
    assert order.selected_carton_source == CARTON_SOURCE_THREE_D


def test_L_override_no_fit_keeps_smart(db):
    _save(db, packaging_strategy="THREE_D_OVERRIDE_SMART")
    order = _order(db, 212)
    set_order_selected_carton(order, carton_id="carton-s", source=CARTON_SOURCE_SMART)
    db.commit()
    with patch(
        "backend.services.packaging_engine.engine.build_packaging_suggestions_for_order",
        return_value=([], None, [], None),
    ):
        r = on_order_status_changed_packaging(db, order=order, new_status_id=20)
        assert r["proposal"]["assigned"] is False
    db.refresh(order)
    assert order.selected_carton_id == "carton-s"


def test_M_manual_not_overwritten(db):
    _save(db, packaging_strategy="THREE_D_OVERRIDE_SMART")
    order = _order(db, 213)
    set_order_selected_carton(order, carton_id="carton-s", source=CARTON_SOURCE_MANUAL)
    db.commit()
    with patch(
        "backend.services.packaging_engine.engine.build_packaging_suggestions_for_order",
        return_value=(
            [_primary("THREE_D_MATCHING", "carton-l")],
            _primary("THREE_D_MATCHING", "carton-l"),
            [],
            None,
        ),
    ):
        r = on_order_status_changed_packaging(db, order=order, new_status_id=20)
        assert r["proposal"]["assigned"] is False
    db.refresh(order)
    assert order.selected_carton_id == "carton-s"


def test_N_O_auto_label_union_single_attempt(db):
    _save(
        db,
        smart_auto_label_enabled=True,
        smart_auto_label_status_ids=[30],
        three_d_auto_label_enabled=True,
        three_d_auto_label_status_ids=[30],
    )
    order = _order(db, 214, carton="carton-s", source=CARTON_SOURCE_SMART)
    with patch(
        "backend.services.packaging_engine.smart_matching_triggers._try_auto_label",
        return_value={"ok": True, "message": "ok"},
    ) as m:
        r = on_order_status_changed_packaging(db, order=order, new_status_id=30)
        assert r["auto_label"] is not None
        assert m.call_count == 1

    _save(
        db,
        smart_auto_label_enabled=True,
        smart_auto_label_status_ids=[30],
        three_d_auto_label_enabled=True,
        three_d_auto_label_status_ids=[20],
    )
    with patch(
        "backend.services.packaging_engine.smart_matching_triggers._try_auto_label",
        return_value={"ok": True, "message": "ok"},
    ) as m2:
        on_order_status_changed_packaging(db, order=order, new_status_id=30)
        assert m2.call_count == 1
        on_order_status_changed_packaging(db, order=order, new_status_id=20)
        assert m2.call_count == 2


def test_Q_legacy_migration_effective_equals(db):
    row = get_or_create_settings(db, tenant_id=1, warehouse_id=1)
    row.proposal_init_status_id = 10
    row.auto_label_enabled = True
    row.auto_label_status_ids_json = "[30]"
    row.smart_proposal_init_status_id = None
    row.three_d_proposal_init_status_id = None
    row.smart_auto_label_enabled = None
    row.three_d_auto_label_enabled = None
    row.smart_auto_label_status_ids_json = None
    row.three_d_auto_label_status_ids_json = None
    db.commit()
    assert effective_smart_proposal_init_status_id(row) == 10
    assert effective_three_d_proposal_init_status_id(row) == 10
    out = settings_to_out(row)
    assert out.smart_proposal_init_status_id == 10
    assert out.three_d_proposal_init_status_id == 10
    assert out.smart_auto_label_enabled is True
    assert out.three_d_auto_label_enabled is True


def test_alias_hook_same_as_packaging(db):
    assert on_order_status_changed_smart_matching is on_order_status_changed_packaging


def test_R_S_isolation_via_settings_warehouse(db):
    _save(db, warehouse_id=1, smart_proposal_init_status_id=10, three_d_proposal_init_status_id=20)
    save_settings(
        db=db,
        tenant_id=1,
        warehouse_id=2,
        identical_orders_threshold=3,
        use_split_workflow=True,
        smart_enabled=True,
        three_d_enabled=True,
        smart_proposal_init_status_id=None,
        three_d_proposal_init_status_id=None,
        smart_auto_label_enabled=False,
        three_d_auto_label_enabled=False,
        smart_auto_label_status_ids=[],
        three_d_auto_label_status_ids=[],
    )
    order = Order(id=300, tenant_id=1, warehouse_id=2, number="W2", status="new")
    db.add(order)
    db.commit()
    with patch(
        "backend.services.packaging_engine.engine.build_packaging_suggestions_for_order",
    ) as m:
        r = on_order_status_changed_packaging(db, order=order, new_status_id=10)
        assert r["want_smart"] is False
        assert not m.called


def test_fe_copy_no_shared_workflow_claim():
    root = Path(__file__).resolve().parents[2] / "frontend" / "src"
    panel = (root / "pages/Settings/WmsThreeDMatchingSettingsPanel.tsx").read_text(encoding="utf-8")
    assert "Strategia i statusy workflow są wspólne z Smart Matching" not in panel
    assert "Status inicjujący 3D Matching" in panel
    smart_form = (root / "pages/Settings/WmsPackagingProposalEngineConfigForm.tsx").read_text(
        encoding="utf-8"
    )
    assert "Status inicjujący Smart Matching" in smart_form
    assert "Strategia jest wspólna dla Smart Matching i 3D Matching" in smart_form
