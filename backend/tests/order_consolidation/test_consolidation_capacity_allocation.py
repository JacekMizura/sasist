"""P5.8C — soft capacity-aware consolidation shelf allocation tests."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.consolidation_rack import ConsolidationRack, ConsolidationRackLevel, RackSegment
from backend.models.order import Order
from backend.models.order_consolidation_plan import OrderConsolidationPlan, OrderConsolidationPlanItem
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.order_consolidation.segment_capacity_service import evaluate_capacity_match
from backend.services.order_consolidation.order_footprint_service import calculate_order_footprint
from backend.services.order_consolidation.segment_capacity_service import sync_segment_capacity_dm3
from backend.services.order_consolidation.shelf_allocation_service import allocate_consolidation_shelf


def _make_db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        Product,
        Order,
        OrderItem,
        OrderConsolidationPlan,
        OrderConsolidationPlanItem,
        ConsolidationRack,
        ConsolidationRackLevel,
        RackSegment,
    ):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="T", default_warehouse_id=2))
    db.add(Warehouse(id=2, tenant_id=1, name="Poznań"))
    db.commit()
    return db


def _rack_two_segments(db, *, cap_a_dm3: float | None, cap_b_dm3: float | None) -> tuple[RackSegment, RackSegment]:
    rack = ConsolidationRack(tenant_id=1, warehouse_id=2, name="RK-01")
    db.add(rack)
    db.flush()
    level = ConsolidationRackLevel(rack_id=rack.id, level_index=0, name="A", is_segmented=True)
    db.add(level)
    db.flush()
    seg_a = RackSegment(level_id=level.id, segment_index=0)
    seg_b = RackSegment(level_id=level.id, segment_index=1)
    db.add_all([seg_a, seg_b])
    db.flush()

    def _apply_cap(seg: RackSegment, dm3: float | None) -> None:
        if dm3 is None:
            return
        # cube with volume dm3: edge_mm = (dm3 * 1e6) ** (1/3)
        edge = (dm3 * 1_000_000) ** (1 / 3)
        seg.length_mm = edge
        seg.width_mm = edge
        seg.height_mm = edge
        sync_segment_capacity_dm3(seg)

    _apply_cap(seg_a, cap_a_dm3)
    _apply_cap(seg_b, cap_b_dm3)
    db.commit()
    return seg_a, seg_b


def _order_with_product(db, *, volume_dm3: float, product_id: int = 101) -> Order:
    if db.query(Product).filter_by(id=product_id).first() is None:
        db.add(Product(id=product_id, tenant_id=1, name="P", sku=f"SKU-{product_id}"))
    product = db.query(Product).filter_by(id=product_id).first()
    product.volume = volume_dm3
    product.length = None
    product.width = None
    product.height = None
    db.add(product)
    order = Order(tenant_id=1, warehouse_id=2, number=f"O-{product_id}", status="NEW")
    db.add(order)
    db.flush()
    db.add(OrderItem(order_id=int(order.id), product_id=product_id, quantity=1, is_bundle_parent=False))
    db.commit()
    return order


def test_best_fit_prefers_higher_utilization():
    db = _make_db()
    seg_small, seg_large = _rack_two_segments(db, cap_a_dm3=100.0, cap_b_dm3=200.0)
    order = _order_with_product(db, volume_dm3=80.0)

    chosen = allocate_consolidation_shelf(db, tenant_id=1, warehouse_id=2, order_id=int(order.id))
    assert chosen is not None
    assert int(chosen.id) == int(seg_small.id)


def test_overflow_picks_largest_segment():
    db = _make_db()
    seg_small, seg_large = _rack_two_segments(db, cap_a_dm3=100.0, cap_b_dm3=200.0)
    order = _order_with_product(db, volume_dm3=250.0)

    chosen = allocate_consolidation_shelf(db, tenant_id=1, warehouse_id=2, order_id=int(order.id))
    assert chosen is not None
    assert int(chosen.id) == int(seg_large.id)
    match = evaluate_capacity_match(250.0, 200.0)
    assert match["capacity_overflow"] is True


def test_segment_without_dimensions_still_eligible():
    db = _make_db()
    seg_a, seg_b = _rack_two_segments(db, cap_a_dm3=100.0, cap_b_dm3=None)
    order = _order_with_product(db, volume_dm3=80.0)

    chosen = allocate_consolidation_shelf(db, tenant_id=1, warehouse_id=2, order_id=int(order.id))
    assert chosen is not None
    assert int(chosen.id) in (int(seg_a.id), int(seg_b.id))


def test_product_without_dimensions_uses_estimate():
    db = _make_db()
    db.add(Product(id=101, tenant_id=1, name="NoDims", sku="ND"))
    order = Order(tenant_id=1, warehouse_id=2, number="EST-1", status="NEW")
    db.add(order)
    db.flush()
    db.add(OrderItem(order_id=int(order.id), product_id=101, quantity=3, is_bundle_parent=False))
    db.commit()

    fp = calculate_order_footprint(db, int(order.id))
    assert fp.dimension_estimated is True
    assert fp.estimated_items_count == 3
    assert fp.volume_dm3 == pytest.approx(0.003)


def test_fallback_p57_when_no_segment_capacities():
    db = _make_db()
    rack = ConsolidationRack(tenant_id=1, warehouse_id=2, name="RK-01")
    db.add(rack)
    db.flush()
    for idx in (2, 0, 1):
        level = ConsolidationRackLevel(rack_id=rack.id, level_index=idx, name=chr(65 + idx), is_segmented=False)
        db.add(level)
        db.flush()
        db.add(RackSegment(level_id=level.id, segment_index=0))
    db.commit()
    order = _order_with_product(db, volume_dm3=50.0)

    chosen = allocate_consolidation_shelf(db, tenant_id=1, warehouse_id=2, order_id=int(order.id))
    level = db.query(ConsolidationRackLevel).filter_by(id=int(chosen.level_id)).one()
    assert int(level.level_index) == 0


def test_allocate_without_order_id_unchanged_p57():
    db = _make_db()
    rack = ConsolidationRack(tenant_id=1, warehouse_id=2, name="RK-01")
    db.add(rack)
    db.flush()
    for idx in (2, 0):
        level = ConsolidationRackLevel(rack_id=rack.id, level_index=idx, name=chr(65 + idx), is_segmented=False)
        db.add(level)
        db.flush()
        db.add(RackSegment(level_id=level.id, segment_index=0))
    db.commit()

    chosen = allocate_consolidation_shelf(db, tenant_id=1, warehouse_id=2)
    level = db.query(ConsolidationRackLevel).filter_by(id=int(chosen.level_id)).one()
    assert int(level.level_index) == 0


def test_mixed_data_quality_best_fit_among_known():
    db = _make_db()
    seg_known, seg_unknown = _rack_two_segments(db, cap_a_dm3=100.0, cap_b_dm3=None)
    order = _order_with_product(db, volume_dm3=90.0)

    chosen = allocate_consolidation_shelf(db, tenant_id=1, warehouse_id=2, order_id=int(order.id))
    assert int(chosen.id) == int(seg_known.id)
