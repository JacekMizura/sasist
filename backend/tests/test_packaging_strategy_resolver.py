"""
Phase 3 — packaging strategy resolver + legacy v1 fallback.

  python -m pytest backend/tests/test_packaging_strategy_resolver.py -q
"""

from __future__ import annotations

from backend.services.packaging_engine.strategy_resolver import (
    SmartResult,
    ThreeDResult,
    normalize_strategy,
    resolve_packaging_strategy,
)
from backend.services.packaging_engine.suggestions import PackagingSuggestionDraft


def _draft(cid: str, *, engine: str = "SMART_MATCHING", conf: float = 0.8) -> PackagingSuggestionDraft:
    return PackagingSuggestionDraft(
        order_id=1,
        source_engine=engine,  # type: ignore[arg-type]
        suggested_package_id=cid,
        package_name=cid,
        package_dimensions="",
        image_url=None,
        confidence_score=conf,
        fill_percentage=50.0 if engine == "THREE_D_MATCHING" else None,
        reason=engine,
        sort_key=conf,
    )


def test_normalize_strategy_default():
    assert normalize_strategy(None) == "SMART_THEN_3D"
    assert normalize_strategy("bogus") == "SMART_THEN_3D"
    assert normalize_strategy("smart_only") == "SMART_ONLY"


def test_r_smart_only():
    smart = SmartResult(draft=_draft("x"), ambiguous=False)
    three_d = ThreeDResult(primary=_draft("y", engine="THREE_D_MATCHING"), fits=True)
    out = resolve_packaging_strategy("SMART_ONLY", smart=smart, three_d=three_d)
    assert out.primary is not None and out.primary.suggested_package_id == "x"
    assert out.source == "SMART"

    empty = resolve_packaging_strategy(
        "SMART_ONLY",
        smart=SmartResult(draft=None, ambiguous=False),
        three_d=three_d,
    )
    assert empty.primary is None


def test_s_three_d_only():
    smart = SmartResult(draft=_draft("x"), ambiguous=False)
    three_d = ThreeDResult(primary=_draft("y", engine="THREE_D_MATCHING"), fits=True)
    out = resolve_packaging_strategy("THREE_D_ONLY", smart=smart, three_d=three_d)
    assert out.primary is not None and out.primary.suggested_package_id == "y"
    assert out.source == "THREE_D"


def test_t_smart_then_3d():
    smart = SmartResult(draft=_draft("x"), ambiguous=False)
    three_d = ThreeDResult(primary=_draft("y", engine="THREE_D_MATCHING"), fits=True)
    out = resolve_packaging_strategy("SMART_THEN_3D", smart=smart, three_d=three_d)
    assert out.primary.suggested_package_id == "x"

    amb = resolve_packaging_strategy(
        "SMART_THEN_3D",
        smart=SmartResult(draft=None, ambiguous=True, reason="AMBIGUOUS"),
        three_d=three_d,
    )
    assert amb.primary.suggested_package_id == "y"
    assert amb.source == "THREE_D"

    no_smart = resolve_packaging_strategy(
        "SMART_THEN_3D",
        smart=SmartResult(draft=None, ambiguous=False),
        three_d=three_d,
    )
    assert no_smart.primary.suggested_package_id == "y"


def test_u_three_d_override_smart():
    smart = SmartResult(draft=_draft("x"), ambiguous=False)
    three_d = ThreeDResult(primary=_draft("y", engine="THREE_D_MATCHING"), fits=True)
    out = resolve_packaging_strategy("THREE_D_OVERRIDE_SMART", smart=smart, three_d=three_d)
    assert out.primary.suggested_package_id == "y"
    assert out.source == "THREE_D"

    no_3d = resolve_packaging_strategy(
        "THREE_D_OVERRIDE_SMART",
        smart=smart,
        three_d=ThreeDResult(primary=None, fits=False),
    )
    assert no_3d.primary.suggested_package_id == "x"
    assert no_3d.source == "SMART"


def test_z_legacy_v1_readonly_fallback(db=None):
    """legacy_v1_fallback_enabled gates exact fingerprint read; no new v1 writes."""
    from datetime import datetime

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
    from backend.services.packaging_engine.smart_matching_store import (
        composition_from_order,
        get_or_create_settings,
        save_settings,
    )
    from backend.services.packaging_engine.smart_matching_v2 import evaluate_smart_matching_v2

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
    carton_shipping_method_links.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="T", default_warehouse_id=1))
    db.add(Warehouse(id=1, tenant_id=1, name="WH"))
    db.add(Product(id=1, tenant_id=1, name="A", sku="A"))
    db.add(Product(id=2, tenant_id=1, name="B", sku="B"))
    db.add(
        Carton(
            id="carton-x",
            tenant_id=1,
            warehouse_id=1,
            name="X",
            length_cm=30,
            width_cm=20,
            height_cm=10,
            is_active=True,
        )
    )
    db.commit()

    # Multi-SKU order (not v2 eligible) + seeded v1 rule
    o = Order(id=1, tenant_id=1, warehouse_id=1, number="M", status="new", created_at=datetime.utcnow())
    db.add(o)
    db.flush()
    db.add(OrderItem(order_id=1, product_id=1, quantity=1, unit_price=1))
    db.add(OrderItem(order_id=1, product_id=2, quantity=1, unit_price=1))
    db.commit()
    key, label, _ = composition_from_order(db, o)
    db.add(
        WmsSmartMatchingRule(
            tenant_id=1,
            warehouse_id=1,
            composition_key=key,
            composition_label=label,
            carton_id="carton-x",
            hit_count=5,
            is_auto=True,
        )
    )
    db.commit()

    settings = get_or_create_settings(db, tenant_id=1, warehouse_id=1)
    settings.legacy_v1_fallback_enabled = True
    db.commit()
    from sqlalchemy.orm import noload

    cartons = db.query(Carton).options(noload("*")).all()
    r = evaluate_smart_matching_v2(db, order=o, tenant_id=1, warehouse_id=1, cartons=cartons)
    assert r.draft is not None
    assert r.reason == "V1_LEGACY"

    save_settings(
        db,
        tenant_id=1,
        warehouse_id=1,
        enabled=True,
        identical_orders_threshold=3,
        proposal_init_status_id=None,
        auto_label_enabled=False,
        auto_label_status_ids=[],
        legacy_v1_fallback_enabled=False,
    )
    db.commit()
    cartons = db.query(Carton).options(noload("*")).all()
    r2 = evaluate_smart_matching_v2(db, order=o, tenant_id=1, warehouse_id=1, cartons=cartons)
    assert r2.draft is None
    db.close()
