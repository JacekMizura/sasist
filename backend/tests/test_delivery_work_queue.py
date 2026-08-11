"""Delivery work queue — operational PZ workflow → CTA / membership."""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

from backend.services.delivery_work_queue_service import (
    EXIT_WORKFLOW_STATUSES,
    QUEUE_WORKFLOW_STATUSES,
    cta_for_workflow,
    list_delivery_work_queue,
    pz_needs_operator_work,
    reorder_delivery_work_queue,
    resolve_operational_workflow,
    set_delivery_work_queue_priority,
    work_phase_for,
)
from backend.services.receiving_workflow_status_service import (
    WH_CLOSED,
    WH_COUNTED,
    WH_COUNTING,
    WH_NEW,
    WH_PUTAWAY_COMPLETED,
    WH_PUTAWAY_IN_PROGRESS,
)


def _doc(**kwargs):
    base = {
        "id": 57,
        "document_type": "PZ",
        "status": "draft",
        "warehouse_workflow_status": WH_NEW,
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


def test_queue_membership_statuses():
    assert QUEUE_WORKFLOW_STATUSES == {WH_NEW, WH_COUNTING, WH_COUNTED, WH_PUTAWAY_IN_PROGRESS}
    assert EXIT_WORKFLOW_STATUSES == {WH_PUTAWAY_COMPLETED, WH_CLOSED}


def test_pz57_new_in_queue_start_receiving():
    d = _doc(id=57, warehouse_workflow_status=WH_NEW, receiving_status="NEW")
    assert pz_needs_operator_work(d) is True
    assert work_phase_for(d) == "receiving"
    label, path, started = cta_for_workflow(d, WH_NEW)
    assert label == "Rozpocznij przyjęcie"
    assert path == "/wms/receiving/pz/57"
    assert started is False


def test_counting_continue_receiving():
    d = _doc(warehouse_workflow_status=WH_COUNTING, receiving_status="IN_PROGRESS")
    assert pz_needs_operator_work(d) is True
    label, path, started = cta_for_workflow(d, WH_COUNTING)
    assert label == "Kontynuuj przyjęcie"
    assert path.endswith("/receiving/pz/57")
    assert started is True


def test_counted_start_putaway():
    d = _doc(
        warehouse_workflow_status=WH_COUNTED,
        receiving_status="DONE",
        putaway_status="NOT_STARTED",
    )
    assert pz_needs_operator_work(d) is True
    assert work_phase_for(d) == "putaway"
    label, path, started = cta_for_workflow(d, WH_COUNTED)
    assert label == "Rozpocznij rozlokowanie"
    assert path == "/wms/putaway/57"
    assert started is False


def test_putaway_in_progress_continue():
    d = _doc(
        warehouse_workflow_status=WH_PUTAWAY_IN_PROGRESS,
        receiving_status="DONE",
        putaway_status="IN_PROGRESS",
    )
    assert pz_needs_operator_work(d) is True
    label, path, started = cta_for_workflow(d, WH_PUTAWAY_IN_PROGRESS)
    assert label == "Kontynuuj rozlokowanie"
    assert path == "/wms/putaway/57"
    assert started is True


def test_putaway_completed_leaves_queue():
    d = _doc(
        warehouse_workflow_status=WH_PUTAWAY_COMPLETED,
        receiving_status="DONE",
        putaway_status="DONE",
        relocation_status="DONE",
    )
    assert pz_needs_operator_work(d) is False


def test_closed_leaves_queue():
    d = _doc(
        status="posted",
        warehouse_workflow_status=WH_CLOSED,
        receiving_status="DONE",
        putaway_status="DONE",
    )
    assert pz_needs_operator_work(d) is False


def test_resolve_uses_receiving_putaway_axes():
    d = _doc(warehouse_workflow_status="bogus", receiving_status="DONE", putaway_status="NOT_STARTED")
    assert resolve_operational_workflow(d) == WH_COUNTED


def test_list_queue_maps_cta_for_new_pz():
    a = _doc(id=57, document_number="PZ #57")
    closed = _doc(
        id=99,
        document_number="PZ #99",
        status="posted",
        warehouse_workflow_status=WH_CLOSED,
        receiving_status="DONE",
        putaway_status="DONE",
        relocation_status="DONE",
    )
    db = MagicMock()
    q = MagicMock()
    db.query.return_value = q
    q.filter.return_value = q
    q.order_by.return_value = q
    q.limit.return_value = q
    # docs, then items, then suppliers (no deliveries)
    q.all.side_effect = [[a, closed], [], []]

    out = list_delivery_work_queue(db, tenant_id=1, warehouse_id=1)
    assert [x.pz_id for x in out.items] == [57]
    assert out.items[0].cta_label == "Rozpocznij przyjęcie"
    assert out.items[0].cta_path == "/wms/receiving/pz/57"


def test_reorder_persists_sort_independent_of_priority():
    a = _doc(id=1, document_number="A", delivery_queue_priority="urgent")
    b = _doc(id=2, document_number="B", delivery_queue_priority="later")
    db = MagicMock()
    q = MagicMock()
    db.query.return_value = q
    q.filter.return_value = q
    q.order_by.return_value = q
    q.limit.return_value = q
    # reorder docs query, lines for reorder, then list: docs, lines, suppliers
    q.all.side_effect = [[a, b], [], [b, a], [], []]

    out = reorder_delivery_work_queue(db, tenant_id=1, warehouse_id=1, ordered_pz_ids=[2, 1])
    assert int(b.delivery_queue_sort) == 1
    assert int(a.delivery_queue_sort) == 2
    assert [x.pz_id for x in out.items] == [2, 1]
    # urgent on A must not jump ahead of explicit sort on B
    assert out.items[0].priority == "later"


def test_set_priority_persists_without_changing_sort():
    a = _doc(id=57, delivery_queue_sort=3)
    db = MagicMock()
    q = MagicMock()
    db.query.return_value = q
    q.filter.return_value = q
    q.order_by.return_value = q
    q.limit.return_value = q
    q.first.return_value = a
    q.all.side_effect = [[], [a], [], []]

    item = set_delivery_work_queue_priority(
        db, tenant_id=1, warehouse_id=1, pz_id=57, priority="urgent"
    )
    assert a.delivery_queue_priority == "urgent"
    assert int(a.delivery_queue_sort) == 3
    assert item.priority == "urgent"
    assert item.queue_sort == 3


def test_pz57_full_lifecycle_cta_and_exit():
    """NOWE → receive → putaway → leave queue (existing WH statuses only)."""
    d = _doc(id=57, receiving_status="NEW", putaway_status="NOT_STARTED")
    assert resolve_operational_workflow(d) == WH_NEW
    assert cta_for_workflow(d, WH_NEW)[0] == "Rozpocznij przyjęcie"

    d.receiving_status = "IN_PROGRESS"
    assert resolve_operational_workflow(d) == WH_COUNTING
    assert cta_for_workflow(d, WH_COUNTING)[0] == "Kontynuuj przyjęcie"

    d.receiving_status = "DONE"
    assert resolve_operational_workflow(d) == WH_COUNTED
    assert cta_for_workflow(d, WH_COUNTED)[0] == "Rozpocznij rozlokowanie"

    d.putaway_status = "IN_PROGRESS"
    assert resolve_operational_workflow(d) == WH_PUTAWAY_IN_PROGRESS
    assert cta_for_workflow(d, WH_PUTAWAY_IN_PROGRESS)[0] == "Kontynuuj rozlokowanie"

    d.putaway_status = "DONE"
    d.relocation_status = "DONE"
    assert resolve_operational_workflow(d) == WH_PUTAWAY_COMPLETED
    assert pz_needs_operator_work(d) is False

    d.status = "posted"
    assert resolve_operational_workflow(d) == WH_CLOSED
    assert pz_needs_operator_work(d) is False
