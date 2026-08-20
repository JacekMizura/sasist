"""
Smart Matching history-events v2 — read projection over ObservationV2.

One row = one packing decision. Does not change learning / break / strategy runtime.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session, noload

from ...models.app_user import AppUser
from ...models.carton import Carton
from ...models.order import Order
from ...models.product import Product
from ...models.wms_smart_matching import WmsSmartMatchingObservationV2, WmsSmartMatchingRuleV2
from .smart_matching_v2.constants import PATTERN_COMPOSITION, PATTERN_SINGLE, SOURCE_MANUAL, STATUS_AMBIGUOUS
from .smart_matching_v2.composition import parse_composition_items_json


EVENT_TYPES = frozenset(
    {
        "all",
        "rule_created",
        "override",
        "rule_broken",
        "manual",
        "conflict",
    }
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


def _carton_map(db: Session, ids: set[str]) -> dict[str, str]:
    clean = [c for c in ids if c]
    if not clean:
        return {}
    rows = db.query(Carton).options(noload("*")).filter(Carton.id.in_(clean)).all()
    return {str(c.id): str(getattr(c, "name", None) or "").strip() or str(c.id) for c in rows}


def _product_map(db: Session, ids: set[int]) -> dict[int, str]:
    if not ids:
        return {}
    rows = db.query(Product).filter(Product.id.in_(list(ids))).all()
    out: dict[int, str] = {}
    for p in rows:
        name = str(getattr(p, "name", None) or getattr(p, "sku", None) or f"#{p.id}")
        out[int(p.id)] = name
    return out


def _order_number_map(db: Session, ids: set[int]) -> dict[int, str]:
    if not ids:
        return {}
    rows = db.query(Order.id, Order.number).filter(Order.id.in_(list(ids))).all()
    return {int(r[0]): str(r[1] or r[0]) for r in rows}


def _rule_dict(db: Session, rule: WmsSmartMatchingRuleV2, carton_names: dict[str, str]) -> dict[str, Any]:
    cid = str(rule.carton_id)
    return {
        "id": int(rule.id),
        "min_qty": int(rule.min_qty),
        "carton_id": cid,
        "carton_name": carton_names.get(cid) or cid,
        "source": str(rule.source),
        "status": str(rule.status),
        "is_locked": bool(rule.is_locked),
        "created_threshold": int(rule.created_threshold) if rule.created_threshold is not None else None,
        "hit_count": int(rule.hit_count or 0),
    }


def _resolve_linked_rule(
    *,
    observation_id: int,
    product_id: int,
    quantity: int,
    carton_id: Optional[str],
    by_created: dict[int, WmsSmartMatchingRuleV2],
    by_broken: dict[int, WmsSmartMatchingRuleV2],
    by_product: dict[int, list[WmsSmartMatchingRuleV2]],
) -> Optional[WmsSmartMatchingRuleV2]:
    """
    Deterministic read linkage for history badges — not a lifecycle engine.
    Priority: created_from → broken_by → same carton rule → MANUAL → best covering rule.
    """
    linked = by_created.get(observation_id) or by_broken.get(observation_id)
    if linked is not None:
        return linked

    candidates = list(by_product.get(int(product_id), []))
    if not candidates:
        return None

    chosen = (carton_id or "").strip() or None
    if chosen:
        same_carton = [r for r in candidates if str(r.carton_id) == chosen]
        if same_carton:
            # Prefer AMBIGUOUS / MANUAL on the exact carton for badge accuracy
            same_carton.sort(
                key=lambda r: (
                    0 if str(r.status) == STATUS_AMBIGUOUS else 1,
                    0 if str(r.source) == SOURCE_MANUAL else 1,
                    -int(r.min_qty),
                    -int(r.id),
                )
            )
            return same_carton[0]

    qty = int(quantity)
    covering = [r for r in candidates if int(r.min_qty) <= qty]
    if not covering:
        covering = candidates
    manuals = [r for r in covering if str(r.source) == SOURCE_MANUAL]
    pool = manuals if manuals else covering
    pool.sort(key=lambda r: (-int(r.min_qty), -int(r.id)))
    return pool[0] if pool else None


def list_history_events_v2(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    page: int = 1,
    limit: int = 50,
    product_id: Optional[int] = None,
    carton_id: Optional[str] = None,
    user_id: Optional[int] = None,
    event_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> dict[str, Any]:
    tid = int(tenant_id)
    wid = int(warehouse_id)
    page = max(1, int(page))
    limit = max(1, min(int(limit), 100))
    et = str(event_type or "all").strip().lower()
    if et not in EVENT_TYPES:
        et = "all"

    q = db.query(WmsSmartMatchingObservationV2).filter(
        WmsSmartMatchingObservationV2.tenant_id == tid,
        WmsSmartMatchingObservationV2.warehouse_id == wid,
    )
    if product_id is not None and int(product_id) > 0:
        q = q.filter(WmsSmartMatchingObservationV2.product_id == int(product_id))
    if carton_id and str(carton_id).strip():
        q = q.filter(WmsSmartMatchingObservationV2.carton_id == str(carton_id).strip())
    if user_id is not None and int(user_id) > 0:
        q = q.filter(WmsSmartMatchingObservationV2.user_id == int(user_id))
    dt_from = _parse_dt(date_from)
    dt_to = _parse_dt(date_to)
    if dt_from is not None:
        q = q.filter(WmsSmartMatchingObservationV2.created_at >= dt_from)
    if dt_to is not None:
        q = q.filter(WmsSmartMatchingObservationV2.created_at <= dt_to)

    # Preload rules for tenant/wh for enrichment (deterministic links).
    rules = (
        db.query(WmsSmartMatchingRuleV2)
        .filter(
            WmsSmartMatchingRuleV2.tenant_id == tid,
            WmsSmartMatchingRuleV2.warehouse_id == wid,
        )
        .all()
    )
    by_created: dict[int, WmsSmartMatchingRuleV2] = {}
    by_broken: dict[int, WmsSmartMatchingRuleV2] = {}
    by_product: dict[int, list[WmsSmartMatchingRuleV2]] = {}
    for r in rules:
        if r.created_from_observation_id is not None:
            by_created[int(r.created_from_observation_id)] = r
        if getattr(r, "broken_by_observation_id", None) is not None:
            by_broken[int(r.broken_by_observation_id)] = r
        by_product.setdefault(int(r.product_id), []).append(r)

    # Event-type filter needs flags — filter in Python after fetch window would be wrong for pagination.
    # For typed filters, scan ids with lightweight pass; for "all" use SQL pagination.
    if et == "all":
        total = q.count()
        rows = (
            q.order_by(
                WmsSmartMatchingObservationV2.created_at.desc(),
                WmsSmartMatchingObservationV2.id.desc(),
            )
            .offset((page - 1) * limit)
            .limit(limit)
            .all()
        )
    else:
        all_rows = (
            q.order_by(
                WmsSmartMatchingObservationV2.created_at.desc(),
                WmsSmartMatchingObservationV2.id.desc(),
            )
            .all()
        )
        filtered: list[WmsSmartMatchingObservationV2] = []
        for o in all_rows:
            oid = int(o.id)
            sug = (o.suggested_carton_id or "").strip() or None
            chosen = (o.carton_id or "").strip() or None
            is_override = bool(sug and chosen and sug != chosen)
            is_created = oid in by_created
            is_broken = oid in by_broken
            linked = _resolve_linked_rule(
                observation_id=oid,
                product_id=int(o.product_id),
                quantity=int(o.quantity),
                carton_id=chosen,
                by_created=by_created,
                by_broken=by_broken,
                by_product=by_product,
            )
            is_manual = linked is not None and str(linked.source) == SOURCE_MANUAL
            is_conflict = linked is not None and str(linked.status) == STATUS_AMBIGUOUS
            if et == "rule_created" and not is_created:
                continue
            if et == "override" and not is_override:
                continue
            if et == "rule_broken" and not is_broken:
                continue
            if et == "manual" and not is_manual:
                continue
            if et == "conflict" and not is_conflict:
                continue
            filtered.append(o)
        total = len(filtered)
        start = (page - 1) * limit
        rows = filtered[start : start + limit]

    carton_ids: set[str] = set()
    product_ids: set[int] = set()
    order_ids: set[int] = set()
    for o in rows:
        if o.carton_id:
            carton_ids.add(str(o.carton_id))
        if o.suggested_carton_id:
            carton_ids.add(str(o.suggested_carton_id))
        product_ids.add(int(o.product_id))
        order_ids.add(int(o.order_id))
        for row in parse_composition_items_json(getattr(o, "composition_items_json", None)):
            product_ids.add(int(row["product_id"]))
    for r in rules:
        carton_ids.add(str(r.carton_id))

    carton_names = _carton_map(db, carton_ids)
    product_names = _product_map(db, product_ids)
    order_numbers = _order_number_map(db, order_ids)

    items: list[dict[str, Any]] = []
    for o in rows:
        oid = int(o.id)
        sug = (o.suggested_carton_id or "").strip() or None
        chosen = (o.carton_id or "").strip() or None
        is_override = bool(sug and chosen and sug != chosen)
        created_rule = by_created.get(oid)
        broken_rule = by_broken.get(oid)
        is_decisive = created_rule is not None
        is_rule_created = created_rule is not None
        is_rule_broken = broken_rule is not None

        linked = _resolve_linked_rule(
            observation_id=oid,
            product_id=int(o.product_id),
            quantity=int(o.quantity),
            carton_id=chosen,
            by_created=by_created,
            by_broken=by_broken,
            by_product=by_product,
        )

        pid = int(o.product_id)
        pt = str(getattr(o, "pattern_type", None) or PATTERN_SINGLE)
        composition_items: list[dict[str, Any]] = []
        for row in parse_composition_items_json(getattr(o, "composition_items_json", None)):
            ipid = int(row["product_id"])
            composition_items.append(
                {
                    "product_id": ipid,
                    "name": product_names.get(ipid) or f"#{ipid}",
                    "quantity": int(row["quantity"]),
                }
            )
        items.append(
            {
                "observation_id": oid,
                "order_id": int(o.order_id),
                "order_number": order_numbers.get(int(o.order_id)),
                "pattern_type": pt,
                "product": {"id": pid, "name": product_names.get(pid) or f"#{pid}"},
                "quantity": int(o.quantity),
                "composition_items": composition_items if pt == PATTERN_COMPOSITION else [],
                "composition_identity_hash": (
                    str(getattr(o, "composition_identity_hash", None) or "") or None
                    if pt == PATTERN_COMPOSITION
                    else None
                ),
                "carton": {
                    "id": chosen,
                    "name": (carton_names.get(chosen) if chosen else None) or chosen,
                }
                if chosen
                else None,
                "suggested_carton": {
                    "id": sug,
                    "name": (carton_names.get(sug) if sug else None) or sug,
                }
                if sug
                else None,
                "operator": {
                    "id": int(o.user_id) if o.user_id else None,
                    "display_name": _operator_display(db, o.user_id),
                },
                "created_at": o.created_at.isoformat() if o.created_at else None,
                "is_override": is_override,
                "is_decisive": is_decisive,
                "is_rule_created": is_rule_created,
                "is_rule_broken": is_rule_broken,
                "linked_rule": _rule_dict(db, linked, carton_names) if linked is not None else None,
                "engine_version": int(o.engine_version or 2),
            }
        )

    return {
        "page": page,
        "limit": limit,
        "total": total,
        "items": items,
    }


def learning_series_for_product_carton(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    carton_id: str,
) -> dict[str, Any]:
    """
    Popover series for SINGLE_PRODUCT: (product, carton), hit_index oldest→newest,
    response newest-first.
    """
    tid = int(tenant_id)
    wid = int(warehouse_id)
    pid = int(product_id)
    cid = str(carton_id).strip()

    obs = (
        db.query(WmsSmartMatchingObservationV2)
        .filter(
            WmsSmartMatchingObservationV2.tenant_id == tid,
            WmsSmartMatchingObservationV2.warehouse_id == wid,
            WmsSmartMatchingObservationV2.product_id == pid,
            WmsSmartMatchingObservationV2.carton_id == cid,
            (
                (WmsSmartMatchingObservationV2.pattern_type == PATTERN_SINGLE)
                | (WmsSmartMatchingObservationV2.pattern_type.is_(None))
            ),
        )
        .order_by(
            WmsSmartMatchingObservationV2.created_at.asc(),
            WmsSmartMatchingObservationV2.id.asc(),
        )
        .all()
    )

    rules = (
        db.query(WmsSmartMatchingRuleV2)
        .filter(
            WmsSmartMatchingRuleV2.tenant_id == tid,
            WmsSmartMatchingRuleV2.warehouse_id == wid,
            WmsSmartMatchingRuleV2.product_id == pid,
            WmsSmartMatchingRuleV2.carton_id == cid,
            WmsSmartMatchingRuleV2.pattern_type == PATTERN_SINGLE,
        )
        .all()
    )
    return _build_learning_series_payload(
        db,
        obs=obs,
        rules=rules,
        carton_id=cid,
        product_id=pid,
        pattern_type=PATTERN_SINGLE,
        composition_items=[],
        identity_hash=None,
    )


def learning_series_for_composition(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    identity_hash: str,
    carton_id: str,
) -> dict[str, Any]:
    """Popover series for COMPOSITION: (exact hash, carton)."""
    tid = int(tenant_id)
    wid = int(warehouse_id)
    hid = str(identity_hash or "").strip()
    cid = str(carton_id).strip()

    obs = (
        db.query(WmsSmartMatchingObservationV2)
        .filter(
            WmsSmartMatchingObservationV2.tenant_id == tid,
            WmsSmartMatchingObservationV2.warehouse_id == wid,
            WmsSmartMatchingObservationV2.pattern_type == PATTERN_COMPOSITION,
            WmsSmartMatchingObservationV2.composition_identity_hash == hid,
            WmsSmartMatchingObservationV2.carton_id == cid,
        )
        .order_by(
            WmsSmartMatchingObservationV2.created_at.asc(),
            WmsSmartMatchingObservationV2.id.asc(),
        )
        .all()
    )
    rules = (
        db.query(WmsSmartMatchingRuleV2)
        .filter(
            WmsSmartMatchingRuleV2.tenant_id == tid,
            WmsSmartMatchingRuleV2.warehouse_id == wid,
            WmsSmartMatchingRuleV2.pattern_type == PATTERN_COMPOSITION,
            WmsSmartMatchingRuleV2.composition_identity_hash == hid,
            WmsSmartMatchingRuleV2.carton_id == cid,
        )
        .all()
    )
    items_json = None
    if obs:
        items_json = getattr(obs[0], "composition_items_json", None)
    elif rules:
        items_json = getattr(rules[0], "composition_items_json", None)
    raw = parse_composition_items_json(items_json)
    pids = {int(r["product_id"]) for r in raw}
    names = _product_map(db, pids)
    composition_items = [
        {
            "product_id": int(r["product_id"]),
            "name": names.get(int(r["product_id"])) or f"#{r['product_id']}",
            "quantity": int(r["quantity"]),
        }
        for r in raw
    ]
    anchor = int(obs[0].product_id) if obs else (int(rules[0].product_id) if rules else 0)
    return _build_learning_series_payload(
        db,
        obs=obs,
        rules=rules,
        carton_id=cid,
        product_id=anchor,
        pattern_type=PATTERN_COMPOSITION,
        composition_items=composition_items,
        identity_hash=hid,
    )


def _build_learning_series_payload(
    db: Session,
    *,
    obs: list,
    rules: list,
    carton_id: str,
    product_id: int,
    pattern_type: str,
    composition_items: list[dict[str, Any]],
    identity_hash: Optional[str],
) -> dict[str, Any]:
    cid = str(carton_id).strip()
    pid = int(product_id)
    by_created = {
        int(r.created_from_observation_id): r
        for r in rules
        if r.created_from_observation_id is not None
    }
    by_broken = {
        int(r.broken_by_observation_id): r
        for r in rules
        if getattr(r, "broken_by_observation_id", None) is not None
    }
    primary_rule = None
    for r in rules:
        if r.created_from_observation_id is not None and str(r.source) != SOURCE_MANUAL:
            primary_rule = r
            break
    if primary_rule is None:
        for r in rules:
            if str(r.source) == SOURCE_MANUAL:
                primary_rule = r
                break
    if primary_rule is None and rules:
        primary_rule = max(rules, key=lambda r: int(r.id))

    carton_names = _carton_map(db, {cid} | {str(r.carton_id) for r in rules})
    product_names = _product_map(db, {pid})
    order_ids = {int(o.order_id) for o in obs}
    order_numbers = _order_number_map(db, order_ids)

    hits_asc: list[dict[str, Any]] = []
    for idx, o in enumerate(obs, start=1):
        oid = int(o.id)
        hits_asc.append(
            {
                "observation_id": oid,
                "hit_index": idx,
                "order_id": int(o.order_id),
                "order_number": order_numbers.get(int(o.order_id)),
                "quantity": int(o.quantity),
                "operator": _operator_display(db, o.user_id),
                "created_at": o.created_at.isoformat() if o.created_at else None,
                "carton_id": cid,
                "carton_name": carton_names.get(cid) or cid,
                "is_decisive": oid in by_created,
                "is_rule_broken": oid in by_broken,
                "is_override": bool(
                    (o.suggested_carton_id or "").strip()
                    and str(o.suggested_carton_id).strip() != cid
                ),
            }
        )
    hits_desc = list(reversed(hits_asc))

    rule_out = None
    if primary_rule is not None:
        cname = carton_names.get(str(primary_rule.carton_id)) or str(primary_rule.carton_id)
        if pattern_type == PATTERN_COMPOSITION and composition_items:
            parts = [f"{ci['name']} ×{ci['quantity']}" for ci in composition_items[:4]]
            label = f"{', '.join(parts)} → {cname}"
        else:
            label = f"od {int(primary_rule.min_qty)} szt. → {cname}"
        rule_out = {
            "id": int(primary_rule.id),
            "product_id": pid,
            "product_name": product_names.get(pid) or f"#{pid}",
            "min_qty": int(primary_rule.min_qty),
            "carton_id": str(primary_rule.carton_id),
            "carton_name": cname,
            "source": str(primary_rule.source),
            "status": str(primary_rule.status),
            "is_locked": bool(primary_rule.is_locked),
            "created_threshold": int(primary_rule.created_threshold)
            if primary_rule.created_threshold is not None
            else None,
            "label": label,
            "pattern_type": pattern_type,
        }

    return {
        "product_id": pid,
        "product_name": product_names.get(pid) or f"#{pid}",
        "carton_id": cid,
        "carton_name": carton_names.get(cid) or cid,
        "pattern_type": pattern_type,
        "composition_identity_hash": identity_hash,
        "composition_items": composition_items,
        "created_threshold": int(primary_rule.created_threshold)
        if primary_rule is not None and primary_rule.created_threshold is not None
        else None,
        "hits": hits_desc,
        "rule": rule_out,
    }
