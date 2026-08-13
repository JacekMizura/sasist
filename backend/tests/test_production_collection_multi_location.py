"""Multi-location WMS collection picks + discrepancy (BAT)."""

from __future__ import annotations

import json
from datetime import date

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.product import Product
from backend.models.product_composition import (
    ProductionBatch,
    ProductionBatchLine,
    ProductComposition,
    ProductCompositionLine,
)
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.stock_operation import StockOperation
from backend.models.stock_reservation import StockReservation
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.warehouse_inventory_movement import WarehouseInventoryMovement
from backend.models.wms_product_warehouse_operation import WmsProductWarehouseOperation
from backend.schemas.production_batch import BatchCollectionUpdateBody
from backend.services.production_batch_service import (
    finish_collecting,
    get_collection_state,
    update_collection_task,
)
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE


def _engine():
    eng = create_engine("sqlite:///:memory:")

    @event.listens_for(eng, "connect")
    def _fk(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=OFF")
        cur.close()

    return eng


@pytest.fixture
def multi_loc_db(monkeypatch):
    monkeypatch.setattr(
        "backend.services.stock_operation_issue_service.record_inventory_movement",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.production_execution.production_warehouse_audit.record_production_rw_issue_audit",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.production_batch_service.require_warehouse_series",
        lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("no series")),
    )
    monkeypatch.setattr(
        "backend.services.production_batch_service.get_product_current_cost",
        lambda *_a, **_k: {"purchase_net": 1.0},
    )
    monkeypatch.setattr(
        "backend.services.production_batch_service._batch_has_shortages",
        lambda *_a, **_k: False,
    )
    monkeypatch.setattr(
        "backend.services.production_batch_service.build_batch_pick_plan",
        lambda *_a, **_k: type("P", (), {"aggregated_components": []})(),
    )
    monkeypatch.setattr(
        "backend.services.reservations.reservation_service.consume_production_reservations",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.production_execution.collection_job_header.build_batch_collection_header",
        lambda *_a, **_k: __import__(
            "backend.schemas.production_batch", fromlist=["CollectionJobHeaderRead"]
        ).CollectionJobHeaderRead(job_number="BAT/ML", job_kind="batch", outputs=[]),
    )
    monkeypatch.setattr(
        "backend.services.production_execution.collection_task_builder.hydrate_collection_tasks",
        lambda *_a, tasks_raw=None, **_k: list(tasks_raw or []),
    )

    engine = _engine()
    for model in (
        Tenant,
        Warehouse,
        Location,
        Product,
        ProductComposition,
        ProductCompositionLine,
        ProductionBatch,
        ProductionBatchLine,
        Inventory,
        StockDocument,
        StockDocumentItem,
        StockOperation,
        StockReservation,
        WarehouseInventoryMovement,
        WmsProductWarehouseOperation,
    ):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Tenant(id=1, name="T", default_warehouse_id=1))
    db.add(Warehouse(id=1, tenant_id=1, name="WH1", requires_putaway=True))
    db.add(Location(id=1, warehouse_id=1, name="B1-A-1", type="pick", location_type="NORMAL", is_active=True))
    db.add(Location(id=2, warehouse_id=1, name="S1-A-2", type="pick", location_type="NORMAL", is_active=True))
    db.add(Location(id=3, warehouse_id=1, name="C1-A-3", type="pick", location_type="NORMAL", is_active=True))
    db.add(Product(id=201, tenant_id=1, name="FG", sku="FG"))
    db.add(Product(id=192, tenant_id=1, name="Sznurowadła CAT 150 cm", sku="LACE150"))
    c = ProductComposition(
        id=1,
        tenant_id=1,
        product_id=201,
        composition_mode="manufacturing",
        name="BOM",
        yield_quantity=1.0,
        is_active=True,
    )
    db.add(c)
    db.flush()
    db.add(ProductCompositionLine(composition_id=1, component_product_id=192, quantity=1.0, sort_order=0))
    batch = ProductionBatch(
        id=20,
        tenant_id=1,
        number="BAT/ML/001",
        warehouse_id=1,
        status="collecting",
        execution_interface="WMS",
        collection_state_json=json.dumps(
            {
                "tasks": [
                    {
                        "task_key": "192",
                        "component_product_id": 192,
                        "product_name": "Sznurowadła CAT 150 cm",
                        "required_qty": 28.0,
                        "collected_qty": 0.0,
                        "location_id": 0,
                        "location_code": "",
                    }
                ]
            }
        ),
    )
    db.add(batch)
    db.flush()
    db.add(
        ProductionBatchLine(
            batch_id=20,
            product_id=201,
            composition_id=1,
            planned_quantity=28.0,
            completed_quantity=0.0,
            status="planned",
        )
    )
    db.commit()
    yield db
    db.close()


def _set_stock(db, rows: list[tuple[int, float]]):
    db.query(Inventory).filter(Inventory.product_id == 192).delete()
    for loc_id, qty in rows:
        db.add(
            Inventory(
                tenant_id=1,
                warehouse_id=1,
                location_id=loc_id,
                product_id=192,
                quantity=qty,
                stock_disposition=STOCK_DISPOSITION_SALEABLE,
                batch_number="",
                expiry_date=date(9999, 12, 31),
            )
        )
    db.commit()


def _pick(db, qty: float, location_id: int):
    return update_collection_task(
        db,
        tenant_id=1,
        batch_id=20,
        body=BatchCollectionUpdateBody(
            task_key="192",
            collected_qty=qty,
            location_id=location_id,
            action="confirm_pick",
        ),
    )


def test_a_multi_location_24_then_4(multi_loc_db):
    db = multi_loc_db
    _set_stock(db, [(1, 24.0), (2, 4.0)])
    s1 = _pick(db, 24.0, 1)
    t = s1.tasks[0]
    assert t.collected_qty == pytest.approx(24.0)
    assert t.remaining_qty == pytest.approx(4.0)
    assert len(t.pick_events) == 1
    assert t.pending_shortage is None

    s2 = _pick(db, 4.0, 2)
    t = s2.tasks[0]
    assert t.collected_qty == pytest.approx(28.0)
    assert t.remaining_qty == pytest.approx(0.0)
    assert len(t.pick_events) == 2
    assert s2.collected_count == 1

    result = finish_collecting(db, tenant_id=1, batch_id=20, performed_by_user_id=1)
    db.commit()
    assert result.status == "in_progress"
    items = db.query(StockDocumentItem).filter(StockDocumentItem.document_id == result.rw_stock_document_id).all()
    assert sum(float(i.quantity) for i in items) == pytest.approx(28.0)
    assert float(db.query(Inventory).filter(Inventory.location_id == 1).one().quantity) == pytest.approx(0.0)
    assert float(db.query(Inventory).filter(Inventory.location_id == 2).one().quantity) == pytest.approx(0.0)


def test_b_physical_short_triggers_pending_shortage(multi_loc_db):
    db = multi_loc_db
    _set_stock(db, [(1, 24.0), (2, 4.0)])
    _pick(db, 23.0, 1)  # discrepancy 1 vs suggested 24
    s = _pick(db, 4.0, 2)
    t = s.tasks[0]
    assert t.collected_qty == pytest.approx(27.0)
    assert t.pending_shortage is not None
    assert t.pending_shortage.missing_qty == pytest.approx(1.0)
    assert t.pick_events[0].discrepancy == pytest.approx(1.0)


def test_c_short_first_then_cover_from_second(multi_loc_db):
    db = multi_loc_db
    _set_stock(db, [(1, 24.0), (2, 10.0)])
    s1 = _pick(db, 23.0, 1)
    assert s1.tasks[0].collected_qty == pytest.approx(23.0)
    assert s1.tasks[0].pending_shortage is None
    assert s1.tasks[0].remaining_qty == pytest.approx(5.0)

    s2 = _pick(db, 5.0, 2)
    assert s2.tasks[0].collected_qty == pytest.approx(28.0)
    assert s2.tasks[0].pending_shortage is None
    assert s2.collected_count == 1


def test_d_three_locations_partial(multi_loc_db):
    db = multi_loc_db
    _set_stock(db, [(1, 10.0), (2, 10.0), (3, 10.0)])
    _pick(db, 10.0, 1)
    _pick(db, 10.0, 2)
    s = _pick(db, 8.0, 3)
    t = s.tasks[0]
    assert t.collected_qty == pytest.approx(28.0)
    assert len(t.pick_events) == 3
    finish_collecting(db, tenant_id=1, batch_id=20, performed_by_user_id=1)
    db.commit()
    batch = db.query(ProductionBatch).filter(ProductionBatch.id == 20).one()
    assert batch.status == "in_progress"
    assert float(db.query(Inventory).filter(Inventory.location_id == 3).one().quantity) == pytest.approx(2.0)


def test_e_reload_preserves_pick_events(multi_loc_db):
    db = multi_loc_db
    _set_stock(db, [(1, 24.0), (2, 4.0)])
    _pick(db, 24.0, 1)
    db.commit()
    state = get_collection_state(db, tenant_id=1, batch_id=20)
    t = state.tasks[0]
    assert t.collected_qty == pytest.approx(24.0)
    assert len(t.pick_events) == 1
    assert t.pick_events[0].location_id == 1
    assert t.remaining_qty == pytest.approx(4.0)


def test_report_shortage_closes_component(multi_loc_db):
    db = multi_loc_db
    _set_stock(db, [(1, 24.0), (2, 4.0)])
    _pick(db, 23.0, 1)
    _pick(db, 4.0, 2)
    s = update_collection_task(
        db,
        tenant_id=1,
        batch_id=20,
        body=BatchCollectionUpdateBody(task_key="192", collected_qty=0, action="report_shortage"),
    )
    assert s.tasks[0].shortage_reported is True
    assert s.collected_count == 1
    result = finish_collecting(db, tenant_id=1, batch_id=20, performed_by_user_id=1)
    db.commit()
    assert result.status == "in_progress"
    items = db.query(StockDocumentItem).filter(StockDocumentItem.document_id == result.rw_stock_document_id).all()
    assert sum(float(i.quantity) for i in items) == pytest.approx(27.0)
