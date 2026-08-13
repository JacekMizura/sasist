"""Regression: finish-collecting for multi-FG ProductionBatch must not 500."""

from __future__ import annotations

import json
from datetime import date

import pytest
from sqlalchemy import create_engine, event, text
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
from backend.services.production_batch_service import finish_collecting
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
def multi_fg_batch_db(monkeypatch):
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
        lambda *_a, **_k: _FakePickPlan(),
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
    db.add(
        Location(
            id=1,
            warehouse_id=1,
            name="PICK-1",
            type="pick",
            location_type="NORMAL",
            is_active=True,
        )
    )
    # FG
    db.add(Product(id=201, tenant_id=1, name="Sznurowadła CAT 100 cm", sku="CAT100"))
    db.add(Product(id=202, tenant_id=1, name="Sznurowadła CAT 150 cm", sku="CAT150"))
    # Components
    db.add(Product(id=301, tenant_id=1, name="Komponent A", sku="CA"))
    db.add(Product(id=302, tenant_id=1, name="Komponent B", sku="CB"))

    c1 = ProductComposition(
        id=1,
        tenant_id=1,
        product_id=201,
        composition_mode="manufacturing",
        name="BOM 100",
        yield_quantity=1.0,
        is_active=True,
    )
    c2 = ProductComposition(
        id=2,
        tenant_id=1,
        product_id=202,
        composition_mode="manufacturing",
        name="BOM 150",
        yield_quantity=1.0,
        is_active=True,
    )
    db.add_all([c1, c2])
    db.flush()
    db.add(ProductCompositionLine(composition_id=1, component_product_id=301, quantity=1.0, sort_order=0))
    db.add(ProductCompositionLine(composition_id=2, component_product_id=302, quantity=1.0, sort_order=0))

    batch = ProductionBatch(
        id=16,
        tenant_id=1,
        number="BAT/2026/0016",
        warehouse_id=1,
        status="collecting",
        execution_interface="WMS",
        collection_state_json=json.dumps(
            {
                "tasks": [
                    {
                        "task_key": "301",
                        "component_product_id": 301,
                        "product_name": "Komponent A",
                        "required_qty": 14.0,
                        "collected_qty": 14.0,
                        "selected_location_id": 1,
                        "location_id": 1,
                        "location_code": "PICK-1",
                    },
                    {
                        "task_key": "302",
                        "component_product_id": 302,
                        "product_name": "Komponent B",
                        "required_qty": 12.0,
                        "collected_qty": 12.0,
                        "selected_location_id": 1,
                        "location_id": 1,
                        "location_code": "PICK-1",
                    },
                ]
            }
        ),
    )
    db.add(batch)
    db.flush()
    db.add(
        ProductionBatchLine(
            batch_id=16,
            product_id=201,
            composition_id=1,
            planned_quantity=14.0,
            completed_quantity=0.0,
            status="planned",
        )
    )
    db.add(
        ProductionBatchLine(
            batch_id=16,
            product_id=202,
            composition_id=2,
            planned_quantity=12.0,
            completed_quantity=0.0,
            status="planned",
        )
    )
    db.add(
        Inventory(
            tenant_id=1,
            warehouse_id=1,
            location_id=1,
            product_id=301,
            quantity=100.0,
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
            batch_number="",
            expiry_date=date(9999, 12, 31),
        )
    )
    db.add(
        Inventory(
            tenant_id=1,
            warehouse_id=1,
            location_id=1,
            product_id=302,
            quantity=100.0,
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
            batch_number="",
            expiry_date=date(9999, 12, 31),
        )
    )
    db.commit()
    yield db
    db.close()


class _FakePickPlan:
    aggregated_components = []


def test_finish_collecting_multi_fg_two_components_succeeds(multi_fg_batch_db, monkeypatch):
    db = multi_fg_batch_db
    # Avoid hydrate/location option side paths — stub collection state read pieces
    from backend.schemas.production_batch import (
        BatchCollectionStateRead,
        CollectionJobHeaderRead,
        CollectionOutputProductRead,
        CollectionTaskRead,
    )

    def _fake_state(*_a, **_k):
        return BatchCollectionStateRead(
            batch_id=16,
            status="collecting",
            header=CollectionJobHeaderRead(
                job_number="BAT/2026/0016",
                job_kind="batch",
                outputs=[
                    CollectionOutputProductRead(product_id=201, product_name="A", planned_quantity=14),
                    CollectionOutputProductRead(product_id=202, product_name="B", planned_quantity=12),
                ],
            ),
            tasks=[
                CollectionTaskRead(
                    task_key="301",
                    component_product_id=301,
                    product_name="Komponent A",
                    required_qty=14,
                    collected_qty=14,
                    selected_location_id=1,
                    location_id=1,
                    location_code="PICK-1",
                ),
                CollectionTaskRead(
                    task_key="302",
                    component_product_id=302,
                    product_name="Komponent B",
                    required_qty=12,
                    collected_qty=12,
                    selected_location_id=1,
                    location_id=1,
                    location_code="PICK-1",
                ),
            ],
            collected_count=2,
            total_count=2,
            progress_percent=100.0,
        )

    import backend.services.production_batch_service as pbs

    monkeypatch.setattr(pbs, "get_collection_state", _fake_state)

    result = finish_collecting(db, tenant_id=1, batch_id=16, performed_by_user_id=1)
    db.commit()

    assert result.status == "in_progress"
    assert result.rw_stock_document_id is not None
    batch = db.query(ProductionBatch).filter(ProductionBatch.id == 16).one()
    assert batch.status == "in_progress"
    assert batch.rw_stock_document_id is not None
    items = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == int(batch.rw_stock_document_id))
        .all()
    )
    assert len(items) == 2
    by_pid = {int(i.product_id): float(i.quantity) for i in items}
    assert by_pid[301] == pytest.approx(14.0)
    assert by_pid[302] == pytest.approx(12.0)
    inv_a = (
        db.query(Inventory)
        .filter(Inventory.product_id == 301, Inventory.location_id == 1)
        .one()
    )
    inv_b = (
        db.query(Inventory)
        .filter(Inventory.product_id == 302, Inventory.location_id == 1)
        .one()
    )
    assert float(inv_a.quantity) == pytest.approx(86.0)
    assert float(inv_b.quantity) == pytest.approx(88.0)


def test_finish_collecting_maps_stock_value_error_to_batch_error(multi_fg_batch_db, monkeypatch):
    db = multi_fg_batch_db
    from backend.schemas.production_batch import (
        BatchCollectionStateRead,
        CollectionJobHeaderRead,
        CollectionOutputProductRead,
        CollectionTaskRead,
    )
    from backend.services.production_batch_service import ProductionBatchError
    import backend.services.production_batch_service as pbs

    def _fake_state(*_a, **_k):
        return BatchCollectionStateRead(
            batch_id=16,
            status="collecting",
            header=CollectionJobHeaderRead(
                job_number="BAT/2026/0016",
                job_kind="batch",
                outputs=[
                    CollectionOutputProductRead(product_id=201, product_name="A", planned_quantity=14),
                    CollectionOutputProductRead(product_id=202, product_name="B", planned_quantity=12),
                ],
            ),
            tasks=[
                CollectionTaskRead(
                    task_key="301",
                    component_product_id=301,
                    product_name="Komponent A",
                    required_qty=14,
                    collected_qty=14,
                    selected_location_id=1,
                    location_id=1,
                    location_code="PICK-1",
                ),
                CollectionTaskRead(
                    task_key="302",
                    component_product_id=302,
                    product_name="Komponent B",
                    required_qty=12,
                    collected_qty=12,
                    selected_location_id=1,
                    location_id=1,
                    location_code="PICK-1",
                ),
            ],
            collected_count=2,
            total_count=2,
            progress_percent=100.0,
        )

    monkeypatch.setattr(pbs, "get_collection_state", _fake_state)
    monkeypatch.setattr(
        "backend.services.production_batch_service.consume_production_material_slices",
        lambda *_a, **_k: (_ for _ in ()).throw(ValueError("Brak stanu w lokalizacji dla produktu #301")),
    )

    with pytest.raises(ProductionBatchError) as exc:
        finish_collecting(db, tenant_id=1, batch_id=16, performed_by_user_id=1)
    assert exc.value.code == "insufficient_stock"
    assert "Brak stanu" in str(exc.value.message)


def test_finish_collecting_uses_committed_pick_ignores_later_inventory_drop(multi_fg_batch_db, monkeypatch):
    """After WMS confirm, finish must not re-pick against live inventory (no double-consume)."""
    db = multi_fg_batch_db
    from backend.schemas.production_batch import BatchCollectionUpdateBody
    from backend.services.production_batch_service import finish_collecting, update_collection_task

    monkeypatch.setattr(
        "backend.services.reservations.reservation_service.consume_production_reservations",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.reservations.reservation_service.lock_production_reservations",
        lambda *_a, **_k: None,
    )
    # Real get_collection_state — pick plan already stubbed empty in fixture; tasks come from JSON.
    monkeypatch.setattr(
        "backend.services.production_execution.collection_job_header.build_batch_collection_header",
        lambda *_a, **_k: __import__(
            "backend.schemas.production_batch", fromlist=["CollectionJobHeaderRead"]
        ).CollectionJobHeaderRead(
            job_number="BAT/2026/0016",
            job_kind="batch",
            outputs=[],
        ),
    )

    # Reset tasks to uncollected so confirm path runs.
    batch = db.query(ProductionBatch).filter(ProductionBatch.id == 16).one()
    batch.collection_state_json = json.dumps(
        {
            "tasks": [
                {
                    "task_key": "301",
                    "component_product_id": 301,
                    "product_name": "Komponent A",
                    "required_qty": 14.0,
                    "collected_qty": 0.0,
                    "selected_location_id": None,
                    "location_id": 0,
                    "location_code": "",
                },
                {
                    "task_key": "302",
                    "component_product_id": 302,
                    "product_name": "Komponent B",
                    "required_qty": 28.0,
                    "collected_qty": 0.0,
                    "selected_location_id": None,
                    "location_id": 0,
                    "location_code": "",
                },
            ]
        }
    )
    # Multi-FG batch lines must match collection required qtys (BOM×planned).
    for line in db.query(ProductionBatchLine).filter(ProductionBatchLine.batch_id == 16).all():
        if int(line.product_id) == 201:
            line.planned_quantity = 14.0
        elif int(line.product_id) == 202:
            line.planned_quantity = 28.0
    inv_b = (
        db.query(Inventory)
        .filter(Inventory.product_id == 302, Inventory.location_id == 1)
        .one()
    )
    inv_b.quantity = 28.0
    inv_a = (
        db.query(Inventory)
        .filter(Inventory.product_id == 301, Inventory.location_id == 1)
        .one()
    )
    inv_a.quantity = 14.0
    db.commit()

    update_collection_task(
        db,
        tenant_id=1,
        batch_id=16,
        body=BatchCollectionUpdateBody(task_key="301", collected_qty=14.0, location_id=1),
    )
    update_collection_task(
        db,
        tenant_id=1,
        batch_id=16,
        body=BatchCollectionUpdateBody(task_key="302", collected_qty=28.0, location_id=1),
    )
    db.commit()

    # Ensure JSON still has committed slices (and required 28) before finish.
    batch = db.query(ProductionBatch).filter(ProductionBatch.id == 16).one()
    raw_tasks = json.loads(str(batch.collection_state_json)).get("tasks") or []
    by_pid = {int(t["component_product_id"]): t for t in raw_tasks}
    assert float(by_pid[302]["required_qty"]) == pytest.approx(28.0)
    assert float(by_pid[302]["collected_qty"]) == pytest.approx(28.0)
    assert by_pid[302].get("picked_slices")

    inv_a = (
        db.query(Inventory)
        .filter(Inventory.product_id == 301, Inventory.location_id == 1)
        .one()
    )
    inv_b = (
        db.query(Inventory)
        .filter(Inventory.product_id == 302, Inventory.location_id == 1)
        .one()
    )
    assert float(inv_a.quantity) == pytest.approx(0.0)
    assert float(inv_b.quantity) == pytest.approx(0.0)

    # Simulate later inventory drift on the pick location (another issue / correction).
    # Finish must still succeed from committed slices — must NOT require live 28 again.
    inv_b.quantity = 4.0  # would fail legacy finish (need 28, avail 4)
    db.commit()

    # finish_collecting uses get_collection_state — stub required qtys from committed JSON
    # (pick-plan stub is empty; do not let hydrate/heal drop committed facts).
    from backend.schemas.production_batch import (
        BatchCollectionStateRead,
        CollectionJobHeaderRead,
        CollectionTaskRead,
    )

    def _state_from_json(*_a, **_k):
        b = db.query(ProductionBatch).filter(ProductionBatch.id == 16).one()
        tasks_raw = json.loads(str(b.collection_state_json)).get("tasks") or []
        tasks = []
        for t in tasks_raw:
            tasks.append(
                CollectionTaskRead(
                    task_key=str(t.get("task_key") or t["component_product_id"]),
                    component_product_id=int(t["component_product_id"]),
                    product_name=str(t.get("product_name") or ""),
                    required_qty=float(t["required_qty"]),
                    collected_qty=float(t["collected_qty"]),
                    selected_location_id=int(t.get("selected_location_id") or t.get("location_id") or 0) or None,
                    location_id=int(t.get("location_id") or t.get("selected_location_id") or 0),
                    location_code=str(t.get("location_code") or "PICK-1"),
                )
            )
        done = sum(1 for t in tasks if t.collected_qty >= t.required_qty - 1e-6)
        return BatchCollectionStateRead(
            batch_id=16,
            status="collecting",
            header=CollectionJobHeaderRead(job_number="BAT/2026/0016", job_kind="batch", outputs=[]),
            tasks=tasks,
            collected_count=done,
            total_count=len(tasks),
            progress_percent=100.0 if done == len(tasks) else 0.0,
        )

    import backend.services.production_batch_service as pbs

    monkeypatch.setattr(pbs, "get_collection_state", _state_from_json)

    result = finish_collecting(db, tenant_id=1, batch_id=16, performed_by_user_id=1)
    db.commit()

    assert result.status == "in_progress"
    assert result.rw_stock_document_id is not None
    inv_b_after = (
        db.query(Inventory)
        .filter(Inventory.product_id == 302, Inventory.location_id == 1)
        .one()
    )
    # No second consume — the post-confirm leftover 4 stays.
    assert float(inv_b_after.quantity) == pytest.approx(4.0)
    items = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == int(result.rw_stock_document_id))
        .all()
    )
    by_pid = {int(i.product_id): float(i.quantity) for i in items}
    assert by_pid[301] == pytest.approx(14.0)
    assert by_pid[302] == pytest.approx(28.0)


def test_wms_confirm_rejects_insufficient_stock_no_gotowe(multi_fg_batch_db, monkeypatch):
    db = multi_fg_batch_db
    from backend.schemas.production_batch import BatchCollectionUpdateBody
    from backend.services.production_batch_service import ProductionBatchError, update_collection_task

    monkeypatch.setattr(
        "backend.services.production_execution.collection_job_header.build_batch_collection_header",
        lambda *_a, **_k: __import__(
            "backend.schemas.production_batch", fromlist=["CollectionJobHeaderRead"]
        ).CollectionJobHeaderRead(
            job_number="BAT/2026/0016",
            job_kind="batch",
            outputs=[],
        ),
    )

    batch = db.query(ProductionBatch).filter(ProductionBatch.id == 16).one()
    batch.collection_state_json = json.dumps(
        {
            "tasks": [
                {
                    "task_key": "302",
                    "component_product_id": 302,
                    "product_name": "Komponent B",
                    "required_qty": 28.0,
                    "collected_qty": 0.0,
                    "location_id": 0,
                    "location_code": "",
                }
            ]
        }
    )
    inv = (
        db.query(Inventory)
        .filter(Inventory.product_id == 302, Inventory.location_id == 1)
        .one()
    )
    inv.quantity = 24.0
    db.commit()

    with pytest.raises(ProductionBatchError) as exc:
        update_collection_task(
            db,
            tenant_id=1,
            batch_id=16,
            body=BatchCollectionUpdateBody(task_key="302", collected_qty=28.0, location_id=1),
        )
    assert exc.value.code == "insufficient_stock"
    assert "24" in str(exc.value.message)
    db.rollback()
    batch = db.query(ProductionBatch).filter(ProductionBatch.id == 16).one()
    state = json.loads(str(batch.collection_state_json))
    assert float(state["tasks"][0].get("collected_qty") or 0) == pytest.approx(0.0)
    assert not state["tasks"][0].get("picked_slices")

