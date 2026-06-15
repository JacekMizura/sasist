"""Tests: PZ creation from inbound delivery uses delivery.warehouse_id (SSOT)."""

from __future__ import annotations

from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from backend.models.inbound_delivery import InboundDelivery
from backend.services.delivery_pz_service import (
    ERR_DELIVERY_NO_WAREHOUSE,
    create_pz_from_delivery,
    require_delivery_warehouse_id,
)


def test_require_delivery_warehouse_id_ok() -> None:
    d = InboundDelivery(id=1, tenant_id=1, supplier_id=1, warehouse_id=7)
    assert require_delivery_warehouse_id(d) == 7


def test_require_delivery_warehouse_id_missing() -> None:
    d = InboundDelivery(id=1, tenant_id=1, supplier_id=1, warehouse_id=None)
    with pytest.raises(ValueError, match=ERR_DELIVERY_NO_WAREHOUSE):
        require_delivery_warehouse_id(d)


def test_create_pz_fails_when_delivery_has_no_warehouse() -> None:
    db = MagicMock()
    delivery = InboundDelivery(
        id=4,
        tenant_id=1,
        supplier_id=2,
        warehouse_id=None,
        status="ordered",
        items=[],
    )
    db.query.return_value.filter.return_value.first.return_value = delivery

    with pytest.raises(ValueError, match=ERR_DELIVERY_NO_WAREHOUSE):
        create_pz_from_delivery(db, tenant_id=1, delivery_id=4)


@patch("backend.services.delivery_pz_service.sync_purchase_order_status_for_delivery_id")
@patch("backend.services.delivery_pz_service.hydrate_delivery_item_snapshots")
@patch("backend.services.delivery_pz_service.stamp_document_creator")
@patch("backend.services.delivery_pz_service.product_vat_rate_percent", return_value=23.0)
def test_create_pz_uses_delivery_warehouse_id(
    _vat: MagicMock,
    _stamp: MagicMock,
    _hydrate: MagicMock,
    _sync: MagicMock,
) -> None:
    from backend.models.inbound_delivery import DeliveryItem
    from backend.models.product import Product
    from backend.models.supplier import Supplier

    db = MagicMock()
    item = DeliveryItem(
        id=10,
        delivery_id=4,
        product_id=5,
        quantity_ordered=3.0,
        quantity_received=0.0,
        purchase_price=10.0,
    )
    delivery = InboundDelivery(
        id=4,
        tenant_id=1,
        supplier_id=2,
        warehouse_id=9,
        status="ordered",
        items=[item],
    )
    supplier = Supplier(id=2, tenant_id=1, name="Sup")
    product = Product(id=5, tenant_id=1, name="P", sku="SKU")

    delivery_q = MagicMock()
    delivery_q.filter.return_value.first.return_value = delivery
    supplier_q = MagicMock()
    supplier_q.filter.return_value.first.return_value = supplier
    product_q = MagicMock()
    product_q.filter.return_value.first.return_value = product

    def query_side(model):
        if model is InboundDelivery:
            return delivery_q
        if model is Supplier:
            return supplier_q
        if model is Product:
            return product_q
        return MagicMock()

    db.query.side_effect = query_side

    captured: dict = {}

    def capture_add(obj):
        if hasattr(obj, "document_type"):
            captured["doc"] = obj

    db.add.side_effect = capture_add

    doc = create_pz_from_delivery(db, tenant_id=1, delivery_id=4)
    assert captured["doc"].warehouse_id == 9
    assert doc.warehouse_id == 9
    db.commit.assert_called_once()
