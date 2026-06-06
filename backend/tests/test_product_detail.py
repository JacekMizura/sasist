"""Product detail GET payload — regression for HTTP 500 on /api/products/{id}."""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from backend.database import SessionLocal
from backend.models.product import Product
from backend.services.product_detail_service import (
    build_product_detail_payload,
    minimal_product_detail_payload,
)


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def test_product_detail_returns_200_for_existing_product(db):
    product = db.query(Product).filter(Product.deleted_at.is_(None)).first()
    if product is None:
        pytest.skip("no products in test db")
    out = build_product_detail_payload(
        db,
        product_id=int(product.id),
        tenant_id=int(product.tenant_id),
    )
    assert int(out["id"]) == int(product.id)
    assert int(out["tenant_id"]) == int(product.tenant_id)
    json.dumps(out)


def test_product_detail_product_192_tenant_1(db):
    product = (
        db.query(Product)
        .filter(Product.id == 192, Product.tenant_id == 1, Product.deleted_at.is_(None))
        .first()
    )
    if product is None:
        pytest.skip("product 192 / tenant 1 not in test db")
    out = build_product_detail_payload(db, product_id=192, tenant_id=1)
    assert out["id"] == 192
    assert out["tenant_id"] == 1
    assert "name" in out
    assert isinstance(out.get("locations"), list)
    assert isinstance(out.get("inventory"), list)


def test_product_detail_not_found(db):
    with pytest.raises(HTTPException) as exc:
        build_product_detail_payload(db, product_id=9_999_999, tenant_id=1)
    assert exc.value.status_code == 404


def test_product_detail_degraded_fallback_when_base_dict_fails(db):
    product = db.query(Product).filter(Product.deleted_at.is_(None)).first()
    if product is None:
        pytest.skip("no products in test db")
    with patch("backend.api.product._product_to_dict", side_effect=RuntimeError("boom")):
        out = build_product_detail_payload(
            db,
            product_id=int(product.id),
            tenant_id=int(product.tenant_id),
        )
    assert out.get("detail_degraded") is True
    assert out["id"] == int(product.id)
    assert out["locations"] == []
    assert out["inventory"] == []


def test_minimal_product_detail_payload_shape(db):
    product = db.query(Product).filter(Product.deleted_at.is_(None)).first()
    if product is None:
        pytest.skip("no products in test db")
    out = minimal_product_detail_payload(product, degraded_reason="test")
    assert out["detail_degraded"] is True
    assert out["detail_degraded_reason"] == "test"
    json.dumps(out)
