"""Multi-LOT / expiry / serial collection pick — discrepancy must stay slice-scoped."""

from __future__ import annotations

import json
from datetime import date

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from backend.models.inventory import Inventory
from backend.models.inventory_serial import SERIAL_STATUS_ON_HAND, SERIAL_STATUS_PICKED, InventorySerial
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
from backend.services.production_batch_service import finish_collecting, update_collection_task
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
def multi_lot_db(monkeypatch):
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
        ).CollectionJobHeaderRead(job_number="BAT/MLT", job_kind="batch", outputs=[]),
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
        InventorySerial,
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
    db.add(Product(id=201, tenant_id=1, name="FG", sku="FG"))
    db.add(Product(id=192, tenant_id=1, name="Komponent", sku="ST-003", purchase_price=1.0))
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
        number="BAT/MLT/001",
        warehouse_id=1,
        status="collecting",
        execution_interface="WMS",
        collection_state_json=json.dumps(
            {
                "tasks": [
                    {
                        "task_key": "192",
                        "component_product_id": 192,
                        "product_name": "Komponent",
                        "required_qty": 10.0,
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
            planned_quantity=10.0,
            completed_quantity=0.0,
            status="planned",
        )
    )
    db.commit()
    yield db
    db.close()


def _inv_qty(db, *, batch: str, location_id: int = 1, expiry: date | None = None) -> float:
    q = db.query(Inventory).filter(
        Inventory.product_id == 192,
        Inventory.location_id == location_id,
        Inventory.batch_number == batch,
    )
    if expiry is not None:
        q = q.filter(Inventory.expiry_date == expiry)
    rows = q.all()
    return round(sum(float(r.quantity or 0) for r in rows), 4)


def _seed_lots(
    db,
    rows: list[tuple[str, float, date | None]],
    *,
    location_id: int = 1,
    clear: bool = True,
) -> None:
    if clear:
        db.query(Inventory).filter(Inventory.product_id == 192).delete()
    for lot, qty, exp in rows:
        db.add(
            Inventory(
                tenant_id=1,
                warehouse_id=1,
                location_id=location_id,
                product_id=192,
                quantity=qty,
                stock_disposition=STOCK_DISPOSITION_SALEABLE,
                batch_number=lot,
                expiry_date=exp if exp is not None else date(9999, 12, 31),
            )
        )
    db.commit()


def _set_task_required(db, required: float) -> None:
    batch = db.query(ProductionBatch).filter(ProductionBatch.id == 20).one()
    batch.collection_state_json = json.dumps(
        {
            "tasks": [
                {
                    "task_key": "192",
                    "component_product_id": 192,
                    "product_name": "Komponent",
                    "required_qty": float(required),
                    "collected_qty": 0.0,
                    "location_id": 0,
                    "location_code": "",
                }
            ]
        }
    )
    db.commit()


def _pick(
    db,
    qty: float,
    location_id: int = 1,
    *,
    batch_number: str | None = None,
    expiry_date: date | None = None,
    serial_number: str | None = None,
):
    return update_collection_task(
        db,
        tenant_id=1,
        batch_id=20,
        body=BatchCollectionUpdateBody(
            task_key="192",
            collected_qty=qty,
            location_id=location_id,
            action="confirm_pick",
            batch_number=batch_number,
            lot=batch_number,
            expiry_date=expiry_date,
            serial_number=serial_number,
        ),
    )


def test_a_multi_lot_same_location_two_picks(multi_lot_db):
    db = multi_lot_db
    _seed_lots(
        db,
        [
            ("LOT-A", 6.0, date(2027, 6, 1)),
            ("LOT-B", 4.0, date(2027, 12, 15)),
        ],
    )
    s1 = _pick(db, 6.0, batch_number="LOT-A", expiry_date=date(2027, 6, 1))
    t1 = s1.tasks[0]
    assert t1.collected_qty == pytest.approx(6.0)
    assert t1.remaining_qty == pytest.approx(4.0)
    assert t1.pick_events[0].discrepancy == pytest.approx(0.0)
    assert _inv_qty(db, batch="LOT-A") == pytest.approx(0.0)
    assert _inv_qty(db, batch="LOT-B") == pytest.approx(4.0)

    s2 = _pick(db, 4.0, batch_number="LOT-B", expiry_date=date(2027, 12, 15))
    t2 = s2.tasks[0]
    assert t2.collected_qty == pytest.approx(10.0)
    assert t2.remaining_qty == pytest.approx(0.0)
    assert t2.pick_events[1].discrepancy == pytest.approx(0.0)
    assert _inv_qty(db, batch="LOT-B") == pytest.approx(0.0)

    result = finish_collecting(db, tenant_id=1, batch_id=20, performed_by_user_id=1)
    db.commit()
    items = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == result.rw_stock_document_id)
        .order_by(StockDocumentItem.batch_number.asc())
        .all()
    )
    assert len(items) == 2
    assert items[0].batch_number == "LOT-A" and float(items[0].quantity) == pytest.approx(6.0)
    assert items[1].batch_number == "LOT-B" and float(items[1].quantity) == pytest.approx(4.0)


def test_b_partial_first_lot_leaves_sibling(multi_lot_db):
    db = multi_lot_db
    _seed_lots(
        db,
        [
            ("LOT-A", 6.0, date(2027, 6, 1)),
            ("LOT-B", 4.0, date(2027, 12, 15)),
        ],
    )
    s = _pick(db, 4.0, batch_number="LOT-A", expiry_date=date(2027, 6, 1))
    t = s.tasks[0]
    assert t.collected_qty == pytest.approx(4.0)
    assert t.remaining_qty == pytest.approx(6.0)
    assert t.pick_events[0].discrepancy == pytest.approx(0.0)
    assert _inv_qty(db, batch="LOT-A") == pytest.approx(2.0)
    assert _inv_qty(db, batch="LOT-B") == pytest.approx(4.0)


def test_c_real_discrepancy_within_lot_only(multi_lot_db):
    db = multi_lot_db
    # Task remainder can be covered by LOT-A alone → confirming less = physical short.
    _set_task_required(db, 6.0)
    _seed_lots(
        db,
        [
            ("LOT-A", 6.0, date(2027, 6, 1)),
            ("LOT-B", 4.0, date(2027, 12, 15)),
        ],
    )
    s = _pick(db, 4.0, batch_number="LOT-A", expiry_date=date(2027, 6, 1))
    t = s.tasks[0]
    assert t.collected_qty == pytest.approx(4.0)
    assert t.pick_events[0].discrepancy == pytest.approx(2.0)
    assert _inv_qty(db, batch="LOT-A") == pytest.approx(0.0)
    assert _inv_qty(db, batch="LOT-B") == pytest.approx(4.0)


def test_d_same_lot_different_expiry(multi_lot_db):
    db = multi_lot_db
    _set_task_required(db, 3.0)
    _seed_lots(
        db,
        [
            ("LOT-X", 3.0, date(2027, 1, 1)),
            ("LOT-X", 5.0, date(2027, 6, 1)),
        ],
    )
    s = _pick(db, 3.0, batch_number="LOT-X", expiry_date=date(2027, 1, 1))
    assert s.tasks[0].collected_qty == pytest.approx(3.0)
    assert s.tasks[0].pick_events[0].discrepancy == pytest.approx(0.0)
    assert _inv_qty(db, batch="LOT-X", expiry=date(2027, 1, 1)) == pytest.approx(0.0)
    assert _inv_qty(db, batch="LOT-X", expiry=date(2027, 6, 1)) == pytest.approx(5.0)


def test_e_different_locations(multi_lot_db):
    db = multi_lot_db
    _set_task_required(db, 6.0)
    _seed_lots(db, [("LOT-A", 6.0, date(2027, 6, 1))], location_id=1)
    _seed_lots(db, [("LOT-A", 4.0, date(2027, 6, 1))], location_id=2, clear=False)
    s = _pick(db, 6.0, location_id=1, batch_number="LOT-A", expiry_date=date(2027, 6, 1))
    assert s.tasks[0].collected_qty == pytest.approx(6.0)
    assert _inv_qty(db, batch="LOT-A", location_id=1) == pytest.approx(0.0)
    assert _inv_qty(db, batch="LOT-A", location_id=2) == pytest.approx(4.0)


def test_f_serialized_pick_does_not_touch_other_sn(multi_lot_db):
    db = multi_lot_db
    _set_task_required(db, 1.0)
    db.query(Inventory).filter(Inventory.product_id == 192).delete()
    db.add(
        Inventory(
            tenant_id=1,
            warehouse_id=1,
            location_id=1,
            product_id=192,
            quantity=2.0,
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
            batch_number="LOT-S",
            expiry_date=date(2027, 6, 1),
        )
    )
    for sn in ("SN-1", "SN-2"):
        db.add(
            InventorySerial(
                tenant_id=1,
                warehouse_id=1,
                location_id=1,
                product_id=192,
                serial_number=sn,
                batch_number="LOT-S",
                expiry_date=date(2027, 6, 1),
                status=SERIAL_STATUS_ON_HAND,
                stock_disposition=STOCK_DISPOSITION_SALEABLE,
            )
        )
    db.commit()

    s = _pick(db, 1.0, batch_number="LOT-S", expiry_date=date(2027, 6, 1), serial_number="SN-1")
    assert s.tasks[0].collected_qty == pytest.approx(1.0)
    assert s.tasks[0].pick_events[0].discrepancy == pytest.approx(0.0)
    sn1 = db.query(InventorySerial).filter(InventorySerial.serial_number == "SN-1").one()
    sn2 = db.query(InventorySerial).filter(InventorySerial.serial_number == "SN-2").one()
    assert sn1.status == SERIAL_STATUS_PICKED
    assert sn2.status == SERIAL_STATUS_ON_HAND
    assert _inv_qty(db, batch="LOT-S") == pytest.approx(1.0)


def test_g_no_traceability_location_discrepancy_still_works(multi_lot_db):
    """No LOT selected — classic location aggregate discrepancy (regression)."""
    db = multi_lot_db
    _set_task_required(db, 10.0)
    _seed_lots(db, [("", 10.0, None)])
    s = _pick(db, 8.0)  # no batch_number
    t = s.tasks[0]
    assert t.collected_qty == pytest.approx(8.0)
    assert t.pick_events[0].discrepancy == pytest.approx(2.0)
    assert _inv_qty(db, batch="") == pytest.approx(0.0)
