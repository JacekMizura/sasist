"""PZ document putaway display must use PUTAWAY operation provenance — not live Inventory."""

from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.product import Product
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.stock_operation import STOCK_OP_PUTAWAY, STOCK_OP_RECEIPT, StockOperation
from backend.models.warehouse import Warehouse
from backend.services.stock_document_service import _putaway_allocations_from_operations


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))

    for model in (Warehouse, Location, Product, Inventory, StockDocument, StockDocumentItem, StockOperation):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


def _seed_wh_product(db):
    wh = Warehouse(id=1, tenant_id=1, name="WH-1", requires_putaway=True)
    db.add(wh)
    dock = Location(id=10, warehouse_id=1, name="DOCK-IN", type="floor", location_type="DOCK")
    a11 = Location(id=11, warehouse_id=1, name="A11-C-1", type="pick", location_type="PICK")
    a23 = Location(id=12, warehouse_id=1, name="A23-A-2", type="pick", location_type="PICK")
    rez = Location(id=13, warehouse_id=1, name="REZERWA-01", type="reserve", location_type="BUFFER")
    db.add_all([dock, a11, a23, rez])
    product = Product(id=1, tenant_id=1, name="Sznurówka", sku="SKU-X", ean="5900000000099", sale_price=1.0)
    db.add(product)
    db.flush()
    return wh, dock, a11, a23, rez, product


def _pz_line(db, *, doc_id: int, line_id: int, received: float, putaway: float) -> StockDocumentItem:
    line = StockDocumentItem(
        id=line_id,
        document_id=doc_id,
        product_id=1,
        ordered_quantity=received,
        received_quantity=received,
        quantity=received,
        quantity_putaway=putaway,
        vat_rate=23.0,
        purchase_price_net=1.0,
    )
    db.add(line)
    db.flush()
    return line


class TestPutawayAllocationsFromOperations:
    def test_a_single_location(self, db):
        _seed_wh_product(db)
        doc = StockDocument(
            id=32,
            tenant_id=1,
            warehouse_id=1,
            location_id=10,
            document_type="PZ",
            status="draft",
            receiving_status="DONE",
            putaway_status="DONE",
        )
        db.add(doc)
        line = _pz_line(db, doc_id=32, line_id=100, received=18, putaway=18)
        db.add(
            StockOperation(
                document_id=32,
                document_line_id=line.id,
                product_id=1,
                location_id=11,
                qty=18,
                type=STOCK_OP_PUTAWAY,
            )
        )
        db.commit()

        by_line = _putaway_allocations_from_operations(db, [line.id], warehouse_id=1)
        rows = by_line[line.id]
        assert len(rows) == 1
        assert rows[0].location_code == "A11-C-1"
        assert rows[0].quantity == 18.0

    def test_b_multi_location_quantities(self, db):
        _seed_wh_product(db)
        doc = StockDocument(
            id=32,
            tenant_id=1,
            warehouse_id=1,
            location_id=10,
            document_type="PZ",
            status="draft",
            receiving_status="DONE",
            putaway_status="IN_PROGRESS",
        )
        db.add(doc)
        line = _pz_line(db, doc_id=32, line_id=100, received=18, putaway=18)
        for lid, qty in ((11, 5), (12, 10), (13, 3)):
            db.add(
                StockOperation(
                    document_id=32,
                    document_line_id=line.id,
                    product_id=1,
                    location_id=lid,
                    qty=qty,
                    type=STOCK_OP_PUTAWAY,
                )
            )
        db.commit()

        rows = _putaway_allocations_from_operations(db, [line.id], warehouse_id=1)[line.id]
        by_code = {r.location_code: r.quantity for r in rows}
        assert by_code == {"A11-C-1": 5.0, "A23-A-2": 10.0, "REZERWA-01": 3.0}

    def test_d_preexisting_inventory_not_in_allocations(self, db):
        """Critical: Inventory A11=105 must not appear as putaway qty 105 for this PZ."""
        _seed_wh_product(db)
        # Pre-existing stock
        db.add(
            Inventory(
                tenant_id=1,
                warehouse_id=1,
                location_id=11,
                product_id=1,
                quantity=100.0,
            )
        )
        doc = StockDocument(
            id=32,
            tenant_id=1,
            warehouse_id=1,
            location_id=10,
            document_type="PZ",
            status="draft",
            receiving_status="DONE",
            putaway_status="IN_PROGRESS",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(doc)
        line = _pz_line(db, doc_id=32, line_id=100, received=18, putaway=18)
        db.add(
            Inventory(
                tenant_id=1,
                warehouse_id=1,
                location_id=11,
                product_id=1,
                quantity=5.0,
            )
        )
        db.add(
            Inventory(
                tenant_id=1,
                warehouse_id=1,
                location_id=12,
                product_id=1,
                quantity=13.0,
            )
        )
        db.add(
            StockOperation(
                document_id=32,
                document_line_id=line.id,
                product_id=1,
                location_id=11,
                qty=5,
                type=STOCK_OP_PUTAWAY,
            )
        )
        db.add(
            StockOperation(
                document_id=32,
                document_line_id=line.id,
                product_id=1,
                location_id=12,
                qty=13,
                type=STOCK_OP_PUTAWAY,
            )
        )
        db.commit()

        rows = _putaway_allocations_from_operations(db, [line.id], warehouse_id=1)[line.id]
        by_code = {r.location_code: r.quantity for r in rows}
        assert by_code == {"A11-C-1": 5.0, "A23-A-2": 13.0}
        assert by_code["A11-C-1"] != 105.0

    def test_e_two_pz_same_product_isolated(self, db):
        _seed_wh_product(db)
        for doc_id, line_id, put_lid, put_qty in ((32, 100, 11, 5.0), (33, 101, 12, 7.0)):
            db.add(
                StockDocument(
                    id=doc_id,
                    tenant_id=1,
                    warehouse_id=1,
                    location_id=10,
                    document_type="PZ",
                    status="draft",
                    receiving_status="DONE",
                    putaway_status="IN_PROGRESS",
                )
            )
            line = _pz_line(db, doc_id=doc_id, line_id=line_id, received=put_qty, putaway=put_qty)
            db.add(
                StockOperation(
                    document_id=doc_id,
                    document_line_id=line.id,
                    product_id=1,
                    location_id=put_lid,
                    qty=put_qty,
                    type=STOCK_OP_PUTAWAY,
                )
            )
        db.commit()

        a = _putaway_allocations_from_operations(db, [100], warehouse_id=1)[100]
        b = _putaway_allocations_from_operations(db, [101], warehouse_id=1)[101]
        assert [(r.location_code, r.quantity) for r in a] == [("A11-C-1", 5.0)]
        assert [(r.location_code, r.quantity) for r in b] == [("A23-A-2", 7.0)]

    def test_f_concurrent_receiving_putaway_sums(self, db):
        _seed_wh_product(db)
        db.add(
            StockDocument(
                id=32,
                tenant_id=1,
                warehouse_id=1,
                location_id=10,
                document_type="PZ",
                status="draft",
                receiving_status="IN_PROGRESS",
                putaway_status="IN_PROGRESS",
            )
        )
        line = _pz_line(db, doc_id=32, line_id=100, received=18, putaway=8)
        # Receipt ops (dock) + putaway ops interleaved — display uses PUTAWAY sum only
        db.add(
            StockOperation(
                document_id=32,
                document_line_id=line.id,
                product_id=1,
                location_id=10,
                qty=10,
                type=STOCK_OP_RECEIPT,
            )
        )
        db.add(
            StockOperation(
                document_id=32,
                document_line_id=line.id,
                product_id=1,
                location_id=11,
                qty=5,
                type=STOCK_OP_PUTAWAY,
            )
        )
        db.add(
            StockOperation(
                document_id=32,
                document_line_id=line.id,
                product_id=1,
                location_id=12,
                qty=3,
                type=STOCK_OP_PUTAWAY,
            )
        )
        db.add(
            StockOperation(
                document_id=32,
                document_line_id=line.id,
                product_id=1,
                location_id=10,
                qty=8,
                type=STOCK_OP_RECEIPT,
            )
        )
        db.commit()

        rows = _putaway_allocations_from_operations(db, [line.id], warehouse_id=1)[line.id]
        put_sum = sum(r.quantity for r in rows)
        assert put_sum == 8.0
        rem = float(line.received_quantity) - put_sum
        assert rem == 10.0

    def test_g_later_move_does_not_change_putaway_ops(self, db):
        """Historical PZ putaway destinations stay on PUTAWAY ops even if stock later moves."""
        _seed_wh_product(db)
        db.add(
            StockDocument(
                id=32,
                tenant_id=1,
                warehouse_id=1,
                location_id=10,
                document_type="PZ",
                status="draft",
                receiving_status="DONE",
                putaway_status="DONE",
            )
        )
        line = _pz_line(db, doc_id=32, line_id=100, received=18, putaway=18)
        db.add(
            StockOperation(
                document_id=32,
                document_line_id=line.id,
                product_id=1,
                location_id=11,
                qty=18,
                type=STOCK_OP_PUTAWAY,
            )
        )
        # Later MM-like inventory shift — no new PUTAWAY for this line
        db.add(
            Inventory(tenant_id=1, warehouse_id=1, location_id=12, product_id=1, quantity=18.0)
        )
        db.commit()

        rows = _putaway_allocations_from_operations(db, [line.id], warehouse_id=1)[line.id]
        assert [(r.location_code, r.quantity) for r in rows] == [("A11-C-1", 18.0)]


class TestInventoryFallbackVsOperationsSsot:
    def test_d_inventory_helper_would_bleed_but_ops_ssot_does_not(self, db):
        """Document read must prefer ops; inventory-by-lot helper can show 105 — do not use it for PZ display."""
        from backend.services.stock_document_service import _putaway_allocations_by_line_id

        _seed_wh_product(db)
        db.add(Inventory(tenant_id=1, warehouse_id=1, location_id=11, product_id=1, quantity=105.0))
        db.add(
            StockDocument(
                id=32,
                tenant_id=1,
                warehouse_id=1,
                location_id=10,
                document_type="PZ",
                status="draft",
                receiving_status="DONE",
                putaway_status="IN_PROGRESS",
            )
        )
        line = _pz_line(db, doc_id=32, line_id=100, received=18, putaway=5)
        db.add(
            StockOperation(
                document_id=32,
                document_line_id=line.id,
                product_id=1,
                location_id=11,
                qty=5,
                type=STOCK_OP_PUTAWAY,
            )
        )
        db.commit()

        prod = db.query(Product).filter(Product.id == 1).one()
        inv_view = _putaway_allocations_by_line_id(db, 1, 1, [line], {1: prod})[line.id]
        op_view = _putaway_allocations_from_operations(db, [line.id], warehouse_id=1)[line.id]

        assert any(r.quantity == 105.0 for r in inv_view)
        assert [(r.location_code, r.quantity) for r in op_view] == [("A11-C-1", 5.0)]


class TestPurchaseWorkflowDeadStatus:
    def test_h_pending_invoice_is_default_without_invoice_entity(self):
        from backend.services.receiving_workflow_status_service import (
            PU_PENDING_INVOICE,
            is_purchase_workflow_document,
            normalize_purchase_workflow_status,
        )

        assert normalize_purchase_workflow_status(None) == PU_PENDING_INVOICE
        doc = StockDocument(tenant_id=1, document_type="PZ", purchase_workflow_status=PU_PENDING_INVOICE)
        assert is_purchase_workflow_document(doc) is True
        # No purchase invoice model / FK — only a string column default.
