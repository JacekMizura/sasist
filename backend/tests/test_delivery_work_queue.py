"""Delivery work queue — open PZ needing receiving/putaway."""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

from backend.services.delivery_work_queue_service import (
    list_delivery_work_queue,
    pz_needs_operator_work,
    reorder_delivery_work_queue,
    resolve_warehouse_workflow,
    set_delivery_work_queue_priority,
    work_phase_for,
)


def _doc(**kwargs):
    base = {
        "id": 57,
        "document_type": "PZ",
        "status": "draft",
        "warehouse_workflow_status": "NEW",
        "receiving_status": "NEW",
        "putaway_status": "NOT_STARTED",
        "relocation_status": "OPEN",
        "document_number": "PZ #57",
        "supplier_id": 1,
        "delivery_id": None,
        "delivery_queue_sort": None,
        "delivery_queue_priority": "later",
        "created_at": datetime(2026, 8, 11),
        "updated_at": datetime(2026, 8, 11),
        "warehouse_id": 1,
        "tenant_id": 1,
    }
    base.update(kwargs)
    return SimpleNamespace(**base)


def test_pz_new_needs_work():
    assert pz_needs_operator_work(_doc()) is True
    assert work_phase_for(_doc()) == "receiving"
    assert resolve_warehouse_workflow(_doc()) == "NEW"


def test_pz_counted_needs_putaway():
    d = _doc(warehouse_workflow_status="COUNTED", receiving_status="DONE", putaway_status="NOT_STARTED")
    assert pz_needs_operator_work(d) is True
    assert work_phase_for(d) == "putaway"


def test_pz_closed_excluded():
    d = _doc(warehouse_workflow_status="CLOSED", receiving_status="DONE", putaway_status="DONE")
    assert pz_needs_operator_work(d) is False


def test_pz_putaway_completed_excluded():
    d = _doc(
        warehouse_workflow_status="PUTAWAY_COMPLETED",
        receiving_status="DONE",
        putaway_status="DONE",
        relocation_status="DONE",
    )
    assert pz_needs_operator_work(d) is False


def test_list_queue_maps_open_pz():
    a = _doc(id=57, document_number="PZ #57")
    closed = _doc(
        id=99,
        document_number="PZ #99",
        warehouse_workflow_status="CLOSED",
        receiving_status="DONE",
        putaway_status="DONE",
    )
    db = MagicMock()
    q = MagicMock()
    db.query.return_value = q
    q.filter.return_value = q
    q.order_by.return_value = q
    q.limit.return_value = q
    # First query: StockDocument list; subsequent: aggregates / suppliers
    q.all.side_effect = [[a, closed], [], []]
    q.group_by.return_value = q

    out = list_delivery_work_queue(db, tenant_id=1, warehouse_id=1)
    assert [x.pz_id for x in out.items] == [57]
    assert out.items[0].status_label == "Nowe"
    assert out.items[0].cta_path == "/wms/receiving/pz/57"


def test_reorder_writes_sort_order():
    a = _doc(id=1, document_number="A")
    b = _doc(id=2, document_number="B")
    db = MagicMock()
    q = MagicMock()
    db.query.return_value = q
    q.filter.return_value = q
    q.order_by.return_value = q
    q.limit.return_value = q
    q.all.side_effect = [[a, b], [b, a], [], []]
    q.group_by.return_value = q
    q.first.return_value = a

    out = reorder_delivery_work_queue(db, tenant_id=1, warehouse_id=1, ordered_pz_ids=[2, 1])
    assert int(b.delivery_queue_sort) == 1
    assert int(a.delivery_queue_sort) == 2
    assert [x.pz_id for x in out.items] == [2, 1]


def test_set_priority():
    a = _doc(id=57)
    db = MagicMock()
    q = MagicMock()
    db.query.return_value = q
    q.filter.return_value = q
    q.order_by.return_value = q
    q.limit.return_value = q
    q.first.return_value = a
    q.all.side_effect = [[a], [], []]
    q.group_by.return_value = q

    item = set_delivery_work_queue_priority(
        db, tenant_id=1, warehouse_id=1, pz_id=57, priority="urgent"
    )
    assert a.delivery_queue_priority == "urgent"
    assert item.priority == "urgent"
