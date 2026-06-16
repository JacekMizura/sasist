"""Bundle STOCK shadow product — identifier validation aligned with DB constraints."""

from __future__ import annotations

import json
from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base
from backend.models.bundle import Bundle, BundleItem
from backend.models.product import Product
from backend.models.product_composition import ProductComposition, ProductCompositionLine
from backend.services.bundle_operational_mode import STOCK_PRODUCTION
from backend.services.bundle_stock_product_service import (
    EAN_CONFLICT_MESSAGE,
    BundleStockProductError,
    apply_stock_bundle_product_adapter,
    ensure_shadow_product_for_stock_bundle,
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


def _seed_stock_bundle(db, *, ean: str = "5900000000001", linked: int | None = 3) -> Bundle:
    p1 = Product(id=101, tenant_id=1, name="Składnik", sku="SK", symbol="SK")
    shadow = Product(
        id=3,
        tenant_id=1,
        name="Shadow",
        sku="DEO-X3",
        symbol="DEO-X3",
        ean="OLD-EAN",
        metadata_json=json.dumps({"is_bundle_stock_shadow": True, "shadow_bundle_id": 1}),
    )
    db.add_all([p1, shadow])
    b = Bundle(
        id=1,
        tenant_id=1,
        name="Dezodorant x3",
        sku="DEO-X3",
        ean=ean,
        bundle_fulfillment_mode=STOCK_PRODUCTION,
        linked_product_id=linked,
    )
    db.add(b)
    db.add(BundleItem(bundle_id=1, product_id=101, quantity=1, sort_order=0))
    db.commit()
    return db.query(Bundle).filter(Bundle.id == 1).first()


class TestBundleStockEanValidation:
    def test_active_product_same_ean_raises_before_flush(self, db) -> None:
        other = Product(id=50, tenant_id=1, name="Aktywny", ean="5900000000001")
        db.add(other)
        db.flush()
        bundle = _seed_stock_bundle(db)

        with pytest.raises(BundleStockProductError) as exc:
            ensure_shadow_product_for_stock_bundle(db, bundle)

        assert exc.value.code == "ean_conflict"
        assert exc.value.message == EAN_CONFLICT_MESSAGE

    def test_soft_deleted_product_same_ean_raises_before_flush(self, db) -> None:
        deleted = Product(
            id=99,
            tenant_id=1,
            name="Usunięty",
            ean="5900000000001",
            deleted_at=datetime.utcnow(),
        )
        db.add(deleted)
        db.flush()
        bundle = _seed_stock_bundle(db)

        with pytest.raises(BundleStockProductError) as exc:
            apply_stock_bundle_product_adapter(db, bundle)

        assert exc.value.code == "ean_conflict"
        assert exc.value.message == EAN_CONFLICT_MESSAGE

    def test_no_ean_conflict_save_ok(self, db) -> None:
        bundle = _seed_stock_bundle(db, ean="5900000000999")

        ensure_shadow_product_for_stock_bundle(db, bundle)
        db.commit()

        shadow = db.query(Product).filter(Product.id == 3).first()
        assert shadow is not None
        assert shadow.ean == "5900000000999"
        assert bundle.linked_product_id == 3
