"""Production material reservation allocation and finish-production integration tests."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.product import Product
from backend.models.product_composition import ProductionBatch, ProductionBatchLine, ProductComposition
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.stock_operation import StockOperation
from backend.models.stock_reservation import StockReservation
from backend.models.warehouse import Warehouse
from backend.services.production_batch_service import finish_production
from backend.services.production_execution.pw_putaway_handoff import create_batch_pw_documents_for_putaway
from backend.services.reservations.allocation_service import allocate_product_quantity
from backend.services.reservations.reservation_service import (
    ProductionReservationConfig,
    create_production_batch_reservations,
)
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE
from backend.services.stock_document_service import doc_allows_wms_putaway
from backend.services.wms_putaway_service import list_wms_putaway_pz_documents


@pytest.fixture
def reservation_db(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants VALUES (1)"))

    for model in (
        Warehouse,
        Location,
        Product,
        Inventory,
        StockReservation,
        ProductComposition,
        ProductionBatch,
        ProductionBatchLine,
        StockDocument,
        StockDocumentItem,
        StockOperation,
    ):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()

    monkeypatch.setattr(
        "backend.services.commercial_availability_service._total_saleable_issued_by_product",
        lambda _db, **_kw: {},
    )
    monkeypatch.setattr(
        "backend.services.reservations.reservation_service.record_inventory_movement",
        lambda *_a, **_k: None,
    )

    wh = Warehouse(id=1, tenant_id=1, name="WH", requires_putaway=True)
    db.add(wh)
    comp = Product(id=10, tenant_id=1, name="Component", sku="CMP")
    fg = Product(id=20, tenant_id=1, name="Finished", sku="FG")
    db.add_all([comp, fg])

    def _loc(lid: int, name: str, *, zone: str | None = None) -> Location:
        return Location(
            id=lid,
            warehouse_id=1,
            name=name,
            type="pick",
            location_type="NORMAL",
            operational_zone_type=zone,
            is_active=True,
        )

    db.add_all(
        [
            _loc(1, "A9-A-1"),
            _loc(2, "A10-A-1"),
            _loc(3, "SKLEP-1", zone="SALES"),
        ]
    )

    def _inv(lid: int, qty: float, iid: int) -> Inventory:
        return Inventory(
            id=iid,
            tenant_id=1,
            warehouse_id=1,
            location_id=lid,
            product_id=10,
            quantity=qty,
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
            batch_number="",
            expiry_date=date(9999, 12, 31),
        )

    db.add_all(
        [
            _inv(1, 197.0, 101),
            _inv(1, 6.0, 102),
            _inv(2, 50.0, 103),
            _inv(3, 500.0, 104),
        ]
    )
    db.commit()

    yield db
    db.close()


def test_single_location_when_first_covers_need(reservation_db):
    slices = allocate_product_quantity(
        reservation_db,
        tenant_id=1,
        warehouse_id=1,
        product_id=10,
        quantity=20,
        strategy="FEFO",
    )
    assert {s.location_id for s in slices} == {1}
    assert sum(s.quantity for s in slices) == pytest.approx(20.0)


def test_multi_location_only_when_first_insufficient(reservation_db):
    slices = allocate_product_quantity(
        reservation_db,
        tenant_id=1,
        warehouse_id=1,
        product_id=10,
        quantity=210,
        strategy="FIFO",
    )
    assert sorted({s.location_id for s in slices}) == [1, 2]
    assert sum(s.quantity for s in slices) == pytest.approx(210.0)
    assert sum(s.quantity for s in slices if s.location_id == 1) == pytest.approx(203.0)


def test_excludes_shop_locations_by_default(reservation_db):
    slices = allocate_product_quantity(
        reservation_db,
        tenant_id=1,
        warehouse_id=1,
        product_id=10,
        quantity=250,
        strategy="FIFO",
    )
    assert 3 not in {s.location_id for s in slices}


def test_includes_shop_when_admin_allows(reservation_db, monkeypatch):
    monkeypatch.setattr(
        "backend.services.reservations.reservation_service._load_production_reservation_config",
        lambda *_a, **_k: ProductionReservationConfig(
            allocation_strategy="FIFO", allow_sales_locations=True
        ),
    )
    reservation_db.query(Inventory).filter(Inventory.id.in_([101, 102, 103])).delete()
    reservation_db.commit()

    batch = ProductionBatch(id=1, tenant_id=1, warehouse_id=1, number="B-SHOP", status="planned")
    reservation_db.add(batch)
    reservation_db.commit()

    rows = create_production_batch_reservations(
        reservation_db,
        tenant_id=1,
        batch_id=1,
        component_totals={10: 30.0},
    )
    assert len(rows) == 1
    assert int(rows[0].location_id) == 3


@pytest.fixture
def finish_production_db(reservation_db, monkeypatch):
    db = reservation_db
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
        "backend.services.wms_putaway_service.batch_load_app_users",
        lambda *_a, **_k: {},
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
        "backend.services.production_execution.production_warehouse_audit.record_production_pw_receipt_audit",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "backend.services.production_execution.production_warehouse_audit.record_production_rw_issue_audit",
        lambda *_a, **_k: None,
    )
    comp = ProductComposition(
        id=1,
        tenant_id=1,
        product_id=20,
        composition_mode="manufacturing",
        name="Test recipe",
        is_active=True,
    )
    db.add(comp)
    batch = ProductionBatch(
        id=5,
        tenant_id=1,
        warehouse_id=1,
        number="B-FIN",
        status="in_progress",
    )
    db.add(batch)
    line = ProductionBatchLine(
        id=50,
        batch_id=5,
        product_id=20,
        composition_id=1,
        planned_quantity=10,
        completed_quantity=10,
        status="in_progress",
    )
    db.add(line)
    db.commit()
    return db, batch, line


def test_finish_production_creates_pw_and_putaway_queue(finish_production_db):
    db, batch, line = finish_production_db

    result = finish_production(db, tenant_id=1, batch_id=int(batch.id))
    db.commit()

    assert result.status == "awaiting_putaway"
    assert line.pw_stock_document_id is not None
    pw = db.query(StockDocument).filter(StockDocument.id == int(line.pw_stock_document_id)).first()
    assert pw is not None
    assert pw.document_type == "PW"
    assert str(getattr(pw, "creation_source", "")).upper() == "PRODUCTION"
    assert doc_allows_wms_putaway(pw)

    from backend.services.stock_document_service import compute_can_wms_putaway

    assert compute_can_wms_putaway(pw) is True

    queue = list_wms_putaway_pz_documents(db, 1, warehouse_id=1)
    assert any(int(r.id) == int(pw.id) for r in queue)


def test_create_batch_pw_documents_provisions_staging(finish_production_db):
    db, batch, _line = finish_production_db
    pw_ids = create_batch_pw_documents_for_putaway(db, batch=batch)
    db.commit()
    assert pw_ids
    pw = db.query(StockDocument).filter(StockDocument.id == int(pw_ids[0])).first()
    assert pw.location_id is not None
    assert pw.putaway_status == "NOT_STARTED"


def test_batch_completes_when_pw_putaway_done(finish_production_db):
    from backend.services.production_execution.batch_putaway_completion import (
        try_complete_production_batch_from_pw_document,
    )

    db, batch, line = finish_production_db
    finish_production(db, tenant_id=1, batch_id=int(batch.id))
    db.commit()

    pw = db.query(StockDocument).filter(StockDocument.id == int(line.pw_stock_document_id)).first()
    assert pw is not None
    assert int(pw.production_batch_id or 0) == int(batch.id)

    pw.putaway_status = "DONE"
    pw.relocation_status = "DONE"
    assert try_complete_production_batch_from_pw_document(db, pw) is True
    db.commit()
    db.refresh(batch)
    assert batch.status == "completed"
    assert batch.completed_at is not None
