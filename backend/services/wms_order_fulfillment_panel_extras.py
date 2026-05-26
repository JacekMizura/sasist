"""OMS panel: WMS timeline + operation times from ``Order`` WMS timestamp columns."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session

from ..models.order import Order
from ..schemas.wms_packing import WmsOperationTimesOut, WmsOrderTimelineEvent
from .wms_audit_service import build_wms_timeline_from_audit_events, order_has_wms_audit_events


def _delta_seconds(a: datetime, b: datetime) -> Optional[int]:
    if b < a:
        return None
    return int((b - a).total_seconds())


def build_wms_timeline_and_operation_times(
    db: Session, order: Order
) -> Tuple[List[WmsOrderTimelineEvent], Optional[WmsOperationTimesOut]]:
    """Oś czasu WMS: pełny szlak audytowy z ``wms_order_events`` gdy istnieje; inaczej znaczniki z zamówienia."""
    if order_has_wms_audit_events(db, int(order.id)):
        timeline_a, op_a = build_wms_timeline_from_audit_events(db, order)
        if timeline_a:
            return timeline_a, op_a
    ps = getattr(order, "picking_started_at", None)
    pd = getattr(order, "picking_finished_at", None) or getattr(order, "picked_at", None)
    ks = getattr(order, "packing_started_at", None)
    kd = getattr(order, "packed_at", None)
    ke = getattr(order, "wms_packing_automation_finished_at", None) or kd

    raw_events: list[tuple[datetime, str, str, str]] = []
    if ps is not None:
        raw_events.append((ps, "PICKING_STARTED", "Rozpoczęto zbieranie (WMS)", "WMS Zbieranie"))
    if pd is not None:
        raw_events.append((pd, "PICKED", "Zebrano zamówienie", "WMS Zbieranie"))
    if ks is not None:
        raw_events.append((ks, "PACKING_STARTED", "Przekazano do pakowania", "WMS Pakowanie"))
    if kd is not None:
        raw_events.append((kd, "PACKED", "Spakowano zamówienie", "WMS Pakowanie"))

    raw_events.sort(key=lambda x: (x[0], x[1]))
    timeline: List[WmsOrderTimelineEvent] = [
        WmsOrderTimelineEvent(
            at=at,
            title=label,
            body=[],
            badge=badge,
            user_label=None,
            event_type=etype,
        )
        for at, etype, label, badge in raw_events
    ]

    pick_sec = _delta_seconds(ps, pd) if ps is not None and pd is not None else None
    pack_sec = _delta_seconds(ks, ke) if ks is not None and ke is not None else None
    wf_sec = _delta_seconds(ps, ke) if ps is not None and ke is not None else None
    # UI: total = sum of stage durations (not wall-clock from first pick start to last pack end).
    if pick_sec is not None and pack_sec is not None:
        tot_sec: Optional[int] = int(pick_sec) + int(pack_sec)
    else:
        tot_sec = None

    if pick_sec is None and pack_sec is None and tot_sec is None and not timeline:
        return [], None

    op = WmsOperationTimesOut(
        picking_time=pick_sec,
        packing_time=pack_sec,
        total_time=tot_sec,
        picking_seconds=pick_sec,
        packing_seconds=pack_sec,
        total_seconds=tot_sec,
        picking_partial_label=None,
        warehouse_flow_seconds=wf_sec,
    )
    return timeline, op
