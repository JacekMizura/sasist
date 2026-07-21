"""
WMS Nowa dostawa — resolve existing supplier vs explicit create (no silent auto-create).

  python -m pytest backend/tests/wms/test_wms_new_delivery_supplier.py -q
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.supplier import Supplier
from backend.models.warehouse import Warehouse
from backend.schemas.wms_receiving import WmsCreateReceivingPzBody
from backend.services.wms_receiving_service import (
    create_wms_empty_pz,
    get_or_create_wms_supplier,
)


@pytest.fixture
def sup_db(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
    Warehouse.__table__.create(engine, checkfirst=True)
    Supplier.__table__.create(engine, checkfirst=True)
    StockDocument.__table__.create(engine, checkfirst=True)
    StockDocumentItem.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    db = Session()
    db.add(Warehouse(id=1, tenant_id=1, name="WH-1"))
    db.add(
        Supplier(
            id=10,
            tenant_id=1,
            name="Anel Sp. z o.o.",
            tax_id="5250000001",
            active=True,
            is_incomplete=False,
        )
    )
    db.commit()

    def _fake_read(db_sess, doc, **_kw):
        from types import SimpleNamespace

        return SimpleNamespace(id=int(doc.id), supplier_id=getattr(doc, "supplier_id", None))

    monkeypatch.setattr(
        "backend.services.wms_receiving_service.build_stock_document_read",
        _fake_read,
    )

    try:
        yield db
    finally:
        db.close()


def test_a_resolve_by_id_uses_existing(sup_db):
    row = get_or_create_wms_supplier(sup_db, 1, "ignored", 10, allow_create=False)
    assert int(row.id) == 10
    assert row.name == "Anel Sp. z o.o."


def test_c_name_only_without_create_raises(sup_db):
    with pytest.raises(ValueError, match="Utwórz nowego dostawcę"):
        get_or_create_wms_supplier(sup_db, 1, "Nieistniejący XYZ", None, allow_create=False)
    assert sup_db.query(Supplier).count() == 1


def test_d_explicit_create_makes_one_row(sup_db):
    before = sup_db.query(Supplier).count()
    row = get_or_create_wms_supplier(sup_db, 1, "Nowy Dostawca WMS", None, allow_create=True)
    assert int(row.id) > 0
    assert row.is_incomplete is True
    assert sup_db.query(Supplier).count() == before + 1


def test_e_exact_name_reuses_without_duplicate(sup_db):
    before = sup_db.query(Supplier).count()
    row = get_or_create_wms_supplier(sup_db, 1, "anel sp. z o.o.", None, allow_create=True)
    assert int(row.id) == 10
    assert sup_db.query(Supplier).count() == before


def test_b_f_create_pz_binds_supplier_id(sup_db):
    doc = create_wms_empty_pz(
        sup_db,
        1,
        WmsCreateReceivingPzBody(
            supplier_name="Anel Sp. z o.o.",
            supplier_id=10,
            create_supplier=False,
            warehouse_id=1,
        ),
        warehouse_id=1,
    )
    raw = sup_db.query(StockDocument).filter(StockDocument.id == int(doc.id)).one()
    assert int(raw.supplier_id) == 10
    # reopen persistence: supplier_id stays on document
    raw2 = sup_db.query(StockDocument).filter(StockDocument.id == int(doc.id)).one()
    assert int(raw2.supplier_id) == 10
    name = (
        sup_db.query(Supplier.name)
        .filter(Supplier.id == int(raw2.supplier_id))
        .scalar()
    )
    assert "Anel" in (name or "")


def test_c_create_pz_without_intent_does_not_create_supplier(sup_db):
    before = sup_db.query(Supplier).count()
    with pytest.raises(ValueError, match="Utwórz nowego dostawcę"):
        create_wms_empty_pz(
            sup_db,
            1,
            WmsCreateReceivingPzBody(
                supplier_name="Losowy Nowy 999",
                create_supplier=False,
                warehouse_id=1,
            ),
            warehouse_id=1,
        )
    assert sup_db.query(Supplier).count() == before


def test_d_create_pz_with_intent_creates_and_binds(sup_db):
    before = sup_db.query(Supplier).count()
    doc = create_wms_empty_pz(
        sup_db,
        1,
        WmsCreateReceivingPzBody(
            supplier_name="Dostawca Jawny",
            create_supplier=True,
            warehouse_id=1,
        ),
        warehouse_id=1,
    )
    assert sup_db.query(Supplier).count() == before + 1
    raw = sup_db.query(StockDocument).filter(StockDocument.id == int(doc.id)).one()
    assert raw.supplier_id is not None
    sup = sup_db.query(Supplier).filter(Supplier.id == int(raw.supplier_id)).one()
    assert sup.name == "Dostawca Jawny"
