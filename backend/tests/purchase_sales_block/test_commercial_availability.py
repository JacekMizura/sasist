"""MVP — purchase PZ line sales block + commercial availability overlay."""

from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.product import Product
from backend.models.product_sales_offer import ProductSalesOffer
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.stock_operation import STOCK_OP_ISSUE, StockOperation
from backend.models.warehouse import Warehouse
from backend.schemas.order import OrderCreateLine
from backend.services.bundle_explosion import BundleExplosionError, resolve_order_create_lines
from backend.services.commercial_availability_service import (
    COMMERCIAL_STOCK_UNAVAILABLE_MSG,
    commercially_sellable_qty,
    effective_sales_block_for_product,
    line_commercial_states_for_product,
)
from backend.services.product_sales_offers import offer_available_qty
from backend.services.product_sales_offers.crud_service import ensure_default_offer_for_product
from backend.services.purchase_sales_block_constants import SALES_BLOCK_REASON_PRICE_DISPUTE
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE


@pytest.fixture
def sales_block_db(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))

    for model in (
        Warehouse,
        Location,
        Product,
        Inventory,
        StockDocument,
        StockDocumentItem,
        StockOperation,
        ProductSalesOffer,
    ):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()

    db.add(Warehouse(id=1, tenant_id=1, name="Magazyn test"))
    db.add(Location(id=1, warehouse_id=1, name="A-01", is_active=True))
    product = Product(
        id=1,
        tenant_id=1,
        name="Produkt A",
        sku="SKU-A",
        ean="5900000000001",
        sale_price=10.0,
    )
    db.add(product)
    db.commit()

    monkeypatch.setattr(
        "backend.services.product_disposition_snapshot_service._reserved_by_product_and_disposition",
        lambda _db, _tenant_id, _warehouse_id, _product_ids, _stock_disposition: {},
    )
    monkeypatch.setattr(
        "backend.services.product_sales_offers.stock_service._reserved_by_product_and_disposition",
        lambda _db, _tenant_id, _warehouse_id, _product_ids, _stock_disposition: {},
    )

    try:
        yield db, product
    finally:
        db.close()


def _set_inventory(db, qty: float) -> None:
    row = db.query(Inventory).filter(Inventory.product_id == 1).first()
    if row is None:
        db.add(
            Inventory(
                tenant_id=1,
                warehouse_id=1,
                location_id=1,
                product_id=1,
                quantity=qty,
                batch_number="",
                expiry_date=date(9999, 12, 31),
                stock_disposition=STOCK_DISPOSITION_SALEABLE,
            )
        )
    else:
        row.quantity = qty
    db.commit()


def _add_pz_line(
    db,
    *,
    product_id: int = 1,
    received: float,
    blocked: float = 0.0,
    created_at: datetime | None = None,
) -> StockDocumentItem:
    when = created_at or datetime.utcnow()
    doc = StockDocument(
        tenant_id=1,
        document_type="PZ",
        warehouse_id=1,
        status="zakonczone",
        created_at=when,
        updated_at=when,
    )
    db.add(doc)
    db.flush()
    line = StockDocumentItem(
        document_id=int(doc.id),
        product_id=int(product_id),
        ordered_quantity=received,
        received_quantity=received,
        quantity=received,
        sales_blocked_qty=blocked,
        sales_block_reason_code=SALES_BLOCK_REASON_PRICE_DISPUTE if blocked > 0 else None,
        stock_disposition=STOCK_DISPOSITION_SALEABLE,
    )
    db.add(line)
    db.flush()
    return line


def _add_issue(db, *, product_id: int, qty: float, line: StockDocumentItem) -> None:
    db.add(
        StockOperation(
            document_id=int(line.document_id),
            document_line_id=int(line.id),
            product_id=int(product_id),
            location_id=1,
            qty=float(qty),
            type=STOCK_OP_ISSUE,
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
    )
    db.commit()


def test_commercially_sellable_10_blocked_2(sales_block_db) -> None:
    db, _product = sales_block_db
    _set_inventory(db, 10.0)
    _add_pz_line(db, received=10.0, blocked=2.0)
    assert commercially_sellable_qty(db, tenant_id=1, warehouse_id=1, product_id=1) == pytest.approx(8.0)


def test_commercially_sellable_500_plus_50_blocked_20(sales_block_db) -> None:
    db, _product = sales_block_db
    _set_inventory(db, 550.0)
    old = datetime.utcnow() - timedelta(days=10)
    new = datetime.utcnow()
    _add_pz_line(db, received=500.0, blocked=0.0, created_at=old)
    _add_pz_line(db, received=50.0, blocked=20.0, created_at=new)
    assert commercially_sellable_qty(db, tenant_id=1, warehouse_id=1, product_id=1) == pytest.approx(530.0)


def test_effective_block_after_partial_issue_lifo(sales_block_db) -> None:
    db, _product = sales_block_db
    _set_inventory(db, 510.0)
    old = datetime.utcnow() - timedelta(days=5)
    new = datetime.utcnow()
    _add_pz_line(db, received=500.0, created_at=old)
    new_line = _add_pz_line(db, received=50.0, blocked=20.0, created_at=new)
    db.commit()
    _add_issue(db, product_id=1, qty=40.0, line=new_line)

    states = line_commercial_states_for_product(db, tenant_id=1, warehouse_id=1, product_id=1)
    by_line = {s.line_id: s for s in states}
    new_state = by_line[int(new_line.id)]
    assert new_state.line_remaining_qty == pytest.approx(10.0)
    assert new_state.effective_sales_block == pytest.approx(10.0)
    assert effective_sales_block_for_product(db, tenant_id=1, warehouse_id=1, product_id=1) == pytest.approx(10.0)
    assert commercially_sellable_qty(db, tenant_id=1, warehouse_id=1, product_id=1) == pytest.approx(500.0)


def test_order_create_rejected_over_commercial_qty(sales_block_db) -> None:
    db, product = sales_block_db
    _set_inventory(db, 10.0)
    _add_pz_line(db, received=10.0, blocked=2.0)
    ensure_default_offer_for_product(db, product=product)
    db.commit()

    with pytest.raises(BundleExplosionError) as exc:
        resolve_order_create_lines(
            db,
            tenant_id=1,
            warehouse_id=1,
            raw_lines=[OrderCreateLine(product_id=1, quantity=9, unit_price=10.0)],
            check_bundle_stock=True,
        )
    assert COMMERCIAL_STOCK_UNAVAILABLE_MSG in str(exc.value.detail)


def test_offer_available_qty_respects_sales_block(sales_block_db) -> None:
    db, product = sales_block_db
    _set_inventory(db, 10.0)
    _add_pz_line(db, received=10.0, blocked=2.0)
    offer = ensure_default_offer_for_product(db, product=product)
    db.commit()
    assert offer_available_qty(db, offer=offer, tenant_id=1, warehouse_id=1) == pytest.approx(8.0)
