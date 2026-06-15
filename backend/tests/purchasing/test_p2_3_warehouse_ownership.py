"""P2.3 — warehouse ownership chain: PO → Delivery → PZ."""

from __future__ import annotations

from datetime import datetime
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.auth.warehouse_deps import (
    load_inbound_delivery_for_active_warehouse,
    load_purchase_order_for_active_warehouse,
)
from backend.models.app_user import AppUser
from backend.models.inbound_delivery import DeliveryItem, InboundDelivery
from backend.models.product import Product
from backend.models.purchase_order import PurchaseOrder, PurchaseOrderItem
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.supplier import Supplier
from backend.models.tenant_warehouse import TenantWarehouse
from backend.models.user_warehouse_assignment import UserWarehouseAssignment
from backend.models.warehouse import Warehouse
from backend.services.delivery_pz_service import create_pz_from_delivery
from backend.services.inbound_delivery_warehouse_service import (
    InboundDeliveryWarehouseRequiredError,
    register_inbound_delivery_warehouse_guard,
)
from backend.services.purchase_order_warehouse_service import (
    ERR_PURCHASE_ORDER_NO_WAREHOUSE,
    register_purchase_order_warehouse_guard,
)
from backend.services.purchasing_order_service import (
    create_inbound_delivery_from_purchase_order,
    create_orders_from_generator,
)
from backend.services.user_warehouse_context_service import sync_user_warehouse_assignments
from backend.services.warehouse_ownership_audit_service import count_missing_warehouse_ownership
from backend.services.warehouse_ownership_chain_service import (
    ERR_PZ_DELIVERY_WAREHOUSE_MISMATCH,
    assert_no_conflicting_pz_on_delivery,
    assert_pz_inherits_delivery_warehouse,
)
from backend.services.wms_warehouse_ownership_service import register_stock_document_warehouse_guard


@pytest.fixture
def chain_db(monkeypatch):
    monkeypatch.setenv("WMS_ENFORCE_WAREHOUSE_ASSIGNMENTS", "hard")
    register_inbound_delivery_warehouse_guard()
    register_purchase_order_warehouse_guard()
    register_stock_document_warehouse_guard()

    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
    AppUser.__table__.create(engine, checkfirst=True)
    UserWarehouseAssignment.__table__.create(engine, checkfirst=True)
    Warehouse.__table__.create(engine, checkfirst=True)
    TenantWarehouse.__table__.create(engine, checkfirst=True)
    Supplier.__table__.create(engine, checkfirst=True)
    Product.__table__.create(engine, checkfirst=True)
    PurchaseOrder.__table__.create(engine, checkfirst=True)
    PurchaseOrderItem.__table__.create(engine, checkfirst=True)
    InboundDelivery.__table__.create(engine, checkfirst=True)
    DeliveryItem.__table__.create(engine, checkfirst=True)
    StockDocument.__table__.create(engine, checkfirst=True)
    StockDocumentItem.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(AppUser(id=1, login="op", email="op@test.pl", password_hash="x", role="user", is_active=True))
    db.add(Warehouse(id=1, tenant_id=1, name="Magazyn A"))
    db.add(Warehouse(id=2, tenant_id=1, name="Magazyn B"))
    db.add(TenantWarehouse(tenant_id=1, warehouse_id=1))
    db.add(TenantWarehouse(tenant_id=1, warehouse_id=2))
    db.add(Supplier(id=1, tenant_id=1, name="Sup", active=True))
    db.add(Product(id=10, tenant_id=1, name="Prod", sku="SKU10", default_supplier_id=1))
    db.commit()
    sync_user_warehouse_assignments(db, user_id=1, warehouse_ids=[1, 2], default_warehouse_id=1)
    db.commit()
    try:
        yield db
    finally:
        db.close()


def test_scenario1_po_delivery_pz_all_same_warehouse(chain_db) -> None:
    """PO(WH=A) → Delivery → PZ — warehouse propagated end-to-end."""
    db = chain_db
    now = datetime.utcnow()
    po = PurchaseOrder(
        tenant_id=1,
        warehouse_id=1,
        supplier_id=1,
        order_number="PO-1",
        status="Draft",
        created_at=now,
        updated_at=now,
    )
    db.add(po)
    db.flush()
    db.add(
        PurchaseOrderItem(
            purchase_order_id=po.id,
            product_id=10,
            qty=5.0,
            received_qty=0.0,
            unit_price=10.0,
            line_total=50.0,
        )
    )
    db.commit()

    delivery_raw = create_inbound_delivery_from_purchase_order(db, tenant_id=1, order_id=po.id)
    delivery = db.query(InboundDelivery).filter(InboundDelivery.id == delivery_raw["delivery_id"]).first()
    assert delivery is not None
    assert delivery.warehouse_id == 1

    with patch("backend.services.delivery_pz_service.sync_purchase_order_status_for_delivery_id"), patch(
        "backend.services.delivery_pz_service.hydrate_delivery_item_snapshots"
    ), patch("backend.services.delivery_pz_service.stamp_document_creator"), patch(
        "backend.services.delivery_pz_service.product_vat_rate_percent", return_value=23.0
    ):
        pz = create_pz_from_delivery(db, tenant_id=1, delivery_id=delivery.id)

    assert pz.warehouse_id == 1
    assert pz.delivery_id == delivery.id


def test_scenario2_cross_warehouse_po_and_delivery_denied(chain_db) -> None:
    """Operator active WH=B accessing PO/Delivery in WH=A → 404."""
    db = chain_db
    user = db.query(AppUser).filter(AppUser.id == 1).first()
    assert user is not None
    now = datetime.utcnow()
    po = PurchaseOrder(
        tenant_id=1,
        warehouse_id=1,
        supplier_id=1,
        order_number="PO-X",
        status="Draft",
        created_at=now,
        updated_at=now,
    )
    db.add(po)
    db.flush()
    delivery = InboundDelivery(
        tenant_id=1,
        supplier_id=1,
        purchase_order_id=po.id,
        warehouse_id=1,
        status="draft",
        created_at=now,
        updated_at=now,
    )
    db.add(delivery)
    db.commit()

    with pytest.raises(HTTPException) as po_exc:
        load_purchase_order_for_active_warehouse(
            db, user, tenant_id=1, order_id=po.id, active_warehouse_id=2
        )
    assert po_exc.value.status_code == 404

    with pytest.raises(HTTPException) as del_exc:
        load_inbound_delivery_for_active_warehouse(
            db, user, tenant_id=1, delivery_id=delivery.id, active_warehouse_id=2
        )
    assert del_exc.value.status_code == 404


def test_scenario3_delivery_without_warehouse_rejected(chain_db) -> None:
    """Delivery without warehouse_id → blocked at ORM insert."""
    db = chain_db
    d = InboundDelivery(
        tenant_id=1,
        supplier_id=1,
        warehouse_id=None,
        status="ordered",
    )
    db.add(d)
    with pytest.raises(InboundDeliveryWarehouseRequiredError):
        db.flush()


def test_scenario4_pz_must_match_delivery_warehouse() -> None:
    """PZ warehouse != delivery warehouse → 400."""
    with pytest.raises(ValueError) as exc:
        assert_pz_inherits_delivery_warehouse(delivery_warehouse_id=1, pz_warehouse_id=2)
    assert ERR_PZ_DELIVERY_WAREHOUSE_MISMATCH in str(exc.value)


def test_conflicting_existing_pz_blocks_create(chain_db) -> None:
    db = chain_db
    now = datetime.utcnow()
    delivery = InboundDelivery(
        tenant_id=1,
        supplier_id=1,
        warehouse_id=1,
        status="ordered",
        created_at=now,
        updated_at=now,
        items=[
            DeliveryItem(
                product_id=10,
                quantity_ordered=1.0,
                quantity_received=0.0,
                purchase_price=1.0,
            )
        ],
    )
    db.add(delivery)
    db.flush()
    db.add(
        StockDocument(
            tenant_id=1,
            document_type="PZ",
            delivery_id=delivery.id,
            warehouse_id=2,
            status="draft",
            created_at=now,
            updated_at=now,
        )
    )
    db.commit()

    with pytest.raises(ValueError) as exc:
        assert_no_conflicting_pz_on_delivery(
            db,
            tenant_id=1,
            delivery_id=delivery.id,
            delivery_warehouse_id=1,
        )
    assert ERR_PZ_DELIVERY_WAREHOUSE_MISMATCH in str(exc.value)


def test_po_orm_guard_blocks_missing_warehouse(chain_db) -> None:
    db = chain_db
    now = datetime.utcnow()
    po = PurchaseOrder(
        tenant_id=1,
        warehouse_id=None,
        supplier_id=1,
        order_number="PO-BAD",
        status="Draft",
        created_at=now,
        updated_at=now,
    )
    db.add(po)
    with pytest.raises(Exception) as exc:
        db.flush()
    assert ERR_PURCHASE_ORDER_NO_WAREHOUSE in str(exc.value)


def test_create_orders_from_generator_requires_warehouse(chain_db) -> None:
    with pytest.raises(HTTPException) as exc:
        create_orders_from_generator(chain_db, tenant_id=1, warehouse_id=None, product_ids=[10])  # type: ignore[arg-type]
    assert exc.value.status_code == 400


def test_audit_counts_null_warehouse_rows(chain_db) -> None:
    db = chain_db
    db.execute(
        text(
            "INSERT INTO purchase_orders (tenant_id, warehouse_id, supplier_id, order_number, status, "
            "currency, tax_mode, subtotal, shipping_cost, total_value, created_at, updated_at) "
            "VALUES (1, NULL, 1, 'LEG-PO', 'Draft', 'PLN', 'domestic_vat', 0, 0, 0, datetime('now'), datetime('now'))"
        )
    )
    db.commit()
    counts = count_missing_warehouse_ownership(db)
    assert counts["purchase_orders_without_warehouse"] >= 1
