"""3D Matching decision history — attempt audit (not Smart learning)."""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import joinedload, noload, sessionmaker

from backend.models.carton import Carton, carton_shipping_method_links
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.order_ui_status import OrderUiStatus
from backend.models.product import Product
from backend.models.shipping_method import ShippingMethod
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_smart_matching import (
    WmsSmartMatchingBreak,
    WmsSmartMatchingHistory,
    WmsSmartMatchingObservationV2,
    WmsSmartMatchingProductSettings,
    WmsSmartMatchingRule,
    WmsSmartMatchingRuleV2,
    WmsSmartMatchingSettings,
)
from backend.models.wms_three_d_matching import WmsThreeDMatchingEvent
from backend.services.packaging_engine.engine import build_packaging_suggestions_for_order
from backend.services.packaging_engine.smart_matching_store import save_settings
from backend.services.packaging_engine.three_d_matching_history import list_three_d_history


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
        WmsSmartMatchingHistory,
        WmsSmartMatchingRule,
        WmsSmartMatchingBreak,
        WmsSmartMatchingObservationV2,
        WmsSmartMatchingRuleV2,
        WmsSmartMatchingProductSettings,
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
    session.add(
        Product(
            id=1,
            tenant_id=1,
            name="BoxSKU",
            sku="SKU1",
            length=10,
            width=10,
            height=10,
            weight=0.5,
        )
    )
    session.add(
        Product(
            id=2,
            tenant_id=1,
            name="NoDims",
            sku="SKU2",
            length=None,
            width=None,
            height=None,
            weight=None,
        )
    )
    session.add(
        Carton(
            id="c-small",
            tenant_id=1,
            warehouse_id=1,
            name="Gabaryt S",
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
            id="c-large",
            tenant_id=1,
            warehouse_id=1,
            name="Gabaryt L",
            length_cm=40,
            width_cm=40,
            height_cm=40,
            weight_kg=0.2,
            is_active=True,
            max_payload_kg=20,
        )
    )
    session.add(
        Carton(
            id="c-wh2",
            tenant_id=1,
            warehouse_id=2,
            name="WH2 Only",
            length_cm=40,
            width_cm=40,
            height_cm=40,
            weight_kg=0.2,
            is_active=True,
            max_payload_kg=20,
        )
    )
    session.add(
        ShippingMethod(
            id="ship-a", tenant_id=1, warehouse_id=1, name="DPD", code="A", is_active=True
        )
    )
    session.add(
        ShippingMethod(
            id="ship-b", tenant_id=1, warehouse_id=1, name="InPost", code="B", is_active=True
        )
    )
    session.execute(
        carton_shipping_method_links.insert().values(
            carton_id="c-small", shipping_method_id="ship-a"
        )
    )
    session.execute(
        carton_shipping_method_links.insert().values(
            carton_id="c-large", shipping_method_id="ship-a"
        )
    )
    session.commit()
    yield session
    session.close()


def _order(db, *, product_id=1, qty=1, shipping_method_id=None, oid=100, warehouse_id=1):
    o = Order(
        id=oid,
        tenant_id=1,
        warehouse_id=warehouse_id,
        number=f"O-{oid}",
        status="new",
        shipping_method_id=shipping_method_id,
    )
    db.add(o)
    db.flush()
    db.add(OrderItem(order_id=oid, product_id=product_id, quantity=qty))
    db.commit()
    return (
        db.query(Order)
        .options(
            noload("*"),
            joinedload(Order.items).joinedload(OrderItem.product),
        )
        .filter(Order.id == oid)
        .first()
    )


def _save(db, **kw):
    defaults = dict(
        tenant_id=1,
        warehouse_id=1,
        identical_orders_threshold=3,
        proposal_init_status_id=None,
        auto_label_enabled=False,
        auto_label_status_ids=[],
        smart_enabled=True,
        three_d_enabled=True,
    )
    defaults.update(kw)
    return save_settings(db=db, **defaults)


def _events(db, *, warehouse_id=1):
    return (
        db.query(WmsThreeDMatchingEvent)
        .filter(
            WmsThreeDMatchingEvent.tenant_id == 1,
            WmsThreeDMatchingEvent.warehouse_id == warehouse_id,
        )
        .order_by(WmsThreeDMatchingEvent.id.asc())
        .all()
    )


def test_A_three_d_only_matched_one_event(db):
    _save(db, packaging_strategy="THREE_D_ONLY", smart_enabled=False)
    order = _order(db, oid=501)
    build_packaging_suggestions_for_order(db, order, tenant_id=1, warehouse_id=1)
    ev = _events(db)
    assert len(ev) == 1
    assert ev[0].result_status == "MATCHED"
    assert ev[0].suggested_carton_id == "c-small"
    assert ev[0].suggested_carton_name_snapshot == "Gabaryt S"
    assert ev[0].strategy == "THREE_D_ONLY"
    assert ev[0].fill_percent is not None


def test_B_smart_only_zero_events(db):
    _save(db, packaging_strategy="SMART_ONLY", three_d_enabled=True)
    order = _order(db, oid=502)
    build_packaging_suggestions_for_order(db, order, tenant_id=1, warehouse_id=1)
    assert _events(db) == []


def test_C_smart_then_3d_smart_hit_zero_events(db):
    """With no Smart rule, Smart won't hit — seed a v2 rule so Smart wins."""
    from backend.models.wms_smart_matching import WmsSmartMatchingRuleV2
    from backend.services.packaging_engine.smart_matching_v2.constants import (
        PATTERN_SINGLE,
        SOURCE_MANUAL,
        STATUS_ACTIVE,
    )

    _save(db, packaging_strategy="SMART_THEN_3D", smart_enabled=True, three_d_enabled=True)
    db.add(
        WmsSmartMatchingRuleV2(
            tenant_id=1,
            warehouse_id=1,
            product_id=1,
            min_qty=1,
            carton_id="c-large",
            source=SOURCE_MANUAL,
            status=STATUS_ACTIVE,
            is_locked=True,
            pattern_type=PATTERN_SINGLE,
            composition_identity_hash="",
        )
    )
    db.commit()
    order = _order(db, oid=503, shipping_method_id="ship-a")
    _c, primary, _a, _p = build_packaging_suggestions_for_order(
        db, order, tenant_id=1, warehouse_id=1
    )
    assert primary is not None
    assert primary.source_engine == "SMART_MATCHING"
    assert _events(db) == []


def test_D_smart_then_3d_fallback_one_event(db):
    _save(db, packaging_strategy="SMART_THEN_3D", smart_enabled=True, three_d_enabled=True)
    order = _order(db, oid=504)
    build_packaging_suggestions_for_order(db, order, tenant_id=1, warehouse_id=1)
    ev = _events(db)
    assert len(ev) == 1
    assert ev[0].strategy == "SMART_THEN_3D"
    assert ev[0].trigger == "STRATEGY_FALLBACK"
    assert ev[0].result_status == "MATCHED"


def test_E_three_d_override_one_event(db):
    _save(
        db,
        packaging_strategy="THREE_D_OVERRIDE_SMART",
        smart_enabled=True,
        three_d_enabled=True,
    )
    order = _order(db, oid=505)
    build_packaging_suggestions_for_order(db, order, tenant_id=1, warehouse_id=1)
    ev = _events(db)
    assert len(ev) == 1
    assert ev[0].trigger == "STRATEGY_OVERRIDE"
    assert ev[0].strategy == "THREE_D_OVERRIDE_SMART"


def test_F_matched_carton(db):
    _save(db, packaging_strategy="THREE_D_ONLY", smart_enabled=False)
    order = _order(db, oid=506)
    build_packaging_suggestions_for_order(db, order, tenant_id=1, warehouse_id=1)
    assert _events(db)[0].suggested_carton_id == "c-small"


def test_G_no_fit(db):
    _save(db, packaging_strategy="THREE_D_ONLY", smart_enabled=False)
    # Product too big for any carton
    db.query(Product).filter(Product.id == 1).update(
        {"length": 100, "width": 100, "height": 100}
    )
    db.commit()
    order = _order(db, oid=507)
    build_packaging_suggestions_for_order(db, order, tenant_id=1, warehouse_id=1)
    assert _events(db)[0].result_status == "NO_FIT"
    assert _events(db)[0].suggested_carton_id is None


def test_H_missing_product_data(db):
    _save(db, packaging_strategy="THREE_D_ONLY", smart_enabled=False)
    order = _order(db, product_id=2, oid=508)
    build_packaging_suggestions_for_order(db, order, tenant_id=1, warehouse_id=1)
    assert _events(db)[0].result_status == "MISSING_PRODUCT_DATA"


def test_I_no_compatible_carton(db):
    _save(db, packaging_strategy="THREE_D_ONLY", smart_enabled=False)
    order = _order(db, oid=509, shipping_method_id="ship-b")
    build_packaging_suggestions_for_order(db, order, tenant_id=1, warehouse_id=1)
    ev = _events(db)[0]
    assert ev.result_status == "NO_COMPATIBLE_CARTON"
    assert ev.candidate_count >= 1
    assert ev.compatible_candidate_count == 0


def test_J_filler_snapshot(db):
    _save(
        db,
        packaging_strategy="THREE_D_ONLY",
        smart_enabled=False,
        three_d_filler_percent=17,
    )
    order = _order(db, oid=510)
    build_packaging_suggestions_for_order(db, order, tenant_id=1, warehouse_id=1)
    assert float(_events(db)[0].filler_percent_snapshot) == 17.0


def test_K_tenant_isolation(db):
    _save(db, packaging_strategy="THREE_D_ONLY", smart_enabled=False)
    order = _order(db, oid=511)
    build_packaging_suggestions_for_order(db, order, tenant_id=1, warehouse_id=1)
    page = list_three_d_history(db, tenant_id=99, warehouse_id=1)
    assert page["total"] == 0


def test_L_warehouse_isolation(db):
    _save(db, packaging_strategy="THREE_D_ONLY", smart_enabled=False)
    order = _order(db, oid=512)
    build_packaging_suggestions_for_order(db, order, tenant_id=1, warehouse_id=1)
    page = list_three_d_history(db, tenant_id=1, warehouse_id=2)
    assert page["total"] == 0


def test_M_pagination(db):
    _save(db, packaging_strategy="THREE_D_ONLY", smart_enabled=False)
    for i in range(5):
        order = _order(db, oid=600 + i)
        build_packaging_suggestions_for_order(db, order, tenant_id=1, warehouse_id=1)
    p1 = list_three_d_history(db, tenant_id=1, warehouse_id=1, page=1, limit=2)
    p2 = list_three_d_history(db, tenant_id=1, warehouse_id=1, page=2, limit=2)
    assert p1["total"] == 5
    assert len(p1["items"]) == 2
    assert len(p2["items"]) == 2
    assert p1["items"][0]["id"] != p2["items"][0]["id"]


def test_N_filters(db):
    _save(db, packaging_strategy="THREE_D_ONLY", smart_enabled=False)
    order = _order(db, oid=620)
    build_packaging_suggestions_for_order(db, order, tenant_id=1, warehouse_id=1)
    page = list_three_d_history(
        db, tenant_id=1, warehouse_id=1, result_status="MATCHED", order_q="O-620"
    )
    assert page["total"] == 1
    page2 = list_three_d_history(db, tenant_id=1, warehouse_id=1, result_status="NO_FIT")
    assert page2["total"] == 0


def test_O_carton_rename_preserves_snapshot(db):
    _save(db, packaging_strategy="THREE_D_ONLY", smart_enabled=False)
    order = _order(db, oid=630)
    build_packaging_suggestions_for_order(db, order, tenant_id=1, warehouse_id=1)
    db.query(Carton).filter(Carton.id == "c-small").update({"name": "Renamed Later"})
    db.commit()
    page = list_three_d_history(db, tenant_id=1, warehouse_id=1, order_q="630")
    assert page["items"][0]["suggested_carton_name"] == "Gabaryt S"


def test_P_strategy_change_preserves_snapshot(db):
    _save(db, packaging_strategy="THREE_D_ONLY", smart_enabled=False)
    order = _order(db, oid=631)
    build_packaging_suggestions_for_order(db, order, tenant_id=1, warehouse_id=1)
    _save(db, packaging_strategy="SMART_ONLY", smart_enabled=True, three_d_enabled=True)
    page = list_three_d_history(db, tenant_id=1, warehouse_id=1, order_q="631")
    assert page["items"][0]["strategy"] == "THREE_D_ONLY"


def test_Q_filler_change_preserves_snapshot(db):
    _save(
        db,
        packaging_strategy="THREE_D_ONLY",
        smart_enabled=False,
        three_d_filler_percent=9,
    )
    order = _order(db, oid=632)
    build_packaging_suggestions_for_order(db, order, tenant_id=1, warehouse_id=1)
    _save(
        db,
        packaging_strategy="THREE_D_ONLY",
        smart_enabled=False,
        three_d_filler_percent=40,
    )
    page = list_three_d_history(db, tenant_id=1, warehouse_id=1, order_q="632")
    assert float(page["items"][0]["filler_percent_snapshot"]) == 9.0


def test_manual_trigger_preserved(db):
    _save(db, packaging_strategy="THREE_D_ONLY", smart_enabled=False)
    order = _order(db, oid=640)
    build_packaging_suggestions_for_order(
        db, order, tenant_id=1, warehouse_id=1, trigger="MANUAL"
    )
    assert _events(db)[0].trigger == "MANUAL"


def test_R_S_T_fe_surface(db):
    root = Path(__file__).resolve().parents[2] / "frontend" / "src"
    panel = (root / "pages/Settings/WmsThreeDMatchingSettingsPanel.tsx").read_text(
        encoding="utf-8"
    )
    table = (root / "pages/Settings/ThreeDMatchingHistoryTable.tsx").read_text(encoding="utf-8")
    api = (root / "api/wmsThreeDMatchingApi.ts").read_text(encoding="utf-8")
    assert "Historia doboru" in panel
    assert "ThreeDMatchingHistoryTable" in panel
    assert "result_label" in table
    assert "fill_percent != null" in table  # no fake fill
    assert "Brak wymiarów" in table or "MISSING_PRODUCT_DATA" in table
    assert "/wms/3d-matching/history" in api
