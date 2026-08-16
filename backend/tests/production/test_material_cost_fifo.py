"""Production material cost = receipt FIFO layers → product purchase_price fallback."""

from __future__ import annotations

from datetime import date, datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base
from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.product import Product
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.stock_operation import STOCK_OP_ISSUE, STOCK_OP_RECEIPT, StockOperation
from backend.models.stock_reservation import StockReservation
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.order_item_pick_allocation_service import PickLotSlice, SENTINEL_EXPIRY
from backend.services.production_execution.material_cost_layers import (
    COST_SOURCE_PRODUCT_FALLBACK,
    COST_SOURCE_RECEIPT,
    ReceiptFifoCostLedger,
    expand_pick_slices_with_cost,
)
from backend.services.production_execution.material_consume_service import consume_production_material_slices


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(
        bind=engine,
        tables=[
            Tenant.__table__,
            Warehouse.__table__,
            Location.__table__,
            Product.__table__,
            Inventory.__table__,
            StockDocument.__table__,
            StockDocumentItem.__table__,
            StockOperation.__table__,
            StockReservation.__table__,
        ],
    )
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T"))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(Location(id=10, warehouse_id=1, name="A1", type="pick", is_active=True))
    session.add(
        Product(
            id=100,
            tenant_id=1,
            name="Comp",
            sku="C-100",
            purchase_price=99.0,
        )
    )
    session.commit()
    yield session
    session.close()


def _add_receipt(db, *, line_id: int, qty: float, unit: float, batch: str = "", doc_id: int | None = None):
    if doc_id is None:
        doc = StockDocument(
            tenant_id=1,
            warehouse_id=1,
            document_type="PZ",
            status="posted",
            document_number=f"PZ-{line_id}",
        )
        db.add(doc)
        db.flush()
        doc_id = int(doc.id)
        line = StockDocumentItem(
            document_id=doc_id,
            product_id=100,
            quantity=qty,
            ordered_quantity=qty,
            received_quantity=qty,
            purchase_price_net=unit,
            batch_number=batch,
        )
        db.add(line)
        db.flush()
        line_id = int(line.id)
    db.add(
        StockOperation(
            document_id=int(doc_id),
            document_line_id=int(line_id),
            product_id=100,
            location_id=10,
            qty=float(qty),
            type=STOCK_OP_RECEIPT,
            batch=batch or None,
            unit_price_net=float(unit),
        )
    )
    db.flush()
    return line_id, doc_id


def test_A_consume_150_from_two_receipts_costs_1600(db):
    _add_receipt(db, line_id=0, qty=100, unit=10.0)
    _add_receipt(db, line_id=0, qty=100, unit=12.0)
    db.commit()
    led = ReceiptFifoCostLedger(db, tenant_id=1, warehouse_id=1, product_id=100)
    parts = led.allocate(150)
    assert len(parts) == 2
    assert parts[0].quantity == 100 and parts[0].unit_cost_net == 10.0
    assert parts[0].cost_source == COST_SOURCE_RECEIPT
    assert parts[1].quantity == 50 and parts[1].unit_cost_net == 12.0
    total = sum(p.quantity * p.unit_cost_net for p in parts)
    assert abs(total - 1600.0) < 1e-6


def test_B_consume_50_costs_500(db):
    _add_receipt(db, line_id=0, qty=100, unit=10.0)
    _add_receipt(db, line_id=0, qty=100, unit=12.0)
    db.commit()
    led = ReceiptFifoCostLedger(db, tenant_id=1, warehouse_id=1, product_id=100)
    parts = led.allocate(50)
    assert len(parts) == 1
    assert parts[0].unit_cost_net == 10.0
    assert abs(parts[0].quantity * parts[0].unit_cost_net - 500.0) < 1e-6


def test_C_consume_120_costs_1240(db):
    _add_receipt(db, line_id=0, qty=100, unit=10.0)
    _add_receipt(db, line_id=0, qty=100, unit=12.0)
    db.commit()
    led = ReceiptFifoCostLedger(db, tenant_id=1, warehouse_id=1, product_id=100)
    parts = led.allocate(120)
    total = sum(p.quantity * p.unit_cost_net for p in parts)
    assert abs(total - 1240.0) < 1e-6


def test_D_receipt_without_price_falls_back_to_product_card(db):
    doc = StockDocument(tenant_id=1, warehouse_id=1, document_type="PZ", status="posted")
    db.add(doc)
    db.flush()
    line = StockDocumentItem(
        document_id=int(doc.id),
        product_id=100,
        quantity=50,
        ordered_quantity=50,
        received_quantity=50,
        purchase_price_net=None,
    )
    db.add(line)
    db.flush()
    # RECEIPT without unit_price_net and line without price → skipped in layers
    db.add(
        StockOperation(
            document_id=int(doc.id),
            document_line_id=int(line.id),
            product_id=100,
            location_id=10,
            qty=50,
            type=STOCK_OP_RECEIPT,
            unit_price_net=None,
        )
    )
    db.commit()
    led = ReceiptFifoCostLedger(db, tenant_id=1, warehouse_id=1, product_id=100)
    parts = led.allocate(20)
    assert len(parts) == 1
    assert parts[0].cost_source == COST_SOURCE_PRODUCT_FALLBACK
    assert parts[0].unit_cost_net == 99.0


def test_E_legacy_stock_without_source_falls_back(db):
    db.add(
        Inventory(
            tenant_id=1,
            warehouse_id=1,
            product_id=100,
            location_id=10,
            quantity=30,
            batch_number="",
            expiry_date=date(9999, 12, 31),
        )
    )
    db.commit()
    slices = expand_pick_slices_with_cost(
        db,
        [PickLotSlice(quantity=10, batch_number="", expiry_date=SENTINEL_EXPIRY)],
        tenant_id=1,
        warehouse_id=1,
        product_id=100,
    )
    assert slices[0].cost_source == COST_SOURCE_PRODUCT_FALLBACK
    assert slices[0].unit_cost_net == 99.0


def test_F_product_price_change_after_freeze_does_not_change_allocation(db):
    _add_receipt(db, line_id=0, qty=100, unit=10.0)
    db.commit()
    led = ReceiptFifoCostLedger(db, tenant_id=1, warehouse_id=1, product_id=100)
    parts = led.allocate(40)
    frozen = parts[0].unit_cost_net
    p = db.query(Product).filter(Product.id == 100).one()
    p.purchase_price = 5.0
    db.commit()
    assert frozen == 10.0
    # New ledger still uses receipt 10, not card 5
    led2 = ReceiptFifoCostLedger(db, tenant_id=1, warehouse_id=1, product_id=100)
    parts2 = led2.allocate(10)
    assert parts2[0].unit_cost_net == 10.0


def test_G_fefo_batch_prefers_matching_receipt_cost(db):
    # Older cheap receipt without batch, later expensive LOT-B
    _add_receipt(db, line_id=0, qty=100, unit=10.0, batch="")
    _add_receipt(db, line_id=0, qty=50, unit=12.0, batch="LOT-B")
    db.commit()
    led = ReceiptFifoCostLedger(db, tenant_id=1, warehouse_id=1, product_id=100)
    # Physical FEFO picked LOT-B → cost must follow LOT-B receipt (12), not pure FIFO (10)
    parts = led.allocate(20, batch_number="LOT-B")
    assert len(parts) == 1
    assert parts[0].unit_cost_net == 12.0
    assert parts[0].cost_source == COST_SOURCE_RECEIPT


def test_H_multi_lot_expand_per_physical_slice(db):
    _add_receipt(db, line_id=0, qty=6, unit=10.0, batch="LOT-A")
    _add_receipt(db, line_id=0, qty=4, unit=12.0, batch="LOT-B")
    db.commit()
    physical = [
        PickLotSlice(quantity=6, batch_number="LOT-A", expiry_date=date(2027, 6, 1)),
        PickLotSlice(quantity=4, batch_number="LOT-B", expiry_date=date(2027, 12, 15)),
    ]
    costed = expand_pick_slices_with_cost(
        db, physical, tenant_id=1, warehouse_id=1, product_id=100
    )
    assert len(costed) == 2
    assert costed[0].batch_number == "LOT-A" and costed[0].unit_cost_net == 10.0
    assert costed[1].batch_number == "LOT-B" and costed[1].unit_cost_net == 12.0
    total = sum(c.quantity * float(c.unit_cost_net or 0) for c in costed)
    assert abs(total - 108.0) < 1e-6


def test_I_consume_service_stamps_cost_and_no_double_peel_in_session(db):
    _add_receipt(db, line_id=0, qty=100, unit=10.0)
    _add_receipt(db, line_id=0, qty=100, unit=12.0)
    db.add(
        Inventory(
            tenant_id=1,
            warehouse_id=1,
            product_id=100,
            location_id=10,
            quantity=200,
            batch_number="",
            expiry_date=date(9999, 12, 31),
        )
    )
    db.commit()
    s1 = consume_production_material_slices(
        db, tenant_id=1, warehouse_id=1, product_id=100, location_id=10, quantity=100
    )
    s2 = consume_production_material_slices(
        db, tenant_id=1, warehouse_id=1, product_id=100, location_id=10, quantity=50
    )
    assert abs(sum(x.quantity * float(x.unit_cost_net or 0) for x in s1) - 1000.0) < 1e-6
    assert abs(sum(x.quantity * float(x.unit_cost_net or 0) for x in s2) - 600.0) < 1e-6


def test_J_issue_ops_do_not_inflate_remaining_before_consume(db):
    """Prior ISSUE peels receipt layers so remaining cost follows physical leftover."""
    line_id, doc_id = _add_receipt(db, line_id=0, qty=100, unit=10.0)
    _add_receipt(db, line_id=0, qty=100, unit=12.0)
    db.add(
        StockOperation(
            document_id=doc_id,
            document_line_id=line_id,
            product_id=100,
            location_id=10,
            qty=100,
            type=STOCK_OP_ISSUE,
            unit_price_net=10.0,
        )
    )
    db.commit()
    led = ReceiptFifoCostLedger(db, tenant_id=1, warehouse_id=1, product_id=100)
    parts = led.allocate(50)
    assert parts[0].unit_cost_net == 12.0
