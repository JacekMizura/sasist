"""Partial FG register + multi-LOT/SN per delta (BAT / PLANNING / ORDERS)."""

from __future__ import annotations

import json
from datetime import date

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.product import Product
from backend.models.product_composition import (
    ProductionBatch,
    ProductionBatchLine,
    ProductComposition,
    ProductCompositionLine,
)
from backend.models.production import (
    PRODUCTION_ORDER_SOURCE_ORDERS,
    ProductionOrder,
    ProductionOrderLineSnapshot,
)
from backend.models.production_fg_output import ProductionFgOutput
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.stock_operation import StockOperation
from backend.models.warehouse import Warehouse
from backend.schemas.production_batch import BatchProductionProgressBody
from backend.schemas.production_execution import OrderProductionProgressBody
from backend.services.production_batch_service import (
    ProductionBatchError,
    finish_production,
    update_production_progress,
)
from backend.services.production_execution.batch_putaway_completion import (
    try_complete_production_batch_from_pw_document,
)
from backend.services.production_execution.fg_output_register_service import (
    list_fg_outputs_for_batch,
    production_pw_documents_for_batch,
)
from backend.services.production_execution.order_execution_service import update_order_production_progress
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE


@pytest.fixture
def fg_register_db(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants VALUES (1)"))
        conn.execute(text("CREATE TABLE app_users (id INTEGER PRIMARY KEY)"))

    for model in (
        Warehouse,
        Location,
        Product,
        Inventory,
        ProductComposition,
        ProductCompositionLine,
        ProductionBatch,
        ProductionBatchLine,
        ProductionOrder,
        ProductionOrderLineSnapshot,
        ProductionFgOutput,
        StockDocument,
        StockDocumentItem,
        StockOperation,
    ):
        model.__table__.create(engine, checkfirst=True)

    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()

    monkeypatch.setattr(
        "backend.services.production_execution.pw_putaway_handoff.require_warehouse_series",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.production_execution.pw_putaway_handoff.upsert_dock_inventory_for_loose_receipt",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.production_execution.pw_putaway_handoff.append_receipt_operation",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.production_execution.production_warehouse_audit.record_production_pw_receipt_audit",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.production_batch_service.list_tenant_warehouse_ids",
        lambda *_a, **_k: {1},
    )
    monkeypatch.setattr(
        "backend.services.production_batch_service._batch_has_shortages",
        lambda *_a, **_k: False,
    )
    monkeypatch.setattr(
        "backend.services.production_execution.production_fg_traceability.resolve_effective_production_traceability_for_product",
        lambda *_a, **_k: type(
            "P",
            (),
            {
                "require_batch": False,
                "require_expiry": False,
                "require_serial": False,
                "to_dict": lambda self: {
                    "require_batch": False,
                    "require_expiry": False,
                    "require_serial": False,
                },
            },
        )(),
    )
    # Staging location for PW header.
    monkeypatch.setattr(
        "backend.services.stock_document_service.ensure_default_pz_receiving_location_if_missing",
        lambda db, doc: setattr(doc, "location_id", 1) or db.flush(),
    )
    monkeypatch.setattr(
        "backend.services.stock_document_service.recompute_putaway_status_for_document",
        lambda doc, items, db=None: setattr(doc, "putaway_status", "NOT_STARTED"),
    )

    db.add(Warehouse(id=1, tenant_id=1, name="WH", requires_putaway=True))
    db.add(Product(id=20, tenant_id=1, name="Finished", sku="FG"))
    db.add(
        Location(
            id=1,
            warehouse_id=1,
            name="DOCK",
            type="dock",
            location_type="NORMAL",
            is_active=True,
        )
    )
    db.add(
        ProductComposition(
            id=91,
            tenant_id=1,
            product_id=20,
            composition_mode="manufacturing",
            name="FG recipe",
            is_active=True,
        )
    )
    db.commit()
    yield db
    db.close()


def _make_batch(db: Session, *, planned: float = 1000.0, batch_id: int = 501, line_id: int = 5010):
    batch = ProductionBatch(
        id=batch_id,
        tenant_id=1,
        warehouse_id=1,
        number=f"B-{batch_id}",
        status="in_progress",
    )
    db.add(batch)
    line = ProductionBatchLine(
        id=line_id,
        batch_id=batch_id,
        product_id=20,
        composition_id=91,
        planned_quantity=planned,
        completed_quantity=0,
        status="in_progress",
    )
    db.add(line)
    db.commit()
    db.refresh(batch)
    db.refresh(line)
    return batch, line


def test_a_bat_partial_deltas_create_pw_and_complete(fg_register_db):
    db = fg_register_db
    batch, line = _make_batch(db, planned=1000.0)

    update_production_progress(
        db,
        tenant_id=1,
        batch_id=int(batch.id),
        body=BatchProductionProgressBody(line_id=int(line.id), add_quantity=200, fg_batch_number="LOT-A"),
    )
    db.commit()
    db.refresh(line)
    db.refresh(batch)
    assert line.completed_quantity == pytest.approx(200)
    assert batch.status == "in_progress"
    assert len(production_pw_documents_for_batch(db, batch_id=int(batch.id))) == 1

    update_production_progress(
        db,
        tenant_id=1,
        batch_id=int(batch.id),
        body=BatchProductionProgressBody(line_id=int(line.id), add_quantity=300, fg_batch_number="LOT-B"),
    )
    db.commit()
    assert len(production_pw_documents_for_batch(db, batch_id=int(batch.id))) == 2

    update_production_progress(
        db,
        tenant_id=1,
        batch_id=int(batch.id),
        body=BatchProductionProgressBody(line_id=int(line.id), add_quantity=500, fg_batch_number="LOT-C"),
    )
    db.commit()
    db.refresh(batch)
    db.refresh(line)
    assert line.completed_quantity == pytest.approx(1000)
    assert batch.status == "awaiting_putaway"
    pws = production_pw_documents_for_batch(db, batch_id=int(batch.id))
    assert len(pws) == 3
    outputs = list_fg_outputs_for_batch(db, batch_id=int(batch.id))
    assert [float(o.quantity) for o in outputs] == [200.0, 300.0, 500.0]
    lots = {str(o.batch_number) for o in outputs}
    assert lots == {"LOT-A", "LOT-B", "LOT-C"}


def test_d_multi_lot_parallel_inventory_lines(fg_register_db):
    db = fg_register_db
    batch, line = _make_batch(db, planned=500.0, batch_id=502, line_id=5020)
    update_production_progress(
        db,
        tenant_id=1,
        batch_id=int(batch.id),
        body=BatchProductionProgressBody(line_id=int(line.id), add_quantity=200, fg_batch_number="LOT-A"),
    )
    update_production_progress(
        db,
        tenant_id=1,
        batch_id=int(batch.id),
        body=BatchProductionProgressBody(line_id=int(line.id), add_quantity=300, fg_batch_number="LOT-B"),
    )
    db.commit()
    items = (
        db.query(StockDocumentItem)
        .join(StockDocument, StockDocument.id == StockDocumentItem.document_id)
        .filter(StockDocument.production_batch_id == int(batch.id))
        .all()
    )
    assert {str(i.batch_number) for i in items} == {"LOT-A", "LOT-B"}


def test_f_retry_idempotent_no_double_stock(fg_register_db):
    db = fg_register_db
    batch, line = _make_batch(db, planned=100.0, batch_id=503, line_id=5030)
    body = BatchProductionProgressBody(
        line_id=int(line.id),
        add_quantity=40,
        fg_batch_number="LOT-R",
        idempotency_key="retry-key-1",
    )
    update_production_progress(db, tenant_id=1, batch_id=int(batch.id), body=body)
    update_production_progress(db, tenant_id=1, batch_id=int(batch.id), body=body)
    db.commit()
    db.refresh(line)
    assert line.completed_quantity == pytest.approx(40)
    assert len(list_fg_outputs_for_batch(db, batch_id=int(batch.id))) == 1
    assert len(production_pw_documents_for_batch(db, batch_id=int(batch.id))) == 1


def test_g_overproduction_rejected(fg_register_db):
    db = fg_register_db
    batch, line = _make_batch(db, planned=10.0, batch_id=504, line_id=5040)
    update_production_progress(
        db,
        tenant_id=1,
        batch_id=int(batch.id),
        body=BatchProductionProgressBody(line_id=int(line.id), add_quantity=8),
    )
    with pytest.raises(ProductionBatchError) as ei:
        update_production_progress(
            db,
            tenant_id=1,
            batch_id=int(batch.id),
            body=BatchProductionProgressBody(line_id=int(line.id), add_quantity=3),
        )
    assert ei.value.code == "over_production"


def test_h_first_delta_putaway_before_rest(fg_register_db):
    db = fg_register_db
    batch, line = _make_batch(db, planned=1000.0, batch_id=505, line_id=5050)
    update_production_progress(
        db,
        tenant_id=1,
        batch_id=int(batch.id),
        body=BatchProductionProgressBody(line_id=int(line.id), add_quantity=200),
    )
    db.commit()
    pw1 = production_pw_documents_for_batch(db, batch_id=int(batch.id))[0]
    pw1.putaway_status = "DONE"
    pw1.relocation_status = "DONE"
    db.add(pw1)
    db.commit()
    assert try_complete_production_batch_from_pw_document(db, pw1) is False
    db.refresh(batch)
    assert batch.status == "in_progress"

    update_production_progress(
        db,
        tenant_id=1,
        batch_id=int(batch.id),
        body=BatchProductionProgressBody(line_id=int(line.id), add_quantity=800),
    )
    db.commit()
    db.refresh(batch)
    assert batch.status == "awaiting_putaway"
    for pw in production_pw_documents_for_batch(db, batch_id=int(batch.id)):
        if int(pw.id) != int(pw1.id):
            pw.putaway_status = "DONE"
            pw.relocation_status = "DONE"
            db.add(pw)
    db.commit()
    last = production_pw_documents_for_batch(db, batch_id=int(batch.id))[-1]
    assert try_complete_production_batch_from_pw_document(db, last) is True
    db.refresh(batch)
    assert batch.status == "completed"


def test_e_sn_per_delta(fg_register_db, monkeypatch):
    db = fg_register_db
    monkeypatch.setattr(
        "backend.services.production_execution.production_fg_traceability.resolve_effective_production_traceability_for_product",
        lambda *_a, **_k: type(
            "P",
            (),
            {
                "require_batch": False,
                "require_expiry": False,
                "require_serial": True,
                "to_dict": lambda self: {
                    "require_batch": False,
                    "require_expiry": False,
                    "require_serial": True,
                },
            },
        )(),
    )
    monkeypatch.setattr(
        "backend.services.production_execution.production_fg_traceability._assert_serials_unused",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.inventory_serial_service.register_serial_on_hand",
        lambda *_a, **_k: None,
    )
    batch, line = _make_batch(db, planned=5.0, batch_id=506, line_id=5060)
    update_production_progress(
        db,
        tenant_id=1,
        batch_id=int(batch.id),
        body=BatchProductionProgressBody(
            line_id=int(line.id),
            add_quantity=2,
            fg_serial_numbers=["A", "B"],
        ),
    )
    update_production_progress(
        db,
        tenant_id=1,
        batch_id=int(batch.id),
        body=BatchProductionProgressBody(
            line_id=int(line.id),
            add_quantity=3,
            fg_serial_numbers=["C", "D", "E"],
        ),
    )
    db.commit()
    outputs = list_fg_outputs_for_batch(db, batch_id=int(batch.id))
    sns = []
    for o in outputs:
        sns.extend(json.loads(o.serial_numbers_json or "[]"))
    assert sns == ["A", "B", "C", "D", "E"]


def test_i_traceability_off_partial_ok(fg_register_db):
    db = fg_register_db
    batch, line = _make_batch(db, planned=50.0, batch_id=507, line_id=5070)
    update_production_progress(
        db,
        tenant_id=1,
        batch_id=int(batch.id),
        body=BatchProductionProgressBody(line_id=int(line.id), add_quantity=10),
    )
    db.commit()
    db.refresh(line)
    assert line.completed_quantity == pytest.approx(10)
    assert len(production_pw_documents_for_batch(db, batch_id=int(batch.id))) == 1


def test_b_planning_mo_partial_pw(fg_register_db, monkeypatch):
    db = fg_register_db
    monkeypatch.setattr(
        "backend.services.production_execution.order_execution_service.serialize_order",
        lambda db, order, **_k: order,
    )
    mo = ProductionOrder(
        id=701,
        tenant_id=1,
        warehouse_id=1,
        number="MO-PLAN-1",
        product_id=20,
        composition_id=91,
        planned_quantity=100,
        produced_quantity=0,
        status="in_progress",
        source_type="PLANNING",
    )
    db.add(mo)
    db.commit()
    update_order_production_progress(
        db,
        tenant_id=1,
        order_id=int(mo.id),
        body=OrderProductionProgressBody(add_quantity=40, fg_batch_number="P1"),
    )
    db.commit()
    db.refresh(mo)
    assert mo.produced_quantity == pytest.approx(40)
    assert mo.status == "in_progress"
    pws = (
        db.query(StockDocument)
        .filter(StockDocument.production_order_id == int(mo.id), StockDocument.document_type == "PW")
        .all()
    )
    assert len(pws) == 1
    assert str(pws[0].putaway_status).upper() == "NOT_STARTED"

    update_order_production_progress(
        db,
        tenant_id=1,
        order_id=int(mo.id),
        body=OrderProductionProgressBody(add_quantity=60, fg_batch_number="P2"),
    )
    db.commit()
    db.refresh(mo)
    assert mo.produced_quantity == pytest.approx(100)
    assert mo.status == "awaiting_putaway"
    assert (
        db.query(StockDocument)
        .filter(StockDocument.production_order_id == int(mo.id), StockDocument.document_type == "PW")
        .count()
        == 2
    )


def test_c_orders_partial_buffer_no_regression(fg_register_db, monkeypatch):
    db = fg_register_db
    monkeypatch.setattr(
        "backend.services.production_execution.orders_fg_fulfillment_service.resolve_orders_mo_buffer_location_id",
        lambda *_a, **_k: 1,
    )
    monkeypatch.setattr(
        "backend.services.production_execution.orders_fg_fulfillment_service.upsert_dock_inventory_for_loose_receipt",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.production_execution.orders_fg_fulfillment_service.append_receipt_operation",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.production_execution.orders_fg_fulfillment_service.require_warehouse_series",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.production_execution.orders_fg_fulfillment_service.allocate_produced_delta_to_order_sources",
        lambda *_a, **_k: {"status_moves": []},
    )
    monkeypatch.setattr(
        "backend.services.production_execution.order_execution_service.serialize_order",
        lambda db, order, **_k: order,
    )
    monkeypatch.setattr(
        "backend.services.production_execution.production_packing_handoff_service.resolve_after_production_action",
        lambda *_a, **_k: "STATUS_ONLY",
    )
    mo = ProductionOrder(
        id=702,
        tenant_id=1,
        warehouse_id=1,
        number="MO-ORD-1",
        product_id=20,
        composition_id=91,
        planned_quantity=10,
        produced_quantity=0,
        status="in_progress",
        source_type=PRODUCTION_ORDER_SOURCE_ORDERS,
    )
    db.add(mo)
    db.commit()
    update_order_production_progress(
        db,
        tenant_id=1,
        order_id=int(mo.id),
        body=OrderProductionProgressBody(add_quantity=4, fg_batch_number="OB1"),
    )
    db.commit()
    db.refresh(mo)
    assert mo.produced_quantity == pytest.approx(4)
    assert mo.status == "in_progress"
    assert mo.pw_stock_document_id is not None
    pw = db.query(StockDocument).filter(StockDocument.id == int(mo.pw_stock_document_id)).first()
    assert str(pw.putaway_status).upper() == "DONE"


def test_finish_idempotent_after_progressive(fg_register_db):
    db = fg_register_db
    batch, line = _make_batch(db, planned=10.0, batch_id=508, line_id=5080)
    update_production_progress(
        db,
        tenant_id=1,
        batch_id=int(batch.id),
        body=BatchProductionProgressBody(line_id=int(line.id), add_quantity=10),
    )
    db.commit()
    first = finish_production(db, tenant_id=1, batch_id=int(batch.id))
    second = finish_production(db, tenant_id=1, batch_id=int(batch.id))
    assert first.status == "awaiting_putaway"
    assert second.status == "awaiting_putaway"
    assert len(production_pw_documents_for_batch(db, batch_id=int(batch.id))) == 1
