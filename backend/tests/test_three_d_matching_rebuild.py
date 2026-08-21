"""3D Matching rebuild: independent enables, filler, missing data, shipping gate."""

from __future__ import annotations

from types import SimpleNamespace

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
from backend.models.wms_smart_matching import (
    WmsSmartMatchingBreak,
    WmsSmartMatchingHistory,
    WmsSmartMatchingObservationV2,
    WmsSmartMatchingProductSettings,
    WmsSmartMatchingRule,
    WmsSmartMatchingRuleV2,
    WmsSmartMatchingSettings,
)
from backend.services.fit_engine.adapters import fit_container_from_carton
from backend.services.fit_engine.models import FitItem
from backend.services.packaging_engine.cartonization_solver import solve_cartonization
from backend.services.packaging_engine.engine import build_packaging_suggestions_for_order
from backend.services.packaging_engine.smart_matching_store import (
    get_or_create_settings,
    save_settings,
    settings_to_out,
)
from backend.services.packaging_engine.three_d_filler import (
    apply_filler_to_container,
    filler_edge_scale,
)
from backend.services.packaging_engine.three_d_matching import (
    THREE_D_OUTCOME_MATCHED,
    THREE_D_OUTCOME_MISSING_PRODUCT_DATA,
    THREE_D_OUTCOME_NO_FIT,
    suggest_three_d_matching,
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
        WmsSmartMatchingHistory,
        WmsSmartMatchingRule,
        WmsSmartMatchingBreak,
        WmsSmartMatchingObservationV2,
        WmsSmartMatchingRuleV2,
        WmsSmartMatchingProductSettings,
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
            name="Small",
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
            name="Large",
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
            id="c-inactive",
            tenant_id=1,
            warehouse_id=1,
            name="Off",
            length_cm=50,
            width_cm=50,
            height_cm=50,
            weight_kg=0.2,
            is_active=False,
            max_payload_kg=20,
        )
    )
    session.add(
        ShippingMethod(
            id="ship-a", tenant_id=1, warehouse_id=1, name="A", code="A", is_active=True
        )
    )
    session.add(
        ShippingMethod(
            id="ship-b", tenant_id=1, warehouse_id=1, name="B", code="B", is_active=True
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


def _order(db, *, product_id=1, qty=1, shipping_method_id=None, oid=100):
    o = Order(
        id=oid,
        tenant_id=1,
        warehouse_id=1,
        number=f"O-{oid}",
        status="new",
        shipping_method_id=shipping_method_id,
    )
    db.add(o)
    db.flush()
    db.add(OrderItem(order_id=oid, product_id=product_id, quantity=qty))
    db.commit()
    from sqlalchemy.orm import joinedload, noload

    return (
        db.query(Order)
        .options(
            noload("*"),
            joinedload(Order.items).joinedload(OrderItem.product),
        )
        .filter(Order.id == oid)
        .first()
    )


def _save(**kw):
    defaults = dict(
        tenant_id=1,
        warehouse_id=1,
        identical_orders_threshold=3,
        proposal_init_status_id=None,
        auto_label_enabled=False,
        auto_label_status_ids=[],
    )
    defaults.update(kw)
    return save_settings(**defaults)


def _active_cartons(db):
    from sqlalchemy.orm import noload

    return (
        db.query(Carton)
        .options(noload("*"))
        .filter(Carton.warehouse_id == 1, Carton.is_active.is_(True))
        .all()
    )


def test_A_smart_on_3d_off(db):
    _save(db=db, smart_enabled=True, three_d_enabled=False, packaging_strategy="SMART_THEN_3D")
    order = _order(db, oid=201)
    _c, primary, _a, _p = build_packaging_suggestions_for_order(
        db, order, tenant_id=1, warehouse_id=1
    )
    if primary is not None:
        assert primary.source_engine != "THREE_D_MATCHING"


def test_B_smart_off_3d_on(db):
    _save(db=db, smart_enabled=False, three_d_enabled=True, packaging_strategy="SMART_THEN_3D")
    order = _order(db, oid=202)
    _c, primary, _a, _p = build_packaging_suggestions_for_order(
        db, order, tenant_id=1, warehouse_id=1
    )
    assert primary is not None
    assert primary.source_engine == "THREE_D_MATCHING"
    assert primary.suggested_package_id == "c-small"


def test_C_both_on(db):
    _save(db=db, smart_enabled=True, three_d_enabled=True, packaging_strategy="THREE_D_ONLY")
    order = _order(db, oid=203)
    _c, primary, _a, _p = build_packaging_suggestions_for_order(
        db, order, tenant_id=1, warehouse_id=1
    )
    assert primary is not None
    assert primary.source_engine == "THREE_D_MATCHING"


def test_D_both_off(db):
    _save(db=db, smart_enabled=False, three_d_enabled=False, packaging_strategy="SMART_THEN_3D")
    order = _order(db, oid=204)
    _c, primary, _a, _p = build_packaging_suggestions_for_order(
        db, order, tenant_id=1, warehouse_id=1
    )
    assert primary is None


@pytest.mark.parametrize(
    "strategy",
    ["SMART_ONLY", "THREE_D_ONLY", "SMART_THEN_3D", "THREE_D_OVERRIDE_SMART"],
)
def test_E_H_strategies_with_3d_only_engine(db, strategy):
    _save(db=db, smart_enabled=False, three_d_enabled=True, packaging_strategy=strategy)
    order = _order(db, oid=300 + abs(hash(strategy)) % 40)
    _c, primary, _a, _p = build_packaging_suggestions_for_order(
        db, order, tenant_id=1, warehouse_id=1
    )
    if strategy == "SMART_ONLY":
        assert primary is None
    else:
        assert primary is not None
        assert primary.source_engine == "THREE_D_MATCHING"


def test_I_filler_0_identity():
    c = SimpleNamespace(
        id="x",
        name="x",
        length_cm=30,
        width_cm=20,
        height_cm=10,
        internal_length_cm=None,
        internal_width_cm=None,
        internal_height_cm=None,
        max_payload_kg=None,
    )
    base = fit_container_from_carton(c)
    out = apply_filler_to_container(base, 0)
    assert out.length_cm == base.length_cm
    assert abs(filler_edge_scale(0) - 1.0) < 1e-12


def test_J_K_filler_scales_volume():
    assert abs(filler_edge_scale(10) ** 3 - 0.9) < 1e-9
    assert abs(filler_edge_scale(20) ** 3 - 0.8) < 1e-9


def test_L_filler_can_reject_tight_fit(db):
    items = [
        (FitItem(product_id=1, length_cm=10, width_cm=10, height_cm=10, weight_kg=0.5), 1)
    ]
    from sqlalchemy.orm import noload

    cartons = (
        db.query(Carton)
        .options(noload("*"))
        .filter(Carton.id == "c-small")
        .all()
    )
    assert solve_cartonization(
        items_with_qty=items, cartons=cartons, filler_percent=0, require_real_product_dimensions=True
    ).fits
    assert not solve_cartonization(
        items_with_qty=items, cartons=cartons, filler_percent=50, require_real_product_dimensions=True
    ).fits


def test_M_N_P_missing_dimensions(db):
    order = _order(db, product_id=2, oid=401)
    cartons = _active_cartons(db)
    drafts, outcome = suggest_three_d_matching(order, cartons, db=db)
    assert outcome == THREE_D_OUTCOME_MISSING_PRODUCT_DATA
    usable = [d for d in drafts if d.suggested_package_id and "Odrzucony:" not in (d.reason or "")]
    assert not usable


def test_O_missing_weight(db):
    p = db.query(Product).filter(Product.id == 1).first()
    p.weight = None
    db.commit()
    order = _order(db, oid=402)
    cartons = _active_cartons(db)
    _drafts, outcome = suggest_three_d_matching(order, cartons, db=db)
    assert outcome == THREE_D_OUTCOME_MISSING_PRODUCT_DATA


def test_Q_inactive_excluded(db):
    _save(db=db, smart_enabled=False, three_d_enabled=True, packaging_strategy="THREE_D_ONLY")
    order = _order(db, oid=403)
    _c, primary, _a, _p = build_packaging_suggestions_for_order(
        db, order, tenant_id=1, warehouse_id=1
    )
    assert primary is not None
    assert primary.suggested_package_id != "c-inactive"


def test_R_S_shipping_compatibility(db):
    order = _order(db, shipping_method_id="ship-b", oid=404)
    cartons = _active_cartons(db)
    _d, outcome = suggest_three_d_matching(order, cartons, db=db, shipping_method_id="ship-b")
    assert outcome == THREE_D_OUTCOME_NO_FIT

    order_a = _order(db, shipping_method_id="ship-a", oid=405)
    drafts2, outcome2 = suggest_three_d_matching(
        order_a, cartons, db=db, shipping_method_id="ship-a"
    )
    assert outcome2 == THREE_D_OUTCOME_MATCHED
    assert any(d.suggested_package_id == "c-small" for d in drafts2)


def test_T_U_qty(db):
    order = _order(db, qty=2, oid=406)
    cartons = _active_cartons(db)
    _d, outcome = suggest_three_d_matching(order, cartons, db=db)
    assert outcome == THREE_D_OUTCOME_MATCHED


def test_Z_AA_warehouse_isolation(db):
    _save(db=db, warehouse_id=1, smart_enabled=True, three_d_enabled=False)
    _save(
        db=db,
        warehouse_id=2,
        smart_enabled=False,
        three_d_enabled=True,
        three_d_filler_percent=15,
    )
    a = settings_to_out(get_or_create_settings(db, tenant_id=1, warehouse_id=1))
    b = settings_to_out(get_or_create_settings(db, tenant_id=1, warehouse_id=2))
    assert a.three_d_enabled is False
    assert b.three_d_enabled is True
    assert b.three_d_filler_percent == 15


def test_AG_legacy_enabled_maps_to_smart_only(db):
    _save(db=db, smart_enabled=False, three_d_enabled=False)
    save_settings(
        db,
        tenant_id=1,
        warehouse_id=1,
        enabled=True,
        identical_orders_threshold=3,
        proposal_init_status_id=None,
        auto_label_enabled=False,
        auto_label_status_ids=[],
    )
    out = settings_to_out(get_or_create_settings(db, tenant_id=1, warehouse_id=1))
    assert out.smart_enabled is True
    assert out.three_d_enabled is False


def test_AH_no_localstorage_dependency():
    from pathlib import Path

    root = Path(__file__).resolve().parents[2] / "frontend" / "src" / "pages" / "Settings"
    assert not (root / "wmsThreeDEngineLocalConfig.ts").exists()
    assert not (root / "WmsThreeDEngineConfigForm.tsx").exists()
    panel = (root / "WmsThreeDMatchingSettingsPanel.tsx").read_text(encoding="utf-8")
    assert "localStorage" not in panel
    assert "Dopasowanie przestrzenne" not in panel
    assert "3D Matching" in panel
    chrome = (root / "WmsSettingsChrome.tsx").read_text(encoding="utf-8")
    assert "Dopasowanie przestrzenne" not in chrome
    assert 'label: "3D Matching"' in chrome
