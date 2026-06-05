"""Tworzenie i obsługa zadań Order Issues (braki przy zbieraniu)."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Literal

from sqlalchemy import and_, delete, func, or_
from sqlalchemy.orm import Session, joinedload

from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.order_issue_task import OrderIssueTask
from ..models.product import Product
from ..services.fulfillment_event_service import line_picked_sum_for_order
from ..services.wms_packing_service import _primary_location_for_product

logger = logging.getLogger(__name__)


def _location_label_for_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    product: Product | None = None,
) -> str:
    """Etykieta lokalizacji magazynowej (helper — ``_primary_location_for_product`` zwraca 3 wartości)."""
    loc, _bin_qty, _storage_hint = _primary_location_for_product(
        db, int(tenant_id), int(warehouse_id), int(product_id)
    )
    legacy_loc = getattr(product, "location", None) if product is not None else None
    return (str(loc).strip() if loc else "") or (
        str(legacy_loc).strip() if legacy_loc and str(legacy_loc).strip() else ""
    )


OrderIssueTaskType = Literal[
    "RETURN_TO_STOCK",
    "READY_FOR_PACKING",
    "REQUIRES_PICKING",
    "WAITING_FOR_STOCK",
    "MIXED",
]

"""Ekran decyzyjny operatora (Braki) — kolejność warunków jak w specyfikacji UI."""
def purge_stale_open_order_issue_tasks(db: Session, *, tenant_id: int, warehouse_id: int) -> int:
    """
    Usuwa OPEN ``OrderIssueTask`` wskazujące na usunięte lub zarchiwizowane (``deleted_at``) zamówienia.
    """
    rows = (
        db.query(OrderIssueTask.id)
        .outerjoin(Order, Order.id == OrderIssueTask.order_id)
        .filter(
            OrderIssueTask.tenant_id == int(tenant_id),
            OrderIssueTask.warehouse_id == int(warehouse_id),
            OrderIssueTask.status == "OPEN",
            or_(Order.id.is_(None), Order.deleted_at.isnot(None)),
        )
        .all()
    )
    ids = [int(r[0]) for r in rows if r[0] is not None]
    if not ids:
        return 0
    db.execute(delete(OrderIssueTask).where(OrderIssueTask.id.in_(ids)))
    db.flush()
    return len(ids)


UiDecisionKind = Literal[
    "CANCELLED_RETURN",
    "READY_PACK",
    "NEW_PRODUCT",
    "ALL_MISSING",
    "PARTIAL",
]

def _append_log(task: OrderIssueTask, message: str, kind: str) -> None:
    try:
        arr = json.loads(task.logs_json or "[]")
    except json.JSONDecodeError:
        arr = []
    if not isinstance(arr, list):
        arr = []
    arr.append(
        {
            "at": datetime.utcnow().isoformat() + "Z",
            "message": message,
            "kind": kind,
        }
    )
    task.logs_json = json.dumps(arr, ensure_ascii=False)


def build_full_issue_payload_for_order(
    db: Session,
    *,
    order: Order,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, float]]:
    """
    missing_items, picked_items, baseline {order_item_id: quantity}.
    Wszystkie linie z ``compute_line_missing_qty`` > 0 — ta sama logika co kolejka / OMS (nie tylko jeden SKU).
    """
    from ..services.order_fulfillment_recompute import compute_line_missing_qty

    missing: list[dict[str, Any]] = []
    picked: list[dict[str, Any]] = []
    baseline: dict[str, float] = {}

    ois = sorted(order.items or [], key=lambda x: int(x.id))
    for oi in ois:
        oid = int(oi.id)
        pid = int(oi.product_id)
        baseline[str(oid)] = float(oi.quantity or 0)
        ps = line_picked_sum_for_order(db, oid, order)
        pr = db.query(Product).filter(Product.id == pid).first()
        sku = (pr.symbol if pr and pr.symbol else "") or ""
        ean = (pr.ean if pr else None) or ""
        row_picked = {
            "order_item_id": oid,
            "product_id": pid,
            "sku": str(sku).strip(),
            "ean": str(ean).strip() if ean else "",
            "quantity_picked": round(ps, 6),
        }
        picked.append(row_picked)
        mq = compute_line_missing_qty(db, order, oi)
        if mq > 1e-9:
            missing.append(
                {
                    "order_item_id": oid,
                    "product_id": pid,
                    "sku": str(sku).strip(),
                    "ean": str(ean).strip() if ean else "",
                    "quantity_missing": round(mq, 6),
                }
            )

    return missing, picked, baseline


def upsert_order_issue_tasks_from_shortage(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_ids: list[int],
    shortage_product_id: int,
) -> list[int]:
    """
    Dla każdego zamówienia: jedno otwarte zadanie (OPEN) — aktualizacja snapshotów przy ponownym braku.
    Picki nie są kasowane; snapshoty odzwierciedlają bieżący stan zdarzeń realizacji + OrderItem.
    """
    if not order_ids:
        return []
    orders = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(
            Order.id.in_(list(dict.fromkeys(order_ids))),
            Order.deleted_at.is_(None),
        )
        .all()
    )
    created_or_updated: list[int] = []
    for order in orders:
        missing, picked, baseline = build_full_issue_payload_for_order(db, order=order)
        existing = (
            db.query(OrderIssueTask)
            .filter(
                OrderIssueTask.order_id == int(order.id),
                OrderIssueTask.status == "OPEN",
            )
            .order_by(OrderIssueTask.id.desc())
            .first()
        )
        now = datetime.utcnow()
        payload_missing = json.dumps(missing, ensure_ascii=False)
        payload_picked = json.dumps(picked, ensure_ascii=False)
        payload_base = json.dumps(baseline, ensure_ascii=False)

        if existing:
            existing.type = "MIXED"
            existing.missing_items = payload_missing
            existing.picked_items = payload_picked
            existing.baseline_order_lines_json = payload_base
            existing.updated_at = now
            _append_log(
                existing,
                f"Zaktualizowano braki (ponowne zgłoszenie, SKU #{int(shortage_product_id)})",
                "shortage_reported",
            )
            created_or_updated.append(int(existing.id))
        else:
            t = OrderIssueTask(
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                order_id=int(order.id),
                type="MIXED",
                status="OPEN",
                missing_items=payload_missing,
                picked_items=payload_picked,
                baseline_order_lines_json=payload_base,
                logs_json="[]",
                created_at=now,
                updated_at=now,
            )
            db.add(t)
            db.flush()
            _append_log(t, "Utworzono zadanie po zgłoszeniu braku przy zbieraniu", "shortage_reported")
            created_or_updated.append(int(t.id))

    return created_or_updated


def _total_picked_qty(picked_items: list[dict[str, Any]]) -> float:
    s = 0.0
    for p in picked_items:
        if not isinstance(p, dict):
            continue
        try:
            s += float(p.get("quantity_picked") or 0)
        except (TypeError, ValueError):
            continue
    return s


def _total_missing_qty(missing_items: list[dict[str, Any]]) -> float:
    s = 0.0
    for m in missing_items:
        try:
            s += float(m.get("quantity_missing") or m.get("quantity") or 0)
        except (TypeError, ValueError):
            continue
    return s


def build_new_product_hints(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    baseline: dict[str, float],
) -> list[dict[str, Any]]:
    """Nowe linie vs snapshot baseline — SKU + pierwsza lokalizacja (magazyn)."""
    out: list[dict[str, Any]] = []
    for oi in order.items or []:
        oid = str(int(oi.id))
        cur = float(oi.quantity or 0)
        base = float(baseline.get(oid, 0.0))
        if cur <= base + 1e-9:
            continue
        pid = int(oi.product_id)
        pr = db.query(Product).filter(Product.id == pid).first()
        sku = ""
        ean = ""
        if pr:
            sku = str(getattr(pr, "symbol", None) or getattr(pr, "sku", None) or "").strip()
            ean = str(getattr(pr, "ean", None) or "").strip()
        loc_s = _location_label_for_product(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            product_id=pid,
            product=pr,
        )
        out.append(
            {
                "product_id": pid,
                "order_item_id": int(oi.id),
                "sku": sku or (f"#{pid}"),
                "ean": ean,
                "location_code": loc_s,
            }
        )
    return out


def find_order_by_scan(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    scan: str,
) -> Order | None:
    raw = (scan or "").strip()
    if not raw:
        return None
    q = db.query(Order).filter(
        Order.tenant_id == int(tenant_id),
        Order.warehouse_id == int(warehouse_id),
    )
    low = raw.lower()
    o = q.filter(or_(Order.barcode == raw, func.lower(Order.scan_code) == low)).first()
    if o:
        return o
    n = raw.lstrip("#").strip()
    for candidate in (raw, n, f"#{n}"):
        if not candidate:
            continue
        o = q.filter(Order.number == candidate).first()
        if o:
            return o
    o = q.filter(func.lower(Order.number) == n.lower()).first()
    if o:
        return o
    return None


def compute_ui_decision(
    db: Session,
    *,
    task: OrderIssueTask,
    order: Order | None,
) -> tuple[UiDecisionKind, list[dict[str, Any]]]:
    """
    Logika ekranu decyzyjnego (bez tabeli): anulowane → brak → nowe linie → wszystko brak → częściowo.
    """
    try:
        missing = json.loads(task.missing_items or "[]")
    except json.JSONDecodeError:
        missing = []
    try:
        picked = json.loads(task.picked_items or "[]")
    except json.JSONDecodeError:
        picked = []
    try:
        baseline = json.loads(task.baseline_order_lines_json or "{}")
    except json.JSONDecodeError:
        baseline = {}

    if not isinstance(missing, list):
        missing = []
    if not isinstance(picked, list):
        picked = []
    if not isinstance(baseline, dict):
        baseline = {}

    st = (order.status or "").strip().upper() if order else ""
    picked_total = _total_picked_qty(picked)

    if st == "CANCELLED" and picked_total > 1e-9:
        return "CANCELLED_RETURN", []

    if _total_missing_qty(missing) <= 1e-9:
        return "READY_PACK", []

    # Pusty baseline (np. legacy) — nie wnioskuj „nowy produkt” z porównania do {}.
    if (
        order
        and isinstance(baseline, dict)
        and len(baseline) > 0
        and _has_new_items_vs_baseline(db, order, baseline)
    ):
        hints = build_new_product_hints(
            db,
            tenant_id=int(task.tenant_id),
            warehouse_id=int(task.warehouse_id),
            order=order,
            baseline=baseline,
        )
        return "NEW_PRODUCT", hints

    if picked_total <= 1e-9 and _total_missing_qty(missing) > 1e-9:
        return "ALL_MISSING", []

    return "PARTIAL", []


def _has_new_items_vs_baseline(db: Session, order: Order, baseline: dict[str, float]) -> bool:
    for oi in order.items or []:
        oid = str(int(oi.id))
        cur = float(oi.quantity or 0)
        base = float(baseline.get(oid, 0.0))
        if cur > base + 1e-9:
            return True
    return False


def compute_recommended_action(
    db: Session,
    *,
    task: OrderIssueTask,
    order: Order | None,
) -> OrderIssueTaskType:
    """Logika z specyfikacji (dla UI / przycisków)."""
    try:
        missing = json.loads(task.missing_items or "[]")
    except json.JSONDecodeError:
        missing = []
    try:
        picked = json.loads(task.picked_items or "[]")
    except json.JSONDecodeError:
        picked = []
    try:
        baseline = json.loads(task.baseline_order_lines_json or "{}")
    except json.JSONDecodeError:
        baseline = {}

    if not isinstance(missing, list):
        missing = []
    if not isinstance(picked, list):
        picked = []
    if not isinstance(baseline, dict):
        baseline = {}

    st = (order.status or "").strip().upper() if order else ""
    picked_total_rec = _total_picked_qty(picked)
    if st == "CANCELLED" and picked_total_rec > 1e-9:
        return "RETURN_TO_STOCK"

    if _total_missing_qty(missing) <= 1e-9:
        return "READY_FOR_PACKING"

    if (
        order
        and isinstance(baseline, dict)
        and len(baseline) > 0
        and _has_new_items_vs_baseline(db, order, baseline)
    ):
        return "REQUIRES_PICKING"

    return "WAITING_FOR_STOCK"


def list_open_tasks_for_warehouse(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> list[OrderIssueTask]:
    return (
        db.query(OrderIssueTask)
        .join(Order, Order.id == OrderIssueTask.order_id)
        .filter(
            OrderIssueTask.tenant_id == int(tenant_id),
            OrderIssueTask.warehouse_id == int(warehouse_id),
            OrderIssueTask.status == "OPEN",
            Order.deleted_at.is_(None),
        )
        .order_by(OrderIssueTask.created_at.desc())
        .all()
    )


def order_customer_display_name(order: Order | None) -> str:
    if order is None:
        return "—"
    from .braki_order_state_service import build_order_issue_customer_fields

    return build_order_issue_customer_fields(order).get("customer_name") or "—"


def count_issue_queue_operational_lines(db: Session, order: Order) -> tuple[int, int]:
    """Delegacja do ``braki_order_state_service`` (awaiting OMS + braki operacyjne)."""
    from .braki_order_state_service import count_issue_queue_operational_lines as _central

    return _central(db, order)


def first_pending_substitute_product(db: Session, order: Order) -> tuple[int, str]:
    """Pierwszy zamiennik z niepełnym zbiorem — do karty kolejki i nawigacji do zbierania."""
    from .order_fulfillment_recompute import order_item_needs_substitute_pick_completion

    for oi in sorted(order.items or [], key=lambda x: int(x.id)):
        if not order_item_needs_substitute_pick_completion(db, order, oi):
            continue
        pid = int(oi.product_id)
        pr = db.query(Product).filter(Product.id == pid).first()
        name = (pr.name if pr and pr.name else "") or f"Produkt #{pid}"
        return pid, str(name).strip()
    return 0, ""


def _pl_produkty_word(n: int) -> str:
    n = abs(int(n))
    if n == 1:
        return "produkt"
    mod100 = n % 100
    if 12 <= mod100 <= 14:
        return "produktów"
    mod10 = n % 10
    if mod10 in (2, 3, 4):
        return "produkty"
    return "produktów"


def format_issue_queue_summary_line(unresolved: int, repl_pending: int) -> str:
    parts: list[str] = []
    if repl_pending > 0:
        parts.append(f"{repl_pending} {_pl_produkty_word(repl_pending)} do zebrania")
    if unresolved > 0:
        if unresolved == 1:
            parts.append("1 produkt z nierozwiązanym brakiem")
        else:
            parts.append(f"{unresolved} {_pl_produkty_word(unresolved)} z brakami")
    return " · ".join(parts) if parts else "Brak aktywnej pracy w kolejce"


def format_braki_issue_summary_line(
    workflow_status: str,
    *,
    unresolved: int,
    repl_pending: int,
    oms_waiting: bool = False,
) -> str:
    """Komunikat pod nagłówkiem kolejki — zgodny z ``braki_workflow_status``, nie generyczny."""
    from .braki_workflow_service import (
        BRAKI_FILTER_AWAITING,
        BRAKI_FILTER_PICK,
        BRAKI_FILTER_PICK_AND_RELOCATION,
        BRAKI_FILTER_READY_PACK,
        BRAKI_FILTER_RELOCATION,
        BRAKI_FILTER_RELOCATION_PARTIAL,
    )

    ws = str(workflow_status or "").strip()
    if ws == BRAKI_FILTER_READY_PACK:
        return "Zamówienie gotowe do pakowania"
    if ws == BRAKI_FILTER_AWAITING:
        return "Oczekuje na decyzję OMS"
    if ws == BRAKI_FILTER_PICK:
        if repl_pending > 0 and unresolved <= 0:
            return "Oczekujące produkty do zebrania"
        if repl_pending > 0:
            return "Oczekujące produkty do zebrania"
        return format_issue_queue_summary_line(unresolved, repl_pending) or "Produkty do zebrania z magazynu"
    if ws in (BRAKI_FILTER_RELOCATION, BRAKI_FILTER_RELOCATION_PARTIAL):
        return "Wymagane rozlokowanie zebranych pozycji"
    if ws == BRAKI_FILTER_PICK_AND_RELOCATION:
        parts = [format_issue_queue_summary_line(unresolved, repl_pending)]
        parts.append("oraz rozlokowanie")
        return " · ".join(p for p in parts if p)
    line = format_issue_queue_summary_line(unresolved, repl_pending)
    return line if line else "Brak aktywnej pracy w kolejce"


def format_issue_queue_status_label(unresolved: int, repl_pending: int) -> str:
    if unresolved > 0 and repl_pending > 0:
        return "Decyzja OMS i produkty do zebrania"
    if unresolved > 0:
        return "Wymaga decyzji OMS"
    if repl_pending > 0:
        return "Produkty do zebrania"
    return "Gotowe do zamknięcia"


def _issue_detail_oms_action_summary(
    db: Session,
    order: Order,
    oi: OrderItem,
    *,
    missing: float,
    waiting: bool,
) -> str:
    from ..models.order_item import OMS_LINE_STATUS_REPLACED, order_item_is_replaced_line
    from ..services.order_fulfillment_recompute import oms_line_secondary_trace_text

    if missing > 1e-6:
        return "Wymaga decyzji OMS"
    if waiting:
        return "Oznaczono: czeka na towar"
    if order_item_is_replaced_line(oi):
        trace = oms_line_secondary_trace_text(db, order, oi)
        return trace or "Zamieniono na inny produkt"
    rep_oid = getattr(oi, "replaced_from_order_item_id", None)
    if rep_oid is not None and int(rep_oid) > 0:
        old = (getattr(oi, "replaced_from_product_name", None) or "").strip()
        return f"Produkt zastępczy za {old}" if old else "Produkt zastępczy"
    declared = float(getattr(oi, "wms_shortage_declared_qty", None) or 0.0)
    if declared > 1e-9 and float(oi.quantity or 0) <= 1e-9:
        return "Usunięto z zamówienia (brak magazynowy)"
    if declared > 1e-9:
        return "Rozwiązano w OMS"
    ols = (getattr(oi, "oms_line_status", None) or "").strip().upper()
    if ols == OMS_LINE_STATUS_REPLACED:
        return "Zarchiwizowano po zamianie"
    return ""


def _classify_issue_detail_section(
    *,
    ordered: float,
    picked: float,
    missing: float,
    waiting: bool,
    ols: str,
    declared: float,
    needs_substitute_pick: bool,
) -> tuple[str | None, str, str]:
    """
    Sekcja operacyjna dla magazynu (ekran szczegółów Braki WMS).

    Zwraca ``None`` gdy linia to wyłącznie historia/OMS (usunięte, czeka na decyzję, brak nierozwiązany).
    Inaczej: ``collected`` | ``remaining`` (zamiennik lub do zebrania).
    """
    from ..models.order_item import OMS_LINE_STATUS_REPLACED, OMS_LINE_STATUS_TO_PICK

    ols_u = (ols or "").strip().upper()

    if needs_substitute_pick:
        return "remaining", "substitute", "PRODUKT ZASTĘPCZY"
    if ols_u == OMS_LINE_STATUS_TO_PICK and ordered > 1e-6 and picked + 1e-6 < ordered:
        return "remaining", "to_pick", "Do zebrania"
    if ordered > 1e-6 and picked + 1e-6 < ordered and missing <= 1e-6:
        return "remaining", "to_pick", "Do zebrania"
    if missing > 1e-6 and not waiting and ordered > 1e-6 and picked + 1e-6 < ordered:
        return "remaining", "to_pick", "Do zebrania"

    if missing > 1e-6 or waiting:
        return None, "", ""
    if ols_u == OMS_LINE_STATUS_REPLACED:
        return None, "", ""
    if ordered <= 1e-6 and (declared > 1e-6 or picked <= 1e-6):
        return None, "", ""

    if picked > 1e-6 or (ordered > 1e-6 and picked + 1e-6 >= ordered):
        return "collected", "collected", "Zebrano"

    return None, "", ""


def _issue_detail_include_line(
    oi: OrderItem,
    *,
    ordered: float,
    picked: float,
    declared: float,
    ols: str,
) -> bool:
    from ..models.order_item import OMS_LINE_STATUS_REPLACED

    if ordered > 1e-6:
        return True
    if picked > 1e-6:
        return True
    if declared > 1e-6:
        return True
    if (ols or "").strip().upper() == OMS_LINE_STATUS_REPLACED:
        return True
    rep_oid = getattr(oi, "replaced_from_order_item_id", None)
    if rep_oid is not None and int(rep_oid) > 0:
        return True
    if getattr(oi, "is_bundle_parent", False):
        return True
    return False


def build_order_issue_detail_context(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
) -> dict[str, list[dict[str, Any]]]:
    """
    Kontekst operacyjny zamówienia dla magazynu (szczegóły Braki WMS):
    zebrane + pozostałe do zbierania (bez historii decyzji OMS).
    """
    from ..services.fulfillment_event_service import picked_location_breakdown_for_order_line
    from ..services.order_fulfillment_recompute import (
        compute_line_missing_qty,
        line_shortage_display_kind,
        order_item_needs_substitute_pick_completion,
    )
    from ..services.wms_audit_service import last_pick_audit_summaries_for_order_lines

    collected: list[dict[str, Any]] = []
    remaining_pick: list[dict[str, Any]] = []

    items = sorted(order.items or [], key=lambda x: int(x.id))
    oi_ids = [int(it.id) for it in items]
    pick_summaries = last_pick_audit_summaries_for_order_lines(db, int(order.id), oi_ids)

    for oi in items:
        if getattr(oi, "parent_bundle_order_item_id", None) is not None:
            continue
        pid = int(oi.product_id)
        pr = db.query(Product).filter(Product.id == pid).first()
        ordered = float(oi.quantity or 0)
        picked = float(line_picked_sum_for_order(db, int(oi.id), order))
        missing = float(compute_line_missing_qty(db, order, oi))
        declared = float(getattr(oi, "wms_shortage_declared_qty", None) or 0.0)
        ols = (getattr(oi, "oms_line_status", None) or "").strip()
        meta_raw = getattr(oi, "metadata_json", None) or ""
        waiting = False
        if str(meta_raw).strip():
            try:
                md = json.loads(meta_raw)
                if isinstance(md, dict) and md.get("oms_waiting_for_stock") is True:
                    waiting = True
            except json.JSONDecodeError:
                waiting = False
        if not _issue_detail_include_line(oi, ordered=ordered, picked=picked, declared=declared, ols=ols):
            continue
        needs_sub = order_item_needs_substitute_pick_completion(db, order, oi)
        section, line_kind, badge = _classify_issue_detail_section(
            ordered=ordered,
            picked=picked,
            missing=missing,
            waiting=waiting,
            ols=ols,
            declared=declared,
            needs_substitute_pick=needs_sub,
        )
        if section is None:
            continue
        substitute_for = ""
        rep_oid = getattr(oi, "replaced_from_order_item_id", None)
        if rep_oid is not None and int(rep_oid) > 0:
            substitute_for = (getattr(oi, "replaced_from_product_name", None) or "").strip()
        if section == "remaining":
            from .wms_operational_task_service import _line_remaining_qty

            remaining_qty = float(_line_remaining_qty(db, order, oi))
        else:
            remaining_qty = 0.0
        name = (pr.name if pr and pr.name else "") or f"Produkt #{pid}"
        img: str | None = None
        if pr and pr.image_url and str(pr.image_url).strip():
            img = str(pr.image_url).strip()
        sku = ""
        ean = ""
        if pr:
            sku = str(getattr(pr, "symbol", None) or getattr(pr, "sku", None) or "").strip()
            ean = str(getattr(pr, "ean", None) or "").strip()
        picked_locs: list[dict[str, Any]] = []
        for lbl, qv, batch, exp_iso in picked_location_breakdown_for_order_line(db, order, int(oi.id)):
            picked_locs.append(
                {
                    "location_label": lbl,
                    "quantity": round(float(qv), 6),
                    "batch_number": batch or None,
                    "expiry_date": exp_iso,
                }
            )
        row = {
            "order_item_id": int(oi.id),
            "product_id": pid,
            "product_name": name,
            "image_url": img,
            "ordered_qty": round(ordered, 6),
            "picked_qty": round(picked, 6),
            "missing_qty": round(missing, 6),
            "location_code": "",
            "oms_action_summary": "",
            "sku": sku,
            "ean": ean,
            "line_kind": line_kind,
            "badge_label": badge,
            "shortage_display_kind": line_shortage_display_kind(oi, missing),
            "oms_line_status": ols or None,
            "pick_audit_summary": pick_summaries.get(int(oi.id)),
            "picked_locations": picked_locs,
            "substitute_for_product_name": substitute_for or None,
            "remaining_qty": remaining_qty,
        }
        from .braki_order_state_service import enrich_shortage_line_location_fields

        enrich_shortage_line_location_fields(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=int(order.id),
            product_id=pid,
            row=row,
        )
        if section == "collected":
            collected.append(row)
        else:
            remaining_pick.append(row)

    return {
        "collected_lines": collected,
        "shortage_decision_lines": [],
        "remaining_pick_lines": remaining_pick,
    }


def build_shortage_lines_for_order(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
) -> list[dict[str, Any]]:
    """
    Linie z operacyjnym brakiem (to samo przeliczenie co OMS / ``wms-fulfillment``). Tylko ``missing_qty > 0``.
    ``image_url`` z produktu; lokalizacja — pierwsza wg stanu w magazynie.
    """
    from ..services.order_fulfillment_recompute import compute_line_missing_qty
    from ..services.wms_audit_service import last_pick_audit_summaries_for_order_lines

    out: list[dict[str, Any]] = []
    items = sorted(order.items or [], key=lambda x: int(x.id))
    oi_ids = [int(it.id) for it in items]
    pick_summaries = last_pick_audit_summaries_for_order_lines(db, int(order.id), oi_ids)
    from .braki_order_state_service import order_line_awaiting_oms_attention

    for oi in items:
        pid = int(oi.product_id)
        pr = db.query(Product).filter(Product.id == pid).first()
        ordered = float(oi.quantity or 0)
        pq = float(line_picked_sum_for_order(db, int(oi.id), order))
        missing = float(compute_line_missing_qty(db, order, oi))
        if missing <= 1e-9 and not order_line_awaiting_oms_attention(db, order, oi):
            continue
        display_missing = missing if missing > 1e-9 else max(
            float(getattr(oi, "wms_shortage_declared_qty", None) or 0.0), 1.0
        )
        name = (pr.name if pr and pr.name else "") or f"Produkt #{pid}"
        img: str | None = None
        if pr and pr.image_url and str(pr.image_url).strip():
            img = str(pr.image_url).strip()
        sku = ""
        ean = ""
        if pr:
            sku = str(getattr(pr, "symbol", None) or getattr(pr, "sku", None) or "").strip()
            ean = str(getattr(pr, "ean", None) or "").strip()
        row_out = {
            "order_item_id": int(oi.id),
            "product_id": pid,
            "product_name": name,
            "image_url": img,
            "ordered_qty": round(ordered, 6),
            "picked_qty": round(pq, 6),
            "missing_qty": round(display_missing, 6),
            "remaining_qty": round(display_missing, 6),
            "location_code": "",
            "sku": sku,
            "ean": ean,
            "line_kind": "shortage_unresolved",
            "badge_label": (
                "Oczekuje na decyzję OMS"
                if missing <= 1e-9 and order_line_awaiting_oms_attention(db, order, oi)
                else "Do zebrania"
            ),
            "pick_audit_summary": pick_summaries.get(int(oi.id)),
        }
        from .braki_order_state_service import enrich_shortage_line_location_fields

        out.append(
            enrich_shortage_line_location_fields(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                order_id=int(order.id),
                product_id=pid,
                row=row_out,
            )
        )
    return out


def build_fallback_shortage_lines_from_task_snapshot(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    missing_snapshot: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Gdy operacyjny ``missing_qty`` spadł do 0, a zadanie nadal OPEN — pokaż listę z snapshotu ``missing_items``
    wzbogaconą o skrót decyzji OMS (dla szczegółów zadania w WMS).
    """
    from ..models.order_item import order_item_is_replaced_line
    from ..services.order_fulfillment_recompute import compute_line_missing_qty

    out: list[dict[str, Any]] = []
    seen: set[int] = set()
    for m in missing_snapshot:
        if not isinstance(m, dict):
            continue
        oi_id = int(m.get("order_item_id") or 0)
        if oi_id < 1 or oi_id in seen:
            continue
        seen.add(oi_id)
        pid = int(m.get("product_id") or 0)
        snap_miss = float(m.get("quantity_missing") or m.get("quantity") or 0)
        pr = db.query(Product).filter(Product.id == pid).first() if pid else None
        name = (
            (pr.name if pr and pr.name else "")
            or str(m.get("name") or "").strip()
            or (f"Produkt #{pid}" if pid else f"Pozycja #{oi_id}")
        )
        img: str | None = None
        if pr and pr.image_url and str(pr.image_url).strip():
            img = str(pr.image_url).strip()
        loc_out = ""
        if pid:
            loc_out = _location_label_for_product(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                product_id=pid,
                product=pr,
            )
        oi = next(
            (x for x in sorted(order.items or [], key=lambda z: int(z.id)) if int(x.id) == oi_id),
            None,
        )
        ordered = float(oi.quantity or 0) if oi else 0.0
        picked = float(line_picked_sum_for_order(db, int(oi.id), order)) if oi else 0.0
        operational_miss = float(compute_line_missing_qty(db, order, oi)) if oi else 0.0
        miss_qty = operational_miss if operational_miss > 1e-9 else snap_miss
        action = ""
        if oi is None:
            action = "Usunięto z zamówienia"
        elif order_item_is_replaced_line(oi):
            succ = next(
                (
                    x
                    for x in order.items or []
                    if int(getattr(x, "replaced_from_order_item_id", 0) or 0) == int(oi.id)
                ),
                None,
            )
            sub_nm = ""
            if succ and succ.product is not None and getattr(succ.product, "name", None):
                sub_nm = str(succ.product.name).strip()
            action = f"Zamieniono na {sub_nm}" if sub_nm else "Zamieniono na inny produkt"
        elif operational_miss > 1e-6:
            action = "Czeka decyzja OMS"
        else:
            meta_raw = getattr(oi, "metadata_json", None) or ""
            waiting = False
            if str(meta_raw).strip():
                try:
                    md = json.loads(meta_raw)
                    if isinstance(md, dict) and md.get("oms_waiting_for_stock") is True:
                        waiting = True
                except json.JSONDecodeError:
                    waiting = False
            if waiting:
                action = "Oznaczono: czeka na towar"
            else:
                action = "Rozwiązano w OMS"
        out.append(
            {
                "order_item_id": oi_id,
                "product_id": pid,
                "product_name": name,
                "image_url": img,
                "ordered_qty": round(ordered, 6),
                "picked_qty": round(picked, 6),
                "missing_qty": round(miss_qty, 6),
                "location_code": loc_out,
                "oms_action_summary": action,
            }
        )
    return out


def ensure_open_issue_task_for_order(db: Session, order: Order) -> None:
    """Utrzymuje OPEN ``OrderIssueTask`` dopóki zamówienie wymaga obsługi braków."""
    from ..services.order_fulfillment_recompute import order_requires_shortage_handling

    if not order_requires_shortage_handling(db, order):
        return
    tid = int(order.tenant_id)
    wid = int(order.warehouse_id)
    missing, picked, baseline = build_full_issue_payload_for_order(db, order=order)
    payload_missing = json.dumps(missing, ensure_ascii=False)
    payload_picked = json.dumps(picked, ensure_ascii=False)
    payload_base = json.dumps(baseline, ensure_ascii=False)
    now = datetime.utcnow()
    existing = (
        db.query(OrderIssueTask)
        .filter(
            OrderIssueTask.order_id == int(order.id),
            OrderIssueTask.status == "OPEN",
        )
        .order_by(OrderIssueTask.id.desc())
        .first()
    )
    if existing:
        existing.type = "MIXED"
        existing.missing_items = payload_missing
        existing.picked_items = payload_picked
        existing.baseline_order_lines_json = payload_base
        existing.updated_at = now
        return
    t = OrderIssueTask(
        tenant_id=tid,
        warehouse_id=wid,
        order_id=int(order.id),
        type="MIXED",
        status="OPEN",
        missing_items=payload_missing,
        picked_items=payload_picked,
        baseline_order_lines_json=payload_base,
        logs_json="[]",
        created_at=now,
        updated_at=now,
    )
    db.add(t)
    db.flush()
    _append_log(t, "Utworzono zadanie — synchronizacja kolejki braków", "shortage_reported")


def collect_shortage_queue_candidate_order_ids(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> set[int]:
    """Zestaw zamówień do przeliczenia przed listą Braki (hinty DB + otwarte zadania + status panelu Braki)."""
    from ..services.wms_picking_shortage_settings_service import get_or_create_wms_picking_shortage_settings

    not_replaced = func.upper(func.coalesce(OrderItem.oms_line_status, "")) != "REPLACED"
    hint_ids = (
        db.query(OrderItem.order_id)
        .join(Order, Order.id == OrderItem.order_id)
        .filter(
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
            Order.deleted_at.is_(None),
            OrderItem.quantity > 1e-9,
            not_replaced,
            func.coalesce(OrderItem.wms_picking_line_missing_qty, 0) > 1e-6,
        )
        .distinct()
        .all()
    )
    cand_ids: set[int] = {int(r[0]) for r in hint_ids}
    for (oid,) in (
        db.query(OrderIssueTask.order_id)
        .filter(
            OrderIssueTask.tenant_id == int(tenant_id),
            OrderIssueTask.warehouse_id == int(warehouse_id),
            OrderIssueTask.status == "OPEN",
        )
        .distinct()
        .all()
    ):
        cand_ids.add(int(oid))
    ss = get_or_create_wms_picking_shortage_settings(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
    )
    rep_sid = getattr(ss, "shortage_reported_order_ui_status_id", None)
    if rep_sid is not None and int(rep_sid) > 0:
        for (oid,) in (
            db.query(Order.id)
            .filter(
                Order.tenant_id == int(tenant_id),
                Order.warehouse_id == int(warehouse_id),
                Order.deleted_at.is_(None),
                Order.order_ui_status_id == int(rep_sid),
            )
            .all()
        ):
            cand_ids.add(int(oid))
    return cand_ids


def consolidate_duplicate_open_issue_tasks(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> int:
    """
    Zamyka nadmiarowe OPEN zadania dla tego samego ``order_id`` (zostawia najnowsze ``id``).
    """
    import logging

    log = logging.getLogger(__name__)
    rows = (
        db.query(OrderIssueTask)
        .filter(
            OrderIssueTask.tenant_id == int(tenant_id),
            OrderIssueTask.warehouse_id == int(warehouse_id),
            OrderIssueTask.status == "OPEN",
        )
        .order_by(OrderIssueTask.order_id.asc(), OrderIssueTask.id.desc())
        .all()
    )
    keep_by_order: dict[int, OrderIssueTask] = {}
    to_close: list[OrderIssueTask] = []
    for t in rows:
        oid = int(t.order_id)
        if oid not in keep_by_order:
            keep_by_order[oid] = t
        else:
            to_close.append(t)
    for dup in to_close:
        mark_task_done(db, dup, "Duplikat zadania braków — scalono w kolejce")
    if to_close:
        log.info(
            "[braki.dedupe] closed %s duplicate OPEN task(s) tenant=%s wh=%s",
            len(to_close),
            tenant_id,
            warehouse_id,
        )
    return len(to_close)


def sync_open_issue_tasks_for_warehouse(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    full_recalc: bool = False,
) -> None:
    """
    Przed listą braków: deduplikacja OPEN zadań; opcjonalnie pełne przeliczenie stanów braków.

    ``full_recalc`` zachowany dla kompatybilności API — stan workflow pochodzi z resolvera (bez mutacji).
    """
    purge_stale_open_order_issue_tasks(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    consolidate_duplicate_open_issue_tasks(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    _ = full_recalc


def ensure_order_issue_task_table_schema(db: Session) -> None:
    """Upewnij się, że kolumny archiwizacji istnieją (starsze DB bez migracji przy starcie)."""
    from ..db.schema_introspection import ensure_order_issue_tasks_archive_columns, get_engine

    bind = db.get_bind()
    if bind is None:
        return
    try:
        get_engine(bind)
    except TypeError:
        return
    ensure_order_issue_tasks_archive_columns(bind)


def list_open_order_issue_tasks_for_warehouse(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> list[OrderIssueTask]:
    """OPEN zadania braków — po deduplikacji po stronie API."""
    ensure_order_issue_task_table_schema(db)
    return (
        db.query(OrderIssueTask)
        .filter(
            OrderIssueTask.tenant_id == int(tenant_id),
            OrderIssueTask.warehouse_id == int(warehouse_id),
            OrderIssueTask.status == "OPEN",
        )
        .order_by(OrderIssueTask.order_id.asc(), OrderIssueTask.id.desc())
        .all()
    )


def order_issue_task_debug_snapshot(
    db: Session,
    task: OrderIssueTask,
    order: Order | None,
    *,
    workflow_status: str | None = None,
) -> dict[str, object]:
    """Pola diagnostyczne do logów kolejki braków."""
    oid = int(getattr(task, "order_id", 0) or 0)
    tid = int(getattr(task, "id", 0) or 0)
    u_short, r_pend = (0, 0)
    reloc = False
    if order is not None:
        try:
            u_short, r_pend = count_issue_queue_operational_lines(db, order)
            from .braki_order_state_service import order_has_pending_relocation_work

            reloc = order_has_pending_relocation_work(
                db,
                tenant_id=int(order.tenant_id),
                warehouse_id=int(order.warehouse_id),
                order_id=oid,
            )
        except Exception:
            pass
    archived = _task_is_archived(task) if hasattr(task, "status") else False
    return {
        "task_id": tid,
        "order_id": oid,
        "workflow_status": workflow_status or "—",
        "relocation_required": reloc,
        "archived": archived,
        "closed_at": getattr(task, "archived_at", None),
        "u_short": u_short,
        "r_pend": r_pend,
    }


def mark_task_done(db: Session, task: OrderIssueTask, message: str | None = None) -> None:
    now = datetime.utcnow()
    task.status = "DONE"
    task.updated_at = now
    _append_log(task, message or "Zadanie zamknięte", "task_done")
    _append_log(
        task,
        f"shortage_resolved_at={now.isoformat()}Z",
        "shortage_resolved",
    )


def _task_is_archived(task: OrderIssueTask) -> bool:
    if getattr(task, "archived_at", None) is not None:
        return True
    return (getattr(task, "status", None) or "").strip().upper() == "ARCHIVED"


def archive_order_issue_task(
    db: Session,
    task: OrderIssueTask,
    order: Order,
    *,
    message: str | None = None,
    operator_user_id: int | None = None,
) -> dict[str, bool]:
    """Ręczne zamknięcie z kolejki Braki (historia zostaje w logach). Idempotentne."""
    from .recovery_workflow_service import can_close_braki_shortage, resolve_order_recovery_state
    from .wms_recovery_pick_service import get_open_recovery_task_for_order, mark_recovery_task_done

    ensure_order_issue_task_table_schema(db)
    prev_status = (getattr(task, "status", None) or "").strip().upper() or "OPEN"
    if _task_is_archived(task):
        logger.info(
            "[wms.shortage.archive] task_id=%s order_id=%s archived_by=%s previous_status=%s "
            "already_archived=true",
            int(task.id),
            int(order.id),
            operator_user_id,
            prev_status,
        )
        return {"archived": True, "already_archived": True}

    rec_state = resolve_order_recovery_state(db, order, log=False)
    if not can_close_braki_shortage(db, order, state=rec_state):
        if rec_state.has_pending_relocation:
            raise ValueError("Nie można zamknąć — trwa rozlokowanie zebranego towaru.")
        if rec_state.has_recovery_pick_work or rec_state.totals.recovery_lines > 0:
            raise ValueError("Nie można zamknąć — otwarta dogrywka zbierki.")
        if rec_state.totals.oms_decision_lines > 0:
            raise ValueError("Nie można zamknąć — wymagana decyzja OMS.")
        raise ValueError(
            "Nie można zamknąć — zamówienie nadal wymaga obsługi braków lub zbierania."
        )

    open_recovery = get_open_recovery_task_for_order(
        db,
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        order_id=int(order.id),
    )
    if open_recovery is not None:
        mark_recovery_task_done(db, open_recovery)

    now = datetime.utcnow()
    task.status = "ARCHIVED"
    task.archived_at = now
    task.archived_by_user_id = (
        int(operator_user_id) if operator_user_id is not None and int(operator_user_id) > 0 else None
    )
    task.updated_at = now
    note = message or "Zamknięto ręcznie z kolejki Braki"
    _append_log(task, note, "task_archived")
    if operator_user_id is not None:
        _append_log(task, f"operator_user_id={int(operator_user_id)}", "task_archived")
    _append_log(task, f"archived_at={now.isoformat()}Z", "task_archived")
    from .wms_operational_task_service import close_operational_tasks_for_order

    try:
        close_operational_tasks_for_order(db, order)
    except Exception:
        logger.warning(
            "[wms.shortage.archive] close_operational_tasks failed order_id=%s task_id=%s",
            int(order.id),
            int(task.id),
            exc_info=True,
        )
    logger.info(
        "[wms.shortage.archive] task_id=%s order_id=%s archived_by=%s previous_status=%s "
        "already_archived=false",
        int(task.id),
        int(order.id),
        operator_user_id,
        prev_status,
    )
    return {"archived": True, "already_archived": False}


def log_operator_event(db: Session, task: OrderIssueTask, message: str, kind: str) -> None:
    _append_log(task, message, kind)
    task.updated_at = datetime.utcnow()
