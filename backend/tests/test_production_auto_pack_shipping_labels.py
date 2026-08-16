"""
Production auto-pack when all newly-ready orders already have shipping labels.

  python -m pytest backend/tests/test_production_auto_pack_shipping_labels.py -q
"""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.order import Order
from backend.models.order_document import OrderDocument
from backend.models.order_document_type_enum import OrderDocumentType
from backend.models.order_ui_status import OrderUiStatus
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.order_shipping_label_service import (
    has_shipping_label,
    order_has_shipping_label,
)
from backend.services.production_execution.production_packing_handoff_service import (
    try_auto_pack_newly_ready_orders,
)
from backend.services.wms_packing_service import PackingScanError


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (Tenant, Warehouse, OrderUiStatus, Order, OrderDocument):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(
        OrderUiStatus(
            id=10,
            tenant_id=1,
            warehouse_id=1,
            main_group="TO_PACK",
            name="Do pakowania",
            color="#000",
            sort_order=1,
        )
    )
    session.commit()
    try:
        yield session
    finally:
        session.close()


def _order(db, *, oid: int, number: str) -> Order:
    o = Order(
        id=oid,
        tenant_id=1,
        warehouse_id=1,
        number=number,
        order_ui_status_id=10,
        fulfillment_state="READY_TO_PACK",
        picking_handoff_mode="CARTLESS",
        created_at=datetime.utcnow(),
    )
    db.add(o)
    db.flush()
    return o


def _waybill(db, *, order_id: int, url: str = "/files/waybill.pdf", doc_id: int | None = None) -> OrderDocument:
    d = OrderDocument(
        id=doc_id,
        order_id=order_id,
        tenant_id=1,
        warehouse_id=1,
        document_type=OrderDocumentType.LIST_PRZEWOZOWY.value,
        original_filename="waybill.pdf",
        stored_filename="waybill.pdf",
        file_url=url,
        created_at=datetime.utcnow(),
    )
    db.add(d)
    db.flush()
    return d


def test_has_shipping_label_from_listy_przewozowe_section(db):
    """A/B SSOT: LIST_PRZEWOZOWY with file_url (section + custom-field sync)."""
    o = _order(db, oid=1, number="A-1")
    assert order_has_shipping_label(db, o) is False
    assert has_shipping_label(db, o) is False
    _waybill(db, order_id=1, url="/media/label-a.pdf")
    db.commit()
    assert has_shipping_label(db, o) is True


def test_empty_or_missing_url_not_a_label(db):
    o = _order(db, oid=2, number="A-2")
    _waybill(db, order_id=2, url="   ")
    db.commit()
    assert has_shipping_label(db, o) is False


def test_c_missing_label_standard_packing_no_mutations(db, monkeypatch):
    o = _order(db, oid=3, number="C-1")
    db.commit()
    called = {"pack": 0, "finish": 0}

    def _pack(*_a, **_k):
        called["pack"] += 1
        return SimpleNamespace()

    def _finish(*_a, **_k):
        called["finish"] += 1
        return SimpleNamespace(post_pack_pipeline=[])

    monkeypatch.setattr(
        "backend.services.wms_packing_service.packing_pack_all_lines",
        _pack,
    )
    monkeypatch.setattr(
        "backend.services.wms_packing_service.packing_finish_order",
        _finish,
    )
    out = try_auto_pack_newly_ready_orders(
        db,
        tenant_id=1,
        warehouse_id=1,
        newly_ready_orders=[{"order_id": 3, "order_number": "C-1"}],
    )
    assert out["attempted"] is True
    assert out["succeeded"] is False
    assert out["fallback_reason"] == "missing_shipping_label"
    assert called["pack"] == 0 and called["finish"] == 0
    assert getattr(o, "wms_packing_automation_finished_at", None) is None


def test_a_bypass_finalize_and_print(db, monkeypatch):
    o = _order(db, oid=4, number="A-1")
    _waybill(db, order_id=4, url="/files/a.pdf")
    db.commit()

    pipe = [
        SimpleNamespace(
            step="print_label",
            ok=True,
            skipped=False,
            message="client_print_waybill;file_url=/files/a.pdf;waybill_count=1",
            offer_replacement_label=False,
            model_dump=lambda: {
                "step": "print_label",
                "ok": True,
                "skipped": False,
                "message": "client_print_waybill;file_url=/files/a.pdf;waybill_count=1",
            },
        )
    ]
    finish_kwargs: dict = {}

    def _pack(*_a, **_k):
        return SimpleNamespace(fully_packed=True)

    def _finish(*_a, **kw):
        finish_kwargs.update(kw)
        return SimpleNamespace(post_pack_pipeline=pipe)

    monkeypatch.setattr(
        "backend.services.wms_packing_service.packing_pack_all_lines",
        _pack,
    )
    monkeypatch.setattr(
        "backend.services.wms_packing_service.packing_finish_order",
        _finish,
    )
    monkeypatch.setattr(
        "backend.services.wms_audit_service.append_order_activity_for_wms",
        lambda *_a, **_k: None,
    )

    out = try_auto_pack_newly_ready_orders(
        db,
        tenant_id=1,
        warehouse_id=1,
        newly_ready_orders=[{"order_id": 4, "order_number": "A-1"}],
    )
    assert out["succeeded"] is True
    assert out["waybill_print_count"] >= 1
    assert finish_kwargs.get("system_auto") is True
    assert finish_kwargs.get("commit") is False
    assert finish_kwargs.get("allow_without_carton") is True
    assert finish_kwargs.get("operator_user_id") is None


def test_d_three_orders_all_labels(db, monkeypatch):
    for i, n in ((10, "D-1"), (11, "D-2"), (12, "D-3")):
        _order(db, oid=i, number=n)
        _waybill(db, order_id=i, url=f"/files/{n}.pdf")
    db.commit()
    finishes: list[int] = []

    def _pack(*_a, **kw):
        return SimpleNamespace()

    def _finish(*_a, **kw):
        finishes.append(int(kw["order_id"]))
        url = f"/files/x-{kw['order_id']}.pdf"
        return SimpleNamespace(
            post_pack_pipeline=[
                SimpleNamespace(
                    step="print_label",
                    ok=True,
                    skipped=False,
                    message=f"client_print_waybill;file_url={url};waybill_count=1",
                    offer_replacement_label=False,
                )
            ]
        )

    monkeypatch.setattr("backend.services.wms_packing_service.packing_pack_all_lines", _pack)
    monkeypatch.setattr("backend.services.wms_packing_service.packing_finish_order", _finish)
    monkeypatch.setattr(
        "backend.services.wms_audit_service.append_order_activity_for_wms",
        lambda *_a, **_k: None,
    )
    out = try_auto_pack_newly_ready_orders(
        db,
        tenant_id=1,
        warehouse_id=1,
        newly_ready_orders=[
            {"order_id": 10, "order_number": "D-1"},
            {"order_id": 11, "order_number": "D-2"},
            {"order_id": 12, "order_number": "D-3"},
        ],
    )
    assert out["succeeded"] is True
    assert finishes == [10, 11, 12]
    assert out["waybill_print_count"] == 3


def test_e_three_orders_one_missing_no_partial_auto(db, monkeypatch):
    _order(db, oid=20, number="E-1")
    _waybill(db, order_id=20, url="/files/e1.pdf")
    _order(db, oid=21, number="E-2")
    # no label for 21
    _order(db, oid=22, number="E-3")
    _waybill(db, order_id=22, url="/files/e3.pdf")
    db.commit()
    called = MagicMock()
    monkeypatch.setattr("backend.services.wms_packing_service.packing_pack_all_lines", called)
    monkeypatch.setattr("backend.services.wms_packing_service.packing_finish_order", called)
    out = try_auto_pack_newly_ready_orders(
        db,
        tenant_id=1,
        warehouse_id=1,
        newly_ready_orders=[
            {"order_id": 20, "order_number": "E-1"},
            {"order_id": 21, "order_number": "E-2"},
            {"order_id": 22, "order_number": "E-3"},
        ],
    )
    assert out["succeeded"] is False
    assert out["fallback_reason"] == "missing_shipping_label"
    assert called.call_count == 0


def test_f_finish_uses_system_auto_same_ssot(db, monkeypatch):
    """F: auto-pack calls packing_finish_order (settings pipeline lives there)."""
    _order(db, oid=30, number="F-1")
    _waybill(db, order_id=30, url="/files/f.pdf")
    db.commit()
    seen = {}

    monkeypatch.setattr(
        "backend.services.wms_packing_service.packing_pack_all_lines",
        lambda *a, **k: SimpleNamespace(),
    )

    def _finish(*_a, **kw):
        seen.update(kw)
        return SimpleNamespace(
            post_pack_pipeline=[
                SimpleNamespace(
                    step="change_order_status",
                    ok=True,
                    skipped=False,
                    message="Spakowane",
                ),
                SimpleNamespace(
                    step="create_document",
                    ok=True,
                    skipped=False,
                    message="id=1;number=FV/1",
                ),
                SimpleNamespace(
                    step="print_label",
                    ok=True,
                    skipped=False,
                    message="client_print_waybill;file_url=/files/f.pdf;waybill_count=1",
                ),
            ]
        )

    monkeypatch.setattr("backend.services.wms_packing_service.packing_finish_order", _finish)
    monkeypatch.setattr(
        "backend.services.wms_audit_service.append_order_activity_for_wms",
        lambda *_a, **_k: None,
    )
    out = try_auto_pack_newly_ready_orders(
        db,
        tenant_id=1,
        warehouse_id=1,
        newly_ready_orders=[{"order_id": 30, "order_number": "F-1"}],
    )
    assert out["succeeded"] is True
    assert seen["system_auto"] is True
    assert seen["commit"] is False
    assert len(out["orders"][0]["post_pack_pipeline"]) == 3


def test_g_idempotent_replay_no_second_finish(db, monkeypatch):
    o = _order(db, oid=40, number="G-1")
    o.wms_packing_automation_finished_at = datetime.utcnow()
    _waybill(db, order_id=40, url="/files/g.pdf")
    db.commit()
    called = MagicMock()
    monkeypatch.setattr("backend.services.wms_packing_service.packing_pack_all_lines", called)
    monkeypatch.setattr("backend.services.wms_packing_service.packing_finish_order", called)
    out = try_auto_pack_newly_ready_orders(
        db,
        tenant_id=1,
        warehouse_id=1,
        newly_ready_orders=[{"order_id": 40, "order_number": "G-1"}],
    )
    assert out["succeeded"] is True
    assert called.call_count == 0
    assert out["orders"][0].get("idempotent_replay") is True


def test_h_empty_newly_ready_no_auto_pack(db, monkeypatch):
    """H: partial production → no status_moves / empty cohort → no auto-pack."""
    called = MagicMock()
    monkeypatch.setattr("backend.services.wms_packing_service.packing_pack_all_lines", called)
    out = try_auto_pack_newly_ready_orders(
        db, tenant_id=1, warehouse_id=1, newly_ready_orders=[]
    )
    assert out["attempted"] is False
    assert out["succeeded"] is False
    assert called.call_count == 0


def test_i_packing_validation_blocker_fallback(db, monkeypatch):
    _order(db, oid=50, number="I-1")
    _waybill(db, order_id=50, url="/files/i.pdf")
    db.commit()

    monkeypatch.setattr(
        "backend.services.wms_packing_service.packing_pack_all_lines",
        lambda *a, **k: SimpleNamespace(),
    )

    def _finish(*_a, **_k):
        raise PackingScanError("CARTON_REQUIRED")

    monkeypatch.setattr("backend.services.wms_packing_service.packing_finish_order", _finish)
    out = try_auto_pack_newly_ready_orders(
        db,
        tenant_id=1,
        warehouse_id=1,
        newly_ready_orders=[{"order_id": 50, "order_number": "I-1"}],
    )
    assert out["succeeded"] is False
    assert out["fallback_reason"] == "CARTON_REQUIRED"
    o = db.query(Order).filter(Order.id == 50).first()
    assert getattr(o, "wms_packing_automation_finished_at", None) is None


def test_b_label_only_via_document_type_not_field_name(db):
    """
    B: custom field SHIPPING_LABEL syncs to OrderDocument LIST_PRZEWOZOWY —
    resolver keys off document_type, not field display name.
    """
    o = _order(db, oid=60, number="B-1")
    db.add(
        OrderDocument(
            order_id=60,
            tenant_id=1,
            warehouse_id=1,
            document_type=OrderDocumentType.LIST_PRZEWOZOWY.value,
            original_filename="from-custom-field.pdf",
            stored_filename="from-custom-field.pdf",
            file_url="/uploads/from-custom-field.pdf",
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    assert has_shipping_label(db, o) is True
