"""PPWR stage 3A — ProductSalesPackaging + Carton/PackagingMaterial PPWR fields."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.carton import Carton
from backend.models.inventory import Inventory
from backend.models.packaging_material import PackagingMaterial
from backend.models.product import Product
from backend.models.product_sales_packaging import ProductSalesPackaging
from backend.models.warehouse import Warehouse
from backend.models.wm_price_tier import WmPriceTier
from backend.services.packaging_materials.ppwr_constants import (
    PPWR_FUNCTION_ECOMMERCE,
    PPWR_FUNCTION_FILLER,
    PPWR_FUNCTION_SALES,
    PPWR_FUNCTION_TRANSPORT,
    PPWR_STATUS_NOT_ASSESSED,
    validate_pct_0_100,
)
from backend.services.packaging_materials.ppwr_fields import apply_carton_ppwr, apply_packaging_material_ppwr


@pytest.fixture
def isolated_db():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))

    for model in (Warehouse, Product, Inventory, Carton, PackagingMaterial, ProductSalesPackaging, WmPriceTier):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine, expire_on_commit=False)
    db = Session()
    db.add(Warehouse(id=1, tenant_id=1, name="Magazyn test"))
    db.add(
        Product(
            id=1,
            tenant_id=1,
            name="Produkt testowy",
            sku="SKU-PPWR",
            ean="5900000000888",
            carton_length_cm=40.0,
            carton_width_cm=30.0,
            carton_height_cm=20.0,
            carton_weight_kg=1.5,
        )
    )
    db.commit()
    yield db
    db.close()


def test_create_product_sales_packaging_linked_to_product(isolated_db):
    db = isolated_db
    row = ProductSalesPackaging(
        id=str(uuid.uuid4()),
        product_id=1,
        name="Butelka PET",
        level="PRIMARY",
        ppwr_format="bottle",
        material_category="PET",
        mass_g=25.0,
        recyclable_pct=90.0,
        recycled_content_pct=30.0,
        is_reusable=False,
        ppwr_status=PPWR_STATUS_NOT_ASSESSED,
    )
    db.add(row)
    db.commit()
    found = db.query(ProductSalesPackaging).filter_by(product_id=1).one()
    assert found.name == "Butelka PET"
    assert found.product_id == 1
    assert found.level == "PRIMARY"


def test_multiple_sales_packaging_primary_secondary(isolated_db):
    db = isolated_db
    db.add(
        ProductSalesPackaging(
            id=str(uuid.uuid4()),
            product_id=1,
            name="Primary",
            level="PRIMARY",
            sort_order=0,
        )
    )
    db.add(
        ProductSalesPackaging(
            id=str(uuid.uuid4()),
            product_id=1,
            name="Secondary box",
            level="SECONDARY",
            sort_order=1,
        )
    )
    db.commit()
    rows = (
        db.query(ProductSalesPackaging)
        .filter_by(product_id=1)
        .order_by(ProductSalesPackaging.sort_order.asc())
        .all()
    )
    assert len(rows) == 2
    assert rows[0].level == "PRIMARY"
    assert rows[1].level == "SECONDARY"


def test_carton_ppwr_save_transport_ecommerce(isolated_db):
    carton = Carton(
        id=str(uuid.uuid4()),
        tenant_id=1,
        warehouse_id=1,
        name="Karton A",
        length_cm=30,
        width_cm=20,
        height_cm=15,
        weight_kg=0.2,
        include_in_bdo=True,
        paper_kg_per_unit=0.2,
    )
    apply_carton_ppwr(
        carton,
        {
            "ppwr_function": PPWR_FUNCTION_ECOMMERCE,
            "ppwr_format": "shipper_box",
            "recyclable_pct": 85,
            "recycled_content_pct": 40,
            "is_reusable": False,
        },
    )
    assert carton.ppwr_function == PPWR_FUNCTION_ECOMMERCE
    assert carton.ppwr_format == "shipper_box"
    assert carton.recyclable_pct == 85
    assert carton.include_in_bdo is True
    assert carton.paper_kg_per_unit == 0.2


def test_carton_rejects_sales_function(isolated_db):
    carton = Carton(
        id=str(uuid.uuid4()),
        tenant_id=1,
        warehouse_id=1,
        name="Karton B",
        length_cm=10,
        width_cm=10,
        height_cm=10,
        weight_kg=0.1,
    )
    with pytest.raises(ValueError, match="Niedozwolona funkcja"):
        apply_carton_ppwr(carton, {"ppwr_function": PPWR_FUNCTION_SALES})


def test_packaging_material_ppwr_save(isolated_db):
    db = isolated_db
    row = PackagingMaterial(
        id=str(uuid.uuid4()),
        tenant_id=1,
        warehouse_id=1,
        name="Stretch",
        material_type="stretch_foil",
        unit="roll",
        include_in_bdo=False,
        plastic_kg_per_unit=0.5,
    )
    apply_packaging_material_ppwr(
        row,
        {
            "ppwr_function": PPWR_FUNCTION_FILLER,
            "ppwr_format": "stretch",
            "recyclable_pct": 50,
        },
    )
    db.add(row)
    db.commit()
    assert row.ppwr_function == PPWR_FUNCTION_FILLER
    assert row.plastic_kg_per_unit == 0.5
    assert row.include_in_bdo is False


def test_pct_validation_0_100():
    assert validate_pct_0_100(0, field="recyclable_pct") == 0
    assert validate_pct_0_100(100, field="recyclable_pct") == 100
    assert validate_pct_0_100(None, field="recyclable_pct") is None
    with pytest.raises(ValueError, match="0–100"):
        validate_pct_0_100(101, field="recyclable_pct")
    with pytest.raises(ValueError, match="0–100"):
        validate_pct_0_100(-1, field="recycled_content_pct")


def test_ppwr_does_not_touch_inventory_or_product_carton_logistics(isolated_db):
    db = isolated_db
    product = db.query(Product).filter_by(id=1).one()
    assert product.carton_length_cm == 40.0
    assert product.carton_weight_kg == 1.5

    inv_before = db.query(Inventory).count()
    db.add(
        ProductSalesPackaging(
            id=str(uuid.uuid4()),
            product_id=1,
            name="Pouch",
            level="PRIMARY",
            ppwr_format="pouch",
        )
    )
    db.commit()

    product2 = db.query(Product).filter_by(id=1).one()
    assert product2.carton_length_cm == 40.0
    assert product2.carton_weight_kg == 1.5
    assert db.query(Inventory).count() == inv_before


def test_existing_carton_defaults_not_assessed(isolated_db):
    carton = Carton(
        id=str(uuid.uuid4()),
        tenant_id=1,
        warehouse_id=1,
        name="Legacy",
        length_cm=12,
        width_cm=12,
        height_cm=12,
        weight_kg=0.1,
    )
    assert carton.ppwr_function is None
    assert (carton.ppwr_status or PPWR_STATUS_NOT_ASSESSED) == PPWR_STATUS_NOT_ASSESSED
