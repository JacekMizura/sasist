"""Product pricing calculation regression."""

from __future__ import annotations

import pytest

from backend.database import SessionLocal
from backend.services.product_cost_service import get_product_current_cost


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def test_margin_math_sale_5_purchase_098_vat_23(db):
    """sale_net=5, purchase_net≈0.98, VAT 23% → expected gross and margin."""
    from backend.models.product import Product
    import json

    p = (
        db.query(Product)
        .filter(Product.symbol == "ST-001", Product.deleted_at.is_(None))
        .first()
    )
    if p is None:
        return
    meta = {"product_ui": {"vat_rate": "23"}}
    p.metadata_json = json.dumps(meta)
    p.sale_price = 5.0
    p.purchase_price = 0.98
    db.flush()

    cost = get_product_current_cost(db, int(p.tenant_id), int(p.id))
    assert cost["sale_net"] == 5.0
    assert cost["sale_gross"] == 6.15
    assert cost["purchase_net"] is not None
    assert abs(float(cost["purchase_net"]) - 0.98) < 0.02
    assert cost["purchase_gross"] is not None
    assert abs(float(cost["purchase_gross"]) - 1.21) < 0.02
    assert cost["landed_cost_net"] is not None
    assert cost["margin_value"] is not None
    assert abs(float(cost["margin_value"]) - 4.02) < 0.05
    assert cost["margin_percent"] is not None
    assert abs(float(cost["margin_percent"]) - 80.4) < 0.5
