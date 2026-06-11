"""
API: Complaints (office panel).

Must be created from an order (POST /complaints/from-order).
"""

from __future__ import annotations

import json
import logging
import traceback
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, Response, UploadFile
from starlette.datastructures import UploadFile
from sqlalchemy import Integer, and_, case, cast, desc, func, nullslast, or_
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models.complaint import Complaint
from ..models.complaint_document import ComplaintDocument
from ..models.complaint_line import ComplaintLine
from ..models.order import Order
from ..models.order_item import OrderItem
from ..schemas.complaint import (
    ALLOWED_FINANCIAL_DECISIONS,
    ALLOWED_OPERATIONAL_DECISIONS,
    ComplaintRelatedBrief,
    ComplaintAuditEventRead,
    ComplaintEventListResponse,
    ComplaintEventRead,
    ComplaintCreateFromOrder,
    ComplaintDecisionPatch,
    ComplaintDeleteResult,
    ComplaintDocumentRead,
    ComplaintDocumentsRegenerateBody,
    ComplaintLinePatch,
    ComplaintLogisticsActionBody,
    ComplaintLineRead,
    ComplaintListRead,
    ComplaintOrderSummary,
    ComplaintRead,
    ComplaintResolutionPatch,
    ComplaintStatusPatch,
    ComplaintWmsUpdateBody,
    ComplaintStatusSummary,
    ComplaintStatusCountRow,
    complaint_photo_urls_from_db,
    dedupe_complaint_photo_urls_preserve_order,
    merge_photo_url_strings_idempotent,
)
from ..services.delete_service import soft_delete_complaint as complaint_set_deleted_at
from ..services.complaint_audit import (
    append_complaint_audit_event,
    complaint_audit_events_from_db,
    notify_complaint_status_change_stub,
)
from ..services.complaint_event_log import list_events_for_complaint, rows_to_read
from ..services.complaint_documents_sync import (
    maybe_sync_correction_on_refund,
    maybe_sync_decision_on_terminal,
    maybe_sync_rma_on_lines,
    regenerate_complaint_documents as run_regenerate_complaint_documents,
)
from .order import build_order_read
from ..services.complaint_image_upload import (
    save_complaint_image,
    save_complaint_line_image,
    validate_complaint_image_part,
)
from ..services.tenant_default_warehouse import resolve_tenant_default_warehouse_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/complaints", tags=["Complaints"])


def complaint_panel_warehouse_id(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
) -> int:
    if warehouse_id is not None:
        return warehouse_id
    try:
        return resolve_tenant_default_warehouse_id(db, tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Brak skonfigurowanego magazynu")

PROCESS_MAIN: tuple[str, ...] = ("NOWE", "OCZEKIWANIE_NA_PRODUKT", "WERYFIKACJA", "DECYZJA")
PROCESS_TERMINALS: frozenset[str] = frozenset({"ZAAKCEPTOWANA", "ODRZUCONA"})
ALL_PROCESS: frozenset[str] = frozenset(PROCESS_MAIN) | PROCESS_TERMINALS
# Rozliczenie z klientem — dopiero po zamknięciu reklamacji (nie w trakcie etapów otwartych).
RESOLUTION_ALLOWED_STATUSES: frozenset[str] = frozenset({"ZAAKCEPTOWANA", "ODRZUCONA"})
OPEN_RESPONSE_DEADLINE_STATUSES: frozenset[str] = frozenset(set(PROCESS_MAIN))

def _db_dialect_name(db: Session) -> str:
    bind = db.get_bind()
    if bind is not None:
        return str(getattr(bind.dialect, "name", "") or "sqlite")
    return "sqlite"


def _complaint_deadline_urgency_order(*, dialect_name: str = "sqlite"):
    """Sort: overdue first, then soonest deadline; terminal / no deadline last."""
    eff = func.coalesce(
        func.nullif(func.trim(func.coalesce(Complaint.status, "")), ""),
        "NOWE",
    )
    is_terminal = eff.in_(("ZAAKCEPTOWANA", "ODRZUCONA"))
    bucket = case(
        (is_terminal, 2),
        (Complaint.response_deadline.is_(None), 2),
        (Complaint.response_deadline < func.current_timestamp(), 0),
        else_=1,
    )
    if dialect_name == "postgresql":
        days_until_deadline = cast(
            func.date(Complaint.response_deadline) - func.current_date(),
            Integer,
        )
    else:
        days_until_deadline = cast(
            func.julianday(func.date(Complaint.response_deadline)) - func.julianday("now"),
            Integer,
        )
    days_remain = case(
        (is_terminal, 999999),
        (Complaint.response_deadline.is_(None), 999999),
        else_=days_until_deadline,
    )
    return (
        bucket.asc(),
        days_remain.asc(),
        Complaint.created_at.desc(),
        Complaint.id.desc(),
    )


def _compile_query_sql_for_log(query) -> str:
    """Best-effort SQL string for error logs (may fail on exotic queries)."""
    try:
        bind = query.session.get_bind() if hasattr(query, "session") else None
        dialect = bind.dialect if bind is not None else None
        stmt = query.statement if hasattr(query, "statement") else query
        return str(
            stmt.compile(
                dialect=dialect,
                compile_kwargs={"literal_binds": False},
            )
        )
    except Exception as compile_exc:
        return f"<sql compile failed: {type(compile_exc).__name__}: {compile_exc}>"

COMPLAINT_RESPONSE_DEADLINE_DAYS = 14

ALL_LOGISTICS_STATUSES: frozenset[str] = frozenset(
    {
        "WAITING_FOR_ITEM",
        "RECEIVED",
        "IN_INSPECTION",
        "IN_SERVICE",
        "RETURNED_FROM_SERVICE",
    }
)


def _norm_logistics_status(raw: Optional[object]) -> str:
    s = str(raw or "").strip().upper()
    return s if s in ALL_LOGISTICS_STATUSES else "WAITING_FOR_ITEM"


def _logistics_notification_flags(c: Complaint, now: datetime) -> tuple[bool, bool]:
    """(przypomnienie o dostawie ≥7 dni w WAITING, alert serwisu >21 dni w IN_SERVICE)."""
    st = _norm_logistics_status(getattr(c, "logistics_status", None))
    waiting_reminder = False
    if st == "WAITING_FOR_ITEM":
        created = getattr(c, "created_at", None) or now
        if isinstance(created, datetime) and (now - created) >= timedelta(days=7):
            waiting_reminder = True
    svc_overdue = False
    if st == "IN_SERVICE":
        since = getattr(c, "logistics_in_service_since", None)
        if isinstance(since, datetime) and (now - since) > timedelta(days=21):
            svc_overdue = True
    return waiting_reminder, svc_overdue


def _initial_logistics_status_for_create(body: ComplaintCreateFromOrder, item_by_id: dict) -> str:
    """Brak powiązanego produktu w linii → oczekiwanie na fizyczny towar."""
    for ln in body.lines:
        oi = item_by_id.get(ln.order_item_id)
        if oi is not None and getattr(oi, "product", None) is not None:
            return "RECEIVED"
    return "WAITING_FOR_ITEM"


# Ścieżki drugorzędne — tylko po nieudanej naprawie/wymianie lub poważnej wadzie (hierarchia prawna).
RESTRICTED_OPERATIONAL_DECISIONS: frozenset[str] = frozenset({"exchange", "replacement", "dispose", "outlet"})
RESTRICTED_FINANCIAL_DECISIONS: frozenset[str] = frozenset({"refund", "price_reduction", "reject"})
RESTRICTED_RESOLUTION_TYPES: frozenset[str] = frozenset({"REFUND", "PARTIAL_REFUND", "REJECTION"})
ALLOWED_LINE_DECISIONS: frozenset[str] = frozenset({"repair", "exchange", "reject", "refund"})
ALLOWED_LINE_EXCHANGE_KIND: frozenset[str] = frozenset({"EXCHANGE", "REPLACEMENT"})
ALLOWED_LINE_SETTLEMENT_TYPES: frozenset[str] = frozenset({"REPLACEMENT", "REFUND", "PARTIAL_REFUND", "REJECTION"})

LINE_OP_CHAIN_REPAIR: tuple[str, ...] = (
    "pickup",
    "warehouse_in",
    "service_sent",
    "repair_done",
    "shipped_customer",
)
# Wymiana z odbiorem reklamowanego towaru u klienta
LINE_OP_CHAIN_EXCHANGE: tuple[str, ...] = ("pickup", "order_placed", "ship_out")
# Tylko dostawa nowego towaru (bez wymaganego kroku „pickup” w operacjach pozycji)
LINE_OP_CHAIN_EXCHANGE_REPLACEMENT: tuple[str, ...] = ("order_placed", "ship_out")
LINE_OP_CHAIN_REJECT: tuple[str, ...] = ("pickup", "return_customer")
LINE_OP_CHAIN_REFUND: tuple[str, ...] = ("pickup", "warehouse_in", "refund_done")
ALL_LINE_OPERATION_STATUSES: frozenset[str] = frozenset(
    LINE_OP_CHAIN_REPAIR
    + LINE_OP_CHAIN_EXCHANGE
    + LINE_OP_CHAIN_EXCHANGE_REPLACEMENT
    + LINE_OP_CHAIN_REJECT
    + LINE_OP_CHAIN_REFUND
)


def _line_op_chain_for_line(line: ComplaintLine) -> Optional[tuple[str, ...]]:
    d = str(line.line_decision or "").strip().lower()
    if d == "repair":
        return LINE_OP_CHAIN_REPAIR
    if d == "exchange":
        ek = str(getattr(line, "exchange_kind", None) or "").strip().upper()
        if ek == "REPLACEMENT":
            return LINE_OP_CHAIN_EXCHANGE_REPLACEMENT
        if ek == "EXCHANGE":
            return LINE_OP_CHAIN_EXCHANGE
        return None
    if d == "reject":
        return LINE_OP_CHAIN_REJECT
    if d == "refund":
        return LINE_OP_CHAIN_REFUND
    return None


def _line_has_decision_set(line: ComplaintLine) -> bool:
    d = str(line.line_decision or "").strip().lower()
    return d in ALLOWED_LINE_DECISIONS


def _line_operations_chain_complete(line: ComplaintLine) -> bool:
    chain = _line_op_chain_for_line(line)
    if not chain:
        return False
    cur = _norm_line_operation_status(getattr(line, "operation_status", None))
    if cur is None:
        return False
    return cur == chain[-1]


def _assert_lines_ready_for_complaint_terminal_close(c: Complaint) -> None:
    lines = list(getattr(c, "lines", []) or [])
    if not lines:
        raise HTTPException(status_code=400, detail="Reklamacja bez pozycji — nie można zamknąć.")
    for line in lines:
        if not _line_has_decision_set(line):
            raise HTTPException(
                status_code=400,
                detail="Zamknięcie wymaga decyzji dla każdej pozycji (naprawa, wymiana, zwrot lub odrzucenie).",
            )
        if not _line_operations_chain_complete(line):
            raise HTTPException(
                status_code=400,
                detail="Zamknięcie wymaga ukończenia operacji dla każdej pozycji.",
            )


def _norm_exchange_kind(raw: Optional[object]) -> Optional[str]:
    if raw is None:
        return None
    s = str(raw).strip().upper()
    return s if s in ALLOWED_LINE_EXCHANGE_KIND else None


def _norm_line_operation_status(raw: Optional[object]) -> Optional[str]:
    if raw is None:
        return None
    s = str(raw).strip().lower()
    if not s:
        return None
    return s if s in ALL_LINE_OPERATION_STATUSES else None


def _apply_line_operation_patch(line: ComplaintLine, new_op: str) -> None:
    chain = _line_op_chain_for_line(line)
    if not chain:
        d = str(line.line_decision or "").strip().lower()
        if d == "exchange":
            raise HTTPException(
                status_code=400,
                detail="Wybierz tryb wymiany: z odbiorem u klienta lub tylko dostawa nowego towaru.",
            )
        raise HTTPException(
            status_code=400,
            detail="Ustaw decyzję pozycji (naprawa / wymiana / odrzuć), aby rejestrować operacje.",
        )
    nxt = str(new_op).strip().lower()
    if nxt not in chain:
        raise HTTPException(status_code=400, detail="Nieprawidłowy etap operacji dla tej decyzji.")
    raw_cur = getattr(line, "operation_status", None)
    cur = _norm_line_operation_status(raw_cur)
    idx_cur = -1 if cur is None else (chain.index(cur) if cur in chain else -1)
    idx_new = chain.index(nxt)
    if idx_new != idx_cur + 1:
        raise HTTPException(status_code=400, detail="Wykonuj operacje po kolei — najpierw poprzedni etap.")
    line.operation_status = nxt


def apply_line_operation_transition(line: ComplaintLine, storage_key: str) -> None:
    """Ustawia kolejny poprawny `operation_status` — współdzielone z PATCH /complaint-lines/.../operation."""
    _apply_line_operation_patch(line, storage_key)


def _complaint_unlock_secondary_paths(c: Complaint) -> bool:
    if bool(
        getattr(c, "major_defect", False)
        or getattr(c, "repair_failed", False)
        or getattr(c, "replacement_failed", False)
    ):
        return True
    for line in getattr(c, "lines", []) or []:
        d = (getattr(line, "line_decision", None) or "").strip().lower()
        if d in ("repair", "exchange", "refund"):
            return True
    return False


def _validate_complaint_decision_hierarchy(c: Complaint) -> None:
    if _complaint_unlock_secondary_paths(c):
        return
    op = (getattr(c, "operational_decision", None) or "").strip()
    if op in RESTRICTED_OPERATIONAL_DECISIONS:
        raise HTTPException(
            status_code=400,
            detail="Ta decyzja operacyjna wymaga uprzednio nieudanej naprawy lub wymiany albo zaznaczenia poważnej wady.",
        )
    fin = (getattr(c, "financial_decision", None) or "").strip()
    if fin in RESTRICTED_FINANCIAL_DECISIONS:
        raise HTTPException(
            status_code=400,
            detail="Zwrot pieniędzy, obniżenie ceny lub odmowa — dopiero po nieudanej naprawie / wymianie lub przy poważnej wadzie.",
        )


def _source_order_total_and_currency(db: Session, c: Complaint) -> Tuple[float, str]:
    oid = getattr(c, "order_id", None)
    if oid is None:
        raise HTTPException(status_code=400, detail="Brak zamówienia źródłowego — nie można rozliczyć kwoty.")
    o = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(Order.id == int(oid))
        .first()
    )
    if not o:
        raise HTTPException(status_code=400, detail="Zamówienie źródłowe nie znalezione.")
    cur = (str(getattr(o, "currency", None) or "").strip() or "PLN")[:8]
    v = getattr(o, "value", None)
    if v is not None and float(v) > 0:
        return round(float(v), 2), cur
    s = 0.0
    for it in o.items or []:
        tp = getattr(it, "total_price", None)
        if tp is not None:
            s += float(tp)
        else:
            up = float(getattr(it, "unit_price", None) or 0)
            q = int(getattr(it, "quantity", 0) or 0)
            s += up * q
    total = round(s, 2)
    if total <= 0:
        raise HTTPException(
            status_code=400,
            detail="Nie można ustalić wartości zamówienia (suma pozycji = 0).",
        )
    return total, cur


def _validate_resolution_unlock(c: Complaint, rtype: str) -> None:
    if rtype in RESTRICTED_RESOLUTION_TYPES:
        if not _complaint_unlock_secondary_paths(c):
            raise HTTPException(
                status_code=400,
                detail="Zwrot, częściowy zwrot lub odmowa — po nieudanej naprawie / wymianie lub przy poważnej wadzie.",
            )


def _sync_financial_decision_from_resolution(rtype: str) -> str:
    if rtype == "REPLACEMENT":
        return "replace"
    if rtype == "REFUND":
        return "refund"
    if rtype == "PARTIAL_REFUND":
        return "price_reduction"
    return "reject"


def _apply_due_response_deadlines(db: Session, tenant_id: int, warehouse_id: int) -> None:
    """Po upływie response_deadline: status ZAAKCEPTOWANA i auto_accepted (tylko etapy otwarte)."""
    now = datetime.utcnow()
    open_status = or_(
        Complaint.status.in_(list(PROCESS_MAIN)),
        Complaint.status.is_(None),
        Complaint.status == "",
    )
    rows = (
        db.query(Complaint)
        .filter(
            _tenant_warehouse_active(tenant_id, warehouse_id),
            Complaint.response_deadline.isnot(None),
            Complaint.response_deadline < now,
            open_status,
        )
        .all()
    )
    if not rows:
        return
    ids = [c.id for c in rows]
    for c in rows:
        prev = _norm_complaint_status(getattr(c, "status", None))
        c.status = "ZAAKCEPTOWANA"
        c.auto_accepted = True
        db.add(c)
        append_complaint_audit_event(
            db,
            c.id,
            "auto_accepted_by_law",
            f"Uznana automatycznie z mocy prawa (poprzedni etap: {prev}).",
            meta={"from_status": prev},
        )
    db.commit()
    for cid in ids:
        c2 = (
            db.query(Complaint)
            .options(
                joinedload(Complaint.lines).joinedload(ComplaintLine.order_item).joinedload(OrderItem.product),
            )
            .filter(Complaint.id == cid)
            .first()
        )
        if c2:
            try:
                maybe_sync_decision_on_terminal(db, c2, "ZAAKCEPTOWANA")
            except Exception:
                logger.exception("auto-accept decision PDF failed id=%s", cid)
    db.commit()


def _norm_complaint_status(raw: Optional[object]) -> str:
    s = str(raw or "NOWE").strip().upper()
    return s if s in ALL_PROCESS else "NOWE"


def _can_transition_status(cur: str, nxt: str) -> bool:
    """Dopuszcza ruch wzdłuż głównej ścieżki (wstecz lub do przodu) oraz z DECYZJA na wynik końcowy."""
    if nxt not in ALL_PROCESS:
        return False
    cur_n = _norm_complaint_status(cur)
    nxt_n = _norm_complaint_status(nxt)
    if cur_n == nxt_n:
        return True
    if cur_n in PROCESS_TERMINALS:
        return False
    if nxt_n in PROCESS_TERMINALS:
        return cur_n == "DECYZJA"
    return cur_n in PROCESS_MAIN and nxt_n in PROCESS_MAIN


STATUS_SUMMARY_ORDER: tuple[str, ...] = (
    "NOWE",
    "OCZEKIWANIE_NA_PRODUKT",
    "WERYFIKACJA",
    "DECYZJA",
    "ZAAKCEPTOWANA",
    "ODRZUCONA",
)


def _tenant_warehouse_active(tenant_id: int, warehouse_id: int):
    return and_(
        Complaint.tenant_id == tenant_id,
        Complaint.warehouse_id == warehouse_id,
        Complaint.deleted_at.is_(None),
    )


def _warehouse_id_for_complaint_by_id(
    db: Session,
    complaint_id: int,
    tenant_id: int,
    warehouse_id: Optional[int] = None,
) -> int:
    """Magazyn z wiersza reklamacji — bez polegania wyłącznie na domyślnym magazynie tenanta.

    Lista i szczegół muszą być spójne: reklamacja przypięta do magazynu zamówienia znikała z GET
    szczegółu przy filtrze po domyślnym magazynie zamiast magazynu dokumentu.
    """
    row = (
        db.query(Complaint)
        .filter(
            Complaint.id == complaint_id,
            Complaint.tenant_id == tenant_id,
            Complaint.deleted_at.is_(None),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Complaint not found")
    wh_id = int(row.warehouse_id)
    if warehouse_id is not None and int(warehouse_id) != wh_id:
        raise HTTPException(status_code=400, detail="warehouse_id does not match complaint warehouse")
    return wh_id


def _first_line_product_image_url(c: Complaint) -> Optional[str]:
    lines_sorted = sorted(getattr(c, "lines", []) or [], key=lambda x: x.id)
    for line in lines_sorted:
        oi = getattr(line, "order_item", None)
        if oi is None:
            continue
        prod = getattr(oi, "product", None)
        if prod is None:
            continue
        raw = getattr(prod, "image_url", None)
        if raw and str(raw).strip():
            return str(raw).strip()
    return None


def _first_line_list_preview(
    c: Complaint,
) -> tuple[Optional[str], Optional[str], Optional[str], Optional[int], Optional[str]]:
    """Pierwsza linia reklamacji: nazwa, sku, ean, ilość, obraz (jak w liście zamówień/zwrotów)."""
    lines_sorted = sorted(getattr(c, "lines", []) or [], key=lambda x: x.id)
    for line in lines_sorted:
        oi = getattr(line, "order_item", None)
        prod = getattr(oi, "product", None) if oi else None
        qty_v = getattr(line, "quantity", None)
        qty = int(qty_v) if qty_v is not None else None
        nm: Optional[str] = None
        sku: Optional[str] = None
        ean: Optional[str] = None
        img: Optional[str] = None
        if prod:
            nm = (getattr(prod, "name", None) or "").strip() or None
            sk = getattr(prod, "sku", None) or getattr(prod, "symbol", None)
            sku = str(sk).strip() if sk else None
            raw_ean = getattr(prod, "ean", None)
            ean = str(raw_ean).strip() if raw_ean else None
            raw_img = getattr(prod, "image_url", None)
            img = str(raw_img).strip() if raw_img else None
        if nm or sku or ean or img or (qty is not None and qty > 0):
            return nm, sku, ean, qty, img
    return None, None, None, None, None


def _defect_ids_from_complaint(c: Complaint) -> List[str]:
    raw = getattr(c, "defects_json", None)
    if not raw or not str(raw).strip():
        return []
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [str(x).strip() for x in data if x is not None and str(x).strip()][:30]
    except Exception:
        pass
    return []


def _defect_ids_from_line(line: ComplaintLine) -> List[str]:
    raw = getattr(line, "defect_ids_json", None)
    if not raw or not str(raw).strip():
        return []
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [str(x).strip() for x in data if x is not None and str(x).strip()][:30]
    except Exception:
        pass
    return []


_DEFECT_LABELS = {
    "transport": "Uszkodzenie w transporcie",
    "factory": "Wada fabryczna",
    "missing": "Brakująca część",
    "use": "Ślady użytkowania",
    "wrong": "Zły produkt",
}


def _defect_objs(ids: List[str]) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    for did in ids:
        sid = str(did or "").strip()
        if not sid:
            continue
        out.append({"id": sid, "name": _DEFECT_LABELS.get(sid, sid)})
    return out


def _list_customer_reason_display(c: Complaint) -> Optional[str]:
    cr = getattr(c, "customer_reason", None)
    if cr and str(cr).strip():
        return str(cr).strip()
    desc = (getattr(c, "description", None) or "").strip()
    if desc:
        block = desc.split("\n\n")[0].strip()
        return block or None
    return None


def _customer_name_from_order_row(order_row: Optional[Order]) -> Optional[str]:
    """Z `addresses_json` zamówienia (Order nie ma kolumn first_name/last_name)."""
    if order_row is None:
        return None
    from ..api.wms_returns import _customer_names_from_order

    fn, ln = _customer_names_from_order(order_row)
    parts = [str(fn).strip() if fn else "", str(ln).strip() if ln else ""]
    name = " ".join(p for p in parts if p)
    return name or None


def _customer_contact_snapshot_from_order(order: Order) -> tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
    from ..api.wms_returns import _customer_names_from_order

    fn, ln = _customer_names_from_order(order)
    parts = [str(fn).strip() if fn else "", str(ln).strip() if ln else ""]
    name = " ".join(p for p in parts if p) or None
    phone, email = _contact_from_addresses_json(getattr(order, "addresses_json", None))
    addr = _customer_address_from_addresses_json(getattr(order, "addresses_json", None))
    return name, phone, email, addr


def _deep_find_str(obj: Any, *want_keys: str) -> Optional[str]:
    lk = {k.lower() for k in want_keys}
    if isinstance(obj, dict):
        for key, val in obj.items():
            if str(key).lower() in lk and val is not None:
                s = str(val).strip()
                if s:
                    return s
        for val in obj.values():
            r = _deep_find_str(val, *want_keys)
            if r:
                return r
    elif isinstance(obj, list):
        for item in obj:
            r = _deep_find_str(item, *want_keys)
            if r:
                return r
    return None


def _contact_from_addresses_json(raw: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    if not raw or not str(raw).strip():
        return None, None
    try:
        data = json.loads(raw)
    except Exception:
        return None, None
    phone = _deep_find_str(data, "phone", "telephone", "tel", "mobile", "phone_number")
    email = _deep_find_str(data, "email", "e_mail", "mail")
    return phone, email


def _address_line_from_block(block: dict) -> Optional[str]:
    lines: List[str] = []
    street = (
        block.get("street")
        or block.get("Ulica")
        or block.get("address1")
        or block.get("address_line1")
        or block.get("line1")
    )
    if street and str(street).strip():
        lines.append(str(street).strip())
    a2 = block.get("address2") or block.get("address_line2") or block.get("line2")
    if a2 and str(a2).strip():
        lines.append(str(a2).strip())
    zip_c = (
        block.get("postcode")
        or block.get("postal_code")
        or block.get("zip")
        or block.get("Kod pocztowy")
        or block.get("Kod")
    )
    city = block.get("city") or block.get("Miejscowość") or block.get("Miasto")
    tail = " ".join(x for x in [zip_c and str(zip_c).strip(), city and str(city).strip()] if x)
    if tail:
        lines.append(tail)
    country = block.get("country") or block.get("Kraj")
    if country and str(country).strip():
        lines.append(str(country).strip())
    if lines:
        return ", ".join(lines)
    return None


def _customer_address_from_addresses_json(raw: Optional[str]) -> Optional[str]:
    if not raw or not str(raw).strip():
        return None
    try:
        data = json.loads(raw)
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    for section in ("shipping", "delivery", "billing", "invoice"):
        block = data.get(section)
        if isinstance(block, dict):
            got = _address_line_from_block(block)
            if got:
                return got[:800]
    got = _address_line_from_block(data)
    if got:
        return got[:800]
    return None


def _customer_address_for_complaint_read(summary: Optional[ComplaintOrderSummary]) -> Optional[str]:
    if summary is None:
        return None
    addr = _customer_address_from_addresses_json(summary.addresses_json)
    if addr:
        return addr
    parts: List[str] = []
    if summary.city and str(summary.city).strip():
        parts.append(str(summary.city).strip())
    if summary.country and str(summary.country).strip():
        parts.append(str(summary.country).strip())
    if parts:
        return ", ".join(parts)[:800]
    return None


def _order_summary(db: Session, order: Optional[Order]) -> Optional[ComplaintOrderSummary]:
    if order is None:
        return None
    from .wms_returns import _shipping_cost_from_order

    full = build_order_read(db, order)
    ship_raw = _shipping_cost_from_order(order)
    ship_out: Optional[float] = None
    if ship_raw is not None:
        try:
            ship_out = round(float(ship_raw), 2)
        except (TypeError, ValueError):
            ship_out = None
    return ComplaintOrderSummary(
        id=full.id,
        number=full.number,
        first_name=full.first_name,
        last_name=full.last_name,
        source=full.source,
        city=full.city,
        country=full.country,
        value=full.value,
        currency=full.currency,
        shipping_method=full.shipping_method,
        shipping_cost=ship_out,
        addresses_json=full.addresses_json,
        created_at=getattr(full, "created_at", None),
    )


def build_complaint_read(db: Session, c: Complaint) -> ComplaintRead:
    order_row = getattr(c, "order", None)
    if order_row is None and c.order_id:
        order_row = db.query(Order).filter(Order.id == c.order_id).first()

    summary = _order_summary(db, order_row)
    phone, email = (None, None)
    if summary and summary.addresses_json:
        phone, email = _contact_from_addresses_json(summary.addresses_json)

    parts_name = [summary.first_name, summary.last_name] if summary else []
    customer_name = " ".join(p.strip() for p in parts_name if p and str(p).strip()) or None

    snap_n = (str(getattr(c, "customer_name", None) or "").strip() or None)
    snap_p = (str(getattr(c, "customer_phone", None) or "").strip() or None)
    snap_e = (str(getattr(c, "customer_email", None) or "").strip() or None)
    customer_name = snap_n or customer_name
    phone = snap_p or phone
    email = snap_e or email

    customer_photo_urls = complaint_photo_urls_from_db(c.photo_urls_json)
    warehouse_photo_urls = complaint_photo_urls_from_db(getattr(c, "warehouse_photo_urls_json", None))
    warehouse_top_set = set(warehouse_photo_urls)

    lines_sorted = sorted(getattr(c, "lines", []) or [], key=lambda x: x.id)
    legacy_complaint_defect_ids = _defect_ids_from_complaint(c)
    aggregate_defect_ids: List[str] = []
    lines_out: List[ComplaintLineRead] = []
    product_name_first: Optional[str] = None
    sku_first: Optional[str] = None
    image_first: Optional[str] = None

    for line in lines_sorted:
        oi = line.order_item
        prod = oi.product if oi else None
        nm = getattr(prod, "name", None) if prod else None
        sku = None
        if prod:
            sku = getattr(prod, "sku", None) or getattr(prod, "symbol", None)
        up = float(oi.unit_price) if oi and getattr(oi, "unit_price", None) is not None else None
        pid = int(prod.id) if prod and getattr(prod, "id", None) is not None else None
        ls_raw = getattr(line, "line_status", None)
        line_st = _norm_complaint_status(ls_raw)
        ld_raw = getattr(line, "line_decision", None)
        ld = (str(ld_raw).strip().lower() if ld_raw is not None and str(ld_raw).strip() else None)
        if ld is not None and ld not in ALLOWED_LINE_DECISIONS:
            ld = None
        prod_man = None
        if prod:
            m = getattr(prod, "manufacturer", None)
            prod_man = str(m).strip() if m and str(m).strip() else None
        op_st = _norm_line_operation_status(getattr(line, "operation_status", None))
        ex_k = _norm_exchange_kind(getattr(line, "exchange_kind", None))
        line_photo_urls = complaint_photo_urls_from_db(getattr(line, "photo_urls_json", None))
        line_warehouse_photos = [u for u in line_photo_urls if u in warehouse_top_set]
        line_customer_photos = [u for u in line_photo_urls if u not in warehouse_top_set]
        line_defect_ids = _defect_ids_from_line(line) or legacy_complaint_defect_ids
        for did in line_defect_ids:
            if did not in aggregate_defect_ids:
                aggregate_defect_ids.append(did)
        prod_ean = None
        prod_img = None
        if prod:
            ea = getattr(prod, "ean", None)
            prod_ean = str(ea).strip() if ea and str(ea).strip() else None
            iu = getattr(prod, "image_url", None)
            prod_img = str(iu).strip() if iu and str(iu).strip() else None
        st_t = (str(getattr(line, "settlement_type", None) or "").strip().upper() or None)
        if st_t is not None and st_t not in ALLOWED_LINE_SETTLEMENT_TYPES:
            st_t = None
        st_amt = getattr(line, "settlement_amount", None)
        st_amt_out: Optional[float] = None
        if st_amt is not None:
            try:
                st_amt_out = round(float(st_amt), 2)
            except (TypeError, ValueError):
                st_amt_out = None
        st_cur = (str(getattr(line, "settlement_currency", None) or "").strip() or None)
        if st_cur is not None:
            st_cur = st_cur[:8] if st_cur else None
        lines_out.append(
            ComplaintLineRead(
                id=line.id,
                order_item_id=line.order_item_id,
                product_id=pid,
                quantity=line.quantity,
                reason=line.reason,
                product_name=nm,
                sku=sku,
                product_ean=prod_ean,
                product_image_url=prod_img,
                unit_price=up,
                status=line_st,
                decision=ld,
                operation_status=op_st,
                exchange_kind=ex_k,
                producer_name=prod_man,
                settlement_type=st_t,
                settlement_amount=st_amt_out,
                settlement_currency=st_cur,
                photo_urls=line_photo_urls,
                customer_photos=line_customer_photos,
                warehouse_photos=line_warehouse_photos,
                defect_ids=line_defect_ids,
                defects=_defect_objs(line_defect_ids),
                note_warehouse=(str(getattr(line, "note_warehouse", None) or "").strip() or None),
            )
        )
        if product_name_first is None and nm:
            product_name_first = nm
            sku_first = sku
            image_first = (getattr(prod, "image_url", None) or "").strip() or None

    cr_db = getattr(c, "customer_reason", None)
    customer_reason_only = str(cr_db).strip() if cr_db and str(cr_db).strip() else None

    now = datetime.utcnow()
    l_rem, l_svc = _logistics_notification_flags(c, now)
    ls_norm = _norm_logistics_status(getattr(c, "logistics_status", None))
    exp_ret_raw = getattr(c, "logistics_expected_return_date", None)
    exp_ret: Optional[date] = None
    if exp_ret_raw is not None:
        if isinstance(exp_ret_raw, datetime):
            exp_ret = exp_ret_raw.date()
        elif isinstance(exp_ret_raw, date):
            exp_ret = exp_ret_raw
        else:
            try:
                exp_ret = date.fromisoformat(str(exp_ret_raw)[:10])
            except Exception:
                exp_ret = None
    in_svc_raw = getattr(c, "logistics_in_service_since", None)
    in_svc_since: Optional[datetime] = None
    if isinstance(in_svc_raw, datetime):
        in_svc_since = in_svc_raw
    elif in_svc_raw is not None:
        try:
            in_svc_since = datetime.fromisoformat(str(in_svc_raw).replace("Z", "+00:00")[:19])
        except Exception:
            in_svc_since = None

    status_st = _norm_complaint_status(getattr(c, "status", None))
    addr_snap = (str(getattr(c, "customer_address", None) or "").strip() or None)
    customer_address_out = addr_snap or _customer_address_for_complaint_read(summary)

    rd_raw = getattr(c, "response_deadline", None)
    rd_days: Optional[int] = None
    rd_over = False
    if isinstance(rd_raw, datetime) and status_st in OPEN_RESPONSE_DEADLINE_STATUSES:
        rd_over = now > rd_raw
        rd_days = (rd_raw.date() - now.date()).days

    auto_acc = bool(getattr(c, "auto_accepted", False))
    wfs_raw = getattr(c, "waiting_for_product_since", None)
    wrsa_raw = getattr(c, "waiting_reminder_sent_at", None)
    wfu = False
    if isinstance(wfs_raw, datetime) and wrsa_raw is None and (now - wfs_raw).total_seconds() >= 7 * 86400:
        wfu = True

    raw_aud = complaint_audit_events_from_db(getattr(c, "audit_events_json", None))
    audit_out: List[ComplaintAuditEventRead] = []
    for row in raw_aud:
        try:
            audit_out.append(ComplaintAuditEventRead.model_validate(row))
        except Exception:
            continue

    ev_rows, _ev_total = list_events_for_complaint(db, c.id, limit=10000, offset=0)
    complaint_events_out: List[ComplaintEventRead] = rows_to_read(ev_rows)

    doc_rows = (
        db.query(ComplaintDocument)
        .filter(ComplaintDocument.complaint_id == c.id)
        .order_by(desc(ComplaintDocument.created_at), desc(ComplaintDocument.id))
        .all()
    )
    docs_out: List[ComplaintDocumentRead] = []
    for drow in doc_rows:
        meta_parsed: Optional[Dict[str, Any]] = None
        mj = getattr(drow, "meta_json", None)
        if mj and str(mj).strip():
            try:
                parsed = json.loads(mj)
                if isinstance(parsed, dict):
                    meta_parsed = parsed
            except Exception:
                meta_parsed = None
        docs_out.append(
            ComplaintDocumentRead(
                id=drow.id,
                type=str(drow.type or ""),
                title=getattr(drow, "title", None),
                file_url=str(drow.file_url or ""),
                created_at=getattr(drow, "created_at", None),
                meta=meta_parsed,
            )
        )

    parent_id_raw = getattr(c, "parent_complaint_id", None)
    parent_complaint_id: Optional[int] = int(parent_id_raw) if parent_id_raw is not None else None
    parent_brief: Optional[ComplaintRelatedBrief] = None
    if parent_complaint_id is not None:
        prow = (
            db.query(Complaint)
            .filter(Complaint.id == parent_complaint_id, Complaint.deleted_at.is_(None))
            .first()
        )
        if prow:
            parent_brief = ComplaintRelatedBrief(
                id=prow.id,
                reference_code=prow.reference_code,
                title=prow.title,
                status=_norm_complaint_status(getattr(prow, "status", None)),
                created_at=getattr(prow, "created_at", None),
            )
    child_rows = (
        db.query(Complaint)
        .filter(Complaint.parent_complaint_id == c.id, Complaint.deleted_at.is_(None))
        .order_by(Complaint.id.asc())
        .all()
    )
    child_briefs: List[ComplaintRelatedBrief] = [
        ComplaintRelatedBrief(
            id=ch.id,
            reference_code=ch.reference_code,
            title=ch.title,
            status=_norm_complaint_status(getattr(ch, "status", None)),
            created_at=getattr(ch, "created_at", None),
        )
        for ch in child_rows
    ]

    return ComplaintRead(
        id=c.id,
        tenant_id=c.tenant_id,
        warehouse_id=c.warehouse_id,
        order_id=c.order_id,
        parent_complaint_id=parent_complaint_id,
        parent_complaint=parent_brief,
        child_complaints=child_briefs,
        title=c.title,
        reference_code=c.reference_code,
        description=c.description,
        created_at=c.created_at,
        response_deadline=getattr(c, "response_deadline", None),
        auto_accepted=auto_acc,
        accepted_by_law=auto_acc,
        response_deadline_days_remaining=rd_days,
        response_deadline_is_overdue=rd_over,
        status=status_st,
        order=summary,
        lines=lines_out,
        photo_urls=customer_photo_urls,
        warehouse_photo_urls=warehouse_photo_urls,
        customer_name=customer_name,
        customer_phone=phone,
        customer_email=email,
        order_source=summary.source if summary else None,
        product_name=product_name_first,
        product_sku=sku_first,
        product_image_url=image_first,
        customer_photo_urls=customer_photo_urls,
        defect_ids=aggregate_defect_ids,
        customer_reason=customer_reason_only,
        customer_address=customer_address_out,
        waiting_for_product_since=wfs_raw if isinstance(wfs_raw, datetime) else None,
        waiting_reminder_sent_at=wrsa_raw if isinstance(wrsa_raw, datetime) else None,
        waiting_product_followup_due=wfu,
        audit_events=audit_out,
        complaint_events=complaint_events_out,
        major_defect=bool(getattr(c, "major_defect", False)),
        repair_failed=bool(getattr(c, "repair_failed", False)),
        replacement_failed=bool(getattr(c, "replacement_failed", False)),
        operational_decision=(str(getattr(c, "operational_decision", None) or "").strip() or None),
        financial_decision=(str(getattr(c, "financial_decision", None) or "").strip() or None),
        logistics_status=ls_norm,
        logistics_service_rma=(str(getattr(c, "logistics_service_rma", None) or "").strip() or None),
        logistics_expected_return_date=exp_ret if isinstance(exp_ret, date) else None,
        logistics_in_service_since=in_svc_since if isinstance(in_svc_since, datetime) else None,
        logistics_waiting_reminder=l_rem,
        logistics_service_overdue_alert=l_svc,
        resolution_type=(str(getattr(c, "resolution_type", None) or "").strip() or None),
        resolution_status=(str(getattr(c, "resolution_status", None) or "").strip() or None),
        resolution_amount=(
            round(float(getattr(c, "resolution_amount")), 2)
            if getattr(c, "resolution_amount", None) is not None
            else None
        ),
        resolution_currency=(str(getattr(c, "resolution_currency", None) or "").strip() or None),
        documents=docs_out,
    )


def _list_read(c: Complaint, db: Session) -> ComplaintListRead:
    order_row = getattr(c, "order", None)
    order_number = getattr(order_row, "number", None) if order_row else None
    nm, sku, ean, qty, img = _first_line_list_preview(c)
    if not img:
        img = _first_line_product_image_url(c)
    snap_n = (str(getattr(c, "customer_name", None) or "").strip() or None)
    snap_p = (str(getattr(c, "customer_phone", None) or "").strip() or None)
    snap_e = (str(getattr(c, "customer_email", None) or "").strip() or None)
    cust = snap_n or _customer_name_from_order_row(order_row)
    phone, email = snap_p, snap_e
    if order_row is not None:
        raw_addr = getattr(order_row, "addresses_json", None)
        oph, oem = _contact_from_addresses_json(raw_addr if raw_addr else None)
        phone = phone or oph
        email = email or oem
    now = datetime.utcnow()
    status_st = _norm_complaint_status(getattr(c, "status", None))
    rd_raw = getattr(c, "response_deadline", None)
    rd_days: Optional[int] = None
    rd_over = False
    if isinstance(rd_raw, datetime) and status_st in OPEN_RESPONSE_DEADLINE_STATUSES:
        rd_over = now > rd_raw
        rd_days = (rd_raw.date() - now.date()).days
    auto_acc = bool(getattr(c, "auto_accepted", False))
    lines_count = len(getattr(c, "lines", None) or [])
    return ComplaintListRead(
        id=c.id,
        title=c.title,
        reference_code=c.reference_code,
        created_at=c.created_at,
        response_deadline=getattr(c, "response_deadline", None),
        auto_accepted=auto_acc,
        accepted_by_law=auto_acc,
        response_deadline_days_remaining=rd_days,
        response_deadline_is_overdue=rd_over,
        order_id=c.order_id,
        order_number=order_number,
        status=_norm_complaint_status(getattr(c, "status", None)),
        product_image_url=img,
        product_name=nm,
        product_sku=sku,
        product_ean=ean,
        line_quantity=qty,
        customer_name=cust,
        customer_phone=phone,
        customer_email=email,
        defect_ids=_defect_ids_from_complaint(c),
        customer_reason=_list_customer_reason_display(c),
        lines_count=lines_count,
    )


@router.get("/status-summary", response_model=ComplaintStatusSummary)
def complaint_status_summary(
    tenant_id: int = Query(...),
    warehouse_id: int = Depends(complaint_panel_warehouse_id),
    db: Session = Depends(get_db),
):
    _apply_due_response_deadlines(db, tenant_id, warehouse_id)
    scope = _tenant_warehouse_active(tenant_id, warehouse_id)
    total = int(db.query(Complaint).filter(scope).count() or 0)
    rows = (
        db.query(Complaint.status, func.count(Complaint.id))
        .filter(scope)
        .group_by(Complaint.status)
        .all()
    )
    counts = {s: 0 for s in STATUS_SUMMARY_ORDER}
    for st, cnt in rows:
        key = _norm_complaint_status(st)
        counts[key] = int(counts.get(key, 0)) + int(cnt or 0)
    by_status = [ComplaintStatusCountRow(status=s, count=counts[s]) for s in STATUS_SUMMARY_ORDER]
    return ComplaintStatusSummary(total=total, by_status=by_status)


@router.get("/")
def list_complaints(
    response: Response,
    tenant_id: int = Query(...),
    warehouse_id: int = Depends(complaint_panel_warehouse_id),
    db: Session = Depends(get_db),
    q: Optional[str] = Query(None, description="Search title or reference"),
    status: Optional[str] = Query(
        None,
        description="Dokładny status: NOWE | WERYFIKACJA | DECYZJA | ZAAKCEPTOWANA | ODRZUCONA",
    ),
    sort_by: str = Query(
        "deadline_urgency",
        description="deadline_urgency | created_at | id | title",
    ),
    sort_dir: str = Query("desc"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    try:
        _apply_due_response_deadlines(db, tenant_id, warehouse_id)
        query = (
            db.query(Complaint)
            .options(
                joinedload(Complaint.order),
                joinedload(Complaint.lines).joinedload(ComplaintLine.order_item).joinedload(OrderItem.product),
            )
            .filter(_tenant_warehouse_active(tenant_id, warehouse_id))
        )
        if status and str(status).strip():
            raw = str(status).strip().upper()
            if raw not in ALL_PROCESS:
                raise HTTPException(status_code=400, detail="Invalid complaint list status filter")
            if raw == "NOWE":
                query = query.filter(or_(Complaint.status.is_(None), Complaint.status == "", Complaint.status == "NOWE"))
            else:
                query = query.filter(Complaint.status == raw)

        if q and q.strip():
            term = f"%{q.strip()}%"
            query = query.filter(or_(Complaint.title.ilike(term), Complaint.reference_code.ilike(term)))

        dialect_name = _db_dialect_name(db)
        norm_sort = (sort_by or "").strip().lower()
        if norm_sort == "deadline_urgency":
            query = query.order_by(*_complaint_deadline_urgency_order(dialect_name=dialect_name))
        else:
            known_cols = {
                "id": Complaint.id,
                "title": Complaint.title,
                "created_at": Complaint.created_at,
            }
            if norm_sort not in known_cols:
                query = query.order_by(nullslast(desc(Complaint.created_at)), desc(Complaint.id))
            else:
                sort_col = known_cols[norm_sort]
                if (sort_dir or "desc").lower() == "asc":
                    query = query.order_by(sort_col.asc(), Complaint.id.asc())
                else:
                    query = query.order_by(nullslast(desc(sort_col)), desc(Complaint.id))

        total = query.count()
        rows: List[Complaint] = query.offset(offset).limit(limit).all()
        out = [_list_read(c, db) for c in rows]
        response.headers["X-Total-Count"] = str(total)
        return out
    except HTTPException:
        raise
    except Exception as exc:
        sql_text = _compile_query_sql_for_log(query) if "query" in locals() else "<query not built>"
        logger.error(
            "[complaints.list] failed tenant_id=%s warehouse_id=%s sort_by=%s sort_dir=%s "
            "limit=%s offset=%s exception_type=%s sql=%s traceback=%s",
            tenant_id,
            warehouse_id,
            sort_by,
            sort_dir,
            limit,
            offset,
            type(exc).__name__,
            sql_text,
            traceback.format_exc(),
        )
        raise HTTPException(status_code=500, detail="Nie udało się wczytać listy reklamacji.") from exc


_PHOTO_KIND_AUDIT: dict[str, tuple[str, str]] = {
    "customer": ("customer_photos_added", "Dodano zdjęcia zgłoszenia (klient)"),
    "warehouse": ("warehouse_photos_added", "Dodano zdjęcia magazynowe"),
    "defect_evidence": ("defect_photos_added", "Dodano zdjęcia dokumentujące wady"),
}


@router.post("/{complaint_id}/photos", response_model=ComplaintRead)
async def upload_complaint_panel_photos(
    complaint_id: int,
    request: Request,
    tenant_id: int = Query(...),
    warehouse_id: Optional[int] = Query(
        None,
        ge=1,
        description="Opcjonalny magazyn; musi zgadzać się z magazynem reklamacji (jak GET /complaints/{id}/).",
    ),
    photo_kind: str = Query(
        "customer",
        description="customer | warehouse | defect_evidence — wpis audytu",
    ),
    complaint_item_id: Optional[int] = Query(
        default=None,
        description="ID pozycji reklamacji (complaint_lines.id) do przypięcia zdjęć per item",
    ),
    db: Session = Depends(get_db),
):
    """Dopisuje pliki do photo_urls_json (multipart pole `photos`)."""
    wh_id = _warehouse_id_for_complaint_by_id(db, complaint_id, tenant_id, warehouse_id)
    _apply_due_response_deadlines(db, tenant_id, wh_id)
    pk = (photo_kind or "customer").strip().lower()
    if pk not in _PHOTO_KIND_AUDIT:
        raise HTTPException(status_code=400, detail="Nieprawidłowy photo_kind.")
    ev_type, ev_msg = _PHOTO_KIND_AUDIT[pk]
    c = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.order),
            joinedload(Complaint.lines).joinedload(ComplaintLine.order_item).joinedload(OrderItem.product),
        )
        .filter(
            Complaint.id == complaint_id,
            _tenant_warehouse_active(tenant_id, wh_id),
        )
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found")
    ct_hdr = (request.headers.get("content-type") or "").lower()
    if "multipart/form-data" not in ct_hdr:
        raise HTTPException(status_code=400, detail="Oczekiwano multipart/form-data z polami photos.")
    form = await request.form()
    saved_raw: List[str] = []
    for _key, val in form.multi_items():
        if _key != "photos":
            continue
        if len(saved_raw) >= _MAX_UPLOAD_FILES:
            break
        if not isinstance(val, UploadFile):
            continue
        content = await val.read()
        if not content:
            continue
        ctype_norm = validate_complaint_image_part(content, val.content_type)
        saved_raw.append(save_complaint_image(content, complaint_id, ctype_norm))
    # Multipart may repeat the same field; two saves → two URLs unless we dedupe incoming first.
    saved = merge_photo_url_strings_idempotent([], saved_raw, max_len=_MAX_UPLOAD_FILES)
    logger.debug(
        "complaint_panel_photos complaint_id=%s multipart_parts=%s unique_incoming=%s urls=%s",
        complaint_id,
        len(saved_raw),
        len(saved),
        saved,
    )
    target_line: Optional[ComplaintLine] = None
    if complaint_item_id is not None:
        target_line = next((ln for ln in (c.lines or []) if int(getattr(ln, "id", 0) or 0) == int(complaint_item_id)), None)
        if target_line is None:
            raise HTTPException(status_code=400, detail="Nieprawidłowe complaint_item_id dla tej reklamacji.")
    if pk == "warehouse":
        existing = complaint_photo_urls_from_db(getattr(c, "warehouse_photo_urls_json", None))
        merged = merge_photo_url_strings_idempotent(existing, saved, max_len=_MAX_COMPLAINT_PHOTOS_TOTAL)
        c.warehouse_photo_urls_json = json.dumps(merged, ensure_ascii=False) if merged else None
    else:
        existing = complaint_photo_urls_from_db(c.photo_urls_json)
        merged = merge_photo_url_strings_idempotent(existing, saved, max_len=_MAX_COMPLAINT_PHOTOS_TOTAL)
        c.photo_urls_json = json.dumps(merged, ensure_ascii=False) if merged else None
    # Exactly one write to line.photo_urls_json per request (single merge, no second propagation step).
    if target_line is not None and saved:
        existing_line = complaint_photo_urls_from_db(getattr(target_line, "photo_urls_json", None))
        before_line_ct = len(existing_line)
        merged_line = merge_photo_url_strings_idempotent(
            existing_line,
            saved,
            max_len=_MAX_COMPLAINT_PHOTOS_TOTAL,
        )
        logger.debug(
            "complaint_panel_photos line_id=%s line_before=%s line_after=%s incoming_unique=%s merged_urls=%s",
            getattr(target_line, "id", None),
            before_line_ct,
            len(merged_line),
            len(saved),
            merged_line,
        )
        target_line.photo_urls_json = (
            json.dumps(merged_line, ensure_ascii=False) if merged_line else None
        )
        db.add(target_line)
    db.add(c)
    if saved:
        append_complaint_audit_event(
            db,
            complaint_id,
            ev_type,
            f"{ev_msg}: {len(saved)} plik(ów).",
            meta={"kind": pk, "added": len(saved), "complaint_item_id": complaint_item_id},
        )
    db.commit()
    refreshed = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.order),
            joinedload(Complaint.lines).joinedload(ComplaintLine.order_item).joinedload(OrderItem.product),
        )
        .filter(Complaint.id == complaint_id, _tenant_warehouse_active(tenant_id, wh_id))
        .first()
    )
    if not refreshed:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return build_complaint_read(db, refreshed)


@router.post("/{complaint_id}/wms-update", response_model=ComplaintRead)
def wms_update_complaint_items(
    complaint_id: int,
    body: ComplaintWmsUpdateBody = Body(default_factory=ComplaintWmsUpdateBody),
    tenant_id: int = Query(...),
    warehouse_id: Optional[int] = Query(
        None,
        ge=1,
        description="Opcjonalny magazyn; musi zgadzać się z magazynem reklamacji (jak GET /complaints/{id}/).",
    ),
    db: Session = Depends(get_db),
):
    """Persist WMS inspection data per complaint line (warehouse note + attached photo urls)."""
    wh_id = _warehouse_id_for_complaint_by_id(db, complaint_id, tenant_id, warehouse_id)
    _apply_due_response_deadlines(db, tenant_id, wh_id)
    c = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.order),
            joinedload(Complaint.lines).joinedload(ComplaintLine.order_item).joinedload(OrderItem.product),
        )
        .filter(
            Complaint.id == complaint_id,
            _tenant_warehouse_active(tenant_id, wh_id),
        )
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found")

    line_by_id: Dict[int, ComplaintLine] = {int(ln.id): ln for ln in (c.lines or [])}
    updates = body.items or []

    changed = 0
    for row in updates:
        raw_id = str(row.item_id or "").strip()
        if not raw_id:
            continue
        try:
            line_id = int(raw_id)
        except Exception:
            continue
        line = line_by_id.get(line_id)
        if line is None:
            continue

        note_norm = (str(row.note_warehouse or "").strip() or None)
        if getattr(line, "note_warehouse", None) != note_norm:
            line.note_warehouse = note_norm
            changed += 1

        photos_in = [str(u).strip() for u in (row.photos or []) if str(u).strip()]
        photos_norm = [u for u in photos_in if u.startswith("/uploads/") or u.startswith("http://") or u.startswith("https://")]
        photos_norm = photos_norm[:50]
        existing = complaint_photo_urls_from_db(getattr(line, "photo_urls_json", None))
        if bool(getattr(row, "replace_photos", False)):
            merged = dedupe_complaint_photo_urls_preserve_order(photos_norm)[:50]
        else:
            merged = merge_photo_url_strings_idempotent(existing, photos_norm, max_len=50)
        next_json = json.dumps(merged, ensure_ascii=False) if merged else None
        if getattr(line, "photo_urls_json", None) != next_json:
            line.photo_urls_json = next_json
            changed += 1

        db.add(line)

    if changed > 0:
        append_complaint_audit_event(
            db,
            complaint_id,
            "wms_update",
            f"Zapisano dane WMS dla {len(updates)} pozycji.",
            meta={"items": len(updates)},
        )
    db.commit()

    refreshed = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.order),
            joinedload(Complaint.lines).joinedload(ComplaintLine.order_item).joinedload(OrderItem.product),
        )
        .filter(
            Complaint.id == complaint_id,
            _tenant_warehouse_active(tenant_id, wh_id),
        )
        .first()
    )
    if not refreshed:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return build_complaint_read(db, refreshed)


@router.get("/{complaint_id}/", response_model=ComplaintRead)
def get_complaint(
    complaint_id: int,
    tenant_id: int = Query(...),
    warehouse_id: Optional[int] = Query(
        None,
        ge=1,
        description="Opcjonalny magazyn; musi zgadzać się z magazynem reklamacji.",
    ),
    db: Session = Depends(get_db),
):
    wh_id = _warehouse_id_for_complaint_by_id(db, complaint_id, tenant_id, warehouse_id)
    _apply_due_response_deadlines(db, tenant_id, wh_id)
    c = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.order),
            joinedload(Complaint.lines).joinedload(ComplaintLine.order_item).joinedload(OrderItem.product),
        )
        .filter(
            Complaint.id == complaint_id,
            _tenant_warehouse_active(tenant_id, wh_id),
        )
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return build_complaint_read(db, c)


@router.get("/{complaint_id}/events", response_model=ComplaintEventListResponse)
def list_complaint_structured_events(
    complaint_id: int,
    tenant_id: int = Query(...),
    warehouse_id: Optional[int] = Query(
        None,
        ge=1,
        description="Opcjonalny magazyn; musi zgadzać się z magazynem reklamacji.",
    ),
    limit: int = Query(500, ge=1, le=10000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Paginated structured event log (newest first). For large histories, use this instead of the full complaint read."""
    wh_id = _warehouse_id_for_complaint_by_id(db, complaint_id, tenant_id, warehouse_id)
    c = (
        db.query(Complaint)
        .filter(
            Complaint.id == complaint_id,
            _tenant_warehouse_active(tenant_id, wh_id),
        )
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found")
    rows, total = list_events_for_complaint(db, complaint_id, limit=limit, offset=offset)
    return ComplaintEventListResponse(
        items=rows_to_read(rows),
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/{complaint_id}/documents/regenerate", response_model=ComplaintRead)
def regenerate_complaint_documents_endpoint(
    complaint_id: int,
    tenant_id: int = Query(...),
    warehouse_id: int = Depends(complaint_panel_warehouse_id),
    body: ComplaintDocumentsRegenerateBody = Body(default_factory=ComplaintDocumentsRegenerateBody),
    db: Session = Depends(get_db),
):
    """Ponowne wygenerowanie PDF (decyzja / korekta / RMA) — tylko gdy spełnione warunki danej kategorii."""
    _apply_due_response_deadlines(db, tenant_id, warehouse_id)
    c = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.order),
            joinedload(Complaint.lines).joinedload(ComplaintLine.order_item).joinedload(OrderItem.product),
        )
        .filter(
            Complaint.id == complaint_id,
            _tenant_warehouse_active(tenant_id, warehouse_id),
        )
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found")
    try:
        run_regenerate_complaint_documents(db, c, body.types)
        db.commit()
    except Exception:
        logger.exception("regenerate complaint documents id=%s", complaint_id)
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Nie udało się wygenerować dokumentów PDF (sprawdź log lub pakiet reportlab).",
        ) from None
    c = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.order),
            joinedload(Complaint.lines).joinedload(ComplaintLine.order_item).joinedload(OrderItem.product),
        )
        .filter(
            Complaint.id == complaint_id,
            _tenant_warehouse_active(tenant_id, warehouse_id),
        )
        .first()
    )
    assert c is not None
    return build_complaint_read(db, c)


@router.delete("/{complaint_id}/", response_model=ComplaintDeleteResult)
def delete_complaint(
    complaint_id: int,
    tenant_id: int = Query(...),
    warehouse_id: int = Depends(complaint_panel_warehouse_id),
    db: Session = Depends(get_db),
):
    """Archiwizacja reklamacji (``deleted_at``). Nagłówek pozostaje — FK dzieci (events, lines, …) bez kasowania."""
    c = (
        db.query(Complaint)
        .filter(
            Complaint.id == complaint_id,
            Complaint.tenant_id == tenant_id,
            Complaint.warehouse_id == warehouse_id,
        )
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found")
    if getattr(c, "deleted_at", None) is not None:
        return ComplaintDeleteResult(success=True, mode="archived")
    complaint_set_deleted_at(db, c)
    db.add(c)
    try:
        db.commit()
    except Exception:
        logger.exception("delete_complaint commit failed id=%s", complaint_id)
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Reklamacja posiada chronione powiązania — nie udało się zarchiwizować.",
        ) from None
    return ComplaintDeleteResult(success=True, mode="archived")


@router.patch("/{complaint_id}/status", response_model=ComplaintRead)
def patch_complaint_status(
    complaint_id: int,
    body: ComplaintStatusPatch,
    tenant_id: int = Query(...),
    warehouse_id: int = Depends(complaint_panel_warehouse_id),
    db: Session = Depends(get_db),
):
    _apply_due_response_deadlines(db, tenant_id, warehouse_id)
    c = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.order),
            joinedload(Complaint.lines).joinedload(ComplaintLine.order_item).joinedload(OrderItem.product),
        )
        .filter(
            Complaint.id == complaint_id,
            _tenant_warehouse_active(tenant_id, warehouse_id),
        )
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found")
    cur = _norm_complaint_status(getattr(c, "status", None))
    nxt = _norm_complaint_status(body.status)
    if not _can_transition_status(cur, nxt):
        raise HTTPException(status_code=400, detail="Niedozwolona zmiana etapu reklamacji.")
    if nxt in PROCESS_TERMINALS:
        _assert_lines_ready_for_complaint_terminal_close(c)
    old_st = str(getattr(c, "status", None) or "").strip() or cur
    c.status = nxt
    now_ts = datetime.utcnow()
    if nxt == "OCZEKIWANIE_NA_PRODUKT" and getattr(c, "waiting_for_product_since", None) is None:
        c.waiting_for_product_since = now_ts
    if cur == "OCZEKIWANIE_NA_PRODUKT" and nxt != "OCZEKIWANIE_NA_PRODUKT":
        c.waiting_for_product_since = None
        c.waiting_reminder_sent_at = None
    db.add(c)
    append_complaint_audit_event(
        db,
        c.id,
        "status_change",
        f"Etap reklamacji: {cur} → {nxt}",
        meta={"from": cur, "to": nxt},
    )
    try:
        maybe_sync_decision_on_terminal(db, c, nxt)
    except Exception:
        logger.exception("complaint decision PDF sync failed id=%s", c.id)
    db.commit()
    notify_complaint_status_change_stub(c.id, old_st, nxt)
    db.refresh(c)
    c = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.order),
            joinedload(Complaint.lines).joinedload(ComplaintLine.order_item).joinedload(OrderItem.product),
        )
        .filter(Complaint.id == c.id)
        .first()
    )
    assert c is not None
    return build_complaint_read(db, c)


@router.patch("/{complaint_id}/decisions", response_model=ComplaintRead)
def patch_complaint_decisions(
    complaint_id: int,
    body: ComplaintDecisionPatch,
    tenant_id: int = Query(...),
    warehouse_id: int = Depends(complaint_panel_warehouse_id),
    db: Session = Depends(get_db),
):
    """Aktualizacja flag hierarchii i decyzji — walidacja na backendzie (nie da się pominąć naprawy/wymiany)."""
    _apply_due_response_deadlines(db, tenant_id, warehouse_id)
    c = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.order),
            joinedload(Complaint.lines).joinedload(ComplaintLine.order_item).joinedload(OrderItem.product),
        )
        .filter(
            Complaint.id == complaint_id,
            _tenant_warehouse_active(tenant_id, warehouse_id),
        )
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found")
    data = body.model_dump(exclude_unset=True)
    defect_changed = False
    if "defect_ids" in data:
        new_ids = data.pop("defect_ids")
        old_ids = _defect_ids_from_complaint(c)
        norm_new = list(new_ids) if isinstance(new_ids, list) else []
        if norm_new != old_ids:
            c.defects_json = json.dumps(norm_new) if norm_new else None
            defect_changed = True
            append_complaint_audit_event(
                db,
                c.id,
                "defects_updated",
                f"Zaktualizowano tagi wad ({len(norm_new)}).",
                meta={"to": norm_new, "from": old_ids},
            )
    if "major_defect" in data:
        c.major_defect = bool(data["major_defect"])
    if "repair_failed" in data:
        c.repair_failed = bool(data["repair_failed"])
    if "replacement_failed" in data:
        c.replacement_failed = bool(data["replacement_failed"])
    if "operational_decision" in data:
        od = data["operational_decision"]
        if od is None:
            c.operational_decision = None
        else:
            os_ = str(od).strip()
            if not os_:
                c.operational_decision = None
            elif os_ not in ALLOWED_OPERATIONAL_DECISIONS:
                raise HTTPException(status_code=400, detail="Nieobsługiwana decyzja operacyjna.")
            else:
                c.operational_decision = os_
    if "financial_decision" in data:
        fd = data["financial_decision"]
        if fd is None:
            c.financial_decision = None
        else:
            fs_ = str(fd).strip()
            if not fs_:
                c.financial_decision = None
            elif fs_ not in ALLOWED_FINANCIAL_DECISIONS:
                raise HTTPException(status_code=400, detail="Nieobsługiwana decyzja finansowa.")
            else:
                c.financial_decision = fs_
    _validate_complaint_decision_hierarchy(c)
    # Brak osobnego wpisu "decision_update" — wybór decyzji pozycji jest w LINE_UPDATED (jedna akcja = jeden wpis).
    db.add(c)
    db.commit()
    db.refresh(c)
    return build_complaint_read(db, c)


@router.patch("/{complaint_id}/resolution", response_model=ComplaintRead)
def patch_complaint_resolution(
    complaint_id: int,
    body: ComplaintResolutionPatch,
    tenant_id: int = Query(...),
    warehouse_id: int = Depends(complaint_panel_warehouse_id),
    db: Session = Depends(get_db),
):
    """Rozliczenie z klientem — tylko po zamknięciu reklamacji (Zaakceptowana lub Odrzucona)."""
    _apply_due_response_deadlines(db, tenant_id, warehouse_id)
    c = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.order),
            joinedload(Complaint.lines).joinedload(ComplaintLine.order_item).joinedload(OrderItem.product),
        )
        .filter(
            Complaint.id == complaint_id,
            _tenant_warehouse_active(tenant_id, warehouse_id),
        )
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found")
    st = _norm_complaint_status(getattr(c, "status", None))
    if st not in RESOLUTION_ALLOWED_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Rozliczenie można zatwierdzić dopiero po zakończeniu reklamacji (status: Zaakceptowana lub Odrzucona).",
        )

    rtype = str(body.resolution_type).strip().upper()
    if rtype not in ("REPLACEMENT", "REFUND", "PARTIAL_REFUND", "REJECTION"):
        raise HTTPException(status_code=400, detail="Nieobsługiwany typ rozliczenia.")

    _validate_resolution_unlock(c, rtype)
    total, default_cur = _source_order_total_and_currency(db, c)
    cur_in = (str(body.resolution_currency or "").strip() or default_cur)[:8]

    if rtype in ("REFUND", "PARTIAL_REFUND"):
        if body.resolution_amount is None:
            raise HTTPException(status_code=400, detail="Podaj kwotę zwrotu.")
        a = round(float(body.resolution_amount), 2)
        if a <= 0:
            raise HTTPException(status_code=400, detail="Kwota zwrotu musi być większa od zera.")
        if a > total:
            raise HTTPException(
                status_code=400,
                detail=f"Kwota nie może przekroczyć wartości zamówienia ({total} {default_cur}).",
            )
        if rtype == "REFUND" and round(a, 2) != round(total, 2):
            raise HTTPException(
                status_code=400,
                detail=f"Pełny zwrot — kwota musi wynosić {total} {default_cur}.",
            )
        if rtype == "PARTIAL_REFUND" and round(a, 2) >= round(total, 2):
            raise HTTPException(
                status_code=400,
                detail="Częściowy zwrot wymaga kwoty mniejszej niż wartość zamówienia.",
            )
        c.resolution_amount = a
        c.resolution_currency = cur_in or default_cur
    else:
        c.resolution_amount = None
        c.resolution_currency = None

    c.resolution_type = rtype
    if rtype == "REPLACEMENT":
        c.resolution_status = "PENDING"
    else:
        c.resolution_status = "COMPLETED"

    c.financial_decision = _sync_financial_decision_from_resolution(rtype)
    _validate_complaint_decision_hierarchy(c)

    meta = {
        "resolution_type": rtype,
        "resolution_status": c.resolution_status,
        "amount": c.resolution_amount,
        "currency": c.resolution_currency,
    }
    append_complaint_audit_event(
        db,
        c.id,
        "resolution_set",
        f"Ustawiono rozliczenie: {rtype}",
        meta=meta,
    )
    if rtype in ("REFUND", "PARTIAL_REFUND"):
        append_complaint_audit_event(
            db,
            c.id,
            "refund_created",
            f"Zapisano kwotę zwrotu: {c.resolution_amount} {c.resolution_currency}",
            meta={"amount": c.resolution_amount, "currency": c.resolution_currency, "kind": rtype},
        )

    db.add(c)
    db.commit()
    db.refresh(c)
    c = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.order),
            joinedload(Complaint.lines).joinedload(ComplaintLine.order_item).joinedload(OrderItem.product),
        )
        .filter(Complaint.id == c.id)
        .first()
    )
    assert c is not None
    try:
        maybe_sync_correction_on_refund(db, c, rtype)
        db.commit()
    except Exception:
        logger.exception("complaint correction PDF sync failed id=%s", c.id)
        db.rollback()
    c = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.order),
            joinedload(Complaint.lines).joinedload(ComplaintLine.order_item).joinedload(OrderItem.product),
        )
        .filter(Complaint.id == complaint_id, _tenant_warehouse_active(tenant_id, warehouse_id))
        .first()
    )
    assert c is not None
    return build_complaint_read(db, c)


@router.patch("/{complaint_id}/lines/{line_id}", response_model=ComplaintRead)
def patch_complaint_line(
    complaint_id: int,
    line_id: int,
    body: ComplaintLinePatch,
    tenant_id: int = Query(...),
    warehouse_id: int = Depends(complaint_panel_warehouse_id),
    db: Session = Depends(get_db),
):
    _apply_due_response_deadlines(db, tenant_id, warehouse_id)
    c = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.order),
            joinedload(Complaint.lines).joinedload(ComplaintLine.order_item).joinedload(OrderItem.product),
        )
        .filter(
            Complaint.id == complaint_id,
            _tenant_warehouse_active(tenant_id, warehouse_id),
        )
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found")
    line = next((ln for ln in (c.lines or []) if ln.id == line_id), None)
    if line is None:
        raise HTTPException(status_code=404, detail="Complaint line not found")
    settle_before = (
        getattr(line, "settlement_type", None),
        getattr(line, "settlement_amount", None),
        getattr(line, "settlement_currency", None),
    )
    payload = body.model_dump(exclude_unset=True)
    old_line_status = _norm_complaint_status(getattr(line, "line_status", None))
    old_ek_snap = _norm_exchange_kind(getattr(line, "exchange_kind", None))
    old_op_snap = getattr(line, "operation_status", None)
    old_dec = (str(line.line_decision).strip().lower() if line.line_decision else None)
    if old_dec not in (None, "") and old_dec not in ALLOWED_LINE_DECISIONS:
        old_dec = None
    new_dec = old_dec
    if "decision" in payload:
        raw_d = payload["decision"]
        if raw_d is None or (isinstance(raw_d, str) and not str(raw_d).strip()):
            new_dec = None
        else:
            d = str(raw_d).strip().lower()
            if d not in ALLOWED_LINE_DECISIONS:
                raise HTTPException(status_code=400, detail="Invalid line decision")
            new_dec = d
    decision_changed = (new_dec or "") != (old_dec or "")
    if "decision" in payload:
        line.line_decision = new_dec
    if decision_changed:
        line.operation_status = None
        line.exchange_kind = None
        line.settlement_type = None
        line.settlement_amount = None
        line.settlement_currency = None
    if "exchange_kind" in payload:
        raw_ek = payload["exchange_kind"]
        cur_dec = str(line.line_decision or "").strip().lower()
        if raw_ek is None or (isinstance(raw_ek, str) and not str(raw_ek).strip()):
            line.exchange_kind = None
            line.operation_status = None
        else:
            ek = str(raw_ek).strip().upper()
            if ek not in ALLOWED_LINE_EXCHANGE_KIND:
                raise HTTPException(status_code=400, detail="Nieprawidłowy tryb wymiany.")
            if cur_dec != "exchange":
                raise HTTPException(
                    status_code=400,
                    detail="Tryb wymiany można ustawić tylko przy decyzji „wymiana”.",
                )
            old_ek = _norm_exchange_kind(getattr(line, "exchange_kind", None))
            line.exchange_kind = ek
            if old_ek != ek:
                line.operation_status = None
    if "settlement_type" in payload:
        raw_st = payload["settlement_type"]
        if raw_st is None:
            line.settlement_type = None
        else:
            st = str(raw_st).strip().upper()
            line.settlement_type = st if st else None
    if "settlement_amount" in payload:
        amt_raw = payload["settlement_amount"]
        if amt_raw is None:
            line.settlement_amount = None
        else:
            try:
                line.settlement_amount = round(float(amt_raw), 2)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="Nieprawidłowa kwota rozliczenia pozycji.")
    if "settlement_currency" in payload:
        cur_raw = payload["settlement_currency"]
        if cur_raw is None or (isinstance(cur_raw, str) and not str(cur_raw).strip()):
            line.settlement_currency = None
        else:
            line.settlement_currency = str(cur_raw).strip()[:8]
    if "status" in payload and payload["status"] is not None:
        line.line_status = _norm_complaint_status(payload["status"])
    if "operation_status" in payload:
        op_raw = payload["operation_status"]
        if op_raw is None or (isinstance(op_raw, str) and not str(op_raw).strip()):
            line.operation_status = None
        else:
            apply_line_operation_transition(line, str(op_raw))

    changed_bits: List[str] = []
    meta: Dict[str, Any] = {"complaint_line_id": line_id}
    if "decision" in payload and decision_changed:
        changed_bits.append("decyzja")
        meta["decision"] = {"from": old_dec, "to": new_dec}
    if "status" in payload and payload.get("status") is not None:
        ns = _norm_complaint_status(getattr(line, "line_status", None))
        if ns != old_line_status:
            changed_bits.append("etap_pozycji")
            meta["line_status"] = {"from": old_line_status, "to": ns}
    if "exchange_kind" in payload:
        ne = _norm_exchange_kind(getattr(line, "exchange_kind", None))
        if ne != old_ek_snap:
            changed_bits.append("tryb_wymiany")
            meta["exchange_kind"] = {"from": old_ek_snap, "to": ne}
    if "operation_status" in payload:
        nop = getattr(line, "operation_status", None)
        if nop != old_op_snap:
            changed_bits.append("operacja_fizyczna")
            meta["operation_status"] = {"from": old_op_snap, "to": nop}
    if changed_bits:
        append_complaint_audit_event(
            db,
            complaint_id,
            "line_update",
            "Pozycja reklamacji — zmiana: " + ", ".join(changed_bits) + ".",
            meta=meta,
        )
    settle_after = (
        getattr(line, "settlement_type", None),
        getattr(line, "settlement_amount", None),
        getattr(line, "settlement_currency", None),
    )
    if settle_before != settle_after and not decision_changed:
        append_complaint_audit_event(
            db,
            complaint_id,
            "line_settlement_saved",
            "Zapisano rozliczenie pozycji.",
            meta={
                "complaint_line_id": line_id,
                "settlement_type": settle_after[0],
                "amount": settle_after[1],
                "currency": settle_after[2],
            },
        )
    db.add(line)
    db.commit()
    c = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.order),
            joinedload(Complaint.lines).joinedload(ComplaintLine.order_item).joinedload(OrderItem.product),
        )
        .filter(Complaint.id == complaint_id, _tenant_warehouse_active(tenant_id, warehouse_id))
        .first()
    )
    assert c is not None
    try:
        maybe_sync_rma_on_lines(db, c)
        db.commit()
    except Exception:
        logger.exception("complaint RMA PDF sync failed id=%s", complaint_id)
        db.rollback()
    c = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.order),
            joinedload(Complaint.lines).joinedload(ComplaintLine.order_item).joinedload(OrderItem.product),
        )
        .filter(Complaint.id == complaint_id, _tenant_warehouse_active(tenant_id, warehouse_id))
        .first()
    )
    assert c is not None
    return build_complaint_read(db, c)


@router.patch("/{complaint_id}/logistics", response_model=ComplaintRead)
def patch_complaint_logistics(
    complaint_id: int,
    body: ComplaintLogisticsActionBody,
    tenant_id: int = Query(...),
    warehouse_id: int = Depends(complaint_panel_warehouse_id),
    db: Session = Depends(get_db),
):
    """Przepływ logistyczny — nie modyfikuje complaint.status (status prawny)."""
    _apply_due_response_deadlines(db, tenant_id, warehouse_id)
    c = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.order),
            joinedload(Complaint.lines).joinedload(ComplaintLine.order_item).joinedload(OrderItem.product),
        )
        .filter(
            Complaint.id == complaint_id,
            _tenant_warehouse_active(tenant_id, warehouse_id),
        )
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found")
    cur = _norm_logistics_status(getattr(c, "logistics_status", None))
    act = body.action
    if act == "mark_received":
        if cur != "WAITING_FOR_ITEM":
            raise HTTPException(
                status_code=400,
                detail="Przyjęcie towaru możliwe tylko w stanie oczekiwania na produkt.",
            )
        c.logistics_status = "RECEIVED"
    elif act == "set_inspection":
        if cur not in ("WAITING_FOR_ITEM", "RECEIVED"):
            raise HTTPException(
                status_code=400,
                detail="Inspekcja: dozwolone ze stanów oczekiwanie na towar lub przyjęte.",
            )
        c.logistics_status = "IN_INSPECTION"
    elif act == "send_to_service":
        if cur not in ("IN_INSPECTION", "RECEIVED"):
            raise HTTPException(
                status_code=400,
                detail="Wysłanie do serwisu: wymaga stanu inspekcji lub przyjęte.",
            )
        rma = (body.service_rma or "").strip()
        if not rma:
            raise HTTPException(status_code=400, detail="Podaj numer RMA serwisu.")
        if body.expected_return_date is None:
            raise HTTPException(status_code=400, detail="Podaj oczekiwaną datę powrotu z serwisu.")
        c.logistics_status = "IN_SERVICE"
        c.logistics_service_rma = rma[:128]
        c.logistics_expected_return_date = body.expected_return_date
        c.logistics_in_service_since = datetime.utcnow()
    elif act == "return_from_service":
        if cur != "IN_SERVICE":
            raise HTTPException(status_code=400, detail="Powrót z serwisu: bieżący stan musi być „W serwisie”.")
        c.logistics_status = "RETURNED_FROM_SERVICE"
        c.logistics_in_service_since = None
    else:
        raise HTTPException(status_code=400, detail="Nieznana akcja logistyczna.")
    db.add(c)
    db.commit()
    db.refresh(c)
    c = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.order),
            joinedload(Complaint.lines).joinedload(ComplaintLine.order_item).joinedload(OrderItem.product),
        )
        .filter(Complaint.id == complaint_id, _tenant_warehouse_active(tenant_id, warehouse_id))
        .first()
    )
    assert c is not None
    return build_complaint_read(db, c)


@router.post("/", response_model=None)
def create_complaint_legacy_removed():
    raise HTTPException(
        status_code=400,
        detail="Reklamacja wymaga zamówienia. Użyj POST /complaints/from-order.",
    )


_MAX_PHOTO_URL_LEN = 2048
_MAX_COMPLAINT_PHOTOS_TOTAL = 30
_MAX_UPLOAD_FILES = 5
_MAX_LINE_PHOTOS_PER_LINE = 5
_MAX_LINE_PHOTOS_TOTAL_AGG = 30


def _collect_body_photo_urls(body: ComplaintCreateFromOrder) -> List[str]:
    """photo_urls z JSON — tylke ścieżki serwera lub http(s); data: → 400."""
    photos: List[str] = []
    if not body.photo_urls:
        return photos
    for u in body.photo_urls[:_MAX_COMPLAINT_PHOTOS_TOTAL]:
        s = str(u).strip()
        if not s or len(s) > _MAX_PHOTO_URL_LEN:
            continue
        low = s[:16].lower()
        if low.startswith("data:"):
            raise HTTPException(
                status_code=400,
                detail="photo_urls nie mogą zawierać data URL — prześlij pliki jako multipart (pole photos).",
            )
        if not (
            s.startswith("/uploads/")
            or s.startswith("http://")
            or s.startswith("https://")
        ):
            raise HTTPException(
                status_code=400,
                detail="photo_urls: dozwolone tylko ścieżki zaczynające się od /uploads/ lub http(s).",
            )
        photos.append(s)
    return photos


def _apply_line_photo_uploads(
    db: Session,
    complaint_id: int,
    line_uploads: Dict[int, List[Tuple[bytes, str]]],
    allowed_order_item_ids: set[int],
) -> None:
    if not line_uploads:
        return
    rows = db.query(ComplaintLine).filter(ComplaintLine.complaint_id == complaint_id).all()
    for cl in rows:
        if cl.order_item_id not in allowed_order_item_ids:
            continue
        parts = line_uploads.get(cl.order_item_id) or []
        if not parts:
            continue
        urls: List[str] = []
        for raw, ctype in parts:
            try:
                urls.append(save_complaint_line_image(raw, complaint_id, cl.order_item_id, ctype))
            except Exception:
                logger.exception(
                    "complaint line image save failed (skipped): complaint_id=%s order_item_id=%s bytes=%s",
                    complaint_id,
                    cl.order_item_id,
                    len(raw),
                )
        if urls:
            cl.photo_urls_json = json.dumps(dedupe_complaint_photo_urls_preserve_order(urls))


def _create_complaint_from_order_body(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    body: ComplaintCreateFromOrder,
    uploaded_parts: List[Tuple[bytes, str]],
    line_uploads: Dict[int, List[Tuple[bytes, str]]],
) -> ComplaintRead:
    order = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(
            Order.id == body.order_id,
            Order.tenant_id == tenant_id,
            Order.warehouse_id == warehouse_id,
        )
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    item_by_id = {it.id: it for it in (order.items or [])}
    seen_oi: set[int] = set()
    line_labels: List[str] = []

    for ln in body.lines:
        if ln.order_item_id in seen_oi:
            raise HTTPException(status_code=400, detail="Duplicate order_item_id in lines")
        seen_oi.add(ln.order_item_id)
        oi = item_by_id.get(ln.order_item_id)
        if not oi:
            raise HTTPException(status_code=400, detail=f"Order item {ln.order_item_id} not in this order")
        if ln.quantity > int(oi.quantity or 0):
            raise HTTPException(status_code=400, detail=f"Quantity too high for order_item {ln.order_item_id}")
        prod = oi.product
        pname = getattr(prod, "name", None) if prod else None
        if pname:
            line_labels.append(pname)

    num = (order.number or str(order.id)).strip()
    title = f"Reklamacja · zam. {num}"
    if line_labels:
        title += " · " + ", ".join(line_labels[:3])
        if len(line_labels) > 3:
            title += "…"
    title = title[:256]

    desc_parts: List[str] = []
    if body.note and str(body.note).strip():
        desc_parts.append(str(body.note).strip())
    description = "\n\n".join(desc_parts) if desc_parts else None
    default_line_defect_ids: List[str] = []
    if body.defect_ids:
        for x in body.defect_ids:
            s = str(x).strip()
            if s and len(s) <= 48 and s not in default_line_defect_ids:
                default_line_defect_ids.append(s)
            if len(default_line_defect_ids) >= 30:
                break

    photos_from_body = _collect_body_photo_urls(body)
    initial_logistics = _initial_logistics_status_for_create(body, item_by_id)

    cust_nm, cust_phone, cust_email, cust_addr = _customer_contact_snapshot_from_order(order)

    created = datetime.utcnow()
    c = Complaint(
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_id=order.id,
        title=title,
        description=description,
        photo_urls_json=json.dumps(photos_from_body) if photos_from_body else None,
        created_at=created,
        response_deadline=created + timedelta(days=COMPLAINT_RESPONSE_DEADLINE_DAYS),
        auto_accepted=False,
        status="NOWE",
        defects_json=None,
        customer_reason=None,
        customer_name=cust_nm,
        customer_phone=cust_phone,
        customer_email=cust_email,
        customer_address=cust_addr,
        logistics_status=initial_logistics,
    )
    db.add(c)
    db.flush()
    c.reference_code = f"CMP-{c.id:06d}"

    disk_urls: List[str] = []
    for raw, ctype in uploaded_parts:
        if len(photos_from_body) + len(disk_urls) >= _MAX_COMPLAINT_PHOTOS_TOTAL:
            break
        try:
            disk_urls.append(save_complaint_image(raw, c.id, ctype))
        except Exception:
            logger.exception(
                "complaint image save failed (skipped): complaint_id=%s bytes=%s",
                c.id,
                len(raw),
            )

    merged_photos = merge_photo_url_strings_idempotent(
        photos_from_body,
        disk_urls,
        max_len=_MAX_COMPLAINT_PHOTOS_TOTAL,
    )
    c.photo_urls_json = json.dumps(merged_photos) if merged_photos else None

    global_defect_ids = default_line_defect_ids
    for ln in body.lines:
        line_defect_ids_clean: List[str] = []
        raw_line_defects = getattr(ln, "defect_ids", None) or global_defect_ids
        if raw_line_defects:
            for x in raw_line_defects:
                s = str(x).strip()
                if s and len(s) <= 48 and s not in line_defect_ids_clean:
                    line_defect_ids_clean.append(s)
                if len(line_defect_ids_clean) >= 30:
                    break
        db.add(
            ComplaintLine(
                complaint_id=c.id,
                order_item_id=ln.order_item_id,
                quantity=ln.quantity,
                reason=None,
                defect_ids_json=(json.dumps(line_defect_ids_clean) if line_defect_ids_clean else None),
                line_status="NOWE",
            )
        )

    db.flush()
    filtered_line_uploads = {k: v for k, v in line_uploads.items() if k in seen_oi}
    _apply_line_photo_uploads(db, c.id, filtered_line_uploads, seen_oi)
    append_complaint_audit_event(
        db,
        c.id,
        "complaint_created",
        f"Utworzono reklamację {c.reference_code}.",
        meta={
            "photos_count": len(merged_photos or []),
            "line_photo_groups": len(filtered_line_uploads),
        },
    )
    if merged_photos:
        append_complaint_audit_event(
            db,
            c.id,
            "customer_photos_added",
            f"Zdjęcia zgłoszenia (klient): {len(merged_photos)} plik(ów).",
            meta={"count": len(merged_photos)},
        )
    n_line_photo_files = sum(len(v) for v in filtered_line_uploads.values())
    if n_line_photo_files:
        append_complaint_audit_event(
            db,
            c.id,
            "line_photos_added",
            f"Zdjęcia na pozycjach zamówienia: {n_line_photo_files} plik(ów).",
            meta={"files": n_line_photo_files, "lines_with_photos": len(filtered_line_uploads)},
        )
    db.commit()

    c = (
        db.query(Complaint)
        .options(
            joinedload(Complaint.order),
            joinedload(Complaint.lines).joinedload(ComplaintLine.order_item).joinedload(OrderItem.product),
        )
        .filter(Complaint.id == c.id)
        .first()
    )
    assert c is not None
    return build_complaint_read(db, c)


@router.post("/from-order", response_model=ComplaintRead)
async def create_complaint_from_order(
    request: Request,
    tenant_id: int = Query(...),
    warehouse_id: int = Depends(complaint_panel_warehouse_id),
    db: Session = Depends(get_db),
):
    uploaded_parts: List[Tuple[bytes, str]] = []
    line_uploads_dict: Dict[int, List[Tuple[bytes, str]]] = {}
    ct_hdr = (request.headers.get("content-type") or "").lower()

    if "multipart/form-data" in ct_hdr:
        form = await request.form()
        data_field = form.get("data")
        if data_field is None:
            raise HTTPException(status_code=400, detail="Brak pola formularza 'data' (JSON).")
        if isinstance(data_field, str):
            data_str = data_field
        elif isinstance(data_field, bytes):
            data_str = data_field.decode("utf-8")
        else:
            data_str = str(data_field)
        try:
            body = ComplaintCreateFromOrder.model_validate_json(data_str)
        except Exception:
            raise HTTPException(status_code=400, detail="Nieprawidłowy JSON w polu 'data'.")
        line_by_oi: Dict[int, List[Tuple[bytes, str]]] = defaultdict(list)
        line_photo_total = 0
        for _key, val in form.multi_items():
            if _key == "photos":
                if len(uploaded_parts) >= _MAX_UPLOAD_FILES:
                    continue
                if not isinstance(val, UploadFile):
                    continue
                content = await val.read()
                fn = val.filename or ""
                logger.info(
                    "complaint from-order photo part: filename=%r bytes=%s content_type=%r",
                    fn,
                    len(content),
                    val.content_type,
                )
                if not content:
                    continue
                ctype_norm = validate_complaint_image_part(content, val.content_type)
                uploaded_parts.append((content, ctype_norm))
                continue
            if isinstance(_key, str) and _key.startswith("line_photo_"):
                suffix = _key[len("line_photo_") :]
                try:
                    oi_id = int(suffix)
                except ValueError:
                    continue
                if len(line_by_oi[oi_id]) >= _MAX_LINE_PHOTOS_PER_LINE or line_photo_total >= _MAX_LINE_PHOTOS_TOTAL_AGG:
                    continue
                if not isinstance(val, UploadFile):
                    continue
                content = await val.read()
                fn = val.filename or ""
                logger.info(
                    "complaint from-order line photo part: order_item_id=%s filename=%r bytes=%s content_type=%r",
                    oi_id,
                    fn,
                    len(content),
                    val.content_type,
                )
                if not content:
                    continue
                ctype_norm = validate_complaint_image_part(content, val.content_type)
                line_by_oi[oi_id].append((content, ctype_norm))
                line_photo_total += 1
        line_uploads_dict = dict(line_by_oi)
    else:
        try:
            raw = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Oczekiwano JSON lub multipart/form-data.")
        body = ComplaintCreateFromOrder.model_validate(raw)

    return _create_complaint_from_order_body(db, tenant_id, warehouse_id, body, uploaded_parts, line_uploads_dict)
