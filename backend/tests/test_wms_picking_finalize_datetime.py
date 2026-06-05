"""
Finalize audit — timezone-aware DB timestamps must not crash duration math.

  python -m pytest backend/tests/test_wms_picking_finalize_datetime.py -q
"""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

from backend.services.wms_audit_service import _naive_utc_dt, emit_wms_picking_finished


def test_naive_utc_dt_strips_tzinfo():
    aware = datetime(2026, 6, 4, 12, 0, 0, tzinfo=timezone.utc)
    naive = _naive_utc_dt(aware)
    assert naive is not None
    assert naive.tzinfo is None
    assert naive.hour == 12


def test_emit_picking_finished_accepts_aware_started_at():
    started = datetime(2026, 6, 4, 10, 0, 0, tzinfo=timezone.utc)
    finished = datetime(2026, 6, 4, 10, 5, 0)
    order = SimpleNamespace(
        id=1201,
        picking_started_at=started,
        picking_finished_at=finished,
        picked_at=None,
        order_ui_status_id=5,
    )
    db = MagicMock()
    emit_wms_picking_finished(
        db,
        tenant_id=1,
        warehouse_id=1,
        order=order,
        cart_id=9,
        operator_user_id=1,
        new_order_ui_status_id=5,
    )
    db.add.assert_called()
