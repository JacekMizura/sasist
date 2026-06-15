"""Purchasing alerts: rules, scan engine, deduplicated events, draft PO helper."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Set

from fastapi import HTTPException
from sqlalchemy import case, func
from sqlalchemy.orm import Session, joinedload

from ..models.inbound_delivery import InboundDelivery
from ..models.product import Product
from ..models.purchase_order import PurchaseOrder
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.purchasing_alert import PurchasingAlertEvent, PurchasingAlertRule, PurchasingAutoDraft
from . import purchasing_replenish_core as core
from .product_inventory_snapshot_service import inventory_snapshots_for_products
from .purchasing_forecast_service import (
    forecast_candidate_product_ids,
    last_sale_date_by_product,
    sales_qty_by_days,
    _unit_cost,
)
from .purchasing_order_service import (
    PO_CONFIRMED,
    PO_DRAFT,
    PO_PARTIALLY_RECEIVED,
    PO_SENT,
    create_orders_from_generator,
)

RULE_TYPES = frozenset(
    {
        "low_cover_days",
        "dead_stock",
        "delayed_supplier_delivery",
        "rising_demand",
        "high_capital_locked",
    }
)
SEVERITIES = frozenset({"info", "warning", "critical"})
EVENT_STATUSES = frozenset({"open", "acknowledged", "resolved"})

OPEN_PO_STATUSES = frozenset({PO_DRAFT, PO_SENT, PO_CONFIRMED, PO_PARTIALLY_RECEIVED})


def _cfg(rule_type: str, raw: str) -> Dict[str, Any]:
    try:
        d = json.loads(raw or "{}")
    except json.JSONDecodeError:
        d = {}
    defaults: Dict[str, Dict[str, Any]] = {
        "low_cover_days": {"threshold_days": 7.0},
        "dead_stock": {"no_sales_days": 60},
        "delayed_supplier_delivery": {"po_age_days": 14},
        "rising_demand": {"multiplier": 1.5},
        "high_capital_locked": {"threshold_value": 10000.0},
    }
    base = defaults.get(rule_type, {})
    base.update(d)
    return base


def _upsert_open_event(
    db: Session,
    *,
    tenant_id: int,
    rule: PurchasingAlertRule,
    dedupe_key: str,
    title: str,
    message: Optional[str],
    severity: str,
    product_id: Optional[int],
    supplier_id: Optional[int],
    payload: Optional[Dict[str, Any]],
) -> PurchasingAlertEvent:
    """One open row per (tenant, rule, dedupe_key); refresh text and updated_at on repeat."""
    now = datetime.utcnow()
    ex = (
        db.query(PurchasingAlertEvent)
        .filter(
            PurchasingAlertEvent.tenant_id == tenant_id,
            PurchasingAlertEvent.rule_id == rule.id,
            PurchasingAlertEvent.dedupe_key == dedupe_key,
            PurchasingAlertEvent.status == "open",
        )
        .first()
    )
    pj = json.dumps(payload) if payload is not None else None
    if ex:
        ex.title = title[:512]
        ex.message = message
        ex.severity = severity
        ex.product_id = product_id
        ex.supplier_id = supplier_id
        ex.payload_json = pj
        ex.updated_at = now
        return ex
    row = PurchasingAlertEvent(
        tenant_id=tenant_id,
        rule_id=rule.id,
        product_id=product_id,
        supplier_id=supplier_id,
        status="open",
        severity=severity,
        title=title[:512],
        message=message,
        payload_json=pj,
        dedupe_key=dedupe_key[:256],
        created_at=now,
        updated_at=now,
        resolved_at=None,
    )
    db.add(row)
    return row


def run_alert_scan(db: Session, tenant_id: int, warehouse_id: Optional[int]) -> Dict[str, Any]:
    rules = (
        db.query(PurchasingAlertRule)
        .filter(PurchasingAlertRule.tenant_id == tenant_id, PurchasingAlertRule.is_enabled.is_(True))
        .all()
    )
    if not rules:
        return {"rules_evaluated": 0, "events_touched": 0, "message": "No enabled rules."}

    cand = forecast_candidate_product_ids(db, tenant_id, warehouse_id, None)
    if cand:
        products = (
            db.query(Product)
            .filter(Product.tenant_id == tenant_id, Product.deleted_at.is_(None), Product.id.in_(cand))
            .all()
        )
    else:
        products = []

    scan_pids = [int(p.id) for p in products]
    scan_snaps = inventory_snapshots_for_products(db, tenant_id, warehouse_id, scan_pids) if scan_pids else {}
    available_map = {pid: float(s["available"]) for pid, s in scan_snaps.items()}
    inbound_map = {pid: float(s["inbound_total"]) for pid, s in scan_snaps.items()}
    on_hand_map = {pid: float(s["on_hand"]) for pid, s in scan_snaps.items()}

    sales_7 = sales_qty_by_days(db, tenant_id, warehouse_id, 7)
    sales_30 = sales_qty_by_days(db, tenant_id, warehouse_id, 30)
    price_map = core.supplier_price_map(db, tenant_id)
    cat_first = core.catalog_supplier_first(db, tenant_id)
    last_sale = last_sale_date_by_product(db, tenant_id, warehouse_id)
    now = datetime.utcnow()

    touched = 0
    for rule in rules:
        if rule.type not in RULE_TYPES:
            continue
        cfg = _cfg(rule.type, rule.config_json)

        if rule.type == "low_cover_days":
            th = float(cfg.get("threshold_days") or 7)
            for p in products:
                m = core.metrics_from_product(p, available_map, sales_30, inbound_map, cat_first)
                avg_d = float(m.sales_30d) / 30.0 if m.sales_30d else 0.0
                dc = core.days_cover(m.stock, avg_d)
                if dc is None or dc >= th:
                    continue
                dk = f"product:{p.id}"
                _upsert_open_event(
                    db,
                    tenant_id=tenant_id,
                    rule=rule,
                    dedupe_key=dk,
                    title=f"Low stock cover ({dc} d < {th:g} d)",
                    message=f"Product «{(p.name or '').strip()}» cover {dc} days (avg daily {avg_d:.4f}).",
                    severity=rule.severity,
                    product_id=int(p.id),
                    supplier_id=m.resolved_supplier_id,
                    payload={"cover_days": dc, "threshold_days": th, "avg_daily": avg_d},
                )
                touched += 1

        elif rule.type == "dead_stock":
            min_days = int(cfg.get("no_sales_days") or 60)
            for p in products:
                st = float(on_hand_map.get(int(p.id), 0.0))
                if st <= 0:
                    continue
                ls = last_sale.get(int(p.id))
                if ls is not None:
                    idle = int((now - ls).total_seconds() // 86400)
                    if idle < min_days:
                        continue
                else:
                    if float(sales_qty_by_days(db, tenant_id, warehouse_id, min_days).get(int(p.id), 0)) > 1e-9:
                        continue
                    idle = 999
                dk = f"product:{p.id}"
                _upsert_open_event(
                    db,
                    tenant_id=tenant_id,
                    rule=rule,
                    dedupe_key=dk,
                    title="Dead stock risk",
                    message=f"«{(p.name or '').strip()}» stock {st:g} but no sales in {idle}+ days.",
                    severity=rule.severity,
                    product_id=int(p.id),
                    supplier_id=int(p.default_supplier_id) if p.default_supplier_id else cat_first.get(int(p.id)),
                    payload={"stock": st, "no_sales_days": idle},
                )
                touched += 1

        elif rule.type == "delayed_supplier_delivery":
            age_days = int(cfg.get("po_age_days") or 14)
            cutoff = now - timedelta(days=age_days)
            delayed_pz = (
                db.query(StockDocument)
                .join(InboundDelivery, InboundDelivery.id == StockDocument.delivery_id)
                .filter(
                    StockDocument.tenant_id == tenant_id,
                    StockDocument.document_type == "PZ",
                    InboundDelivery.expected_date.isnot(None),
                    InboundDelivery.expected_date < cutoff,
                )
                .all()
            )
            delayed_pz_ids: List[int] = []
            for doc in delayed_pz:
                rec = (
                    db.query(func.coalesce(func.sum(StockDocumentItem.received_quantity), 0.0))
                    .filter(StockDocumentItem.document_id == doc.id)
                    .scalar()
                )
                if float(rec or 0) > 1e-9:
                    continue
                delayed_pz_ids.append(int(doc.id))
                _upsert_open_event(
                    db,
                    tenant_id=tenant_id,
                    rule=rule,
                    dedupe_key=f"pz:{doc.id}",
                    title=f"Planned delivery overdue > {age_days} days",
                    message=f"PZ-{doc.id} (supplier #{doc.supplier_id}) has expected date overdue and no received qty yet.",
                    severity=rule.severity,
                    product_id=None,
                    supplier_id=int(doc.supplier_id),
                    payload={"stock_document_id": doc.id, "document_number": f"PZ-{doc.id}", "status": doc.status},
                )
                touched += 1

            # Fallback to PO-based alerts when there is no overdue PZ candidate.
            if not delayed_pz_ids:
                pos = (
                    db.query(PurchaseOrder)
                    .filter(
                        PurchaseOrder.tenant_id == tenant_id,
                        PurchaseOrder.status.in_(OPEN_PO_STATUSES),
                        PurchaseOrder.created_at < cutoff,
                    )
                    .all()
                )
                for po in pos:
                    dk = f"po:{po.id}"
                    _upsert_open_event(
                        db,
                        tenant_id=tenant_id,
                        rule=rule,
                        dedupe_key=dk,
                        title=f"Purchase order open > {age_days} days",
                        message=f"PO {po.order_number} (supplier #{po.supplier_id}) still in «{po.status}».",
                        severity=rule.severity,
                        product_id=None,
                        supplier_id=int(po.supplier_id),
                        payload={"purchase_order_id": po.id, "order_number": po.order_number, "status": po.status},
                    )
                    touched += 1

        elif rule.type == "rising_demand":
            mult = float(cfg.get("multiplier") or 1.5)
            for p in products:
                s7 = float(sales_7.get(int(p.id), 0))
                s30 = float(sales_30.get(int(p.id), 0))
                avg7 = s7 / 7.0
                avg30 = s30 / 30.0
                if avg30 <= 1e-9:
                    if avg7 <= 1e-9:
                        continue
                    spike = True
                else:
                    spike = avg7 > avg30 * mult
                if not spike:
                    continue
                dk = f"product:{p.id}"
                _upsert_open_event(
                    db,
                    tenant_id=tenant_id,
                    rule=rule,
                    dedupe_key=dk,
                    title="Rising demand vs 30d average",
                    message=f"«{(p.name or '').strip()}»: last 7d pace {avg7:.4f}/d vs 30d {avg30:.4f}/d (×{mult:g}).",
                    severity=rule.severity,
                    product_id=int(p.id),
                    supplier_id=int(p.default_supplier_id) if p.default_supplier_id else cat_first.get(int(p.id)),
                    payload={"avg_7d": avg7, "avg_30d": avg30, "multiplier": mult},
                )
                touched += 1

        elif rule.type == "high_capital_locked":
            thr = float(cfg.get("threshold_value") or 10000)
            for p in products:
                st = float(on_hand_map.get(int(p.id), 0.0))
                if st <= 0:
                    continue
                cost = _unit_cost(p, price_map, cat_first)
                val = st * cost
                if val <= thr:
                    continue
                dk = f"product:{p.id}"
                _upsert_open_event(
                    db,
                    tenant_id=tenant_id,
                    rule=rule,
                    dedupe_key=dk,
                    title="High capital locked in stock",
                    message=f"«{(p.name or '').strip()}» ≈ {val:.2f} > {thr:.2f}.",
                    severity=rule.severity,
                    product_id=int(p.id),
                    supplier_id=int(p.default_supplier_id) if p.default_supplier_id else cat_first.get(int(p.id)),
                    payload={"stock_value": val, "threshold_value": thr, "stock": st},
                )
                touched += 1

    db.commit()
    return {"rules_evaluated": len(rules), "events_touched": touched, "message": "Skan zakończony — lista problemów została zaktualizowana."}


def list_alert_rules(db: Session, tenant_id: int) -> List[PurchasingAlertRule]:
    return (
        db.query(PurchasingAlertRule)
        .filter(PurchasingAlertRule.tenant_id == tenant_id)
        .order_by(PurchasingAlertRule.created_at.desc())
        .all()
    )


def create_alert_rule(
    db: Session,
    *,
    tenant_id: int,
    name: str,
    rule_type: str,
    severity: str,
    config_json: Optional[str],
    is_enabled: bool = True,
) -> PurchasingAlertRule:
    if rule_type not in RULE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid rule type")
    if severity not in SEVERITIES:
        raise HTTPException(status_code=400, detail="Invalid severity")
    raw = config_json or "{}"
    try:
        json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="config_json must be valid JSON")
    r = PurchasingAlertRule(
        tenant_id=tenant_id,
        name=name.strip()[:256],
        type=rule_type,
        is_enabled=bool(is_enabled),
        severity=severity,
        config_json=raw,
        created_at=datetime.utcnow(),
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


def patch_alert_rule(
    db: Session,
    tenant_id: int,
    rule_id: int,
    *,
    name: Optional[str] = None,
    is_enabled: Optional[bool] = None,
    severity: Optional[str] = None,
    config_json: Optional[str] = None,
) -> PurchasingAlertRule:
    r = db.query(PurchasingAlertRule).filter(PurchasingAlertRule.id == rule_id, PurchasingAlertRule.tenant_id == tenant_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Rule not found")
    if name is not None:
        r.name = name.strip()[:256]
    if is_enabled is not None:
        r.is_enabled = bool(is_enabled)
    if severity is not None:
        if severity not in SEVERITIES:
            raise HTTPException(status_code=400, detail="Invalid severity")
        r.severity = severity
    if config_json is not None:
        try:
            json.loads(config_json)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="config_json must be valid JSON")
        r.config_json = config_json
    db.commit()
    db.refresh(r)
    return r


def list_alert_events(
    db: Session,
    *,
    tenant_id: int,
    status: Optional[str],
    severity: Optional[str],
    rule_type: Optional[str],
    limit: int = 200,
) -> List[PurchasingAlertEvent]:
    q = db.query(PurchasingAlertEvent).options(joinedload(PurchasingAlertEvent.rule)).filter(PurchasingAlertEvent.tenant_id == tenant_id)
    if status and status.strip() in EVENT_STATUSES:
        q = q.filter(PurchasingAlertEvent.status == status.strip())
    if severity and severity.strip() in SEVERITIES:
        q = q.filter(PurchasingAlertEvent.severity == severity.strip())
    if rule_type and rule_type.strip():
        rt = rule_type.strip()
        matching_rule_ids = [
            rid
            for (rid,) in db.query(PurchasingAlertRule.id)
            .filter(PurchasingAlertRule.tenant_id == tenant_id, PurchasingAlertRule.type == rt)
            .all()
        ]
        if not matching_rule_ids:
            return []
        q = q.filter(PurchasingAlertEvent.rule_id.in_(matching_rule_ids))
    sev_order = case(
        (PurchasingAlertEvent.severity == "critical", 0),
        (PurchasingAlertEvent.severity == "warning", 1),
        else_=2,
    )
    rows = q.order_by(sev_order.asc(), PurchasingAlertEvent.updated_at.desc()).limit(min(max(limit, 1), 500)).all()
    return rows


def alert_summary(db: Session, tenant_id: int) -> Dict[str, Any]:
    today0 = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow0 = today0 + timedelta(days=1)
    open_cnt = (
        db.query(func.count(PurchasingAlertEvent.id))
        .filter(PurchasingAlertEvent.tenant_id == tenant_id, PurchasingAlertEvent.status == "open")
        .scalar()
        or 0
    )
    crit_open = (
        db.query(func.count(PurchasingAlertEvent.id))
        .filter(
            PurchasingAlertEvent.tenant_id == tenant_id,
            PurchasingAlertEvent.status == "open",
            PurchasingAlertEvent.severity == "critical",
        )
        .scalar()
        or 0
    )
    resolved_today = (
        db.query(func.count(PurchasingAlertEvent.id))
        .filter(
            PurchasingAlertEvent.tenant_id == tenant_id,
            PurchasingAlertEvent.status == "resolved",
            PurchasingAlertEvent.resolved_at >= today0,
            PurchasingAlertEvent.resolved_at < tomorrow0,
        )
        .scalar()
        or 0
    )
    draft_waiting = (
        db.query(func.count(PurchaseOrder.id))
        .filter(PurchaseOrder.tenant_id == tenant_id, PurchaseOrder.status == PO_DRAFT)
        .scalar()
        or 0
    )
    return {
        "open_alerts": int(open_cnt),
        "critical_open": int(crit_open),
        "resolved_today": int(resolved_today),
        "draft_orders_waiting": int(draft_waiting),
    }


def acknowledge_event(db: Session, tenant_id: int, event_id: int) -> PurchasingAlertEvent:
    ev = db.query(PurchasingAlertEvent).filter(PurchasingAlertEvent.id == event_id, PurchasingAlertEvent.tenant_id == tenant_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Alert not found")
    if ev.status != "open":
        raise HTTPException(status_code=400, detail="Only open alerts can be acknowledged")
    ev.status = "acknowledged"
    ev.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(ev)
    return ev


def resolve_event(db: Session, tenant_id: int, event_id: int) -> PurchasingAlertEvent:
    ev = db.query(PurchasingAlertEvent).filter(PurchasingAlertEvent.id == event_id, PurchasingAlertEvent.tenant_id == tenant_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Alert not found")
    if ev.status == "resolved":
        return ev
    if ev.status not in ("open", "acknowledged"):
        raise HTTPException(status_code=400, detail="Invalid status transition")
    now = datetime.utcnow()
    ev.status = "resolved"
    ev.resolved_at = now
    ev.updated_at = now
    db.commit()
    db.refresh(ev)
    return ev


def bulk_resolve_events(db: Session, tenant_id: int, event_ids: List[int]) -> Dict[str, Any]:
    """Resolve many alerts in one transaction; skips unknown ids and already-resolved rows."""
    if not event_ids:
        return {"resolved_ids": [], "skipped_ids": []}
    uniq = list({int(x) for x in event_ids})
    now = datetime.utcnow()
    resolved: List[int] = []
    skipped: List[int] = []
    for eid in uniq:
        ev = (
            db.query(PurchasingAlertEvent)
            .filter(PurchasingAlertEvent.id == eid, PurchasingAlertEvent.tenant_id == tenant_id)
            .first()
        )
        if not ev:
            skipped.append(eid)
            continue
        if ev.status == "resolved":
            skipped.append(eid)
            continue
        if ev.status not in ("open", "acknowledged"):
            skipped.append(eid)
            continue
        ev.status = "resolved"
        ev.resolved_at = now
        ev.updated_at = now
        resolved.append(eid)
    db.commit()
    return {"resolved_ids": resolved, "skipped_ids": skipped}


def create_draft_orders_from_critical_alerts(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> Dict[str, Any]:
    q = (
        db.query(PurchasingAlertEvent)
        .filter(
            PurchasingAlertEvent.tenant_id == tenant_id,
            PurchasingAlertEvent.status == "open",
            PurchasingAlertEvent.severity == "critical",
            PurchasingAlertEvent.product_id.isnot(None),
        )
        .all()
    )
    pids: Set[int] = {int(e.product_id) for e in q if e.product_id is not None}
    if not pids:
        return {
            "purchase_order_ids": [],
            "summary": {"message": "No open critical product alerts."},
            "created_orders": [],
            "skipped_product_ids": [],
            "auto_draft_id": None,
        }

    result = create_orders_from_generator(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_ids=list(pids),
        override_qty_map=None,
    )
    po_ids: List[int] = []
    for bundle in result.get("created_orders", []):
        oid = bundle.get("order", {}).get("id")
        if oid is not None:
            po_ids.append(int(oid))

    summary = {
        "from_alert_count": len(q),
        "distinct_products": len(pids),
        "purchase_orders_created": len(po_ids),
        "skipped_product_ids": result.get("skipped_product_ids", []),
    }
    row = PurchasingAutoDraft(
        tenant_id=tenant_id,
        generated_at=datetime.utcnow(),
        purchase_order_ids_json=json.dumps(po_ids),
        summary_json=json.dumps(summary),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "purchase_order_ids": po_ids,
        "summary": summary,
        "created_orders": result.get("created_orders", []),
        "skipped_product_ids": result.get("skipped_product_ids", []),
        "auto_draft_id": row.id,
    }


def list_recent_auto_drafts(db: Session, tenant_id: int, limit: int = 10) -> List[PurchasingAutoDraft]:
    return (
        db.query(PurchasingAutoDraft)
        .filter(PurchasingAutoDraft.tenant_id == tenant_id)
        .order_by(PurchasingAutoDraft.generated_at.desc())
        .limit(min(max(limit, 1), 50))
        .all()
    )
