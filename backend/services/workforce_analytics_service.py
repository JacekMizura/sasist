"""
Aggregate user activity into operational sessions (10-minute inactivity gap)
and simple productivity / cost metrics.
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..models.app_user import AppUser
from ..models.employee_cost_profile import EmployeeCostProfile
from ..models.user_activity_log import UserActivityLog

SESSION_GAP_MINUTES = 12


def _parse_meta(raw: Optional[str]) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        out = json.loads(raw)
        return out if isinstance(out, dict) else {}
    except json.JSONDecodeError:
        return {}


def merge_activity_sessions(rows: list[UserActivityLog], gap_minutes: int = SESSION_GAP_MINUTES) -> list[dict[str, Any]]:
    """Split ordered logs into sessions when gap > gap_minutes."""
    if not rows:
        return []
    gap = timedelta(minutes=gap_minutes)
    sessions: list[dict[str, Any]] = []
    cur: Optional[dict[str, Any]] = None
    prev_ts: Optional[datetime] = None
    for r in sorted(rows, key=lambda x: x.created_at or datetime.min):
        ts = r.created_at
        if ts is None:
            continue
        if cur is None or prev_ts is None or (ts - prev_ts) > gap:
            if cur is not None:
                sessions.append(cur)
            cur = {
                "started_at": ts.isoformat(),
                "last_at": ts.isoformat(),
                "events": 1,
                "duration_minutes_approx": 0.0,
            }
        else:
            assert cur is not None
            cur["events"] += 1
            start = datetime.fromisoformat(cur["started_at"])
            cur["duration_minutes_approx"] = max(0.0, (ts - start).total_seconds() / 60.0)
            cur["last_at"] = ts.isoformat()
        prev_ts = ts
    if cur is not None:
        sessions.append(cur)
    return sessions


def dashboard_summary(
    db: Session,
    *,
    tenant_id: Optional[int],
    user_ids: Optional[list[int]],
    date_from: datetime,
    date_to: datetime,
) -> dict[str, Any]:
    q = db.query(UserActivityLog).filter(UserActivityLog.created_at >= date_from, UserActivityLog.created_at <= date_to)
    if tenant_id is not None:
        q = q.filter(UserActivityLog.tenant_id == tenant_id)
    if user_ids:
        q = q.filter(UserActivityLog.user_id.in_(user_ids))
    rows = q.order_by(UserActivityLog.created_at).all()

    by_user: dict[int, list[UserActivityLog]] = defaultdict(list)
    for r in rows:
        if r.user_id:
            by_user[r.user_id].append(r)

    active_minutes_by_user: dict[int, float] = {}
    events_by_user: dict[int, int] = {}
    for uid, urs in by_user.items():
        events_by_user[uid] = len(urs)
        sess = merge_activity_sessions(urs)
        active_minutes_by_user[uid] = round(sum(s.get("duration_minutes_approx", 0.0) for s in sess) + len(sess) * 2, 1)

    # Action-type buckets (extend as clients log more types)
    picks = sum(1 for r in rows if "pick" in (r.action_type or "").lower())
    packs = sum(1 for r in rows if "pack" in (r.action_type or "").lower())
    scans = sum(1 for r in rows if "scan" in (r.action_type or "").lower())
    receiving = sum(1 for r in rows if (r.module or "").upper() == "WMS_RECEIVING")
    putaway = sum(1 for r in rows if (r.module or "").upper() == "WMS_PUTAWAY")
    movements = sum(1 for r in rows if (r.module or "").upper() == "WMS_MOVEMENTS")

    return {
        "range": {"from": date_from.isoformat(), "to": date_to.isoformat()},
        "total_events": len(rows),
        "distinct_users": len(by_user),
        "approx_sessions_computed": sum(len(merge_activity_sessions(v)) for v in by_user.values()),
        "action_buckets": {
            "picking_events": picks,
            "packing_events": packs,
            "scan_events": scans,
            "receiving_events": receiving,
            "putaway_events": putaway,
            "movement_events": movements,
        },
        "per_user": [
            {
                "user_id": uid,
                "events": events_by_user.get(uid, 0),
                "active_minutes_approx": active_minutes_by_user.get(uid, 0.0),
            }
            for uid in sorted(by_user.keys())
        ],
    }


def operational_cost_estimates(
    db: Session,
    *,
    tenant_id: Optional[int],
    dashboard: dict[str, Any],
) -> dict[str, Any]:
    """Rough cost / event using stored employer hourly when profile exists."""
    profiles = db.query(EmployeeCostProfile).filter(EmployeeCostProfile.is_active.is_(True))
    if tenant_id is not None:
        profiles = profiles.filter(
            (EmployeeCostProfile.tenant_id == tenant_id) | (EmployeeCostProfile.tenant_id.is_(None))
        )
    prof_by_user = {p.user_id: p for p in profiles.all()}

    lines: list[dict[str, Any]] = []
    total_cost = 0.0
    for row in dashboard.get("per_user") or []:
        uid = int(row["user_id"])
        ev = int(row.get("events") or 0)
        minutes = float(row.get("active_minutes_approx") or 0.0)
        p = prof_by_user.get(uid)
        eh = float(p.employer_hourly_pln or 0.0) if p else 0.0
        hours = minutes / 60.0 if minutes else 0.0
        cost = hours * eh if eh and hours else 0.0
        per_event = (cost / ev) if ev and cost else None
        total_cost += cost
        lines.append(
            {
                "user_id": uid,
                "employer_hourly_pln": eh or None,
                "active_hours_approx": round(hours, 3),
                "estimated_cost_pln": round(cost, 2) if cost else 0.0,
                "estimated_cost_per_event_pln": round(per_event, 4) if per_event is not None else None,
            }
        )

    total_events = int(dashboard.get("total_events") or 0)
    return {
        "total_estimated_cost_pln": round(total_cost, 2),
        "estimated_cost_per_event_pln": round(total_cost / total_events, 4) if total_events and total_cost else None,
        "per_user": lines,
        "disclaimer": "Szacunki operacyjne (koszt pracodawcy × czas aktywności), nie rozliczenie płac.",
    }


def list_recent_logs(
    db: Session,
    *,
    tenant_id: Optional[int],
    limit: int = 200,
    user_id: Optional[int] = None,
    module: Optional[str] = None,
) -> list[dict[str, Any]]:
    q = db.query(UserActivityLog)
    if tenant_id is not None:
        q = q.filter(UserActivityLog.tenant_id == tenant_id)
    if user_id is not None:
        q = q.filter(UserActivityLog.user_id == user_id)
    if module:
        q = q.filter(UserActivityLog.module == module)
    rows = q.order_by(desc(UserActivityLog.created_at)).limit(min(limit, 500)).all()
    out: list[dict[str, Any]] = []
    for r in rows:
        login = None
        if r.user_id:
            u = db.query(AppUser).filter(AppUser.id == r.user_id).first()
            login = u.login if u else None
        out.append(
            {
                "id": r.id,
                "user_id": r.user_id,
                "login": login,
                "tenant_id": r.tenant_id,
                "action_type": r.action_type,
                "module": r.module,
                "entity_type": r.entity_type,
                "entity_id": r.entity_id,
                "metadata": _parse_meta(r.metadata_json),
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
        )
    return out
