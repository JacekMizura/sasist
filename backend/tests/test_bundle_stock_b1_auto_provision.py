"""B1 — auto shadow Product for STOCK bundles."""

from __future__ import annotations

import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base
from backend.models.bundle import Bundle, BundleItem
from backend.models.product import Product
from backend.models.product_composition import ProductComposition, ProductCompositionLine
from backend.services.bundle_operational_mode import ON_DEMAND_ASSEMBLY, STOCK_PRODUCTION
from backend.services.bundle_stock_product_service import (
    SHADOW_META_FLAG,
    apply_stock_bundle_product_adapter,
    ensure_shadow_product_for_stock_bundle,
    is_bundle_stock_shadow_product,
)


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    tables = [
        Product.__table__,
        Bundle.__table__,
        BundleItem.__table__,
        ProductComposition.__table__,
        ProductCompositionLine.__table__,
    ]
    Base.metadata.create_all(bind=engine, tables=tables)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


def _seed_components(db) -> tuple[Product, Product]:
    p1 = Product(id=101, tenant_id=1, name="Składnik A", sku="A", symbol="A")
    p2 = Product(id=102, tenant_id=1, name="Składnik B", sku="B", symbol="B")
    db.add_all([p1, p2])
    db.flush()
    return p1, p2


def _stock_bundle(db, *, linked: int | None = None) -> Bundle:
    p1, p2 = _seed_components(db)
    b = Bundle(
        id=1,
        tenant_id=1,
        name="Dezodorant x3",
        sku="DEO-X3",
        ean="5900000000001",
        sale_price=99.0,
        bundle_fulfillment_mode=STOCK_PRODUCTION,
        linked_product_id=linked,
    )
    db.add(b)
    db.flush()
    db.add_all(
        [
            BundleItem(bundle_id=b.id, product_id=p1.id, quantity=2, sort_order=0),
            BundleItem(bundle_id=b.id, product_id=p2.id, quantity=1, sort_order=1),
        ]
    )
    db.flush()
    return b


class TestBundleStockAutoProvision:
    def test_creates_shadow_product_on_stock_save(self, db) -> None:
        bundle = _stock_bundle(db, linked=None)
        pid = ensure_shadow_product_for_stock_bundle(db, bundle)
        assert pid is not None
        assert bundle.linked_product_id == pid
        product = db.query(Product).filter(Product.id == int(pid)).first()
        assert product is not None
        assert product.name == "Dezodorant x3"
        assert product.sku == "DEO-X3"
        assert product.ean == "5900000000001"
        assert is_bundle_stock_shadow_product(product)
        meta = json.loads(product.metadata_json or "{}")
        assert meta.get(SHADOW_META_FLAG) is True
        assert meta.get("shadow_bundle_id") == 1

    def test_syncs_existing_linked_product(self, db) -> None:
        existing = Product(id=200, tenant_id=1, name="Old", sku="OLD", symbol="OLD")
        db.add(existing)
        db.flush()
        bundle = _stock_bundle(db, linked=200)
        bundle.name = "Nowa nazwa"
        bundle.sku = "NEW-SKU"
        ensure_shadow_product_for_stock_bundle(db, bundle)
        db.refresh(existing)
        assert existing.name == "Nowa nazwa"
        assert existing.sku == "NEW-SKU"
        assert is_bundle_stock_shadow_product(existing)

    def test_creates_manufacturing_composition(self, db) -> None:
        bundle = _stock_bundle(db, linked=None)
        pid = ensure_shadow_product_for_stock_bundle(db, bundle)
        comp = (
            db.query(ProductComposition)
            .filter(
                ProductComposition.product_id == int(pid),
                ProductComposition.composition_mode == "manufacturing",
                ProductComposition.is_active.is_(True),
            )
            .first()
        )
        assert comp is not None
        assert len(comp.lines) == 2

    def test_on_demand_clears_linked_product(self, db) -> None:
        existing = Product(id=200, tenant_id=1, name="Shadow", sku="S", symbol="S")
        db.add(existing)
        db.flush()
        bundle = _stock_bundle(db, linked=200)
        bundle.bundle_fulfillment_mode = ON_DEMAND_ASSEMBLY
        result = ensure_shadow_product_for_stock_bundle(db, bundle)
        assert result is None
        assert bundle.linked_product_id is None

    def test_apply_adapter_via_api_hook(self, db) -> None:
        bundle = _stock_bundle(db, linked=None)
        apply_stock_bundle_product_adapter(db, bundle)
        assert bundle.linked_product_id is not None

    def test_ean_conflict_raises(self, db) -> None:
        other = Product(id=50, tenant_id=1, name="Inny", ean="5900000000001")
        db.add(other)
        db.flush()
        bundle = _stock_bundle(db, linked=None)
        from backend.services.bundle_stock_product_service import BundleStockProductError

        with pytest.raises(BundleStockProductError) as exc:
            ensure_shadow_product_for_stock_bundle(db, bundle)
        assert exc.value.code == "ean_conflict"
        from backend.services.bundle_stock_product_service import EAN_CONFLICT_MESSAGE

        assert exc.value.message == EAN_CONFLICT_MESSAGE

    def test_update_linked_product_no_duplicate_insert(self, db) -> None:
        """Regression: PUT when linked_product_id=3 must UPDATE product #3, not INSERT."""
        shadow = Product(
            id=3,
            tenant_id=1,
            name="Shadow",
            sku="DEO-X3",
            symbol="DEO-X3",
            metadata_json=json.dumps({"is_bundle_stock_shadow": True, "shadow_bundle_id": 1}),
        )
        db.add(shadow)
        db.flush()
        bundle = _stock_bundle(db, linked=3)
        count_before = db.query(Product).count()
        ensure_shadow_product_for_stock_bundle(db, bundle)
        assert db.query(Product).count() == count_before
        assert bundle.linked_product_id == 3
        db.refresh(shadow)
        assert shadow.name == "Dezodorant x3"

    def test_reuses_orphan_shadow_when_linked_null(self, db) -> None:
        """Product #3 exists with shadow_bundle_id=1 but bundle.linked_product_id IS NULL."""
        shadow = Product(
            id=3,
            tenant_id=1,
            name="Orphan shadow",
            sku="DEO-X3",
            symbol="DEO-X3",
            metadata_json=json.dumps({"is_bundle_stock_shadow": True, "shadow_bundle_id": 1}),
        )
        db.add(shadow)
        db.flush()
        bundle = _stock_bundle(db, linked=None)
        count_before = db.query(Product).count()
        pid = ensure_shadow_product_for_stock_bundle(db, bundle)
        assert pid == 3
        assert bundle.linked_product_id == 3
        assert db.query(Product).count() == count_before

    def test_double_save_idempotent(self, db) -> None:
        """Second save (PUT-like) must not create another Product row."""
        bundle = _stock_bundle(db, linked=None)
        ensure_shadow_product_for_stock_bundle(db, bundle)
        first_pid = int(bundle.linked_product_id)
        count = db.query(Product).count()
        bundle.name = "Zmieniona nazwa"
        ensure_shadow_product_for_stock_bundle(db, bundle)
        assert db.query(Product).count() == count
        assert bundle.linked_product_id == first_pid
