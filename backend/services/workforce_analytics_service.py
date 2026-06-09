"""
Aggregate user activity into operational sessions (15-minute inactivity gap)
and workforce telemetry metrics (not HR / payroll).
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
from .activity_session_service import SESSION_GAP_MINUTES


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
                "session_id": r.session_id,
                "started_at": ts.isoformat(),
                "last_at": ts.isoformat(),
                "events": 1,
                "duration_minutes_approx": 0.0,
                "modules": {r.module or "UNKNOWN": 1},
            }
        else:
            assert cur is not None
            cur["events"] += 1
            start = datetime.fromisoformat(cur["started_at"])
            cur["duration_minutes_approx"] = max(0.0, (ts - start).total_seconds() / 60.0)
            cur["last_at"] = ts.isoformat()
            mod = r.module or "UNKNOWN"
            cur["modules"][mod] = int(cur["modules"].get(mod, 0)) + 1
            if r.session_id and not cur.get("session_id"):
                cur["session_id"] = r.session_id
        prev_ts = ts
    if cur is not None:
        sessions.append(cur)
    return sessions


def _session_active_minutes(sessions: list[dict[str, Any]]) -> float:
    """Active operational time = span first→last event per session (min 1 min per session)."""
    total = 0.0
    for s in sessions:
        events = int(s.get("events") or 0)
        if events <= 0:
            continue
        dur = float(s.get("duration_minutes_approx") or 0.0)
        total += max(1.0, dur)
    return round(total, 1)


def _hourly_heatmap(rows: list[UserActivityLog]) -> list[dict[str, Any]]:
    buckets = [0] * 24
    for r in rows:
        if r.created_at:
            buckets[r.created_at.hour] += 1
    return [{"hour": h, "count": buckets[h]} for h in range(24)]


def _daily_breakdown(rows: list[UserActivityLog]) -> list[dict[str, Any]]:
    by_day: dict[str, int] = defaultdict(int)
    for r in rows:
        if r.created_at:
            by_day[r.created_at.date().isoformat()] += 1
    return [{"date": d, "count": by_day[d]} for d in sorted(by_day.keys())]


def _module_breakdown(rows: list[UserActivityLog], limit: int = 12) -> list[dict[str, Any]]:
    counts: dict[str, int] = defaultdict(int)
    for r in rows:
        counts[r.module or "UNKNOWN"] += 1
    ranked = sorted(counts.items(), key=lambda x: (-x[1], x[0]))
    return [{"module": mod, "count": cnt} for mod, cnt in ranked[:limit]]


def _action_buckets(rows: list[UserActivityLog]) -> dict[str, int]:
    picks = sum(1 for r in rows if "pick" in (r.action_type or "").lower())
    packs = sum(1 for r in rows if "pack" in (r.action_type or "").lower())
    scans = sum(1 for r in rows if "scan" in (r.action_type or "").lower())
    receiving = sum(1 for r in rows if (r.module or "").upper() in ("WMS_RECEIVING", "INBOUND"))
    putaway = sum(1 for r in rows if (r.module or "").upper() in ("WMS_PUTAWAY", "WMS_RELOCATION"))
    movements = sum(1 for r in rows if (r.module or "").upper() in ("WMS_MOVEMENTS", "WMS_REPLENISHMENT"))
    documents = sum(
        1
        for r in rows
        if (r.module or "").upper()
        in ("STOCK_DOCUMENTS", "SALE_DOCUMENTS", "DOCUMENTS", "DOCUMENT_SERIES")
    )
    inventory = sum(1 for r in rows if "INVENTORY" in (r.module or "").upper())
    admin = sum(1 for r in rows if (r.module or "").upper() in ("ADMIN_USERS", "SETTINGS", "AUTH", "WORKFORCE"))
    return {
        "picking_events": picks,
        "packing_events": packs,
        "scan_events": scans,
        "receiving_events": receiving,
        "putaway_events": putaway,
        "movement_events": movements,
        "document_events": documents,
        "inventory_events": inventory,
        "admin_events": admin,
    }


def _query_logs(
    db: Session,
    *,
    tenant_id: Optional[int],
    user_ids: Optional[list[int]],
    date_from: datetime,
    date_to: datetime,
) -> list[UserActivityLog]:
    q = db.query(UserActivityLog).filter(
        UserActivityLog.created_at >= date_from,
        UserActivityLog.created_at <= date_to,
    )
    if tenant_id is not None:
        q = q.filter(UserActivityLog.tenant_id == tenant_id)
    if user_ids:
        q = q.filter(UserActivityLog.user_id.in_(user_ids))
    return q.order_by(UserActivityLog.created_at).all()


def dashboard_summary(
    db: Session,
    *,
    tenant_id: Optional[int],
    user_ids: Optional[list[int]],
    date_from: datetime,
    date_to: datetime,
) -> dict[str, Any]:
    rows = _query_logs(db, tenant_id=tenant_id, user_ids=user_ids, date_from=date_from, date_to=date_to)

    by_user: dict[int, list[UserActivityLog]] = defaultdict(list)
    for r in rows:
        if r.user_id:
            by_user[r.user_id].append(r)

    active_minutes_by_user: dict[int, float] = {}
    events_by_user: dict[int, int] = {}
    sessions_by_user: dict[int, list[dict[str, Any]]] = {}
    for uid, urs in by_user.items():
        events_by_user[uid] = len(urs)
        sess = merge_activity_sessions(urs)
        sessions_by_user[uid] = sess
        active_minutes_by_user[uid] = _session_active_minutes(sess)

    total_active_minutes = round(sum(active_minutes_by_user.values()), 1)
    all_sessions = [s for sess in sessions_by_user.values() for s in sess]

    return {
        "range": {"from": date_from.isoformat(), "to": date_to.isoformat()},
        "session_gap_minutes": SESSION_GAP_MINUTES,
        "total_events": len(rows),
        "distinct_users": len(by_user),
        "approx_sessions_computed": len(all_sessions),
        "total_active_minutes_approx": total_active_minutes,
        "total_active_hours_approx": round(total_active_minutes / 60.0, 2),
        "action_buckets": _action_buckets(rows),
        "top_modules": _module_breakdown(rows),
        "hourly_heatmap": _hourly_heatmap(rows),
        "daily_breakdown": _daily_breakdown(rows),
        "per_user": [
            {
                "user_id": uid,
                "events": events_by_user.get(uid, 0),
                "active_minutes_approx": active_minutes_by_user.get(uid, 0.0),
                "sessions_count": len(sessions_by_user.get(uid, [])),
            }
            for uid in sorted(by_user.keys())
        ],
    }


def build_workforce_analytics(
    db: Session,
    *,
    tenant_id: Optional[int],
    user_id: Optional[int],
    date_from: datetime,
    date_to: datetime,
) -> dict[str, Any]:
    """Extended analytics payload for supervisor dashboards."""
    user_ids = [user_id] if user_id is not None else None
    rows = _query_logs(db, tenant_id=tenant_id, user_ids=user_ids, date_from=date_from, date_to=date_to)
    dash = dashboard_summary(
        db,
        tenant_id=tenant_id,
        user_ids=user_ids,
        date_from=date_from,
        date_to=date_to,
    )

    sessions_detail: list[dict[str, Any]] = []
    if user_id is not None:
        user_rows = [r for r in rows if r.user_id == user_id]
        source_groups = [(user_id, user_rows)]
    else:
        by_uid: dict[int, list[UserActivityLog]] = defaultdict(list)
        for r in rows:
            if r.user_id:
                by_uid[r.user_id].append(r)
        source_groups = list(by_uid.items())

    for _uid, group_rows in source_groups:
        for idx, sess in enumerate(merge_activity_sessions(group_rows), start=1):
            top_mod = sorted(sess.get("modules", {}).items(), key=lambda x: -x[1])[:3]
            sessions_detail.append(
                {
                    "index": idx,
                    "user_id": _uid,
                    "session_id": sess.get("session_id"),
                    "started_at": sess.get("started_at"),
                    "last_at": sess.get("last_at"),
                    "events": sess.get("events"),
                    "active_minutes_approx": max(1.0, float(sess.get("duration_minutes_approx") or 0.0)),
                    "top_modules": [{"module": m, "count": c} for m, c in top_mod],
                }
            )
    sessions_detail.sort(key=lambda s: s.get("started_at") or "", reverse=True)
    sessions_detail = sessions_detail[:40]
    for i, s in enumerate(sessions_detail, start=1):
        s["index"] = i

    timeline: list[dict[str, Any]] = []
    for r in sorted(rows, key=lambda x: x.created_at or datetime.min, reverse=True)[:80]:
        login = None
        if r.user_id:
            u = db.query(AppUser).filter(AppUser.id == r.user_id).first()
            login = u.login if u else None
        timeline.append(
            {
                "id": r.id,
                "user_id": r.user_id,
                "login": login,
                "module": r.module,
                "action_type": r.action_type,
                "warehouse_id": r.warehouse_id,
                "session_id": r.session_id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
        )

    throughput = {
        "events_per_active_hour": round(
            len(rows) / max(dash.get("total_active_hours_approx") or 0.01, 0.01),
            2,
        ),
        "events_per_user": round(len(rows) / max(dash.get("distinct_users") or 1, 1), 2),
    }

    return {
        **dash,
        "user_id": user_id,
        "sessions": sessions_detail,
        "recent_timeline": timeline,
        "throughput": throughput,
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
        "disclaimer": "Szacunki operacyjne (koszt pracodawcy × aktywny czas operacyjny), nie rozliczenie płac.",
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
                "warehouse_id": r.warehouse_id,
                "session_id": r.session_id,
                "action_type": r.action_type,
                "module": r.module,
                "entity_type": r.entity_type,
                "entity_id": r.entity_id,
                "metadata": _parse_meta(r.metadata_json),
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
        )
    return out
