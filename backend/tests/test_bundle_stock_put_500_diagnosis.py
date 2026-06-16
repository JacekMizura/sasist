"""Diagnostic regression — PUT bundle STOCK HTTP 500 root cause (EAN unique vs soft-deleted)."""

from __future__ import annotations

import json
from datetime import datetime

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from backend.models.bundle import Bundle, BundleItem
from backend.models.product import Product
from backend.models.product_composition import ProductComposition, ProductCompositionLine
from backend.services.bundle_operational_mode import STOCK_PRODUCTION
from backend.services.bundle_stock_product_service import apply_stock_bundle_product_adapter


def test_put_500_repro_ean_sync_vs_soft_deleted_product(db_engine_bundle_stock):
    """Reproduces unhandled IntegrityError that surfaces as HTTP 500 on PUT."""
    Session = sessionmaker(bind=db_engine_bundle_stock)
    db = Session()
    try:
        p1 = Product(id=101, tenant_id=1, name="Składnik", sku="SK", symbol="SK")
        p_deleted = Product(
            id=99,
            tenant_id=1,
            name="Usunięty katalog",
            ean="5900000000001",
            deleted_at=datetime.utcnow(),
        )
        shadow = Product(
            id=3,
            tenant_id=1,
            name="Shadow",
            sku="DEO-X3",
            symbol="DEO-X3",
            ean="OLD-EAN",
            metadata_json=json.dumps({"is_bundle_stock_shadow": True, "shadow_bundle_id": 1}),
        )
        db.add_all([p1, p_deleted, shadow])
        b = Bundle(
            id=1,
            tenant_id=1,
            name="Dezodorant x3",
            sku="DEO-X3",
            ean="5900000000001",
            bundle_fulfillment_mode=STOCK_PRODUCTION,
            linked_product_id=3,
        )
        db.add(b)
        db.add(BundleItem(bundle_id=1, product_id=101, quantity=1, sort_order=0))
        db.commit()

        bundle = db.query(Bundle).filter(Bundle.id == 1).first()
        with pytest.raises(IntegrityError):
            apply_stock_bundle_product_adapter(db, bundle)
    finally:
        db.close()


@pytest.fixture()
def db_engine_bundle_stock():
    from sqlalchemy import create_engine

    from backend.database import Base

    engine = create_engine("sqlite:///:memory:")
    tables = [
        Product.__table__,
        Bundle.__table__,
        BundleItem.__table__,
        ProductComposition.__table__,
        ProductCompositionLine.__table__,
    ]
    Base.metadata.create_all(engine, tables=tables)
    yield engine
    engine.dispose()
