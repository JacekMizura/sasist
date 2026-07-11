"""
Silnik auto-reorder: filtruje produkty z generatora, stosuje score dostawcy,
pilnuje budżetu, tworzy wyłącznie szkice PO (Draft) — bez wysyłki do dostawcy.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.purchase_auto_reorder import PurchaseAutoRule, PurchaseAutoRun
from ..models.purchase_order import PurchaseOrder
from ..models.supplier import Supplier
from . import purchasing_order_service as po_svc
from .purchasing_order_service import ERR_PO_WAREHOUSE_REQUIRED
from .purchasing_forecast_service import sales_qty_by_days
from .purchasing_replenishment_service import replenishment_rows_for_export
from .purchasing_supplier_analytics_service import build_supplier_analytics

# Domyślna konfiguracja reguły (uzupełniana przez config_json z bazy)
_DEFAULT_RULE_CONFIG: Dict[str, Any] = {
    "max_budget": None,
    "only_critical_products": False,
    "exclude_dead_stock": True,
    "min_supplier_score": None,
    "target_cover_days": 14,
    "auto_group_by_supplier": True,
    "minimum_order_value_required": False,
    "warehouse_id": None,
    "only_supplier_id": None,
}


def _parse_config(raw: Optional[str]) -> Dict[str, Any]:
    """Łączy JSON z bazy z wartościami domyślnymi."""
    cfg = dict(_DEFAULT_RULE_CONFIG)
    if not raw or not str(raw).strip():
        return cfg
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            cfg.update({k: v for k, v in data.items() if k in _DEFAULT_RULE_CONFIG})
    except json.JSONDecodeError:
        pass
    return cfg


def _supplier_score_map(db: Session, tenant_id: int, range_days: int) -> Dict[int, Optional[float]]:
    """supplier_id -> score (None jeśli brak danych scorecard)."""
    payload = build_supplier_analytics(db, tenant_id=tenant_id, supplier_id=None, range_days=range_days)
    out: Dict[int, Optional[float]] = {}
    for r in payload.get("rows", []):
        sid = int(r["supplier_id"])
        sc = r.get("score")
        out[sid] = float(sc) if sc is not None else None
    return out


def _dead_stock_sales_map(
    db: Session, tenant_id: int, warehouse_id: Optional[int], lookback_days: int
) -> Dict[int, float]:
    """Sztuki sprzedane w oknie — do wykrycia martwego stoku."""
    return sales_qty_by_days(db, tenant_id, warehouse_id, int(lookback_days))


def _apply_target_cover_override(rows: List[Dict[str, Any]], target_days: float) -> Dict[int, float]:
    """Nadpisuje ilość zamówienia wg celu cover (max z sugestii generatora i wyliczenia z dni)."""
    overrides: Dict[int, float] = {}
    td = float(target_days)
    if td <= 0:
        return overrides
    for r in rows:
        pid = int(r["product_id"])
        avg = float(r.get("avg_daily_sales") or 0.0)
        stock = float(r.get("current_stock") or 0.0)
        inc = float(r.get("incoming_qty") or 0.0)
        raw = max(0.0, avg * td - stock - inc)
        base = float(r.get("suggested_qty") or 0.0)
        overrides[pid] = max(base, round(raw, 3))
    return overrides


def resolve_auto_reorder_products(
    db: Session,
    *,
    tenant_id: int,
    rule: PurchaseAutoRule,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Zwraca wiersze generatora po filtrach reguły oraz słownik statystyk (do logu).
    Nie tworzy zamówień.
    """
    cfg = _parse_config(rule.config_json)
    wh_raw = cfg.get("warehouse_id")
    warehouse_id: Optional[int] = int(wh_raw) if wh_raw is not None else None

    score_days = 90
    scores = _supplier_score_map(db, tenant_id, score_days)
    sales_map = _dead_stock_sales_map(db, tenant_id, warehouse_id, 90)

    max_budget = cfg.get("max_budget")
    max_budget_f = float(max_budget) if max_budget is not None else None
    min_score = cfg.get("min_supplier_score")
    min_score_f = float(min_score) if min_score is not None else None
    exclude_dead = bool(cfg.get("exclude_dead_stock", True))
    only_crit = bool(cfg.get("only_critical_products", False))
    mov_required = bool(cfg.get("minimum_order_value_required", False))
    target_cover = float(cfg.get("target_cover_days") or 14)
    only_supplier_raw = cfg.get("only_supplier_id")
    only_supplier_id: Optional[int] = None
    if only_supplier_raw is not None and str(only_supplier_raw).strip() != "":
        try:
            only_supplier_id = int(only_supplier_raw)
        except (TypeError, ValueError):
            only_supplier_id = None

    rows = replenishment_rows_for_export(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        search=None,
        supplier_id=None,
        category_id=None,
        critical_only=only_crit,
        low_stock_only=False,
        positive_margin_only=False,
        sort_by="estimated_order_value",
        sort_dir="desc",
        product_ids=None,
        max_rows=50_000,
    )

    stats = {
        "input_rows": len(rows),
        "after_filters": 0,
        "after_mov": 0,
        "after_budget": 0,
    }

    filtered: List[Dict[str, Any]] = []
    for r in rows:
        pid = int(r["product_id"])
        if float(r.get("suggested_qty") or 0) <= 0:
            continue
        if only_supplier_id is not None:
            sid_row = r.get("supplier_id")
            if sid_row is None or int(sid_row) != only_supplier_id:
                continue
        sid = r.get("supplier_id")
        if sid is not None and min_score_f is not None:
            sc = scores.get(int(sid))
            if sc is None or sc < min_score_f:
                continue
        if exclude_dead:
            st = float(r.get("current_stock") or 0.0)
            sold = float(sales_map.get(pid, 0.0))
            if st > 1e-6 and sold <= 1e-9:
                continue
        filtered.append(r)

    stats["after_filters"] = len(filtered)

    # Minimalna wartość zamówienia u dostawcy — odrzuć całą grupę dostawcy poniżej progu
    if mov_required and filtered:
        by_sup: Dict[int, List[Dict[str, Any]]] = {}
        for r in filtered:
            sid = r.get("supplier_id")
            if sid is None:
                continue
            by_sup.setdefault(int(sid), []).append(r)
        kept: List[Dict[str, Any]] = []
        for sid, g in by_sup.items():
            sup = db.query(Supplier).filter(Supplier.id == sid, Supplier.tenant_id == tenant_id).first()
            if sup is not None and not bool(getattr(sup, "requires_moq", True)):
                kept.extend(g)
                continue
            mov = float(sup.minimum_order_value) if sup and sup.minimum_order_value is not None else 0.0
            sub = sum(float(x.get("estimated_order_value") or 0) for x in g)
            if mov > 0 and sub + 1e-6 < mov:
                continue
            kept.extend(g)
        filtered = kept

    stats["after_mov"] = len(filtered)

    filtered.sort(key=lambda rr: (-float(rr.get("estimated_order_value") or 0), int(rr["product_id"])))

    if max_budget_f is not None and max_budget_f > 0:
        cum = 0.0
        budgeted: List[Dict[str, Any]] = []
        for r in filtered:
            ev = float(r.get("estimated_order_value") or 0)
            if cum + ev > max_budget_f + 1e-6:
                continue
            cum += ev
            budgeted.append(r)
        filtered = budgeted

    stats["after_budget"] = len(filtered)

    return filtered, {"stats": stats, "target_cover_days": target_cover}


def _execute_rule_engine(
    db: Session,
    *,
    tenant_id: int,
    rule: PurchaseAutoRule,
    dry_run: bool,
) -> Dict[str, Any]:
    """Jedna reguła: filtr → opcjonalnie szkice PO → wpis w purchase_auto_runs."""
    cfg = _parse_config(rule.config_json)
    wh_raw = cfg.get("warehouse_id")
    warehouse_id: Optional[int] = int(wh_raw) if wh_raw is not None else None
    if not dry_run and (warehouse_id is None or int(warehouse_id) <= 0):
        raise HTTPException(status_code=400, detail=ERR_PO_WAREHOUSE_REQUIRED)

    run = PurchaseAutoRun(
        tenant_id=tenant_id,
        started_at=datetime.utcnow(),
        finished_at=None,
        status="running",
        created_orders_count=0,
        skipped_products_count=0,
        log_json=json.dumps({"rule_id": rule.id, "rule_name": rule.name, "steps": []}, ensure_ascii=False),
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    log_steps: List[str] = []
    try:
        rows, meta = resolve_auto_reorder_products(db, tenant_id=tenant_id, rule=rule)
        log_steps.append(f"Po filtrach: {len(rows)} produktów z sugerowaną ilością > 0.")

        if not rows:
            run.status = "completed"
            run.finished_at = datetime.utcnow()
            run.skipped_products_count = 0
            run.created_orders_count = 0
            run.log_json = json.dumps(
                {"rule_id": rule.id, "rule_name": rule.name, "steps": log_steps, "message": "Brak produktów do zamówienia."},
                ensure_ascii=False,
            )
            db.commit()
            return {
                "run_id": run.id,
                "status": run.status,
                "created_orders_count": 0,
                "skipped_products_count": 0,
                "purchase_order_ids": [],
                "dry_run": dry_run,
                "preview_rows": [
                    {
                        "product_id": int(r["product_id"]),
                        "product_name": r.get("product_name"),
                        "suggested_qty": float(r.get("suggested_qty") or 0),
                    }
                    for r in rows
                ],
            }

        target_cover = float(cfg.get("target_cover_days") or 14)
        clean_rows = [{k: v for k, v in r.items() if not str(k).startswith("_")} for r in rows]
        override_qty = _apply_target_cover_override(clean_rows, target_cover)
        pids = [int(r["product_id"]) for r in rows]

        if dry_run:
            run.status = "completed"
            run.finished_at = datetime.utcnow()
            run.created_orders_count = 0
            run.skipped_products_count = 0
            log_steps.append("Dry-run: pominięto tworzenie PO.")
            run.log_json = json.dumps(
                {"rule_id": rule.id, "rule_name": rule.name, "steps": log_steps, "meta": meta, "product_ids": pids},
                ensure_ascii=False,
            )
            db.commit()
            return {
                "run_id": run.id,
                "status": run.status,
                "created_orders_count": 0,
                "skipped_products_count": 0,
                "purchase_order_ids": [],
                "dry_run": True,
                "preview_rows": [
                    {
                        "product_id": int(r["product_id"]),
                        "suggested_qty": override_qty.get(int(r["product_id"]), float(r.get("suggested_qty") or 0)),
                        "supplier_name": r.get("supplier_name"),
                        "estimated_order_value": r.get("estimated_order_value"),
                    }
                    for r in rows
                ],
            }

        result = po_svc.create_orders_from_generator(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            product_ids=pids,
            override_qty_map=override_qty,
        )
        po_ids: List[int] = []
        for bundle in result.get("created_orders", []):
            oid = bundle.get("order", {}).get("id")
            if oid is not None:
                po_ids.append(int(oid))
        skipped = len(result.get("skipped_product_ids", []))

        run.status = "completed"
        run.finished_at = datetime.utcnow()
        run.created_orders_count = len(po_ids)
        run.skipped_products_count = int(skipped)
        log_steps.append(f"Utworzono szkiców PO: {len(po_ids)}, pominiętych produktów: {skipped}.")
        run.log_json = json.dumps(
            {
                "rule_id": rule.id,
                "rule_name": rule.name,
                "steps": log_steps,
                "purchase_order_ids": po_ids,
                "skipped_product_ids": result.get("skipped_product_ids", []),
                "meta": meta,
            },
            ensure_ascii=False,
        )
        db.commit()
        return {
            "run_id": run.id,
            "status": run.status,
            "created_orders_count": len(po_ids),
            "skipped_products_count": skipped,
            "purchase_order_ids": po_ids,
            "dry_run": False,
            "preview_rows": [],
        }
    except HTTPException:
        run.status = "failed"
        run.finished_at = datetime.utcnow()
        run.log_json = json.dumps({"rule_id": rule.id, "rule_name": rule.name, "steps": log_steps}, ensure_ascii=False)
        db.commit()
        raise
    except Exception as exc:  # noqa: BLE001 — logujemy dowolny błąd silnika
        run.status = "failed"
        run.finished_at = datetime.utcnow()
        log_steps.append(f"Błąd: {exc!s}")
        run.log_json = json.dumps({"rule_id": rule.id, "rule_name": rule.name, "steps": log_steps, "error": str(exc)}, ensure_ascii=False)
        db.commit()
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def list_rules(db: Session, tenant_id: int) -> List[PurchaseAutoRule]:
    return (
        db.query(PurchaseAutoRule)
        .filter(PurchaseAutoRule.tenant_id == tenant_id)
        .order_by(PurchaseAutoRule.created_at.desc())
        .all()
    )


def create_rule(
    db: Session,
    *,
    tenant_id: int,
    name: str,
    is_enabled: bool,
    run_time: str,
    weekdays_json: str,
    config_json: str,
) -> PurchaseAutoRule:
    try:
        json.loads(weekdays_json or "[]")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="weekdays_json musi być poprawnym JSON")
    try:
        json.loads(config_json or "{}")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="config_json musi być poprawnym JSON")
    r = PurchaseAutoRule(
        tenant_id=tenant_id,
        name=name.strip()[:256],
        is_enabled=bool(is_enabled),
        run_time=(run_time or "07:00").strip()[:8],
        weekdays_json=weekdays_json or "[1,2,3,4,5]",
        config_json=config_json or "{}",
        created_at=datetime.utcnow(),
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


def patch_rule(
    db: Session,
    tenant_id: int,
    rule_id: int,
    *,
    name: Optional[str] = None,
    is_enabled: Optional[bool] = None,
    run_time: Optional[str] = None,
    weekdays_json: Optional[str] = None,
    config_json: Optional[str] = None,
) -> PurchaseAutoRule:
    r = db.query(PurchaseAutoRule).filter(PurchaseAutoRule.id == rule_id, PurchaseAutoRule.tenant_id == tenant_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Reguła nie istnieje")
    if name is not None:
        r.name = name.strip()[:256]
    if is_enabled is not None:
        r.is_enabled = bool(is_enabled)
    if run_time is not None:
        r.run_time = run_time.strip()[:8]
    if weekdays_json is not None:
        try:
            json.loads(weekdays_json)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="weekdays_json musi być poprawnym JSON")
        r.weekdays_json = weekdays_json
    if config_json is not None:
        try:
            json.loads(config_json)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="config_json musi być poprawnym JSON")
        r.config_json = config_json
    db.commit()
    db.refresh(r)
    return r


def delete_rule(db: Session, tenant_id: int, rule_id: int) -> None:
    r = db.query(PurchaseAutoRule).filter(PurchaseAutoRule.id == rule_id, PurchaseAutoRule.tenant_id == tenant_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Reguła nie istnieje")
    db.delete(r)
    db.commit()


def list_runs(db: Session, tenant_id: int, limit: int = 50) -> List[PurchaseAutoRun]:
    lim = min(max(int(limit), 1), 200)
    return (
        db.query(PurchaseAutoRun)
        .filter(PurchaseAutoRun.tenant_id == tenant_id)
        .order_by(PurchaseAutoRun.started_at.desc())
        .limit(lim)
        .all()
    )


def count_draft_pos_created_today(db: Session, tenant_id: int) -> int:
    """Liczba szkiców PO utworzonych dzisiaj (dowolnego pochodzenia)."""
    t0 = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    t1 = t0 + timedelta(days=1)
    n = (
        db.query(PurchaseOrder)
        .filter(
            PurchaseOrder.tenant_id == tenant_id,
            PurchaseOrder.status == po_svc.PO_DRAFT,
            PurchaseOrder.created_at >= t0,
            PurchaseOrder.created_at < t1,
        )
        .count()
    )
    return int(n or 0)


def build_kpis(db: Session, tenant_id: int) -> Dict[str, Any]:
    """Karty KPI na pulpicie auto-reorder."""
    active = (
        db.query(PurchaseAutoRule)
        .filter(PurchaseAutoRule.tenant_id == tenant_id, PurchaseAutoRule.is_enabled.is_(True))
        .count()
    )
    last = (
        db.query(PurchaseAutoRun)
        .filter(
            PurchaseAutoRun.tenant_id == tenant_id,
            PurchaseAutoRun.status == "completed",
            PurchaseAutoRun.finished_at.isnot(None),
        )
        .order_by(PurchaseAutoRun.finished_at.desc())
        .first()
    )
    last_iso = None
    if last and last.finished_at:
        last_iso = last.finished_at.isoformat()
    drafts_today = count_draft_pos_created_today(db, tenant_id)
    today_runs = (
        db.query(PurchaseAutoRun)
        .filter(
            PurchaseAutoRun.tenant_id == tenant_id,
            PurchaseAutoRun.status == "completed",
            PurchaseAutoRun.finished_at.isnot(None),
            PurchaseAutoRun.finished_at >= datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0),
        )
        .all()
    )
    orders_today = sum(int(r.created_orders_count or 0) for r in today_runs)
    time_saved_minutes = int(orders_today * 15)

    return {
        "active_rules": int(active or 0),
        "last_run_finished_at": last_iso,
        "drafts_created_today": drafts_today,
        "time_saved_minutes_heuristic": time_saved_minutes,
    }


def run_auto_reorder_now(
    db: Session,
    *,
    tenant_id: int,
    rule_id: Optional[int],
    dry_run: bool,
) -> Dict[str, Any]:
    """Uruchamia jedną regułę (rule_id) lub wszystkie włączone po kolei."""
    if rule_id is not None:
        rule = db.query(PurchaseAutoRule).filter(PurchaseAutoRule.id == int(rule_id), PurchaseAutoRule.tenant_id == tenant_id).first()
        if not rule:
            raise HTTPException(status_code=404, detail="Reguła nie istnieje")
        if not rule.is_enabled and not dry_run:
            raise HTTPException(status_code=400, detail="Reguła jest wyłączona — włącz ją lub uruchom z dry_run=true (podgląd).")
        out = _execute_rule_engine(db, tenant_id=tenant_id, rule=rule, dry_run=dry_run)
        return {"batch": False, "results": [out]}

    rules = (
        db.query(PurchaseAutoRule)
        .filter(PurchaseAutoRule.tenant_id == tenant_id, PurchaseAutoRule.is_enabled.is_(True))
        .order_by(PurchaseAutoRule.id.asc())
        .all()
    )
    if not rules:
        raise HTTPException(status_code=400, detail="Brak aktywnych reguł.")
    results: List[Dict[str, Any]] = []
    for rule in rules:
        results.append(_execute_rule_engine(db, tenant_id=tenant_id, rule=rule, dry_run=dry_run))
    return {"batch": True, "results": results}


def preview_rule(db: Session, *, tenant_id: int, rule_id: int) -> Dict[str, Any]:
    rule = db.query(PurchaseAutoRule).filter(PurchaseAutoRule.id == rule_id, PurchaseAutoRule.tenant_id == tenant_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Reguła nie istnieje")
    rows, meta = resolve_auto_reorder_products(db, tenant_id=tenant_id, rule=rule)
    cfg = _parse_config(rule.config_json)
    target_cover = float(cfg.get("target_cover_days") or 14)
    clean_rows = [{k: v for k, v in r.items() if not str(k).startswith("_")} for r in rows]
    override_qty = _apply_target_cover_override(clean_rows, target_cover)
    preview = []
    for r in rows:
        pid = int(r["product_id"])
        preview.append(
            {
                "product_id": pid,
                "name": r.get("product_name"),
                "sku": r.get("sku"),
                "supplier_name": r.get("supplier_name"),
                "suggested_qty": override_qty.get(pid, float(r.get("suggested_qty") or 0)),
                "estimated_order_value": r.get("estimated_order_value"),
            }
        )
    return {"rule_id": rule.id, "rule_name": rule.name, "count": len(preview), "rows": preview, "meta": meta}
