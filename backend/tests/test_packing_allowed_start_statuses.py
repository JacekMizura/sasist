"""Packing queue statuses: start_status_id + allowed_start_status_ids (without picking)."""

from __future__ import annotations

from unittest.mock import MagicMock

from backend.schemas.wms_packing import WmsPackingTargetStatusItem
from backend.services import wms_packing_service as svc
from backend.services.wms_packing_service import _parse_packing_allowed_start_status_ids


def test_parse_allowed_start_status_ids_dedupes_and_filters():
    assert _parse_packing_allowed_start_status_ids(None) == []
    assert _parse_packing_allowed_start_status_ids("[]") == []
    assert _parse_packing_allowed_start_status_ids("[1, 2, 2, 0, -1, \"3\"]") == [1, 2, 3]
    assert _parse_packing_allowed_start_status_ids([5, 5, "x", 8]) == [5, 8]


def test_list_packing_target_statuses_merges_multi_start(monkeypatch):
    db = MagicMock()

    status_by_id = {
        10: MagicMock(id=10, name="Pakowanie", color="#111111", main_group="IN_PROGRESS"),
        11: MagicMock(id=11, name="Nowe", color="#222222", main_group="NEW"),
        12: MagicMock(id=12, name="Pilne", color="#333333", main_group="IN_PROGRESS"),
    }

    picking_q = MagicMock()
    picking_q.options.return_value = picking_q
    picking_q.filter.return_value = picking_q
    picking_q.order_by.return_value = picking_q
    picking_q.all.return_value = []

    pack_q = MagicMock()
    pack_q.filter.return_value = pack_q
    pack_q.first.return_value = MagicMock(
        start_status_id=10,
        allowed_start_status_ids_json="[11, 12, 10]",
    )

    order_q = MagicMock()
    order_q.filter.return_value = order_q
    order_q.group_by.return_value = order_q
    order_q.all.return_value = []

    def query(model, *args, **kwargs):
        name = getattr(model, "__name__", str(model))
        if "PickingConfig" in name:
            return picking_q
        if "WmsPackingSettings" in name:
            return pack_q
        return order_q

    db.query.side_effect = query

    def fake_append(_db, *, tenant_id, warehouse_id, status_id, seen, out):
        sid = int(status_id)
        if sid <= 0 or sid in seen:
            return
        st = status_by_id.get(sid)
        if st is None:
            return
        seen.add(sid)
        out.append(
            WmsPackingTargetStatusItem(
                target_status_id=int(st.id),
                status=str(st.name),
                color=str(st.color),
                main_group=st.main_group,
                order_count=0,
            )
        )

    monkeypatch.setattr(svc, "_append_packing_queue_status", fake_append)

    rows = svc.list_packing_target_statuses(db, tenant_id=1, warehouse_id=1)
    ids = [int(r.target_status_id) for r in rows]
    assert sorted(ids) == [10, 11, 12]
    # NEW before IN_PROGRESS (canonical group order)
    assert ids[0] == 11
