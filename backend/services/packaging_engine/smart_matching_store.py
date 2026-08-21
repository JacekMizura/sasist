"""
Smart Matching persistence: settings, composition fingerprint, learning, history, breaks, reset.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session, noload

from ...models.carton import Carton
from ...models.order import Order
from ...models.order_item import OrderItem
from ...models.product import Product
from ...models.wms_smart_matching import (
    WmsSmartMatchingBreak,
    WmsSmartMatchingHistory,
    WmsSmartMatchingRule,
    WmsSmartMatchingSettings,
)
from ...schemas.wms_smart_matching import WmsSmartMatchingSettingsOut

logger = logging.getLogger(__name__)

VALID_THRESHOLDS = frozenset({2, 3, 5})
MAX_THREE_D_FILLER_PERCENT = 99.0


def _clamp_filler_percent(raw: object) -> float:
    try:
        v = float(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0
    if v != v:  # NaN
        return 0.0
    return max(0.0, min(MAX_THREE_D_FILLER_PERCENT, v))


def _loads_ids(raw: object) -> list[int]:
    if raw is None or raw == "":
        return []
    if isinstance(raw, list):
        return [int(x) for x in raw if str(x).strip().isdigit() and int(x) > 0]
    try:
        data = json.loads(str(raw))
    except Exception:
        return []
    if not isinstance(data, list):
        return []
    return [int(x) for x in data if str(x).strip().lstrip("-").isdigit() and int(x) > 0]


def effective_smart_enabled(row: WmsSmartMatchingSettings) -> bool:
    """Runtime SSOT for Smart engine — prefers smart_enabled, falls back to legacy enabled."""
    if hasattr(row, "smart_enabled") and row.smart_enabled is not None:
        return bool(row.smart_enabled)
    return bool(row.enabled)


def effective_three_d_enabled(row: WmsSmartMatchingSettings) -> bool:
    """Runtime SSOT for 3D engine — prefers three_d_enabled, falls back to legacy enabled."""
    if hasattr(row, "three_d_enabled") and row.three_d_enabled is not None:
        return bool(row.three_d_enabled)
    return bool(row.enabled)


def effective_filler_percent(row: WmsSmartMatchingSettings) -> float:
    return _clamp_filler_percent(getattr(row, "three_d_filler_percent", 0) or 0)


def get_or_create_settings(db: Session, *, tenant_id: int, warehouse_id: int) -> WmsSmartMatchingSettings:
    row = (
        db.query(WmsSmartMatchingSettings)
        .filter(
            WmsSmartMatchingSettings.tenant_id == int(tenant_id),
            WmsSmartMatchingSettings.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if row is not None:
        # Self-heal rows created before independent flags (NULL / missing attrs).
        changed = False
        if getattr(row, "smart_enabled", None) is None:
            row.smart_enabled = bool(row.enabled)
            changed = True
        if getattr(row, "three_d_enabled", None) is None:
            row.three_d_enabled = bool(row.enabled)
            changed = True
        if getattr(row, "three_d_filler_percent", None) is None:
            row.three_d_filler_percent = 0.0
            changed = True
        if changed:
            db.add(row)
            db.flush()
        return row
    row = WmsSmartMatchingSettings(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        enabled=True,
        smart_enabled=True,
        three_d_enabled=True,
        identical_orders_threshold=3,
        proposal_init_status_id=None,
        auto_label_enabled=False,
        auto_label_status_ids_json="[]",
        packaging_strategy="SMART_THEN_3D",
        legacy_v1_fallback_enabled=True,
        three_d_filler_percent=0.0,
    )
    db.add(row)
    db.flush()
    return row


def settings_to_out(row: WmsSmartMatchingSettings) -> WmsSmartMatchingSettingsOut:
    th = int(row.identical_orders_threshold or 3)
    if th not in VALID_THRESHOLDS:
        th = 3
    smart_on = effective_smart_enabled(row)
    three_d_on = effective_three_d_enabled(row)
    return WmsSmartMatchingSettingsOut(
        enabled=smart_on,
        smart_enabled=smart_on,
        three_d_enabled=three_d_on,
        identical_orders_threshold=th,  # type: ignore[arg-type]
        proposal_init_status_id=int(row.proposal_init_status_id)
        if row.proposal_init_status_id is not None
        else None,
        auto_label_enabled=bool(row.auto_label_enabled),
        auto_label_status_ids=_loads_ids(row.auto_label_status_ids_json),
        packaging_strategy=str(getattr(row, "packaging_strategy", None) or "SMART_THEN_3D"),
        legacy_v1_fallback_enabled=bool(getattr(row, "legacy_v1_fallback_enabled", True)),
        three_d_filler_percent=effective_filler_percent(row),
    )


def save_settings(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    identical_orders_threshold: int,
    proposal_init_status_id: Optional[int],
    auto_label_enabled: bool,
    auto_label_status_ids: list[int],
    enabled: Optional[bool] = None,
    smart_enabled: Optional[bool] = None,
    three_d_enabled: Optional[bool] = None,
    packaging_strategy: Optional[str] = None,
    legacy_v1_fallback_enabled: Optional[bool] = None,
    three_d_filler_percent: Optional[float] = None,
) -> WmsSmartMatchingSettings:
    row = get_or_create_settings(db, tenant_id=tenant_id, warehouse_id=warehouse_id)

    if smart_enabled is not None:
        row.smart_enabled = bool(smart_enabled)
    elif enabled is not None:
        row.smart_enabled = bool(enabled)
    # Keep legacy column in sync with Smart so old readers stay coherent.
    row.enabled = bool(row.smart_enabled)

    if three_d_enabled is not None:
        row.three_d_enabled = bool(three_d_enabled)

    th = int(identical_orders_threshold)
    row.identical_orders_threshold = th if th in VALID_THRESHOLDS else 3
    row.proposal_init_status_id = int(proposal_init_status_id) if proposal_init_status_id else None
    row.auto_label_enabled = bool(auto_label_enabled)
    ids = sorted({int(x) for x in auto_label_status_ids if int(x) > 0})
    row.auto_label_status_ids_json = json.dumps(ids)
    if packaging_strategy is not None:
        from .smart_matching_v2.constants import DEFAULT_PACKAGING_STRATEGY, PACKAGING_STRATEGIES

        ps = str(packaging_strategy).strip().upper()
        row.packaging_strategy = ps if ps in PACKAGING_STRATEGIES else DEFAULT_PACKAGING_STRATEGY
    if legacy_v1_fallback_enabled is not None:
        row.legacy_v1_fallback_enabled = bool(legacy_v1_fallback_enabled)
    if three_d_filler_percent is not None:
        row.three_d_filler_percent = _clamp_filler_percent(three_d_filler_percent)
    row.updated_at = datetime.utcnow()
    db.add(row)
    db.flush()
    return row


def composition_from_order(db: Session, order: Order) -> tuple[str, str, float]:
    """
    Returns (composition_key, human label, total units).

    Key is stable hash of sorted product_id:qty pairs (identical product sets).
    """
    items = (
        db.query(OrderItem)
        .filter(OrderItem.order_id == int(order.id))
        .all()
    )
    pairs: list[tuple[int, int]] = []
    labels: list[str] = []
    total = 0.0
    for it in items:
        pid = int(getattr(it, "product_id", 0) or 0)
        qty = int(getattr(it, "quantity", 0) or 0)
        if pid <= 0 or qty <= 0:
            continue
        pairs.append((pid, qty))
        total += float(qty)
        prod = db.query(Product).filter(Product.id == pid).first()
        name = str(getattr(prod, "name", None) or getattr(prod, "sku", None) or f"#{pid}")
        labels.append(f"{name} ×{qty}")
    pairs.sort()
    raw = "|".join(f"{p}:{q}" for p, q in pairs) or "empty"
    key = hashlib.sha1(raw.encode("utf-8")).hexdigest()
    label = ", ".join(labels[:6])
    if len(labels) > 6:
        label = f"{label} (+{len(labels) - 6})"
    return key, (label or "—")[:512], total


def active_rule_for_composition(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    composition_key: str,
) -> Optional[WmsSmartMatchingRule]:
    """Best auto rule for composition (highest hit_count)."""
    return (
        db.query(WmsSmartMatchingRule)
        .filter(
            WmsSmartMatchingRule.tenant_id == int(tenant_id),
            WmsSmartMatchingRule.warehouse_id == int(warehouse_id),
            WmsSmartMatchingRule.composition_key == str(composition_key),
            WmsSmartMatchingRule.is_auto.is_(True),
        )
        .order_by(WmsSmartMatchingRule.hit_count.desc(), WmsSmartMatchingRule.id.desc())
        .first()
    )


def _user_display(db: Session, user_id: Optional[int]) -> Optional[str]:
    if user_id is None:
        return None
    try:
        from ...models.app_user import AppUser

        u = db.query(AppUser).filter(AppUser.id == int(user_id)).first()
        if u is None:
            return f"#{user_id}"
        for attr in ("display_name", "full_name", "name", "email", "username"):
            v = getattr(u, attr, None)
            if v and str(v).strip():
                return str(v).strip()[:255]
        return f"#{user_id}"
    except Exception:
        return f"#{user_id}" if user_id else None


def record_packing_carton_choice(
    db: Session,
    *,
    order: Order,
    carton_id: str,
    operator_user_id: Optional[int] = None,
    suggested_carton_id: Optional[str] = None,
) -> WmsSmartMatchingHistory:
    """
    Persist packing choice, update/create auto rule when threshold met,
    and record interrupted series when operator overrides an active rule.
    """
    tid = int(order.tenant_id)
    wid = int(order.warehouse_id)
    settings = get_or_create_settings(db, tenant_id=tid, warehouse_id=wid)
    key, label, units = composition_from_order(db, order)
    cid = str(carton_id).strip()
    carton = (
        db.query(Carton)
        .options(noload("*"))
        .filter(Carton.id == cid, Carton.tenant_id == tid, Carton.warehouse_id == wid)
        .first()
    )
    carton_name = str(getattr(carton, "name", None) or "") or None

    rule = active_rule_for_composition(db, tenant_id=tid, warehouse_id=wid, composition_key=key)
    suggested = (suggested_carton_id or "").strip() or (str(rule.carton_id) if rule else None)
    broke = bool(rule is not None and suggested and cid and cid != str(suggested))

    hist = WmsSmartMatchingHistory(
        tenant_id=tid,
        warehouse_id=wid,
        order_id=int(order.id),
        composition_key=key,
        composition_label=label,
        carton_id=cid or None,
        carton_name=carton_name,
        suggested_carton_id=suggested,
        user_id=int(operator_user_id) if operator_user_id else None,
        user_display=_user_display(db, operator_user_id),
        quantity_units=units,
        broke_series=broke,
        created_at=datetime.utcnow(),
    )
    db.add(hist)
    db.flush()

    if broke and rule is not None:
        br = WmsSmartMatchingBreak(
            tenant_id=tid,
            warehouse_id=wid,
            rule_id=int(rule.id),
            history_id=int(hist.id),
            order_id=int(order.id),
            composition_key=key,
            suggested_carton_id=str(suggested) if suggested else None,
            chosen_carton_id=cid,
            chosen_carton_name=carton_name,
            user_id=int(operator_user_id) if operator_user_id else None,
            user_display=hist.user_display,
            quantity_units=units,
            created_at=datetime.utcnow(),
        )
        db.add(br)

    # Learn from this pack: count identical composition+carton history.
    same_count = (
        db.query(WmsSmartMatchingHistory)
        .filter(
            WmsSmartMatchingHistory.tenant_id == tid,
            WmsSmartMatchingHistory.warehouse_id == wid,
            WmsSmartMatchingHistory.composition_key == key,
            WmsSmartMatchingHistory.carton_id == cid,
        )
        .count()
    )
    threshold = int(settings.identical_orders_threshold or 3)
    if threshold not in VALID_THRESHOLDS:
        threshold = 3

    existing = (
        db.query(WmsSmartMatchingRule)
        .filter(
            WmsSmartMatchingRule.tenant_id == tid,
            WmsSmartMatchingRule.warehouse_id == wid,
            WmsSmartMatchingRule.composition_key == key,
            WmsSmartMatchingRule.carton_id == cid,
        )
        .first()
    )
    now = datetime.utcnow()
    if existing is not None:
        existing.hit_count = int(same_count)
        existing.composition_label = label
        existing.last_order_id = int(order.id)
        existing.last_used_at = now
        existing.updated_at = now
        db.add(existing)
    # v2 cutover: do NOT create new v1 exact-composition rules.
    # Existing v1 rules remain readable via legacy_v1_fallback_enabled.
    elif same_count >= threshold and settings.enabled:
        logger.info(
            "smart_matching v1 rule create skipped (engine v2) tenant=%s wh=%s key=%s carton=%s hits=%s",
            tid,
            wid,
            key[:12],
            cid,
            same_count,
        )

    db.flush()
    return hist


def reset_auto_rules(db: Session, *, tenant_id: int, warehouse_id: int) -> int:
    """Delete only auto-created associations (v1 + v2 AUTO); keep packing history/observations."""
    from ...models.wms_smart_matching import WmsSmartMatchingRuleV2
    from .smart_matching_v2.constants import SOURCE_AUTO

    q = db.query(WmsSmartMatchingRule).filter(
        WmsSmartMatchingRule.tenant_id == int(tenant_id),
        WmsSmartMatchingRule.warehouse_id == int(warehouse_id),
        WmsSmartMatchingRule.is_auto.is_(True),
    )
    rule_ids = [int(r.id) for r in q.all()]
    n = 0
    if rule_ids:
        db.query(WmsSmartMatchingBreak).filter(WmsSmartMatchingBreak.rule_id.in_(rule_ids)).delete(
            synchronize_session=False
        )
        n = (
            db.query(WmsSmartMatchingRule)
            .filter(WmsSmartMatchingRule.id.in_(rule_ids))
            .delete(synchronize_session=False)
        )
    n_v2 = (
        db.query(WmsSmartMatchingRuleV2)
        .filter(
            WmsSmartMatchingRuleV2.tenant_id == int(tenant_id),
            WmsSmartMatchingRuleV2.warehouse_id == int(warehouse_id),
            WmsSmartMatchingRuleV2.source == SOURCE_AUTO,
            WmsSmartMatchingRuleV2.is_locked.is_(False),
        )
        .delete(synchronize_session=False)
    )
    db.flush()
    # Bulk delete leaves ORM identity map stale; expire so recreate can INSERT cleanly.
    db.expire_all()
    return int(n or 0) + int(n_v2 or 0)


def list_history(
    db: Session, *, tenant_id: int, warehouse_id: int, limit: int = 100
) -> list[dict[str, Any]]:
    rows = (
        db.query(WmsSmartMatchingHistory)
        .filter(
            WmsSmartMatchingHistory.tenant_id == int(tenant_id),
            WmsSmartMatchingHistory.warehouse_id == int(warehouse_id),
        )
        .order_by(WmsSmartMatchingHistory.created_at.desc(), WmsSmartMatchingHistory.id.desc())
        .limit(max(1, min(int(limit), 500)))
        .all()
    )
    out: list[dict[str, Any]] = []
    for h in rows:
        order = db.query(Order).filter(Order.id == int(h.order_id)).first()
        br = None
        if h.broke_series:
            br_row = (
                db.query(WmsSmartMatchingBreak)
                .filter(WmsSmartMatchingBreak.history_id == int(h.id))
                .order_by(WmsSmartMatchingBreak.id.desc())
                .first()
            )
            if br_row:
                br = _break_dict(db, br_row)
        out.append(
            {
                "id": int(h.id),
                "order_id": int(h.order_id),
                "order_number": str(getattr(order, "number", None) or "") or None,
                "composition_key": h.composition_key,
                "composition_label": h.composition_label,
                "carton_id": h.carton_id,
                "carton_name": h.carton_name,
                "suggested_carton_id": h.suggested_carton_id,
                "user_display": h.user_display,
                "quantity_units": h.quantity_units,
                "broke_series": bool(h.broke_series),
                "created_at": h.created_at.isoformat() if h.created_at else None,
                "latest_break": br,
            }
        )
    return out


def list_rules(
    db: Session, *, tenant_id: int, warehouse_id: int, limit: int = 100
) -> list[dict[str, Any]]:
    rows = (
        db.query(WmsSmartMatchingRule)
        .filter(
            WmsSmartMatchingRule.tenant_id == int(tenant_id),
            WmsSmartMatchingRule.warehouse_id == int(warehouse_id),
            WmsSmartMatchingRule.is_auto.is_(True),
        )
        .order_by(WmsSmartMatchingRule.hit_count.desc(), WmsSmartMatchingRule.id.desc())
        .limit(max(1, min(int(limit), 500)))
        .all()
    )
    out: list[dict[str, Any]] = []
    for r in rows:
        carton = db.query(Carton).options(noload("*")).filter(Carton.id == str(r.carton_id)).first()
        br_row = (
            db.query(WmsSmartMatchingBreak)
            .filter(WmsSmartMatchingBreak.rule_id == int(r.id))
            .order_by(WmsSmartMatchingBreak.created_at.desc())
            .first()
        )
        out.append(
            {
                "id": int(r.id),
                "composition_key": r.composition_key,
                "composition_label": r.composition_label,
                "carton_id": str(r.carton_id),
                "carton_name": str(getattr(carton, "name", None) or "") or None,
                "hit_count": int(r.hit_count or 0),
                "is_auto": bool(r.is_auto),
                "has_interrupted_series": br_row is not None,
                "last_order_id": int(r.last_order_id) if r.last_order_id else None,
                "last_used_at": r.last_used_at.isoformat() if r.last_used_at else None,
                "created_from_history_id": int(r.created_from_history_id)
                if r.created_from_history_id is not None
                else None,
                "created_threshold": int(r.created_threshold)
                if r.created_threshold is not None
                else None,
                "latest_break": _break_dict(db, br_row) if br_row else None,
            }
        )
    return out


def _break_dict(db: Session, br: WmsSmartMatchingBreak) -> dict[str, Any]:
    order = db.query(Order).filter(Order.id == int(br.order_id)).first()
    return {
        "id": int(br.id),
        "order_id": int(br.order_id),
        "order_number": str(getattr(order, "number", None) or "") or None,
        "user_display": br.user_display,
        "quantity_units": br.quantity_units,
        "chosen_carton_id": br.chosen_carton_id,
        "chosen_carton_name": br.chosen_carton_name,
        "suggested_carton_id": br.suggested_carton_id,
        "created_at": br.created_at.isoformat() if br.created_at else None,
    }


def dashboard_stats(db: Session, *, tenant_id: int, warehouse_id: int, period_days: int = 7) -> dict[str, Any]:
    from datetime import timedelta

    since = datetime.utcnow() - timedelta(days=max(1, min(int(period_days), 90)))
    q = db.query(WmsSmartMatchingHistory).filter(
        WmsSmartMatchingHistory.tenant_id == int(tenant_id),
        WmsSmartMatchingHistory.warehouse_id == int(warehouse_id),
        WmsSmartMatchingHistory.created_at >= since,
    )
    total = q.count()
    overrides = q.filter(WmsSmartMatchingHistory.broke_series.is_(True)).count()
    override_pct = (overrides / total * 100.0) if total else None
    rules_n = (
        db.query(WmsSmartMatchingRule)
        .filter(
            WmsSmartMatchingRule.tenant_id == int(tenant_id),
            WmsSmartMatchingRule.warehouse_id == int(warehouse_id),
            WmsSmartMatchingRule.is_auto.is_(True),
        )
        .count()
    )
    top: list[dict[str, Any]] = []
    # Simple top cartons from history
    from sqlalchemy import func

    rows = (
        db.query(WmsSmartMatchingHistory.carton_id, WmsSmartMatchingHistory.carton_name, func.count())
        .filter(
            WmsSmartMatchingHistory.tenant_id == int(tenant_id),
            WmsSmartMatchingHistory.warehouse_id == int(warehouse_id),
            WmsSmartMatchingHistory.created_at >= since,
            WmsSmartMatchingHistory.carton_id.isnot(None),
        )
        .group_by(WmsSmartMatchingHistory.carton_id, WmsSmartMatchingHistory.carton_name)
        .order_by(func.count().desc())
        .limit(8)
        .all()
    )
    for cid, name, cnt in rows:
        top.append({"carton_id": cid, "name": name or cid, "uses": int(cnt)})

    return {
        "period_days": int(period_days),
        # Active auto-rules count (not suggestion events). FE label: „Aktywne reguły dopasowania”.
        "suggestions_total": int(rules_n),
        "override_rate_pct": override_pct,
        "top_packages": top,
        "note": f"Historia pakowań (okres): {total}; nadpisania serii: {overrides}.",
    }
