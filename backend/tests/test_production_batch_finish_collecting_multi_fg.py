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


def test_finish_collecting_multi_fg_two_components_succeeds(multi_fg_batch_db):
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

    pbs.get_collection_state = _fake_state  # type: ignore[assignment]

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

    pbs.get_collection_state = _fake_state  # type: ignore[assignment]
    monkeypatch.setattr(
        "backend.services.production_batch_service.consume_production_material_slices",
        lambda *_a, **_k: (_ for _ in ()).throw(ValueError("Brak stanu w lokalizacji dla produktu #301")),
    )

    with pytest.raises(ProductionBatchError) as exc:
        finish_collecting(db, tenant_id=1, batch_id=16, performed_by_user_id=1)
    assert exc.value.code == "insufficient_stock"
    assert "Brak stanu" in str(exc.value.message)
