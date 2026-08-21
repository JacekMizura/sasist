"""Returns list performance: batch projection + default panel status."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from backend.api.wms_returns import _list_item_from_row, _list_items_from_rows_batched
from backend.models.customer import Customer
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.models.return_status import ReturnStatus
from backend.models.return_ui_status import ReturnUiStatus
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_order_return import WmsOrderReturn
from backend.models.wms_refund import WmsRefund
from backend.models.wms_rmz_line import RMZLine
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.stock_document_return_link import StockDocumentReturnLink
from backend.services.return_default_new_panel_status import (
    assign_default_new_panel_status_to_return,
    get_or_create_default_new_return_ui_status_id,
)


def _db():
    engine = create_engine("sqlite:///:memory:")
    for m in (
        Tenant,
        Warehouse,
        Customer,
        Product,
        Order,
        OrderItem,
        ReturnStatus,
        ReturnUiStatus,
        WmsOrderReturn,
        RMZLine,
        WmsRefund,
        StockDocument,
        StockDocumentItem,
        StockDocumentReturnLink,
    ):
        m.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="T", default_warehouse_id=1))
    db.add(Warehouse(id=1, tenant_id=1, name="WH1"))
    db.add(Customer(id=1, tenant_id=1, first_name="Jan", last_name="K"))
    db.add(Product(id=10, tenant_id=1, name="P", sku="S", ean="E", image_url="https://img/x.png"))
    db.add(
        ReturnStatus(
            id=1, tenant_id=1, warehouse_id=1, name="Start", type="in_progress", transition_key="start"
        )
    )
    db.commit()
    return db, engine


def _seed_n(db, n: int = 36):
    for i in range(n):
        oid = 1000 + i
        rid = 2000 + i
        db.add(
            Order(
                id=oid,
                tenant_id=1,
                warehouse_id=1,
                number=f"O-{oid}",
                customer_id=1,
                status="packed",
                currency="PLN",
                value=10.0,
                created_at=datetime.utcnow(),
            )
        )
        db.flush()
        db.add(
            OrderItem(
                id=oid,
                order_id=oid,
                product_id=10,
                quantity=1,
                unit_price=10.0,
                total_price=10.0,
                vat_percent=23.0,
            )
        )
        db.add(
            WmsOrderReturn(
                id=rid,
                tenant_id=1,
                warehouse_id=1,
                order_id=oid,
                rmz_number=f"RMZ-{rid}",
                return_type="RMA",
                status_id=1,
                lines_json="[]",
                created_at=datetime.utcnow(),
            )
        )
        db.flush()
        db.add(
            RMZLine(
                rmz_id=rid,
                order_item_id=oid,
                product_id=10,
                quantity=1,
                accepted_qty=1,
                rejected_qty=0,
                damaged_b_qty=0,
                damaged_c_qty=0,
                decision="OK",
            )
        )
    db.commit()


def test_batch_list_fewer_queries_than_per_row():
    db, engine = _db()
    _seed_n(db, 36)
    pairs = (
        db.query(WmsOrderReturn, Order)
        .join(Order, Order.id == WmsOrderReturn.order_id)
        .order_by(WmsOrderReturn.id.asc())
        .all()
    )

    qcount = {"n": 0}

    def before_cursor(*_a, **_k):
        qcount["n"] += 1

    event.listen(engine, "before_cursor_execute", before_cursor)

    qcount["n"] = 0
    batched = _list_items_from_rows_batched(db, pairs)
    batch_q = qcount["n"]

    qcount["n"] = 0
    # Per-row path on a small sample (10) extrapolated — measure exact for same 36
    per_row = [_list_item_from_row(db, r, o) for r, o in pairs]
    per_row_q = qcount["n"]

    event.remove(engine, "before_cursor_execute", before_cursor)

    assert len(batched) == 36
    assert len(per_row) == 36
    assert batched[0].lines_preview[0].image_url == "https://img/x.png"
    # Batched must be dramatically cheaper than N+1 (expect ~O(10) vs hundreds).
    assert batch_q < 25, f"batch queries too high: {batch_q}"
    assert per_row_q > batch_q * 5, f"expected N+1: batch={batch_q} per_row={per_row_q}"


def test_default_panel_status_on_assign():
    db, _engine = _db()
    sid = get_or_create_default_new_return_ui_status_id(db, 1, 1)
    row = WmsOrderReturn(
        tenant_id=1,
        warehouse_id=1,
        order_id=1,
        rmz_number="RMZ-X",
        return_type="RMA",
        status_id=1,
        lines_json="[]",
    )
    db.add(Order(id=1, tenant_id=1, warehouse_id=1, number="O-1", status="new", currency="PLN", value=0))
    db.flush()
    assign_default_new_panel_status_to_return(db, row)
    assert row.ui_status_id == sid
    ui = db.query(ReturnUiStatus).filter(ReturnUiStatus.id == sid).one()
    assert ui.main_group == "NEW"
    assert ui.name == "Nowe"


def test_wszystkie_includes_null_ui_status_semantics():
    """Null ui_status_id remains listable (Wszystkie); no separate nav required."""
    db, _ = _db()
    db.add(Order(id=1, tenant_id=1, warehouse_id=1, number="O-1", status="new", currency="PLN", value=0))
    db.add(
        WmsOrderReturn(
            id=5,
            tenant_id=1,
            warehouse_id=1,
            order_id=1,
            rmz_number="RMZ-5",
            return_type="RMA",
            status_id=1,
            ui_status_id=None,
            lines_json="[]",
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    from backend.api.wms_returns import _returns_query

    q = _returns_query(db, 1, 1)
    rows = q.all()
    assert len(rows) == 1
    assert rows[0][0].ui_status_id is None
