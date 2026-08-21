"""Regression: packaging 3D policy must not affect location/storage geometry.

Shared fit_engine is OK. Packaging knobs (filler / three_d_enabled / strategy /
shipping carton filter) must not leak into slotting location capacity.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.carton import Carton, carton_shipping_method_links
from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.product import Product
from backend.models.shipping_method import ShippingMethod
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_smart_matching import WmsSmartMatchingSettings
from backend.services.fit_engine.adapters import fit_item_from_product
from backend.services.fit_engine.models import FitItem
from backend.services.packaging_engine.cartonization_solver import solve_cartonization
from backend.services.packaging_engine.smart_matching_store import (
    get_or_create_settings,
    save_settings,
)
from backend.services.slotting.capacity_service import calculate_location_capacity
from backend.services.slotting.location_capacity_solver import solve_location_capacity

ROOT = Path(__file__).resolve().parents[2]
SLOTING_ROOT = ROOT / "backend" / "services" / "slotting"
PACKAGING_POLICY_MARKERS = (
    "three_d_filler",
    "three_d_enabled",
    "packaging_strategy",
    "is_carton_compatible_with_shipping",
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        Product,
        Location,
        Inventory,
        ShippingMethod,
        Carton,
        WmsSmartMatchingSettings,
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
    # 40×40×40 cm bin; 10 cm cube units → geometric capacity deterministic
    session.add(
        Location(
            id=1,
            warehouse_id=1,
            name="A-01-01",
            type="pick",
            is_active=True,
            width=40.0,
            depth=40.0,
            height=40.0,
            max_weight_kg=100.0,
            occupied_volume_dm3=0.0,
            occupied_weight_kg=0.0,
            # No soft rack structure → structural weight uses location max only
            # (still real solve_location_capacity path; avoids extra layout tables).
            rack_name=None,
            level=None,
            position=None,
        )
    )
    session.add(
        Product(
            id=1,
            tenant_id=1,
            name="UnitSKU",
            sku="U1",
            length=10,
            width=10,
            height=10,
            weight=0.5,
        )
    )
    # Tight packaging carton: 12³ cm — used only for packaging regression
    session.add(
        Carton(
            id="c-tight",
            tenant_id=1,
            warehouse_id=1,
            name="Tight",
            length_cm=12,
            width_cm=12,
            height_cm=12,
            weight_kg=0.1,
            is_active=True,
            max_payload_kg=5,
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
            carton_id="c-tight", shipping_method_id="ship-a"
        )
    )
    session.commit()
    get_or_create_settings(session, tenant_id=1, warehouse_id=1)
    session.commit()
    yield session
    session.close()


def _save(db, **kw):
    defaults = dict(
        tenant_id=1,
        warehouse_id=1,
        identical_orders_threshold=3,
        proposal_init_status_id=None,
        auto_label_enabled=False,
        auto_label_status_ids=[],
    )
    defaults.update(kw)
    return save_settings(db=db, **defaults)


def _cap_snapshot(solved) -> dict:
    return {
        "total_capacity": solved.total_capacity,
        "additional_capacity": solved.additional_capacity,
        "current_quantity": solved.current_quantity,
        "count_x": solved.count_x,
        "count_y": solved.count_y,
        "count_z": solved.count_z,
        "method": solved.method,
        "confidence": solved.confidence,
        "limiting_factor": solved.limiting_factor,
        "capacity_numeric_trusted": solved.capacity_numeric_trusted,
        "geometry_source": solved.geometry_source,
    }


def _fit_snapshot(fit) -> dict:
    return {
        "fits": fit.fits,
        "max_units": fit.max_units,
        "limiting_factor": fit.limiting_factor,
        "failure_reason": fit.failure_reason,
        "method": fit.method,
        "confidence": fit.confidence,
    }


def _run_storage_capacity(db):
    loc = db.query(Location).filter(Location.id == 1).one()
    product = db.query(Product).filter(Product.id == 1).one()
    solved = solve_location_capacity(db, location=loc, product=product, packaging_mode="UNIT")
    fit = calculate_location_capacity(loc, product, quantity=1.0, packaging_mode="UNIT")
    return _cap_snapshot(solved), _fit_snapshot(fit)


def test_1_location_capacity_identical_when_filler_changes(db):
    _save(
        db,
        three_d_enabled=True,
        three_d_filler_percent=0,
        packaging_strategy="SMART_THEN_3D",
    )
    before_solved, before_fit = _run_storage_capacity(db)
    assert before_solved["total_capacity"] is not None
    assert before_solved["total_capacity"] > 0

    _save(
        db,
        three_d_enabled=True,
        three_d_filler_percent=20,
        packaging_strategy="SMART_THEN_3D",
    )
    mid_solved, mid_fit = _run_storage_capacity(db)

    _save(
        db,
        three_d_enabled=True,
        three_d_filler_percent=30,
        packaging_strategy="SMART_THEN_3D",
    )
    after_solved, after_fit = _run_storage_capacity(db)

    assert mid_solved == before_solved
    assert after_solved == before_solved
    assert mid_fit == before_fit
    assert after_fit == before_fit


def test_2_location_capacity_identical_when_three_d_enabled_toggles(db):
    _save(
        db,
        three_d_enabled=True,
        three_d_filler_percent=15,
        packaging_strategy="THREE_D_ONLY",
    )
    on_solved, on_fit = _run_storage_capacity(db)

    _save(
        db,
        three_d_enabled=False,
        three_d_filler_percent=15,
        packaging_strategy="THREE_D_ONLY",
    )
    off_solved, off_fit = _run_storage_capacity(db)

    assert off_solved == on_solved
    assert off_fit == on_fit


def test_3_location_capacity_identical_when_shipping_compatibility_changes(db):
    _save(
        db,
        three_d_enabled=True,
        three_d_filler_percent=0,
        packaging_strategy="THREE_D_ONLY",
    )
    before_solved, before_fit = _run_storage_capacity(db)

    # Mutate packaging shipping links — storage path must ignore this entirely.
    db.execute(carton_shipping_method_links.delete())
    db.execute(
        carton_shipping_method_links.insert().values(
            carton_id="c-tight", shipping_method_id="ship-b"
        )
    )
    db.commit()

    _save(db, packaging_strategy="SMART_THEN_3D")
    after_solved, after_fit = _run_storage_capacity(db)

    assert after_solved == before_solved
    assert after_fit == before_fit


def test_4_packaging_filler_still_affects_carton_fit(db):
    """Separacja: filler działa w packaging, nie w storage (test 1)."""
    from sqlalchemy.orm import noload

    product = db.query(Product).filter(Product.id == 1).one()
    item = fit_item_from_product(product)
    assert isinstance(item, FitItem)
    items = [(item, 1)]
    carton = (
        db.query(Carton).options(noload("*")).filter(Carton.id == "c-tight").one()
    )

    fit0 = solve_cartonization(
        items_with_qty=items,
        cartons=[carton],
        filler_percent=0,
        require_real_product_dimensions=True,
    )
    fit_hi = solve_cartonization(
        items_with_qty=items,
        cartons=[carton],
        filler_percent=50,
        require_real_product_dimensions=True,
    )
    assert fit0.fits is True
    assert fit_hi.fits is False

    # Storage unchanged while packaging boundary flips
    _save(db, three_d_enabled=True, three_d_filler_percent=0)
    cap0, _ = _run_storage_capacity(db)
    _save(db, three_d_enabled=True, three_d_filler_percent=50)
    cap50, _ = _run_storage_capacity(db)
    assert cap50 == cap0


def test_5_repo_search_slotting_has_no_packaging_policy_imports():
    hits: list[str] = []
    for path in SLOTING_ROOT.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        for marker in PACKAGING_POLICY_MARKERS:
            if marker in text:
                hits.append(f"{path.relative_to(ROOT)}: {marker}")
    # Also scan putaway / replenishment capacity call sites for accidental policy imports
    for rel in (
        "backend/services/wms_putaway_service.py",
        "backend/services/wms_replenishment_service.py",
    ):
        text = (ROOT / rel).read_text(encoding="utf-8")
        for marker in PACKAGING_POLICY_MARKERS:
            if marker in text:
                hits.append(f"{rel}: {marker}")
    assert hits == [], "packaging policy leaked into storage capacity paths:\n" + "\n".join(hits)
