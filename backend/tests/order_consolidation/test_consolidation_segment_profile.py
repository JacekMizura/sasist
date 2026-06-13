"""P5.8 prep — custom segment labels, dimensions, slotting adapter."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.consolidation_rack import ConsolidationRack, ConsolidationRackLevel, RackSegment
from backend.models.order import Order
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.consolidation_rack_service import ConsolidationRackService
from backend.services.order_consolidation.progress_helpers import format_segment_label, segment_slot_label
from backend.services.order_consolidation.segment_capacity_service import (
    segment_as_location_capacity_profile,
    segment_volume_capacity_dm3,
    sync_segment_capacity_dm3,
)
from backend.services.order_consolidation.staging_service import lookup_shelf_assignment
from backend.services.slotting.capacity_service import calculate_location_capacity


def _make_db():
    engine = create_engine("sqlite:///:memory:")
    for model in (Tenant, Warehouse, Product, Order, ConsolidationRack, ConsolidationRackLevel, RackSegment):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="T", default_warehouse_id=2))
    db.add(Warehouse(id=2, tenant_id=1, name="Poznań"))
    db.add(Product(id=101, tenant_id=1, name="P", sku="P"))
    db.commit()
    return db


def _rack_with_segments(db):
    rack = ConsolidationRack(tenant_id=1, warehouse_id=2, name="RK-01")
    db.add(rack)
    db.flush()
    level_a = ConsolidationRackLevel(rack_id=rack.id, level_index=0, name="A", is_segmented=True)
    level_b = ConsolidationRackLevel(rack_id=rack.id, level_index=1, name="B", is_segmented=True)
    db.add_all([level_a, level_b])
    db.flush()
    seg_a1 = RackSegment(level_id=level_a.id, segment_index=0)
    seg_a2 = RackSegment(level_id=level_a.id, segment_index=1)
    seg_b1 = RackSegment(level_id=level_b.id, segment_index=0)
    db.add_all([seg_a1, seg_a2, seg_b1])
    db.flush()
    return rack, level_a, seg_a1, seg_a2, seg_b1


def test_default_slot_labels_unchanged():
    db = _make_db()
    rack, level_a, seg_a1, seg_a2, _ = _rack_with_segments(db)
    assert segment_slot_label(level_a, seg_a1) == "A1"
    assert format_segment_label(rack.name, level_a, seg_a1) == "RK-01/A1"
    assert format_segment_label(rack.name, level_a, seg_a2) == "RK-01/A2"


def test_custom_slot_label_format_and_lookup():
    db = _make_db()
    rack, level_a, seg_a1, _, _ = _rack_with_segments(db)
    order = Order(number="ORD-99", tenant_id=1, warehouse_id=2, status="NEW")
    db.add(order)
    db.flush()
    seg_a1.slot_label = "TV-01"
    seg_a1.order_id = int(order.id)
    db.add(seg_a1)
    db.commit()

    assert format_segment_label(rack.name, level_a, seg_a1) == "RK-01/TV-01"

    hit = lookup_shelf_assignment(db, tenant_id=1, warehouse_id=2, code="RK-01/TV-01")
    assert hit is not None
    assert hit["order_id"] == int(order.id)
    assert hit["shelf_label"] == "RK-01/TV-01"


def test_update_segment_service():
    db = _make_db()
    _, _, seg_a1, _, _ = _rack_with_segments(db)
    db.commit()
    svc = ConsolidationRackService(db)
    out = svc.update_segment(int(seg_a1.id), slot_label="DUŻA-01", length_mm=1000, width_mm=500, height_mm=400)
    assert out["slot_label"] == "DUŻA-01"
    assert out["effective_slot_label"] == "DUŻA-01"
    assert out["capacity_dm3"] == pytest.approx(200.0)


def test_segment_capacity_profile_for_slotting_engine():
    db = _make_db()
    rack, level_a, seg_a1, _, _ = _rack_with_segments(db)
    seg_a1.length_mm = 600
    seg_a1.width_mm = 400
    seg_a1.height_mm = 300
    sync_segment_capacity_dm3(seg_a1)
    profile = segment_as_location_capacity_profile(seg_a1, level_a, rack)
    assert profile.total_volume_dm3 == pytest.approx(72.0)
    assert profile.location_type == "consolidation_segment"
    assert profile.location_code == "RK-01/A1"

    product = db.query(Product).filter_by(id=101).first()
    result = calculate_location_capacity(profile, product, quantity=50)
    assert result.fits is True
    assert result.max_units > 0


def test_volume_zero_when_dimensions_incomplete():
    assert segment_volume_capacity_dm3(100, None, 100) == 0.0
    assert segment_volume_capacity_dm3(None, None, None) == 0.0
