"""3D Matching history — write + list attempt audit events."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session, noload

from ...models.app_user import AppUser
from ...models.carton import Carton
from ...models.order import Order
from ...models.shipping_method import ShippingMethod
from ...models.wms_three_d_matching import WmsThreeDMatchingEvent

logger = logging.getLogger(__name__)

RESULT_MATCHED = "MATCHED"
RESULT_NO_FIT = "NO_FIT"
RESULT_MISSING_PRODUCT_DATA = "MISSING_PRODUCT_DATA"
RESULT_NO_COMPATIBLE_CARTON = "NO_COMPATIBLE_CARTON"
RESULT_ERROR = "ERROR"

TRIGGER_MANUAL = "MANUAL"
TRIGGER_STATUS = "STATUS"
TRIGGER_STRATEGY_FALLBACK = "STRATEGY_FALLBACK"
TRIGGER_STRATEGY_OVERRIDE = "STRATEGY_OVERRIDE"
TRIGGER_SYSTEM = "SYSTEM"

RESULT_LABELS_PL = {
    RESULT_MATCHED: "Dopasowano",
    RESULT_NO_FIT: "Brak pasującego opakowania",
    RESULT_MISSING_PRODUCT_DATA: "Brak wymiarów",
    RESULT_NO_COMPATIBLE_CARTON: "Brak opakowania zgodnego z wysyłką",
    RESULT_ERROR: "Błąd",
}


def _operator_display(db: Session, user_id: Optional[int]) -> Optional[str]:
    if user_id is None:
        return None
    try:
        u = db.query(AppUser).filter(AppUser.id == int(user_id)).first()
        if u is None:
            return f"#{user_id}"
        fn = str(getattr(u, "first_name", None) or "").strip()
        ln = str(getattr(u, "last_name", None) or "").strip()
        if fn or ln:
            return f"{fn} {ln}".strip()[:255]
        for attr in ("login", "email"):
            v = getattr(u, attr, None)
            if v and str(v).strip():
                return str(v).strip()[:255]
        return f"#{user_id}"
    except Exception:
        return f"#{user_id}" if user_id else None


def _carton_name(db: Session, carton_id: Optional[str]) -> Optional[str]:
    if not carton_id:
        return None
    c = db.query(Carton).options(noload("*")).filter(Carton.id == str(carton_id)).first()
    if c is None:
        return str(carton_id)
    return str(getattr(c, "name", None) or "").strip() or str(carton_id)


def composition_snapshot_from_order(order: Order) -> str:
    rows: list[dict[str, Any]] = []
    for it in getattr(order, "items", None) or []:
        q = int(getattr(it, "quantity", 0) or 0)
        if q <= 0:
            continue
        p = getattr(it, "product", None)
        pid = int(getattr(it, "product_id", None) or getattr(p, "id", 0) or 0)
        if pid <= 0:
            continue
        name = ""
        if p is not None:
            name = str(getattr(p, "name", None) or getattr(p, "sku", None) or "").strip()
        rows.append({"product_id": pid, "product_name": name or f"#{pid}", "quantity": q})
    rows.sort(key=lambda r: int(r["product_id"]))
    return json.dumps(rows, ensure_ascii=False)


def resolve_result_status(
    *,
    td_outcome: str,
    candidate_count: int,
    compatible_candidate_count: int,
    suggested_carton_id: Optional[str],
) -> tuple[str, Optional[str], Optional[str]]:
    """Returns (result_status, error_code, error_message)."""
    out = str(td_outcome or "").strip().upper()
    if out == "MATCHED" and suggested_carton_id:
        return RESULT_MATCHED, None, None
    if out == "MISSING_PRODUCT_DATA":
        return (
            RESULT_MISSING_PRODUCT_DATA,
            "MISSING_PRODUCT_DATA",
            "Brak kompletnych wymiarów lub wagi produktów.",
        )
    if candidate_count > 0 and compatible_candidate_count <= 0:
        return (
            RESULT_NO_COMPATIBLE_CARTON,
            "NO_COMPATIBLE_CARTON",
            "Żaden aktywny karton nie jest zgodny z metodą wysyłki.",
        )
    if out in ("NO_FIT", "SKIPPED", "") or not suggested_carton_id:
        return (
            RESULT_NO_FIT,
            "NO_FIT",
            "Żaden karton nie mieści zamówienia geometrycznie.",
        )
    return RESULT_NO_FIT, "NO_FIT", None


def record_three_d_attempt(
    db: Session,
    *,
    order: Order,
    tenant_id: int,
    warehouse_id: int,
    trigger: str,
    strategy: str,
    three_d_enabled: bool,
    filler_percent: float,
    shipping_method_id: Optional[str],
    td_outcome: str,
    suggested_carton_id: Optional[str],
    suggested_carton_name: Optional[str],
    fill_percent: Optional[float],
    candidate_count: int,
    compatible_candidate_count: int,
    triggered_by_user_id: Optional[int] = None,
    error_override: Optional[tuple[str, str]] = None,
) -> WmsThreeDMatchingEvent:
    if error_override:
        result_status, err_code, err_msg = RESULT_ERROR, error_override[0], error_override[1]
    else:
        result_status, err_code, err_msg = resolve_result_status(
            td_outcome=td_outcome,
            candidate_count=int(candidate_count),
            compatible_candidate_count=int(compatible_candidate_count),
            suggested_carton_id=suggested_carton_id,
        )

    ship_name = None
    sm_id = str(shipping_method_id).strip() if shipping_method_id else None
    if sm_id:
        sm = db.query(ShippingMethod).filter(ShippingMethod.id == sm_id).first()
        if sm is not None:
            ship_name = str(getattr(sm, "name", None) or "").strip() or sm_id

    sel_id = getattr(order, "selected_carton_id", None)
    sel_s = str(sel_id).strip() if sel_id else None
    sel_name = _carton_name(db, sel_s) if sel_s else None

    sug_id = str(suggested_carton_id).strip() if suggested_carton_id else None
    sug_name = (
        (str(suggested_carton_name).strip() if suggested_carton_name else None)
        or _carton_name(db, sug_id)
    )

    trig = str(trigger or TRIGGER_SYSTEM).strip().upper()
    if trig not in {
        TRIGGER_MANUAL,
        TRIGGER_STATUS,
        TRIGGER_STRATEGY_FALLBACK,
        TRIGGER_STRATEGY_OVERRIDE,
        TRIGGER_SYSTEM,
    }:
        trig = TRIGGER_SYSTEM

    row = WmsThreeDMatchingEvent(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order.id),
        trigger=trig,
        strategy=str(strategy or "SMART_THEN_3D").strip().upper()[:32],
        three_d_enabled_snapshot=1 if three_d_enabled else 0,
        filler_percent_snapshot=float(filler_percent or 0),
        shipping_method_id=sm_id,
        shipping_method_name_snapshot=ship_name,
        result_status=result_status,
        suggested_carton_id=sug_id,
        suggested_carton_name_snapshot=sug_name[:255] if sug_name else None,
        selected_carton_id=sel_s,
        selected_carton_name_snapshot=sel_name[:255] if sel_name else None,
        fill_percent=float(fill_percent) if fill_percent is not None else None,
        candidate_count=max(0, int(candidate_count)),
        compatible_candidate_count=max(0, int(compatible_candidate_count)),
        error_code=err_code,
        error_message=(err_msg or "")[:2000] if err_msg else None,
        composition_snapshot_json=composition_snapshot_from_order(order),
        triggered_by_user_id=int(triggered_by_user_id) if triggered_by_user_id else None,
        triggered_by_display_snapshot=_operator_display(db, triggered_by_user_id),
        created_at=datetime.utcnow(),
        selected_at=datetime.utcnow() if sel_s else None,
    )
    db.add(row)
    db.flush()
    return row


def attach_selected_carton_to_event(
    db: Session,
    *,
    event_id: int,
    carton_id: str,
    carton_name: Optional[str] = None,
) -> Optional[WmsThreeDMatchingEvent]:
    """Mutate only selected_* on an existing attempt (immutable attempt core preserved)."""
    row = db.query(WmsThreeDMatchingEvent).filter(WmsThreeDMatchingEvent.id == int(event_id)).first()
    if row is None:
        return None
    cid = str(carton_id).strip()
    if not cid:
        return row
    row.selected_carton_id = cid
    row.selected_carton_name_snapshot = (
        (str(carton_name).strip()[:255] if carton_name else None) or _carton_name(db, cid)
    )
    row.selected_at = datetime.utcnow()
    db.add(row)
    db.flush()
    return row


def attach_selected_carton_to_latest_attempt(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    carton_id: str,
    carton_name: Optional[str] = None,
) -> Optional[WmsThreeDMatchingEvent]:
    row = (
        db.query(WmsThreeDMatchingEvent)
        .filter(
            WmsThreeDMatchingEvent.tenant_id == int(tenant_id),
            WmsThreeDMatchingEvent.warehouse_id == int(warehouse_id),
            WmsThreeDMatchingEvent.order_id == int(order_id),
        )
        .order_by(WmsThreeDMatchingEvent.created_at.desc(), WmsThreeDMatchingEvent.id.desc())
        .first()
    )
    if row is None:
        return None
    return attach_selected_carton_to_event(
        db, event_id=int(row.id), carton_id=carton_id, carton_name=carton_name
    )


def _parse_dt(raw: Optional[str]) -> Optional[datetime]:
    if not raw:
        return None
    s = str(raw).strip()
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return datetime.fromisoformat(s)
    except ValueError:
        return None


def list_three_d_history(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    page: int = 1,
    limit: int = 50,
    order_q: Optional[str] = None,
    result_status: Optional[str] = None,
    carton_id: Optional[str] = None,
    user_id: Optional[int] = None,
    strategy: Optional[str] = None,
    trigger: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> dict[str, Any]:
    from ...models.order import Order as OrderModel

    q = db.query(WmsThreeDMatchingEvent).filter(
        WmsThreeDMatchingEvent.tenant_id == int(tenant_id),
        WmsThreeDMatchingEvent.warehouse_id == int(warehouse_id),
    )
    rs = str(result_status or "").strip().upper()
    if rs and rs != "ALL":
        q = q.filter(WmsThreeDMatchingEvent.result_status == rs)
    if carton_id and str(carton_id).strip():
        cid = str(carton_id).strip()
        q = q.filter(
            (WmsThreeDMatchingEvent.suggested_carton_id == cid)
            | (WmsThreeDMatchingEvent.selected_carton_id == cid)
        )
    if user_id is not None and int(user_id) > 0:
        q = q.filter(WmsThreeDMatchingEvent.triggered_by_user_id == int(user_id))
    st = str(strategy or "").strip().upper()
    if st and st != "ALL":
        q = q.filter(WmsThreeDMatchingEvent.strategy == st)
    tr = str(trigger or "").strip().upper()
    if tr and tr != "ALL":
        q = q.filter(WmsThreeDMatchingEvent.trigger == tr)
    df = _parse_dt(date_from)
    dt = _parse_dt(date_to)
    if df is not None:
        q = q.filter(WmsThreeDMatchingEvent.created_at >= df)
    if dt is not None:
        q = q.filter(WmsThreeDMatchingEvent.created_at <= dt)

    oq = str(order_q or "").strip()
    if oq:
        from sqlalchemy import or_

        clauses = [OrderModel.number.ilike(f"%{oq}%")]
        if oq.isdigit():
            clauses.append(OrderModel.id == int(oq))
        matched_ids = [
            int(r[0])
            for r in db.query(OrderModel.id)
            .filter(
                OrderModel.tenant_id == int(tenant_id),
                OrderModel.warehouse_id == int(warehouse_id),
                or_(*clauses),
            )
            .all()
        ]
        if not matched_ids:
            return {"page": max(1, int(page)), "limit": max(1, min(int(limit), 200)), "total": 0, "items": []}
        q = q.filter(WmsThreeDMatchingEvent.order_id.in_(matched_ids))

    total = q.count()
    page_i = max(1, int(page))
    limit_i = max(1, min(int(limit), 200))
    rows = (
        q.order_by(WmsThreeDMatchingEvent.created_at.desc(), WmsThreeDMatchingEvent.id.desc())
        .offset((page_i - 1) * limit_i)
        .limit(limit_i)
        .all()
    )

    oid_set = {int(r.order_id) for r in rows}
    order_map: dict[int, str] = {}
    if oid_set:
        for oid, num in (
            db.query(OrderModel.id, OrderModel.number).filter(OrderModel.id.in_(list(oid_set))).all()
        ):
            order_map[int(oid)] = str(num or oid)

    items = []
    for r in rows:
        comp = []
        try:
            raw = json.loads(r.composition_snapshot_json or "[]")
            if isinstance(raw, list):
                comp = raw
        except Exception:
            comp = []
        items.append(
            {
                "id": int(r.id),
                "order_id": int(r.order_id),
                "order_number": order_map.get(int(r.order_id), str(r.order_id)),
                "trigger": str(r.trigger),
                "strategy": str(r.strategy),
                "three_d_enabled_snapshot": bool(r.three_d_enabled_snapshot),
                "filler_percent_snapshot": float(r.filler_percent_snapshot or 0),
                "shipping_method_id": r.shipping_method_id,
                "shipping_method_name": r.shipping_method_name_snapshot,
                "result_status": str(r.result_status),
                "result_label": RESULT_LABELS_PL.get(str(r.result_status), str(r.result_status)),
                "suggested_carton_id": r.suggested_carton_id,
                "suggested_carton_name": r.suggested_carton_name_snapshot,
                "selected_carton_id": r.selected_carton_id,
                "selected_carton_name": r.selected_carton_name_snapshot,
                "fill_percent": float(r.fill_percent) if r.fill_percent is not None else None,
                "candidate_count": int(r.candidate_count or 0),
                "compatible_candidate_count": int(r.compatible_candidate_count or 0),
                "error_code": r.error_code,
                "error_message": r.error_message,
                "composition_items": comp,
                "triggered_by_user_id": r.triggered_by_user_id,
                "triggered_by_display": r.triggered_by_display_snapshot or "system",
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "selected_at": r.selected_at.isoformat() if r.selected_at else None,
            }
        )
    return {"page": page_i, "limit": limit_i, "total": int(total), "items": items}
