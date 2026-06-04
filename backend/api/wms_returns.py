"""
WMS returns (RMZ): warehouse list + order-linked create/process flow.
Status is a FK to ReturnStatus; business rules use ReturnStatus.type / transition_key only (never name).
"""

import json
import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional, Sequence, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import cast, desc, exists, func, nullslast, or_, String
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models.customer import Customer
from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.product import Product
from ..models.return_ui_status import ReturnUiStatus
from ..models.return_status import ReturnStatus
from ..models.wms_order_return import WmsOrderReturn
from ..models.wms_rmz_line import RMZLine
from ..models.stock_document import StockDocument
from ..models.wms_refund import WmsRefund
from ..models.wms_settings import WmsSettings
from ..schemas.entity_delete import EntityBulkDeleteResult, entity_bulk_delete_result_from_service_dict
from ..schemas.wms_return import (
    CustomerInsightsRead,
    CustomerRiskTier,
    OrderLookupHit,
    ReturnStatusBrief,
    ReturnUiStatusBrief,
    WmsReturnCreate,
    WmsReturnListItem,
    WmsReturnLineListPreview,
    WmsReturnRead,
    WmsReturnLineRead,
    WmsReturnLineDamageEntryRead,
    WmsReturnLineProcess,
    WmsReturnLineSplitProcess,
    WmsRefundCreate,
    WmsReturnsBulkArchiveBody,
    WmsReturnWorkflowStatusPatch,
    WmsReturnQueueCountsRead,
    ReturnsMode,
)
from ..services.delete_service import archive_wms_returns_bulk
from ..services.rmz_return_receipt_service import ensure_rmz_return_receipt_after_refund
from ..services.return_status_service import get_by_transition_key, seed_default_statuses_session
from ..services.tenant_default_warehouse import resolve_tenant_default_warehouse_id
from ..utils.panel_ui_status_tokens import resolve_panel_status_tokens
from ..utils.ui_status_color import normalize_stored_color

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/wms/returns", tags=["WMS Returns"])
print("IMPORTING WMS RETURNS ROUTER", flush=True)


def _wms_returns_wh_dep(
    tenant_id: int = Query(...),
    db: Session = Depends(get_db),
) -> int:
    try:
        return resolve_tenant_default_warehouse_id(db, tenant_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Brak skonfigurowanego magazynu")

_TERMINAL_STATUS_TYPES = frozenset({"done_success", "done_rejected"})
_RETURN_TYPE_VALUES = frozenset({"RMA", "UNCLAIMED"})
_LOGGED_ADDRESSES_JSON_EXAMPLE = False

_RET_ORD_PREFIX_RE = re.compile(r"^\s*(?:RET|ORD|RMZ)\s*[-#:]*\s*(\d+)\s*$", re.IGNORECASE)


def _photo_urls_list_from_cell(raw: object) -> List[str]:
    """Parse `rmz_lines.photo_urls` (JSON array string or legacy) into URL strings."""
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(u).strip() for u in raw if str(u).strip()]
    s = str(raw).strip()
    if not s or s.lower() in ("null", "none", "[]"):
        return []
    try:
        parsed = json.loads(s)
    except Exception:
        return []
    if isinstance(parsed, list):
        return [str(u).strip() for u in parsed if str(u).strip()]
    return []


def _parse_damage_entries_raw(raw: object) -> List[dict]:
    if raw is None:
        return []
    s = str(raw).strip()
    if not s or s.lower() in ("null", "none", "[]"):
        return []
    try:
        data = json.loads(s)
    except Exception:
        return []
    return [x for x in data if isinstance(x, dict)] if isinstance(data, list) else []

def _stock_document_ids_for_rmz(db: Session, rmz_id: int) -> List[int]:
    rows = (
        db.query(StockDocument.id)
        .filter(StockDocument.rmz_id == int(rmz_id))
        .order_by(StockDocument.id.asc())
        .all()
    )
    return [int(r[0]) for r in rows]


def _optional_positive_int(raw: object) -> Optional[int]:
    if raw is None:
        return None
    try:
        v = int(raw)
    except (TypeError, ValueError):
        return None
    return v if v >= 1 else None


def _damage_entry_putaway_completed_at(raw: object) -> Optional[datetime]:
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw
    s = str(raw).strip()
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def _normalize_damage_entry_created_at(raw: object) -> Optional[str]:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


_FINAL_DISP = frozenset({"RESTOCK", "OUTLET", "REPAIR", "DISPOSE", "RETURN_TO_CUSTOMER"})


def _damage_entry_reads_from_rmz_line(ln: RMZLine) -> List[WmsReturnLineDamageEntryRead]:
    """JSON list on row, else legacy buckets B/C as synthetic entries."""
    parsed = _parse_damage_entries_raw(getattr(ln, "damage_entries_json", None))
    out: List[WmsReturnLineDamageEntryRead] = []
    for x in parsed:
        try:
            pid = str(x.get("id") or "").strip()
            qty = int(x.get("qty") or 0)
            cond_raw = x.get("condition")
            if not pid or qty < 1 or cond_raw not in ("B", "C"):
                continue
            photos_raw = x.get("photo_urls") or []
            photos = (
                [str(u).strip() for u in photos_raw if str(u).strip()]
                if isinstance(photos_raw, list)
                else []
            )
            fd_raw = x.get("final_disposition")
            fd_s = str(fd_raw).strip().upper() if fd_raw is not None and str(fd_raw).strip() else None
            fd_out = fd_s if fd_s in _FINAL_DISP else None
            disp_raw = x.get("disposition")
            disp_s = (str(disp_raw).strip()[:48] if disp_raw is not None and str(disp_raw).strip() else None)
            out.append(
                WmsReturnLineDamageEntryRead(
                    id=pid[:80],
                    qty=qty,
                    condition="C" if cond_raw == "C" else "B",
                    damage_type=(str(x.get("damage_type")).strip() if x.get("damage_type") else None) or None,
                    photo_urls=photos,
                    note=(str(x.get("note")).strip() if x.get("note") else None) or None,
                    operator_name=(str(x.get("operator_name")).strip() if x.get("operator_name") else None) or None,
                    created_at=_normalize_damage_entry_created_at(x.get("created_at")),
                    final_disposition=fd_out,  # type: ignore[arg-type]
                    disposition=disp_s,
                    stock_document_id=_optional_positive_int(x.get("stock_document_id")),
                    stock_document_line_id=_optional_positive_int(x.get("stock_document_line_id")),
                    location_id=_optional_positive_int(x.get("location_id")),
                    putaway_status=(
                        (str(x.get("putaway_status")).strip()[:32] if x.get("putaway_status") else None) or None
                    ),
                    putaway_completed_at=_damage_entry_putaway_completed_at(x.get("putaway_completed_at")),
                )
            )
        except (TypeError, ValueError):
            continue
    if out:
        return out
    ib = int(ln.damaged_b_qty or 0)
    ic = int(ln.damaged_c_qty or 0)
    if ib + ic < 1:
        return []
    photos = _photo_urls_list_from_cell(getattr(ln, "photo_urls", None)) or []
    dt = (str(ln.damage_type).strip() if getattr(ln, "damage_type", None) else None) or None
    rid = int(ln.id or 0)
    syn: List[WmsReturnLineDamageEntryRead] = []
    if ib > 0:
        syn.append(
            WmsReturnLineDamageEntryRead(
                id=f"legacy-b-{rid}",
                qty=ib,
                condition="B",
                damage_type=dt,
                photo_urls=list(photos),
            )
        )
    if ic > 0:
        syn.append(
            WmsReturnLineDamageEntryRead(
                id=f"legacy-c-{rid}",
                qty=ic,
                condition="C",
                damage_type=dt,
                photo_urls=list(photos),
            )
        )
    return syn


def _rmz_line_has_damage_photos(ln: RMZLine) -> bool:
    for e in _damage_entry_reads_from_rmz_line(ln):
        if e.photo_urls:
            return True
    return False


def _normalize_wms_returns_lookup_query(raw: str) -> Tuple[str, Optional[int]]:
    """
    Zwraca (tekst_do dopasowań stringowych, opcjonalny token numeryczny dla id zamówienia / id RMZ).
    Obsługa: trim, wiodący #, ORD-13 / RET-13 / RMZ-13, same cyfry (w tym z zerami wiodącymi).
    """
    t = (raw or "").strip()
    if not t:
        return "", None
    while t.startswith("#"):
        t = t[1:].strip()
    if not t:
        return "", None
    m = _RET_ORD_PREFIX_RE.match(t.replace(" ", ""))
    if m:
        return t, int(m.group(1))
    if t.isdigit():
        return t, int(t)
    return t, None


def _order_lookup_hit_from_row(o: Order, matched_return_id: Optional[int] = None) -> OrderLookupHit:
    return OrderLookupHit(
        id=o.id,
        number=o.number,
        status=o.status,
        barcode=o.barcode,
        external_id=getattr(o, "external_id", None),
        sales_document_number=getattr(o, "sales_document_number", None),
        matched_return_id=matched_return_id,
    )

# One-time normalization for legacy DBs/migrations:
# Inconsistent state: `decision IS NULL` but quantities were accidentally backfilled (>0).
_UNSET_DECISION_QTY_NORMALIZED = False


def _rmz_line_resolved_qty_expr():
    """Sum of accepted + damaged + rejected quantities stored on the RMZ line row."""
    return (
        func.coalesce(RMZLine.accepted_qty, 0)
        + func.coalesce(RMZLine.damaged_b_qty, 0)
        + func.coalesce(RMZLine.damaged_c_qty, 0)
        + func.coalesce(RMZLine.rejected_qty, 0)
    )


def _normalize_unset_decision_line_quantities(db: Session) -> None:
    global _UNSET_DECISION_QTY_NORMALIZED
    if _UNSET_DECISION_QTY_NORMALIZED:
        return

    # Legacy inconsistent rows: decision unset but quantities sum to the full line (partial pending rows use sum < quantity).
    updated = (
        db.query(RMZLine)
        .filter(
            RMZLine.decision.is_(None),
            RMZLine.quantity > 0,
            _rmz_line_resolved_qty_expr() >= RMZLine.quantity,
        )
        .update(
            {
                "accepted_qty": 0,
                "damaged_b_qty": 0,
                "damaged_c_qty": 0,
                "rejected_qty": 0,
            },
            synchronize_session=False,
        )
    )

    logger.info("RMZ unset-decision quantities normalized: updated_rows=%s", updated)
    _UNSET_DECISION_QTY_NORMALIZED = True


def _wms_return_line_qty_fields_from_rmz_row(ln: RMZLine) -> Tuple[Optional[int], Optional[int], Optional[int], Optional[int], Optional[int]]:
    """
    Serialize quantity columns for API reads.

    When decision is unset and no quantities were stored yet, expose None (pristine line).
    When decision is unset but some quantities are stored (partial split-process), expose counts so WMS can hydrate.
    """
    acc = ln.accepted_qty
    db = ln.damaged_b_qty
    dc = ln.damaged_c_qty
    rej = ln.rejected_qty

    def nz(v: Optional[int]) -> int:
        return 0 if v is None else int(v)

    ia, ib, ic, ir = nz(acc), nz(db), nz(dc), nz(rej)
    resolved = ia + ib + ic + ir

    if ln.decision is None and resolved == 0:
        return (None, None, None, None, None)

    damaged_total = ib + ic
    return (ia, damaged_total, ib, ic, ir)


def _next_rmz_number(db: Session, tenant_id: int, warehouse_id: int) -> str:
    year = datetime.utcnow().year
    prefix = f"RMZ-{year}-"
    rows = (
        db.query(WmsOrderReturn.rmz_number)
        .filter(
            WmsOrderReturn.tenant_id == tenant_id,
            WmsOrderReturn.warehouse_id == warehouse_id,
            WmsOrderReturn.rmz_number.startswith(prefix),
        )
        .all()
    )
    max_n = 0
    for (rn,) in rows:
        try:
            n = int(str(rn).split("-")[-1])
            max_n = max(max_n, n)
        except (ValueError, IndexError):
            pass
    return f"{prefix}{max_n + 1:05d}"


def _parse_lines(raw: str) -> List[dict]:
    try:
        data = json.loads(raw or "[]")
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def _lines_to_read(parsed: List[dict]) -> List[WmsReturnLineRead]:
    out: List[WmsReturnLineRead] = []
    for x in parsed:
        try:
            out.append(
                WmsReturnLineRead(
                    order_item_id=int(x["order_item_id"]),
                    product_id=int(x["product_id"]),
                    quantity=int(x["quantity"]),
                )
            )
        except (KeyError, ValueError, TypeError):
            continue
    return out


def _lines_for_list_read(db: Session, r: WmsOrderReturn) -> List[WmsReturnLineRead]:
    _normalize_unset_decision_line_quantities(db)
    rows = (
        db.query(RMZLine)
        .filter(RMZLine.rmz_id == r.id)
        .order_by(RMZLine.id.asc())
        .all()
    )
    if rows:
        out_reads: List[WmsReturnLineRead] = []
        for ln in rows:
            aq, dq, dbq, dcq, rq = _wms_return_line_qty_fields_from_rmz_row(ln)
            out_reads.append(
                WmsReturnLineRead(
                    id=int(ln.id),
                    order_item_id=int(ln.order_item_id),
                    product_id=int(ln.product_id),
                    quantity=int(ln.quantity),
                    accepted_qty=aq,
                    damaged_qty=dq,
                    damaged_b_qty=dbq,
                    damaged_c_qty=dcq,
                    rejected_qty=rq,
                    decision=ln.decision,  # type: ignore[arg-type]
                    condition=ln.condition,  # type: ignore[arg-type]
                    final_disposition=ln.final_disposition,  # type: ignore[arg-type]
                    processed_at=ln.processed_at,
                    damage_type=(str(ln.damage_type).strip() if getattr(ln, "damage_type", None) else None) or None,
                    photo_urls=_photo_urls_list_from_cell(getattr(ln, "photo_urls", None)) or None,
                    damage_entries=_damage_entry_reads_from_rmz_line(ln),
                )
            )
        return out_reads
    parsed = _parse_lines(r.lines_json)
    return _lines_to_read(parsed)


def _lines_preview_for_return_list(db: Session, line_reads: List[WmsReturnLineRead], limit: int = 3) -> List[WmsReturnLineListPreview]:
    slice = line_reads[:limit]
    if not slice:
        return []
    pids = [int(ln.product_id) for ln in slice]
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(pids)).all()}
    out: List[WmsReturnLineListPreview] = []
    for ln in slice:
        p = products.get(int(ln.product_id))
        out.append(
            WmsReturnLineListPreview(
                quantity=int(ln.quantity),
                name=p.name if p else None,
                ean=p.ean if p else None,
                sku=(p.symbol or p.sku) if p else None,
                image_url=getattr(p, "image_url", None) if p else None,
            )
        )
    return out


def _sum_return_lines_value_pln(db: Session, order_id: int, line_reads: List[WmsReturnLineRead]) -> float:
    """Best-effort value of returned quantities using order line unit/list price."""
    if not line_reads:
        return 0.0
    oids = [int(ln.order_item_id) for ln in line_reads]
    if not oids:
        return 0.0
    rows = (
        db.query(OrderItem)
        .filter(OrderItem.order_id == int(order_id), OrderItem.id.in_(oids))
        .all()
    )
    by_id = {int(oi.id): oi for oi in rows}
    total = 0.0
    for ln in line_reads:
        oi = by_id.get(int(ln.order_item_id))
        if oi is None:
            continue
        try:
            unit = float(oi.unit_price) if oi.unit_price is not None else float(oi.list_price or 0)
        except (TypeError, ValueError):
            unit = 0.0
        try:
            qty = float(ln.quantity)
        except (TypeError, ValueError):
            qty = 0.0
        total += qty * max(0.0, unit)
    return max(0.0, total)


def _compute_list_total_refund_amount(
    db: Session,
    order: Order,
    refund_row: Optional[WmsRefund],
    line_reads: List[WmsReturnLineRead],
    shipping_cost: Optional[float],
) -> float:
    """Panel/office list: monetary total (never negative)."""
    line_sum = _sum_return_lines_value_pln(db, int(order.id), line_reads)
    ship = 0.0
    try:
        ship = max(0.0, float(shipping_cost or 0))
    except (TypeError, ValueError):
        ship = 0.0

    if not refund_row:
        return line_sum

    rtype = str(refund_row.refund_type or "NONE").strip().upper()
    ra = refund_row.refund_amount
    if ra is not None:
        try:
            total = max(0.0, float(ra))
        except (TypeError, ValueError):
            total = 0.0
    elif rtype == "NONE":
        total = 0.0
    else:
        total = line_sum

    if refund_row.refund_shipping:
        sa = getattr(refund_row, "refund_shipping_amount", None)
        if sa is not None:
            try:
                total += max(0.0, float(sa))
            except (TypeError, ValueError):
                total += ship
        else:
            total += ship

    return max(0.0, total)


def _get_wms_settings(db: Session, tenant_id: int, warehouse_id: int) -> WmsSettings:
    row = (
        db.query(WmsSettings)
        .filter(WmsSettings.tenant_id == tenant_id, WmsSettings.warehouse_id == warehouse_id)
        .first()
    )
    if row:
        return row
    return WmsSettings(tenant_id=tenant_id, warehouse_id=warehouse_id, returns_mode="simple")


def _brief_ui_status(us: Optional[ReturnUiStatus]) -> Optional[ReturnUiStatusBrief]:
    if us is None:
        return None
    mg = str(getattr(us, "main_group", None) or "NEW").strip().upper()
    if mg not in ("NEW", "IN_PROGRESS", "DONE"):
        mg = "NEW"
    _, badge, bg, tx = resolve_panel_status_tokens(us)
    gn = getattr(us, "group_name", None)
    sn = getattr(us, "subgroup_name", None)
    img = getattr(us, "image_url", None)
    return ReturnUiStatusBrief(
        id=us.id,
        name=us.name,
        color=normalize_stored_color(us.color),
        main_group=mg,  # type: ignore[arg-type]
        group_name=str(gn).strip()[:128] if gn is not None and str(gn).strip() else None,
        subgroup_name=str(sn).strip()[:128] if sn is not None and str(sn).strip() else None,
        badge_color=badge,
        background_color=bg,
        text_color=tx,
        image_url=str(img).strip()[:512] if img is not None and str(img).strip() else None,
        is_active=bool(getattr(us, "is_active", True)),
    )


def _brief_from_rs(rs: Optional[ReturnStatus]) -> ReturnStatusBrief:
    if rs is None:
        return ReturnStatusBrief(
            id=0,
            name="—",
            color="slate",
            type="in_progress",
            transition_key=None,
        )
    return ReturnStatusBrief(
        id=rs.id,
        name=rs.name,
        color=rs.color or "blue",
        type=rs.type,  # type: ignore[arg-type]
        transition_key=rs.transition_key,
    )


def _is_terminal(rs: Optional[ReturnStatus]) -> bool:
    return rs is not None and rs.type in _TERMINAL_STATUS_TYPES


def _next_transition_key_for_lines(
    returns_mode: ReturnsMode,
    rmz_lines: Sequence[RMZLine],
) -> Optional[str]:
    if not rmz_lines or not all(ln.decision is not None for ln in rmz_lines):
        return None
    all_rejected = all(ln.decision == "REJECTED" for ln in rmz_lines)
    all_damaged_have_evidence = all(
        (ln.decision != "DAMAGED") or _rmz_line_has_damage_photos(ln) for ln in rmz_lines
    )
    # Simple mode: never jump straight to terminal "success" on line saves — that blocked further
    # split-process / edits while the UI still showed an open RMZ. Refund POST moves qc_complete → success.
    if returns_mode == "simple":
        return "rejected" if all_rejected else "qc_complete"
    if returns_mode == "two_step":
        return "office_pending"
    if returns_mode == "advanced":
        if not all_damaged_have_evidence:
            return None
        return "qc_complete"
    return None


def _apply_transition(db: Session, row: WmsOrderReturn, transition_key: str) -> None:
    st = get_by_transition_key(db, row.tenant_id, row.warehouse_id, transition_key)
    if st is None:
        seed_default_statuses_session(db, row.tenant_id, row.warehouse_id)
        st = get_by_transition_key(db, row.tenant_id, row.warehouse_id, transition_key)
    if st is None:
        raise HTTPException(status_code=500, detail=f"Return status '{transition_key}' missing; run migrations")
    row.status_id = st.id


def _str_from_block(block: dict, keys: Tuple[str, ...]) -> Optional[str]:
    for k in keys:
        v = block.get(k)
        if v is None:
            continue
        s = str(v).strip()
        if s:
            return s
    return None


_FIRST_KEYS: Tuple[str, ...] = (
    "Imię",
    "first_name",
    "First name",
    "Firstname",
    "firstname",
    "given_name",
    "Given name",
)
_LAST_KEYS: Tuple[str, ...] = (
    "Nazwisko",
    "last_name",
    "Last name",
    "Lastname",
    "lastname",
    "family_name",
    "Family name",
)
_FULL_KEYS: Tuple[str, ...] = (
    "Imię i nazwisko",
    "full_name",
    "Full name",
    "name",
    "Name",
    "customer_name",
    "Customer name",
)
_COMPANY_KEYS: Tuple[str, ...] = (
    "Firma",
    "company",
    "Company",
    "company_name",
    "Company name",
    "Nazwa firmy",
    "organization",
    "Organization",
    "Organisation",
)


def _split_full_name(full: str) -> Tuple[Optional[str], Optional[str]]:
    full = (full or "").strip()
    if not full:
        return None, None
    parts = full.split(None, 1)
    if len(parts) == 2:
        return parts[0].strip() or None, parts[1].strip() or None
    return parts[0], None


def _first_last_from_block(block: dict) -> Optional[Tuple[Optional[str], Optional[str]]]:
    fn = _str_from_block(block, _FIRST_KEYS)
    ln = _str_from_block(block, _LAST_KEYS)
    if fn or ln:
        return fn, ln
    full = _str_from_block(block, _FULL_KEYS)
    if full:
        return _split_full_name(full)
    return None


def _customer_names_from_order(order: Order) -> Tuple[Optional[str], Optional[str]]:
    """Derive customer display name from `addresses_json` (Order has no name columns)."""
    raw = getattr(order, "addresses_json", None) or ""
    if not str(raw).strip():
        return None, None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None, None
    if not isinstance(data, dict):
        return None, None

    # 0) Polish-first billing block (most common in imported addresses_json)
    billing = data.get("billing")
    if isinstance(billing, dict):
        b_fn = billing.get("Imię") or billing.get("first_name")
        b_ln = billing.get("Nazwisko") or billing.get("last_name")
        b_fn_s = str(b_fn).strip() if b_fn is not None and str(b_fn).strip() else None
        b_ln_s = str(b_ln).strip() if b_ln is not None and str(b_ln).strip() else None
        if b_fn_s or b_ln_s:
            return b_fn_s, b_ln_s

    # 1) Root: first_name + last_name
    r_fn = _str_from_block(data, _FIRST_KEYS)
    r_ln = _str_from_block(data, _LAST_KEYS)
    if r_fn or r_ln:
        return r_fn, r_ln

    # 2) Root: full_name → split
    r_full = _str_from_block(data, _FULL_KEYS)
    if r_full:
        return _split_full_name(r_full)

    # 3) billing, then shipping (strict order per product requirement)
    for section in ("billing", "shipping"):
        block = data.get(section)
        if not isinstance(block, dict):
            continue
        got = _first_last_from_block(block)
        if got and (got[0] or got[1]):
            return got

    # 4) invoice / delivery
    for section in ("invoice", "delivery"):
        block = data.get(section)
        if not isinstance(block, dict):
            continue
        got = _first_last_from_block(block)
        if got and (got[0] or got[1]):
            return got

    # 5) Company name (single field → first_name slot for list display)
    for section in ("billing", "shipping", "invoice", "delivery"):
        block = data.get(section)
        if not isinstance(block, dict):
            continue
        company = _str_from_block(block, _COMPANY_KEYS)
        if company:
            return company, None

    root_co = _str_from_block(data, _COMPANY_KEYS)
    if root_co:
        return root_co, None

    return None, None


def _customer_contact_from_order(order: Order) -> Tuple[Optional[str], Optional[str]]:
    """Extract phone/email from `addresses_json` (best-effort, flexible structure)."""
    global _LOGGED_ADDRESSES_JSON_EXAMPLE
    raw = getattr(order, "addresses_json", None) or ""
    if not _LOGGED_ADDRESSES_JSON_EXAMPLE:
        # Debug once per process: helps verify real payload shape in production-like data.
        print("ADDRESSES_JSON:", raw)
        _LOGGED_ADDRESSES_JSON_EXAMPLE = True
    if not str(raw).strip():
        return None, None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None, None
    if not isinstance(data, dict):
        return None, None

    billing = data.get("billing") if isinstance(data.get("billing"), dict) else {}
    shipping = data.get("shipping") if isinstance(data.get("shipping"), dict) else {}
    customer = data.get("customer") if isinstance(data.get("customer"), dict) else {}

    def _clean(v: object) -> Optional[str]:
        if v is None:
            return None
        s = str(v).strip()
        return s or None

    # Polish-first extraction requested by business flow.
    phone = _clean(
        billing.get("Telefon")
        or shipping.get("Telefon")
        or billing.get("phone")
        or shipping.get("phone")
        or customer.get("Telefon")
        or customer.get("phone")
        or data.get("phone")
        or data.get("phone_number")
        or data.get("tel")
    )

    email = _clean(
        billing.get("Email")
        or shipping.get("Email")
        or billing.get("email")
        or shipping.get("email")
        or customer.get("Email")
        or customer.get("email")
        or data.get("email")
        or data.get("email_address")
        or data.get("mail")
    )

    return phone, email


def _normalize_customer_email(raw: Optional[str]) -> str:
    return (raw or "").strip().lower()


def _resolve_insights_email(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    email: Optional[str],
    external_id: Optional[str],
) -> str:
    """Return normalized email for stats, or raise HTTPException."""
    email_norm = _normalize_customer_email(email)
    ext = (external_id or "").strip() if external_id is not None else ""
    if email_norm:
        return email_norm
    if not ext:
        raise HTTPException(status_code=400, detail="Podaj email lub external_id zamówienia")
    order = (
        db.query(Order)
        .filter(
            Order.tenant_id == tenant_id,
            Order.warehouse_id == warehouse_id,
            Order.external_id == ext,
        )
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Nie znaleziono zamówienia po external_id")
    _, em = _customer_contact_from_order(order)
    resolved = _normalize_customer_email(em)
    if not resolved:
        raise HTTPException(
            status_code=400,
            detail="Zamówienie nie ma adresu e-mail — uzupełnij dane lub podaj email ręcznie",
        )
    return resolved


def _order_ids_matching_email(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    email_norm: str,
) -> List[int]:
    rows = (
        db.query(Order)
        .filter(
            Order.tenant_id == tenant_id,
            Order.warehouse_id == warehouse_id,
            Order.addresses_json.isnot(None),
        )
        .all()
    )
    out: List[int] = []
    for o in rows:
        _, em = _customer_contact_from_order(o)
        if em and _normalize_customer_email(em) == email_norm:
            out.append(int(o.id))
    return out


def _risk_from_return_rate(rate: float) -> Tuple[str, CustomerRiskTier]:
    if rate < 0.2:
        return "Normalny klient", "normal"
    if rate <= 0.4:
        return "Podwyższone zwroty", "elevated"
    return "Częste zwroty", "high"


_KNOWN_SOURCES_LOWER = {
    "allegro": "Allegro",
    "ebay": "eBay",
    "amazon": "Amazon",
    "empik": "Empik",
    "shoper": "Shoper",
    "woocommerce": "WooCommerce",
    "prestashop": "PrestaShop",
    "bricklink": "Bricklink",
}


def _normalize_order_source(raw: Optional[str]) -> Optional[str]:
    """Human-friendly channel label: trim, drop noise, title-case / known aliases."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    s = re.sub(r"\s+", " ", s)
    low = s.lower()
    if low in _KNOWN_SOURCES_LOWER:
        return _KNOWN_SOURCES_LOWER[low]
    # Split camelCase: sklepXyz → sklep Xyz
    spaced = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", s)
    if spaced != s:
        parts = re.split(r"\s+", spaced.strip())
        return " ".join(p[:1].upper() + p[1:].lower() if p else "" for p in parts if p)
    # Underscore / hyphen / spaces
    if re.search(r"[\s_\-]+", s):
        parts = re.split(r"[\s_\-]+", s)
        return " ".join(p[:1].upper() + p[1:].lower() if p else "" for p in parts if p)
    # Single token: Allegro for allegro (already handled) or Title
    return s[:1].upper() + s[1:].lower() if len(s) > 1 else s.upper()


def _load_rmz(
    db: Session,
    return_id: int,
    tenant_id: int,
    warehouse_id: int,
) -> Optional[WmsOrderReturn]:
    return (
        db.query(WmsOrderReturn)
        .options(joinedload(WmsOrderReturn.return_status), joinedload(WmsOrderReturn.ui_status))
        .filter(
            WmsOrderReturn.id == return_id,
            WmsOrderReturn.tenant_id == tenant_id,
            WmsOrderReturn.warehouse_id == warehouse_id,
            WmsOrderReturn.deleted_at.is_(None),
        )
        .first()
    )


def _warehouse_id_for_return_mutation(
    db: Session,
    return_id: int,
    tenant_id: int,
    warehouse_id: Optional[int] = None,
) -> int:
    """Resolve RMZ warehouse from the document row (same idea as GET /wms/returns/id/{id}).

    Do not use only the tenant default warehouse: POST would 404 while GET succeeds for
    returns stored on the order's warehouse.
    """
    row_scope = (
        db.query(WmsOrderReturn)
        .filter(WmsOrderReturn.id == return_id, WmsOrderReturn.tenant_id == tenant_id)
        .first()
    )
    if not row_scope:
        raise HTTPException(status_code=404, detail="Return not found")
    wh_id = int(row_scope.warehouse_id)
    if warehouse_id is not None and int(warehouse_id) != wh_id:
        raise HTTPException(status_code=400, detail="warehouse_id does not match return warehouse")
    return wh_id


def _build_refund_dict(refund_row: Optional[WmsRefund]) -> Optional[dict]:
    if not refund_row:
        return None
    return {
        "id": refund_row.id,
        "rmz_id": refund_row.rmz_id,
        "refund_type": refund_row.refund_type,
        "refund_amount": refund_row.refund_amount,
        "refund_shipping": bool(refund_row.refund_shipping),
        "refund_shipping_amount": getattr(refund_row, "refund_shipping_amount", None),
        "decided_by": refund_row.decided_by,
        "decided_at": refund_row.decided_at,
    }


def _shipping_cost_from_order(order: Order) -> Optional[float]:
    """Best-effort shipping cost extraction for WMS header.

    - Prefer first-class fields if present (some DBs/branches may have them).
    - Fallback to import_metadata_json keys if shipping cost is not modeled.
    """
    for attr in ("shipping_cost", "delivery_price"):
        v = getattr(order, attr, None)
        try:
            if v is not None and float(v) >= 0:
                return float(v)
        except Exception:
            pass

    raw = getattr(order, "import_metadata_json", None) or ""
    if not str(raw).strip():
        return 0.0
    try:
        meta = json.loads(raw)
    except Exception:
        return 0.0
    if not isinstance(meta, dict):
        return 0.0

    # Common import column names (PL + EN)
    keys = (
        "shipping_cost",
        "delivery_price",
        "delivery_cost",
        "Koszt dostawy",
        "Koszt dostawy brutto",
        "Dostawa - koszt",
        "Cena dostawy",
        "Shipping cost",
        "Delivery price",
    )
    for k in keys:
        if k in meta and meta[k] is not None and str(meta[k]).strip() != "":
            try:
                return max(0.0, float(str(meta[k]).replace(",", ".")))
            except Exception:
                continue
    return 0.0


def _serialize_return_read(db: Session, row: WmsOrderReturn) -> WmsReturnRead:
    _normalize_unset_decision_line_quantities(db)
    rmz_lines = (
        db.query(RMZLine)
        .filter(RMZLine.rmz_id == row.id)
        .order_by(RMZLine.id.asc())
        .all()
    )
    refund_row = db.query(WmsRefund).filter(WmsRefund.rmz_id == row.id).first()
    lines_out = []
    for ln in rmz_lines:
        aq, dq, dbq, dcq, rq = _wms_return_line_qty_fields_from_rmz_row(ln)
        lines_out.append(
            WmsReturnLineRead(
                id=int(ln.id),
                order_item_id=int(ln.order_item_id),
                product_id=int(ln.product_id),
                quantity=int(ln.quantity),
                accepted_qty=aq,
                damaged_qty=dq,
                damaged_b_qty=dbq,
                damaged_c_qty=dcq,
                rejected_qty=rq,
                decision=ln.decision,
                condition=ln.condition,
                final_disposition=ln.final_disposition,  # type: ignore[arg-type]
                processed_at=ln.processed_at,
                damage_type=(str(ln.damage_type).strip() if getattr(ln, "damage_type", None) else None) or None,
                photo_urls=_photo_urls_list_from_cell(getattr(ln, "photo_urls", None)) or None,
                damage_entries=_damage_entry_reads_from_rmz_line(ln),
            )
        )
    rs = row.return_status
    if rs is None:
        rs = db.query(ReturnStatus).filter(ReturnStatus.id == row.status_id).first()
    order = (
        db.query(Order)
        .filter(
            Order.id == row.order_id,
            Order.tenant_id == row.tenant_id,
            Order.warehouse_id == row.warehouse_id,
        )
        .first()
    )
    fn, ln_name = _customer_names_from_order(order) if order else (None, None)
    phone, email = _customer_contact_from_order(order) if order else (None, None)
    src = getattr(order, "source", None) if order else None
    source_raw = str(src).strip() if src is not None and str(src).strip() else None
    source_out = _normalize_order_source(source_raw)
    shipping_cost = _shipping_cost_from_order(order) if order else 0.0
    sales_document_number = getattr(order, "sales_document_number", None) if order else None
    ui_row = getattr(row, "ui_status", None)
    if ui_row is None and getattr(row, "ui_status_id", None):
        ui_row = db.query(ReturnUiStatus).filter(ReturnUiStatus.id == row.ui_status_id).first()
    terminal = _is_terminal(rs)
    return WmsReturnRead(
        id=row.id,
        rmz_number=row.rmz_number,
        status=_brief_from_rs(rs),
        order_id=row.order_id,
        tenant_id=row.tenant_id,
        warehouse_id=row.warehouse_id,
        return_type=(str(getattr(row, "return_type", "RMA") or "RMA").upper() if str(getattr(row, "return_type", "RMA") or "").upper() in _RETURN_TYPE_VALUES else "RMA"),  # type: ignore[arg-type]
        first_name=fn,
        last_name=ln_name,
        source=source_out,
        shipping_cost=shipping_cost,
        sales_document_number=sales_document_number,
        phone=phone,
        email=email,
        customer_phone=phone,
        customer_email=email,
        lines=lines_out,
        created_at=row.created_at,
        external_id=getattr(row, "external_id", None),
        refund=_build_refund_dict(refund_row),  # type: ignore[arg-type]
        ui_status=_brief_ui_status(ui_row),
        workflow_finished=terminal,
        workflow_editable=not terminal,
        stock_document_ids=_stock_document_ids_for_rmz(db, row.id),
    )


def _list_item_from_row(db: Session, r: WmsOrderReturn, order: Order) -> WmsReturnListItem:
    fn, ln_name = _customer_names_from_order(order)
    src = getattr(order, "source", None)
    source_raw = str(src).strip() if src is not None and str(src).strip() else None
    source_out = _normalize_order_source(source_raw)
    shipping_cost = _shipping_cost_from_order(order)
    rs = r.return_status
    if rs is None:
        rs = db.query(ReturnStatus).filter(ReturnStatus.id == r.status_id).first()
    line_reads = _lines_for_list_read(db, r)
    refund_row = db.query(WmsRefund).filter(WmsRefund.rmz_id == r.id).first()
    ui_row = getattr(r, "ui_status", None)
    if ui_row is None and getattr(r, "ui_status_id", None):
        ui_row = db.query(ReturnUiStatus).filter(ReturnUiStatus.id == r.ui_status_id).first()
    total_refund = _compute_list_total_refund_amount(db, order, refund_row, line_reads, shipping_cost)
    return WmsReturnListItem(
        id=r.id,
        rmz_number=r.rmz_number,
        status=_brief_from_rs(rs),
        order_id=r.order_id,
        order_number=order.number,
        sales_document_number=getattr(order, "sales_document_number", None),
        return_type=(str(getattr(r, "return_type", "RMA") or "RMA").upper() if str(getattr(r, "return_type", "RMA") or "").upper() in _RETURN_TYPE_VALUES else "RMA"),  # type: ignore[arg-type]
        first_name=fn,
        last_name=ln_name,
        source=source_out,
        shipping_cost=shipping_cost,
        created_at=r.created_at,
        lines=line_reads,
        lines_preview=_lines_preview_for_return_list(db, line_reads),
        refund=_build_refund_dict(refund_row),  # type: ignore[arg-type]
        ui_status=_brief_ui_status(ui_row),
        total_refund_amount=total_refund,
    )


def _returns_query(db: Session, tenant_id: int, warehouse_id: int, *, archive_scope: str = "active"):
    """Base list query: tenant + warehouse + optional archive scope (active | archived | all)."""
    scope = (archive_scope or "active").strip().lower()
    q = (
        db.query(WmsOrderReturn, Order)
        .options(joinedload(WmsOrderReturn.return_status), joinedload(WmsOrderReturn.ui_status))
        .join(Order, Order.id == WmsOrderReturn.order_id)
        .filter(
            WmsOrderReturn.tenant_id == tenant_id,
            WmsOrderReturn.warehouse_id == warehouse_id,
        )
    )
    if scope == "archived":
        q = q.filter(WmsOrderReturn.deleted_at.isnot(None))
    elif scope == "all":
        pass
    else:
        q = q.filter(WmsOrderReturn.deleted_at.is_(None))
    return q


def _parse_csv_positive_ints(raw: Optional[str]) -> List[int]:
    out: List[int] = []
    if not raw or not str(raw).strip():
        return out
    for part in str(raw).split(","):
        p = part.strip()
        if not p:
            continue
        try:
            v = int(p)
        except ValueError:
            continue
        if v > 0:
            out.append(v)
    return out


def _parse_yyyy_mm_dd(raw: Optional[str]) -> Optional[date]:
    if not raw or not str(raw).strip():
        return None
    s = str(raw).strip()[:10]
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        return None


RETURN_QUEUE_TAB_KEYS: Tuple[str, ...] = (
    "wszystkie",
    "nowe",
    "w_toku",
    "do_decyzji",
    "uszkodzone",
    "odrzucone",
    "rozliczone",
    "refundacje",
    "reklamacje",
)


def _normalize_operational_queue_param(raw: Optional[str]) -> str:
    s = (raw or "").strip().lower().replace("-", "_")
    if s in ("", "all", "wszystkie"):
        return "wszystkie"
    if s in RETURN_QUEUE_TAB_KEYS:
        return s
    raise HTTPException(status_code=400, detail=f"Invalid operational_queue: {raw!r}")


def _operational_queue_effects(oq: str) -> dict:
    """Side filters for operational work-queue tabs (Orders → Returns list)."""
    out = {
        "force_panel_group": None,
        "return_status_transition_key": None,
        "rmz_has_damaged": None,
        "refund_issued": None,
        "order_has_complaint": None,
    }
    if oq == "wszystkie":
        return out
    if oq == "nowe":
        out["force_panel_group"] = "NEW"
    elif oq == "w_toku":
        out["force_panel_group"] = "IN_PROGRESS"
    elif oq == "do_decyzji":
        out["return_status_transition_key"] = "office_pending"
    elif oq == "uszkodzone":
        out["rmz_has_damaged"] = True
    elif oq == "odrzucone":
        out["return_status_transition_key"] = "rejected"
    elif oq == "rozliczone":
        out["return_status_transition_key"] = "success"
    elif oq == "refundacje":
        out["refund_issued"] = True
    elif oq == "reklamacje":
        out["order_has_complaint"] = True
    return out


def _apply_returns_list_filters(
    q,
    tenant_id: int,
    wh_id: int,
    *,
    operational_queue: str,
    panel_ui_status_id: Optional[int],
    panel_ui_unassigned: bool,
    panel_ui_main_group: Optional[str],
    panel_ui_status_ids: Optional[str],
    has_panel_label: Optional[str],
    return_status_id: Optional[int],
    shipping_method_id: Optional[str],
    order_number: Optional[str],
    customer_search: Optional[str],
    tracking: Optional[str],
    created_from: Optional[str],
    created_to: Optional[str],
    search: Optional[str],
):
    """Mutates query `q` with panel + list + operational queue filters (no order/limit)."""
    eff = _operational_queue_effects(operational_queue)
    fp = eff["force_panel_group"]
    multi_ids = _parse_csv_positive_ints(panel_ui_status_ids)
    if fp:
        mg = str(fp).strip().upper()
        if mg not in ("NEW", "IN_PROGRESS", "DONE"):
            raise HTTPException(status_code=400, detail="Invalid operational panel group")
        q = q.join(ReturnUiStatus, ReturnUiStatus.id == WmsOrderReturn.ui_status_id).filter(
            ReturnUiStatus.main_group == mg,
            ReturnUiStatus.tenant_id == tenant_id,
            ReturnUiStatus.warehouse_id == wh_id,
        )
    elif multi_ids:
        q = q.filter(WmsOrderReturn.ui_status_id.in_(multi_ids))
    elif panel_ui_unassigned:
        q = q.filter(WmsOrderReturn.ui_status_id.is_(None))
    elif panel_ui_status_id is not None:
        q = q.filter(WmsOrderReturn.ui_status_id == panel_ui_status_id)
    elif panel_ui_main_group:
        mg = (panel_ui_main_group or "").strip().upper()
        if mg not in ("NEW", "IN_PROGRESS", "DONE"):
            raise HTTPException(status_code=400, detail="Invalid panel_ui_main_group")
        q = q.join(ReturnUiStatus, ReturnUiStatus.id == WmsOrderReturn.ui_status_id).filter(
            ReturnUiStatus.main_group == mg,
            ReturnUiStatus.tenant_id == tenant_id,
            ReturnUiStatus.warehouse_id == wh_id,
        )

    hpl = (has_panel_label or "").strip().lower()
    if hpl == "yes":
        q = q.filter(WmsOrderReturn.ui_status_id.isnot(None))
    elif hpl == "no":
        q = q.filter(WmsOrderReturn.ui_status_id.is_(None))

    if return_status_id is not None:
        q = q.filter(WmsOrderReturn.status_id == int(return_status_id))

    rk = eff["return_status_transition_key"]
    if rk:
        q = q.join(ReturnStatus, ReturnStatus.id == WmsOrderReturn.status_id).filter(
            ReturnStatus.tenant_id == tenant_id,
            ReturnStatus.warehouse_id == wh_id,
            ReturnStatus.transition_key == rk,
        )

    if eff["order_has_complaint"] is True:
        q = q.filter(Order.complaint_id.isnot(None))

    if eff["rmz_has_damaged"] is True:
        dmg_exists = exists().where(
            RMZLine.rmz_id == WmsOrderReturn.id,
            or_(
                RMZLine.decision == "DAMAGED",
                func.coalesce(RMZLine.damaged_b_qty, 0) + func.coalesce(RMZLine.damaged_c_qty, 0) > 0,
            ),
        )
        q = q.filter(dmg_exists)

    if eff["refund_issued"] is True:
        refund_exists = exists().where(
            WmsRefund.rmz_id == WmsOrderReturn.id,
            or_(
                WmsRefund.refund_type.in_(("FULL", "PARTIAL")),
                func.coalesce(WmsRefund.refund_amount, 0) > 0,
                WmsRefund.refund_shipping.is_(True),
            ),
        )
        q = q.filter(refund_exists)

    sm_id = (shipping_method_id or "").strip()
    if sm_id:
        q = q.filter(Order.shipping_method_id == sm_id)

    onum = (order_number or "").strip()
    if onum:
        like_on = f"%{onum}%"
        q = q.filter(Order.number.ilike(like_on))

    cs = (customer_search or "").strip()
    if cs:
        like_c = f"%{cs}%"
        q = q.outerjoin(Customer, Customer.id == Order.customer_id).filter(
            or_(
                Customer.first_name.ilike(like_c),
                Customer.last_name.ilike(like_c),
                Customer.email.ilike(like_c),
                Order.addresses_json.ilike(like_c),
            )
        )

    tr = (tracking or "").strip()
    if tr:
        like_t = f"%{tr}%"
        q = q.filter(Order.import_metadata_json.ilike(like_t))

    d_from = _parse_yyyy_mm_dd(created_from)
    if d_from is not None:
        q = q.filter(WmsOrderReturn.created_at >= datetime.combine(d_from, datetime.min.time()))
    d_to = _parse_yyyy_mm_dd(created_to)
    if d_to is not None:
        end_excl = datetime.combine(d_to + timedelta(days=1), datetime.min.time())
        q = q.filter(WmsOrderReturn.created_at < end_excl)

    term = (search or "").strip()
    if term:
        like = f"%{term}%"
        parts = [
            WmsOrderReturn.rmz_number.ilike(like),
            Order.number.ilike(like),
            Order.external_id.ilike(like),
            Order.sales_document_number.ilike(like),
            Order.addresses_json.ilike(like),
            cast(WmsOrderReturn.id, String).ilike(like),
            cast(Order.id, String).ilike(like),
        ]
        if term.isdigit():
            try:
                n = int(term)
                parts.append(WmsOrderReturn.id == n)
                parts.append(Order.id == n)
            except ValueError:
                pass
        q = q.filter(or_(*parts))

    return q


@router.get("/queue-counts", response_model=WmsReturnQueueCountsRead)
def get_wms_return_queue_counts(
    tenant_id: int = Query(...),
    warehouse_id: Optional[int] = Query(
        None,
        ge=1,
        description="Magazyn WMS; gdy brak — domyślny magazyn tenanta.",
    ),
    archive_scope: str = Query(
        "active",
        description="active | archived | all — jak lista zwrotów.",
    ),
    search: Optional[str] = Query(None, description="Jak lista zwrotów — wąskie liczniki przy wyszukiwaniu."),
    created_from: Optional[str] = Query(None, description="YYYY-MM-DD — data utworzenia RMZ od"),
    created_to: Optional[str] = Query(None, description="YYYY-MM-DD — data utworzenia RMZ do (włącznie)"),
    return_status_id: Optional[int] = Query(None, ge=1),
    shipping_method_id: Optional[str] = Query(None),
    order_number: Optional[str] = Query(None),
    customer_search: Optional[str] = Query(None),
    tracking: Optional[str] = Query(None),
    has_panel_label: Optional[str] = Query(None),
    panel_ui_status_id: Optional[int] = Query(
        None,
        description="Jak lista — liczniki w kontekście wybranego filtra panelu (oprócz kolejek 'nowe' / 'w_toku', które nadpisują grupę).",
    ),
    panel_ui_unassigned: bool = Query(False),
    panel_ui_main_group: Optional[str] = Query(None),
    panel_ui_status_ids: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Operational queue badge counts for the returns list.
    Respects the same list filters as the main endpoint (search, dates, workflow status, etc.)
    and optional panel sidebar filters, so badges stay comparable to the visible table.
    """
    try:
        wh_id = (
            int(warehouse_id)
            if warehouse_id is not None and int(warehouse_id) > 0
            else resolve_tenant_default_warehouse_id(db, tenant_id)
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Brak skonfigurowanego magazynu")
    try:
        asc = (archive_scope or "active").strip().lower()
        if asc not in ("active", "archived", "all"):
            raise HTTPException(status_code=400, detail="Invalid archive_scope")
        counts: dict[str, int] = {}
        for key in RETURN_QUEUE_TAB_KEYS:
            q_base = _returns_query(db, tenant_id, wh_id, archive_scope=asc)
            q2 = _apply_returns_list_filters(
                q_base,
                tenant_id,
                wh_id,
                operational_queue=key,
                panel_ui_status_id=panel_ui_status_id,
                panel_ui_unassigned=panel_ui_unassigned,
                panel_ui_main_group=panel_ui_main_group,
                panel_ui_status_ids=panel_ui_status_ids,
                has_panel_label=has_panel_label,
                return_status_id=return_status_id,
                shipping_method_id=shipping_method_id,
                order_number=order_number,
                customer_search=customer_search,
                tracking=tracking,
                created_from=created_from,
                created_to=created_to,
                search=search,
            )
            cnt = q2.with_entities(func.count(WmsOrderReturn.id)).scalar()
            counts[key] = int(cnt or 0)
        return WmsReturnQueueCountsRead(counts=counts)
    except HTTPException:
        raise
    except SQLAlchemyError:
        logger.exception("get_wms_return_queue_counts: database error")
        return WmsReturnQueueCountsRead(counts={k: 0 for k in RETURN_QUEUE_TAB_KEYS})


def _wms_returns_orders_lookup_search(
    db: Session,
    tenant_id: int,
    q: str,
    warehouse_id: Optional[int],
) -> List[OrderLookupHit]:
    """Search orders for WMS return intake — never raises HTTP 404."""
    try:
        wh_id = (
            int(warehouse_id)
            if warehouse_id is not None and int(warehouse_id) > 0
            else resolve_tenant_default_warehouse_id(db, tenant_id)
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Brak skonfigurowanego magazynu")

    term_raw, num_token = _normalize_wms_returns_lookup_query(q)
    if not term_raw and num_token is None:
        return []

    base_wh = db.query(Order).filter(Order.tenant_id == tenant_id, Order.warehouse_id == wh_id)
    base_tenant = db.query(Order).filter(Order.tenant_id == tenant_id)

    hits: dict[int, OrderLookupHit] = {}

    def merge_hit(o: Order, matched_return_id: Optional[int] = None) -> None:
        cur = hits.get(o.id)
        if cur is None:
            hits[o.id] = _order_lookup_hit_from_row(o, matched_return_id)
            return
        if matched_return_id is not None and cur.matched_return_id is None:
            hits[o.id] = _order_lookup_hit_from_row(o, matched_return_id)

    if num_token is not None:
        oid = int(num_token)
        row = base_wh.filter(Order.id == oid).first() or base_tenant.filter(Order.id == oid).first()
        if row:
            merge_hit(row, None)
        r_wh = (
            db.query(WmsOrderReturn)
            .filter(
                WmsOrderReturn.tenant_id == tenant_id,
                WmsOrderReturn.warehouse_id == wh_id,
                WmsOrderReturn.id == oid,
                WmsOrderReturn.deleted_at.is_(None),
            )
            .first()
        )
        r_any = (
            db.query(WmsOrderReturn)
            .filter(
                WmsOrderReturn.tenant_id == tenant_id,
                WmsOrderReturn.id == oid,
                WmsOrderReturn.deleted_at.is_(None),
            )
            .first()
            if r_wh is None
            else r_wh
        )
        if r_any is not None:
            o = base_tenant.filter(Order.id == r_any.order_id).first()
            if o is not None:
                merge_hit(o, int(r_any.id))

    term = term_raw
    if term:
        term_low = term.lower()
        ex = (
            base_wh.filter(
                or_(
                    Order.number == term,
                    Order.barcode == term,
                    func.lower(Order.scan_code) == term_low,
                    Order.external_id == term,
                    Order.sales_document_number == term,
                )
            )
            .limit(10)
            .all()
        )
        if not ex:
            ex = (
                base_tenant.filter(
                    or_(
                        Order.number == term,
                        Order.barcode == term,
                        func.lower(Order.scan_code) == term_low,
                        Order.external_id == term,
                        Order.sales_document_number == term,
                    )
                )
                .limit(10)
                .all()
            )
        for o in ex:
            merge_hit(o, None)

        ret_row = (
            db.query(WmsOrderReturn)
            .filter(
                WmsOrderReturn.tenant_id == tenant_id,
                WmsOrderReturn.warehouse_id == wh_id,
                WmsOrderReturn.deleted_at.is_(None),
                or_(WmsOrderReturn.rmz_number == term, WmsOrderReturn.external_id == term),
            )
            .first()
        )
        if ret_row is None:
            ret_row = (
                db.query(WmsOrderReturn)
                .filter(
                    WmsOrderReturn.tenant_id == tenant_id,
                    WmsOrderReturn.deleted_at.is_(None),
                    or_(WmsOrderReturn.rmz_number == term, WmsOrderReturn.external_id == term),
                )
                .first()
            )
        if ret_row is not None:
            o = base_tenant.filter(Order.id == ret_row.order_id).first()
            if o is not None:
                merge_hit(o, int(ret_row.id))

    if hits:
        return sorted(hits.values(), key=lambda h: h.id)

    if not term:
        return []

    like_term = f"%{term}%"
    partial = (
        base_wh.filter(
            or_(
                Order.number.ilike(like_term),
                Order.external_id.ilike(like_term),
                Order.sales_document_number.ilike(like_term),
            )
        )
        .order_by(Order.id.desc())
        .limit(15)
        .all()
    )
    return [_order_lookup_hit_from_row(o, None) for o in partial]


@router.get(
    "/orders/lookup",
    status_code=200,
    summary="Wyszukiwanie zamówienia pod zwrot WMS",
)
@router.get("/orders/lookup/", include_in_schema=False)
def lookup_orders(
    tenant_id: int = Query(...),
    warehouse_id: Optional[int] = Query(
        None,
        ge=1,
        description="Magazyn z UI WMS; gdy brak — domyślny magazyn tenanta (jak wcześniej).",
    ),
    q: str = Query(..., min_length=1, description="Numer zamówienia, kod, #id, RET-id, id RMZ / zamówienia"),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """
    Wyszukiwanie zamówień pod zwrot WMS.

    Zawsze HTTP 200 + JSON array (pusta lista gdy brak trafień). Nigdy 404.
    """
    print("[returns.lookup] q=", q, flush=True)
    try:
        results = _wms_returns_orders_lookup_search(db, tenant_id, q, warehouse_id)
    except HTTPException as exc:
        if exc.status_code == 404:
            print("[returns.lookup] results=", 0, "(swallowed 404)", flush=True)
            return JSONResponse(status_code=200, content=[])
        raise
    except SQLAlchemyError:
        logger.exception("[returns.lookup] database error q=%r", q)
        raise HTTPException(status_code=500, detail="Błąd wyszukiwania zamówienia") from None

    print("[returns.lookup] results=", len(results), flush=True)
    return JSONResponse(status_code=200, content=jsonable_encoder(results))


@router.get("/orders/{order_id:int}/returns", response_model=List[WmsReturnListItem])
def list_returns_for_order(
    order_id: int,
    tenant_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """RMZ documents for a single order (newest first)."""
    # Use the order's warehouse (not tenant default): lookup may surface orders from any linked warehouse.
    order = (
        db.query(Order)
        .filter(
            Order.id == order_id,
            Order.tenant_id == tenant_id,
        )
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    warehouse_id = int(order.warehouse_id)

    q = (
        _returns_query(db, tenant_id, warehouse_id, archive_scope="active")
        .filter(WmsOrderReturn.order_id == order_id)
        .order_by(nullslast(desc(WmsOrderReturn.created_at)), desc(WmsOrderReturn.id))
    )
    return [_list_item_from_row(db, r, o) for r, o in q.all()]


@router.get("", response_model=List[WmsReturnListItem])
@router.get("/", response_model=List[WmsReturnListItem])
def list_wms_returns(
    tenant_id: int = Query(...),
    warehouse_id: Optional[int] = Query(
        None,
        ge=1,
        description="Magazyn WMS (jak office/return-ui/summary). Gdy brak — domyślny magazyn tenanta.",
    ),
    operational_queue: Optional[str] = Query(
        None,
        description="Kolejka operacyjna listy zwrotów: wszystkie | nowe | w_toku | do_decyzji | uszkodzone | odrzucone | rozliczone | refundacje | reklamacje",
    ),
    panel_ui_status_id: Optional[int] = Query(
        None,
        description="Panel filter: return_ui_statuses.id (sub-status)",
    ),
    panel_ui_unassigned: bool = Query(
        False,
        description="Panel filter: only returns with no panel sub-status",
    ),
    panel_ui_main_group: Optional[str] = Query(
        None,
        description="Panel filter: NEW | IN_PROGRESS | DONE (all sub-statuses in group)",
    ),
    panel_ui_status_ids: Optional[str] = Query(
        None,
        description="Comma-separated return_ui_statuses.id — when set, overrides unassigned/single/group panel filters.",
    ),
    search: Optional[str] = Query(None, description="RMZ, zamówienie, adresy (JSON), id RMZ/zamówienia"),
    created_from: Optional[str] = Query(None, description="YYYY-MM-DD — data utworzenia RMZ od"),
    created_to: Optional[str] = Query(None, description="YYYY-MM-DD — data utworzenia RMZ do (włącznie)"),
    return_status_id: Optional[int] = Query(None, ge=1, description="ReturnStatus.id (workflow RMZ)"),
    shipping_method_id: Optional[str] = Query(None, description="Order.shipping_method_id (kurier / metoda)"),
    order_number: Optional[str] = Query(None, description="Fragment numeru zamówienia"),
    customer_search: Optional[str] = Query(None, description="Imię, nazwisko, e-mail klienta lub adres JSON"),
    tracking: Optional[str] = Query(None, description="Fragment numeru śledzenia (import_metadata_json)"),
    has_panel_label: Optional[str] = Query(
        None,
        description="yes = ma status panelu (ui_status_id ustawione), no = bez etykiety panelu",
    ),
    archive_scope: str = Query(
        "active",
        description="active = tylko niezarchiwizowane, archived = tylko zarchiwizowane, all = oba",
    ),
    db: Session = Depends(get_db),
):
    """All RMZ documents for the warehouse (newest by created_at, then id)."""
    try:
        wh_id = (
            int(warehouse_id)
            if warehouse_id is not None and int(warehouse_id) > 0
            else resolve_tenant_default_warehouse_id(db, tenant_id)
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Brak skonfigurowanego magazynu")
    try:
        asc = (archive_scope or "active").strip().lower()
        if asc not in ("active", "archived", "all"):
            raise HTTPException(status_code=400, detail="Invalid archive_scope")
        oq = _normalize_operational_queue_param(operational_queue)

        q = _returns_query(db, tenant_id, wh_id, archive_scope=asc)
        q = _apply_returns_list_filters(
            q,
            tenant_id,
            wh_id,
            operational_queue=oq,
            panel_ui_status_id=panel_ui_status_id,
            panel_ui_unassigned=panel_ui_unassigned,
            panel_ui_main_group=panel_ui_main_group,
            panel_ui_status_ids=panel_ui_status_ids,
            has_panel_label=has_panel_label,
            return_status_id=return_status_id,
            shipping_method_id=shipping_method_id,
            order_number=order_number,
            customer_search=customer_search,
            tracking=tracking,
            created_from=created_from,
            created_to=created_to,
            search=search,
        )

        q = q.order_by(nullslast(desc(WmsOrderReturn.created_at)), desc(WmsOrderReturn.id)).limit(500)
        return [_list_item_from_row(db, r, o) for r, o in q.all()]
    except HTTPException:
        raise
    except SQLAlchemyError:
        logger.exception("list_wms_returns: database error (panel UI filter / joined load)")
        return []


@router.post("", response_model=WmsReturnRead)
@router.post("/", response_model=WmsReturnRead)
def create_wms_return(body: WmsReturnCreate, db: Session = Depends(get_db)):
    # Resolve warehouse from the order row (same as GET .../orders/{id}/returns), not tenant default —
    # otherwise numeric lookup can load a non-default-warehouse order and POST here returns 404.
    order = (
        db.query(Order)
        .filter(
            Order.id == body.order_id,
            Order.tenant_id == body.tenant_id,
        )
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    wh_id = int(order.warehouse_id)
    if body.warehouse_id is not None and int(body.warehouse_id) != wh_id:
        raise HTTPException(status_code=400, detail="warehouse_id does not match order warehouse")

    if not body.lines:
        raise HTTPException(status_code=400, detail="At least one line required")

    seed_default_statuses_session(db, body.tenant_id, wh_id)
    start_rs = get_by_transition_key(db, body.tenant_id, wh_id, "start")
    if start_rs is None:
        raise HTTPException(status_code=500, detail="Default return statuses missing")

    lines_out: List[dict] = []
    for line in body.lines:
        oi = (
            db.query(OrderItem)
            .filter(
                OrderItem.id == line.order_item_id,
                OrderItem.order_id == body.order_id,
            )
            .first()
        )
        if not oi:
            raise HTTPException(
                status_code=400,
                detail=f"Order item {line.order_item_id} not in order {body.order_id}",
            )
        if oi.product_id != line.product_id:
            raise HTTPException(
                status_code=400,
                detail=f"Product mismatch for order_item {line.order_item_id}",
            )
        if line.quantity > (oi.quantity or 0):
            raise HTTPException(
                status_code=400,
                detail=f"Quantity {line.quantity} exceeds order line {oi.quantity}",
            )
        lines_out.append(
            {
                "order_item_id": line.order_item_id,
                "product_id": line.product_id,
                "quantity": line.quantity,
            }
        )

    rmz = _next_rmz_number(db, body.tenant_id, wh_id)
    return_type = str(body.return_type or "RMA").upper()
    if return_type not in _RETURN_TYPE_VALUES:
        raise HTTPException(status_code=400, detail="return_type must be RMA or UNCLAIMED")

    row = WmsOrderReturn(
        tenant_id=body.tenant_id,
        warehouse_id=wh_id,
        order_id=body.order_id,
        external_id=getattr(order, "external_id", None),
        rmz_number=rmz,
        return_type=return_type,
        status_id=start_rs.id,
        lines_json=json.dumps(lines_out),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    for lo in lines_out:
        db.add(
            RMZLine(
                rmz_id=row.id,
                order_item_id=int(lo["order_item_id"]),
                product_id=int(lo["product_id"]),
                quantity=float(lo["quantity"]),
                decision=None,
                condition=None,
                photo_urls=None,
            )
        )
    db.commit()

    logger.info("WMS return created id=%s rmz=%s order_id=%s", row.id, rmz, body.order_id)

    row = _load_rmz(db, row.id, body.tenant_id, wh_id)
    if not row:
        raise HTTPException(status_code=500, detail="Failed to load created return")
    return _serialize_return_read(db, row)


@router.post("/id/{return_id:int}/lines/{order_item_id}/split-process", response_model=WmsReturnRead)
def process_rmz_line_split(
    return_id: int,
    order_item_id: int,
    body: WmsReturnLineSplitProcess,
    tenant_id: int = Query(...),
    warehouse_id: Optional[int] = Query(
        None,
        ge=1,
        description="Opcjonalny magazyn; musi zgadzać się z magazynem dokumentu RMZ (jak GET /wms/returns/id/{id}).",
    ),
    db: Session = Depends(get_db),
):
    wh_id = _warehouse_id_for_return_mutation(db, return_id, tenant_id, warehouse_id)
    row = _load_rmz(db, return_id, tenant_id, wh_id)
    if not row:
        raise HTTPException(status_code=404, detail="Return not found")
    if _is_terminal(row.return_status):
        raise HTTPException(status_code=400, detail="Return already finished")

    settings = _get_wms_settings(db, tenant_id, wh_id)
    mode: ReturnsMode = settings.returns_mode  # type: ignore[assignment]

    rmz_line = (
        db.query(RMZLine)
        .filter(RMZLine.rmz_id == row.id, RMZLine.order_item_id == order_item_id)
        .first()
    )
    if not rmz_line:
        raise HTTPException(status_code=404, detail="Return line not found")
    if int(rmz_line.product_id) != int(body.product_id):
        raise HTTPException(status_code=400, detail="Product mismatch for return line")
    return_type = str(getattr(row, "return_type", "RMA") or "RMA").upper()

    total_qty = int(rmz_line.quantity or 0)
    accepted_qty = int(body.accepted_qty)
    rejected_qty = int(body.rejected_qty)
    entry_rows = list(body.damage_entries or [])
    use_entries = len(entry_rows) > 0

    if use_entries:
        ids_seen = set()
        for e in entry_rows:
            if e.id in ids_seen:
                raise HTTPException(status_code=400, detail="duplicate damage entry id in request")
            ids_seen.add(e.id)
            if int(e.qty) != 1:
                raise HTTPException(
                    status_code=400,
                    detail="Each damage entry must represent exactly one physical unit (qty must be 1).",
                )
        damaged_qty = sum(int(e.qty) for e in entry_rows)
        damaged_b_qty = sum(int(e.qty) for e in entry_rows if e.condition == "B")
        damaged_c_qty = sum(int(e.qty) for e in entry_rows if e.condition == "C")
        resolved_sum = accepted_qty + damaged_qty + rejected_qty
        if resolved_sum > total_qty:
            raise HTTPException(
                status_code=400,
                detail="accepted_qty + sum(damage_entries.qty) + rejected_qty cannot exceed line quantity",
            )
        if resolved_sum < 1:
            raise HTTPException(
                status_code=400,
                detail="At least one unit must be resolved before saving split-process payload",
            )
    else:
        damaged_qty = int(body.damaged_qty)
        damaged_b_qty = int(body.damaged_b_qty)
        damaged_c_qty = int(body.damaged_c_qty)
        resolved_sum = accepted_qty + damaged_qty + rejected_qty
        if resolved_sum > total_qty:
            raise HTTPException(
                status_code=400,
                detail="accepted_qty + damaged_qty + rejected_qty cannot exceed line quantity",
            )
        if resolved_sum < 1:
            raise HTTPException(
                status_code=400,
                detail="At least one unit must be resolved before saving split-process payload",
            )
        if damaged_b_qty + damaged_c_qty != damaged_qty:
            raise HTTPException(
                status_code=400,
                detail="damaged_b_qty + damaged_c_qty must equal damaged_qty",
            )

    if return_type == "UNCLAIMED" and rejected_qty > 0:
        raise HTTPException(status_code=400, detail="UNCLAIMED return does not allow rejected_qty > 0")

    if use_entries:
        logger.info(
            "[WMS RMZ] split-process submit return_id=%s order_item_id=%s entries=%s accepted=%s rejected=%s",
            return_id,
            order_item_id,
            len(entry_rows),
            accepted_qty,
            rejected_qty,
        )
        for e in entry_rows:
            if settings.require_photos and not [u for u in (e.photo_urls or []) if str(u).strip()]:
                raise HTTPException(
                    status_code=400,
                    detail="At least one photo_url is required for each damage entry (photo_urls)",
                )
        serializable = []
        for e in entry_rows:
            created_at_out = (
                e.created_at.astimezone(timezone.utc).isoformat()
                if e.created_at is not None
                else datetime.now(timezone.utc).isoformat()
            )
            row_d: dict = {
                "id": e.id,
                "qty": int(e.qty),
                "condition": e.condition,
                "damage_type": (str(e.damage_type).strip() if e.damage_type else None) or None,
                "photo_urls": [str(u).strip() for u in (e.photo_urls or []) if str(u).strip()],
                "note": (str(e.note).strip() if e.note else None) or None,
                "operator_name": (str(e.operator_name).strip() if e.operator_name else None) or None,
                "created_at": created_at_out,
            }
            if getattr(e, "stock_document_id", None):
                row_d["stock_document_id"] = int(e.stock_document_id)  # type: ignore[arg-type]
            if getattr(e, "stock_document_line_id", None):
                row_d["stock_document_line_id"] = int(e.stock_document_line_id)  # type: ignore[arg-type]
            if getattr(e, "disposition", None):
                row_d["disposition"] = str(e.disposition).strip()[:48]
            if getattr(e, "location_id", None):
                row_d["location_id"] = int(e.location_id)  # type: ignore[arg-type]
            if getattr(e, "putaway_status", None):
                row_d["putaway_status"] = str(e.putaway_status).strip()[:32]
            if getattr(e, "putaway_completed_at", None):
                pca = e.putaway_completed_at
                row_d["putaway_completed_at"] = (
                    pca.astimezone(timezone.utc).isoformat()
                    if isinstance(pca, datetime) and pca.tzinfo is not None
                    else (pca.isoformat() if isinstance(pca, datetime) else str(pca))
                )
            if e.final_disposition:
                row_d["final_disposition"] = e.final_disposition
            serializable.append(row_d)
        rmz_line.damage_entries_json = json.dumps(serializable, ensure_ascii=False)
        logger.info(
            "[WMS RMZ] split-process persisted damage_entries_json return_id=%s order_item_id=%s payload=%s",
            return_id,
            order_item_id,
            rmz_line.damage_entries_json,
        )
        rmz_line.photo_urls = None
        rmz_line.damage_type = None
        if damaged_qty > 0:
            rmz_line.condition = "C" if damaged_c_qty > 0 and damaged_b_qty == 0 else "B"
        elif accepted_qty > 0:
            rmz_line.condition = "A"
        else:
            rmz_line.condition = None
    else:
        condition = body.condition
        photo_urls = body.photo_urls or []
        if damaged_qty > 0:
            if settings.require_condition and not condition:
                raise HTTPException(status_code=400, detail="condition is required for DAMAGED")
            if settings.require_photos and not photo_urls:
                raise HTTPException(status_code=400, detail="At least one photo_url is required (photo_urls)")

        if damaged_qty > 0:
            if condition is not None:
                rmz_line.condition = condition
            rmz_line.photo_urls = (
                json.dumps(list(photo_urls), ensure_ascii=False) if photo_urls else None
            )
        else:
            rmz_line.photo_urls = None
            if accepted_qty > 0:
                rmz_line.condition = "A"
            else:
                rmz_line.condition = None
        rmz_line.damage_entries_json = None

    complete_line = resolved_sum >= total_qty

    rmz_line.accepted_qty = accepted_qty
    rmz_line.damaged_b_qty = damaged_b_qty
    rmz_line.damaged_c_qty = damaged_c_qty
    rmz_line.rejected_qty = rejected_qty

    dt_raw = str(body.damage_type).strip() if body.damage_type else ""
    if dt_raw:
        rmz_line.damage_type = dt_raw[:512]
    else:
        rmz_line.damage_type = None

    if complete_line:
        if rejected_qty == total_qty:
            rmz_line.decision = "REJECTED"
        elif damaged_qty > 0:
            rmz_line.decision = "DAMAGED"
        else:
            rmz_line.decision = "OK"
        if rejected_qty > 0:
            rmz_line.final_disposition = "RETURN_TO_CUSTOMER"
        elif damaged_c_qty > 0:
            rmz_line.final_disposition = "REPAIR"
        elif damaged_b_qty > 0:
            rmz_line.final_disposition = "OUTLET"
        elif accepted_qty > 0:
            rmz_line.final_disposition = "RESTOCK"
        rmz_line.processed_at = datetime.utcnow()
    else:
        rmz_line.decision = None
        rmz_line.final_disposition = None
        rmz_line.processed_at = None

    db.flush()
    rmz_lines = db.query(RMZLine).filter(RMZLine.rmz_id == row.id).all()
    next_key = _next_transition_key_for_lines(mode, rmz_lines)
    if next_key:
        _apply_transition(db, row, next_key)
    db.commit()

    row = _load_rmz(db, return_id, tenant_id, wh_id)
    if not row:
        raise HTTPException(status_code=404, detail="Return not found")
    saved_line = (
        db.query(RMZLine)
        .filter(RMZLine.rmz_id == row.id, RMZLine.order_item_id == order_item_id)
        .first()
    )
    logger.info(
        "[WMS RMZ] split-process post-commit return_id=%s order_item_id=%s damage_entries_json=%s damaged_b=%s damaged_c=%s rejected=%s",
        return_id,
        order_item_id,
        getattr(saved_line, "damage_entries_json", None),
        int(getattr(saved_line, "damaged_b_qty", 0) or 0),
        int(getattr(saved_line, "damaged_c_qty", 0) or 0),
        int(getattr(saved_line, "rejected_qty", 0) or 0),
    )
    return _serialize_return_read(db, row)


@router.post("/id/{return_id:int}/lines/{order_item_id}/process", response_model=WmsReturnRead)
def process_rmz_line(
    return_id: int,
    order_item_id: int,
    body: WmsReturnLineProcess,
    tenant_id: int = Query(...),
    warehouse_id: Optional[int] = Query(
        None,
        ge=1,
        description="Opcjonalny magazyn; musi zgadzać się z magazynem dokumentu RMZ (jak GET /wms/returns/id/{id}).",
    ),
    db: Session = Depends(get_db),
):
    wh_id = _warehouse_id_for_return_mutation(db, return_id, tenant_id, warehouse_id)
    row = _load_rmz(db, return_id, tenant_id, wh_id)
    if not row:
        raise HTTPException(status_code=404, detail="Return not found")
    if _is_terminal(row.return_status):
        raise HTTPException(status_code=400, detail="Return already finished")

    settings = _get_wms_settings(db, tenant_id, wh_id)
    mode: ReturnsMode = settings.returns_mode  # type: ignore[assignment]

    rmz_line = (
        db.query(RMZLine)
        .filter(RMZLine.rmz_id == row.id, RMZLine.order_item_id == order_item_id)
        .first()
    )
    if not rmz_line:
        raise HTTPException(status_code=404, detail="Return line not found")
    return_type = str(getattr(row, "return_type", "RMA") or "RMA").upper()

    decision = body.decision
    if return_type == "UNCLAIMED" and decision == "REJECTED":
        raise HTTPException(status_code=400, detail="UNCLAIMED return does not allow REJECTED decision")
    condition = body.condition
    photo_urls = body.photo_urls or []

    if decision == "DAMAGED":
        if settings.require_condition and not condition:
            raise HTTPException(status_code=400, detail="condition is required for DAMAGED")
        if settings.require_photos:
            if not photo_urls:
                raise HTTPException(status_code=400, detail="At least one photo_url is required (photo_urls)")
        rmz_line.condition = condition if condition else None
        rmz_line.photo_urls = json.dumps(photo_urls, ensure_ascii=False) if photo_urls else None
        merged_dt = body.damage_type if body.damage_type else None
        if getattr(body, "note", None) and str(getattr(body, "note")).strip():
            note_s = str(body.note).strip()[:300]
            merged_dt = f"{merged_dt} | notatka:{note_s}" if merged_dt else f"notatka:{note_s}"
        rmz_line.damage_type = merged_dt[:512] if merged_dt else None
    elif decision == "OK":
        rmz_line.condition = "A"
        rmz_line.photo_urls = None
        rmz_line.damage_type = None
    else:  # REJECTED
        rmz_line.condition = None
        rmz_line.photo_urls = None
        reason = str(body.damage_type or "").strip()
        if not reason:
            raise HTTPException(status_code=400, detail="Powód odrzucenia jest wymagany")
        # Panel/WMS: „Inny powód” = kod ops_other + notatka z uzasadnieniem
        if reason == "ops_other":
            note_s = str(getattr(body, "note", None) or "").strip()
            if not note_s:
                raise HTTPException(
                    status_code=400,
                    detail="Uzupełnij uzasadnienie przy wyborze „Inny powód”.",
                )
        meta_parts: List[str] = []
        meta_parts.append(reason)
        if getattr(body, "note", None) and str(getattr(body, "note")).strip():
            meta_parts.append("notatka:" + str(body.note).strip()[:300])
        merged = " | ".join(meta_parts)[:512] if meta_parts else None
        rmz_line.damage_type = merged

    rmz_line.decision = decision
    rmz_line.processed_at = datetime.utcnow()
    # Pełna linia OK/REJECTED przez `/process` — ustaw ilości jak przy split (GET + seed UI).
    total_line = int(float(rmz_line.quantity or 0))
    if decision == "OK":
        rmz_line.accepted_qty = total_line
        rmz_line.damaged_b_qty = 0
        rmz_line.damaged_c_qty = 0
        rmz_line.rejected_qty = 0
        rmz_line.final_disposition = "RESTOCK"
    elif decision == "REJECTED":
        rmz_line.accepted_qty = 0
        rmz_line.damaged_b_qty = 0
        rmz_line.damaged_c_qty = 0
        rmz_line.rejected_qty = total_line
        rmz_line.final_disposition = "RETURN_TO_CUSTOMER"

    db.flush()

    rmz_lines = db.query(RMZLine).filter(RMZLine.rmz_id == row.id).all()
    next_key = _next_transition_key_for_lines(mode, rmz_lines)
    if next_key:
        _apply_transition(db, row, next_key)

    db.commit()

    row = _load_rmz(db, return_id, tenant_id, wh_id)
    if not row:
        raise HTTPException(status_code=404, detail="Return not found")
    return _serialize_return_read(db, row)


@router.post("/id/{return_id:int}/refund", response_model=WmsReturnRead)
def process_rmz_refund(
    return_id: int,
    body: WmsRefundCreate,
    tenant_id: int = Query(...),
    warehouse_id: Optional[int] = Query(
        None,
        ge=1,
        description="Opcjonalny magazyn; musi zgadzać się z magazynem dokumentu RMZ (jak GET /wms/returns/id/{id}).",
    ),
    db: Session = Depends(get_db),
):
    wh_id = _warehouse_id_for_return_mutation(db, return_id, tenant_id, warehouse_id)
    row = _load_rmz(db, return_id, tenant_id, wh_id)
    if not row:
        raise HTTPException(status_code=404, detail="Return not found")
    if _is_terminal(row.return_status):
        raise HTTPException(status_code=400, detail="Return already finished")
    return_type = str(getattr(row, "return_type", "RMA") or "RMA").upper()
    if return_type == "UNCLAIMED":
        refund = db.query(WmsRefund).filter(WmsRefund.rmz_id == row.id).first()
        if not refund:
            refund = WmsRefund(
                rmz_id=row.id,
                refund_type="NONE",
                refund_amount=None,
                refund_shipping=False,
                refund_shipping_amount=None,
                decided_by=body.decided_by,
                decided_at=datetime.utcnow(),
            )
            db.add(refund)
        else:
            refund.refund_type = "NONE"
            refund.refund_amount = None
            refund.refund_shipping = False
            refund.refund_shipping_amount = None
            refund.decided_by = body.decided_by
            refund.decided_at = datetime.utcnow()
        _apply_transition(db, row, "success")
        db.commit()
        row = _load_rmz(db, return_id, tenant_id, wh_id)
        if not row:
            raise HTTPException(status_code=404, detail="Return not found")
        return _serialize_return_read(db, row)

    settings = _get_wms_settings(db, tenant_id, wh_id)
    mode: ReturnsMode = settings.returns_mode  # type: ignore[assignment]
    eff_refund_type = str(body.refund_type or "NONE").strip().upper()
    eff_refund_amount = body.refund_amount
    eff_refund_shipping = bool(body.refund_shipping)
    eff_refund_shipping_amount = body.refund_shipping_amount

    if not settings.enable_refund:
        if eff_refund_type != "NONE":
            raise HTTPException(
                status_code=400,
                detail="Refund is disabled by WMS settings — use refund_type NONE to finish receiving only.",
            )
        eff_refund_type = "NONE"
        eff_refund_amount = None
        eff_refund_shipping = False
        eff_refund_shipping_amount = None

    rs = row.return_status
    if rs is None:
        rs = db.query(ReturnStatus).filter(ReturnStatus.id == row.status_id).first()
    tkey = rs.transition_key if rs else None
    expected = "office_pending" if mode == "two_step" else "qc_complete"
    if tkey != expected:
        raise HTTPException(status_code=400, detail=f"Refund allowed only in stage {expected}")

    if eff_refund_type != "NONE":
        if eff_refund_amount is None:
            raise HTTPException(status_code=400, detail="refund_amount is required for refund_type != NONE")
    else:
        eff_refund_amount = None

    if not eff_refund_shipping:
        eff_refund_shipping_amount = None
    else:
        if eff_refund_shipping_amount is not None:
            try:
                eff_refund_shipping_amount = max(0.0, float(eff_refund_shipping_amount))
            except Exception:
                raise HTTPException(status_code=400, detail="refund_shipping_amount must be numeric")

    refund = db.query(WmsRefund).filter(WmsRefund.rmz_id == row.id).first()
    if not refund:
        refund = WmsRefund(
            rmz_id=row.id,
            refund_type=eff_refund_type,
            refund_amount=eff_refund_amount,
            refund_shipping=eff_refund_shipping,
            refund_shipping_amount=eff_refund_shipping_amount,
            decided_by=body.decided_by,
            decided_at=datetime.utcnow(),
        )
        db.add(refund)
    else:
        refund.refund_type = eff_refund_type
        refund.refund_amount = eff_refund_amount
        refund.refund_shipping = eff_refund_shipping
        refund.refund_shipping_amount = eff_refund_shipping_amount
        refund.decided_by = body.decided_by
        refund.decided_at = datetime.utcnow()

    _apply_transition(db, row, "success")
    try:
        ensure_rmz_return_receipt_after_refund(db, row)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.commit()

    row = _load_rmz(db, return_id, tenant_id, wh_id)
    if not row:
        raise HTTPException(status_code=404, detail="Return not found")
    return _serialize_return_read(db, row)


@router.patch("/id/{return_id:int}/status", response_model=WmsReturnRead)
def patch_wms_return_workflow_status(
    return_id: int,
    body: WmsReturnWorkflowStatusPatch,
    tenant_id: int = Query(...),
    warehouse_id: Optional[int] = Query(
        None,
        ge=1,
        description="Opcjonalny magazyn; musi zgadzać się z magazynem dokumentu RMZ (jak GET /wms/returns/id/{id}).",
    ),
    db: Session = Depends(get_db),
):
    """Set RMZ workflow `ReturnStatus` by id (must belong to tenant + return warehouse)."""
    wh_id = _warehouse_id_for_return_mutation(db, return_id, tenant_id, warehouse_id)
    row = _load_rmz(db, return_id, tenant_id, wh_id)
    if not row:
        raise HTTPException(status_code=404, detail="Return not found")
    new_rs = (
        db.query(ReturnStatus)
        .filter(
            ReturnStatus.id == int(body.status_id),
            ReturnStatus.tenant_id == tenant_id,
            ReturnStatus.warehouse_id == wh_id,
        )
        .first()
    )
    if not new_rs:
        raise HTTPException(status_code=400, detail="Invalid status_id for this warehouse")
    row.status_id = int(new_rs.id)
    db.commit()
    row = _load_rmz(db, return_id, tenant_id, wh_id)
    if not row:
        raise HTTPException(status_code=404, detail="Return not found")
    return _serialize_return_read(db, row)


@router.get("/customer-insights", response_model=CustomerInsightsRead)
def get_customer_insights(
    tenant_id: int = Query(...),
    warehouse_id: int = Depends(_wms_returns_wh_dep),
    email: Optional[str] = Query(None),
    external_id: Optional[str] = Query(None, description="Order external_id when email is missing; email is read from that order"),
    db: Session = Depends(get_db),
):
    """
    Aggregate orders and RMZ rows for one customer (matched by e-mail in `addresses_json`)
    within tenant + warehouse. `return_rate` = returns / orders (0 if no orders).
    """
    email_norm = _resolve_insights_email(db, tenant_id, warehouse_id, email, external_id)
    order_ids = _order_ids_matching_email(db, tenant_id, warehouse_id, email_norm)
    n_orders = len(order_ids)
    if not order_ids:
        n_returns = 0
    else:
        cnt = (
            db.query(func.count(WmsOrderReturn.id))
            .filter(
                WmsOrderReturn.tenant_id == tenant_id,
                WmsOrderReturn.warehouse_id == warehouse_id,
                WmsOrderReturn.order_id.in_(order_ids),
                WmsOrderReturn.deleted_at.is_(None),
            )
            .scalar()
        )
        n_returns = int(cnt or 0)
    rate = (float(n_returns) / float(n_orders)) if n_orders > 0 else 0.0
    label, tier = _risk_from_return_rate(rate)
    return CustomerInsightsRead(
        matched_email=email_norm,
        total_orders_count=n_orders,
        total_returns_count=n_returns,
        return_rate=rate,
        risk_label=label,
        risk_tier=tier,
    )


@router.get("/id/{return_id:int}", response_model=WmsReturnRead)
def get_wms_return(
    return_id: int,
    tenant_id: int = Query(...),
    warehouse_id: Optional[int] = Query(
        None,
        ge=1,
        description="Opcjonalny magazyn; musi zgadzać się z magazynem RMZ. Bez tego — magazyn z dokumentu.",
    ),
    db: Session = Depends(get_db),
):
    # Resolve warehouse from the RMZ row (not tenant default) — same as create/list-for-order.
    row_scope = (
        db.query(WmsOrderReturn)
        .filter(WmsOrderReturn.id == return_id, WmsOrderReturn.tenant_id == tenant_id)
        .first()
    )
    if not row_scope:
        raise HTTPException(status_code=404, detail="Return not found")
    if getattr(row_scope, "deleted_at", None) is not None:
        raise HTTPException(status_code=404, detail="Return not found")
    wh_id = int(row_scope.warehouse_id)
    if warehouse_id is not None and int(warehouse_id) != wh_id:
        raise HTTPException(status_code=400, detail="warehouse_id does not match return warehouse")
    row = _load_rmz(db, return_id, tenant_id, wh_id)
    if not row:
        raise HTTPException(status_code=404, detail="Return not found")
    return _serialize_return_read(db, row)


@router.post("/bulk-archive", response_model=EntityBulkDeleteResult)
def wms_returns_bulk_archive(body: WmsReturnsBulkArchiveBody, db: Session = Depends(get_db)):
    """Archiwizacja wielu RMZ: usuwa linie operacyjne, ustawia deleted_at na nagłówku."""
    result = archive_wms_returns_bulk(db, body.tenant_id, body.warehouse_id, body.ids)
    if result.get("errors"):
        db.rollback()
    else:
        db.commit()
    return entity_bulk_delete_result_from_service_dict(result)


@router.delete("/id/{return_id:int}", response_model=EntityBulkDeleteResult)
def archive_single_wms_return(
    return_id: int,
    tenant_id: int = Query(...),
    warehouse_id: Optional[int] = Query(
        None,
        ge=1,
        description="Opcjonalny magazyn; musi zgadzać się z magazynem RMZ.",
    ),
    db: Session = Depends(get_db),
):
    """Archiwizacja pojedynczego RMZ (jak bulk-archive)."""
    wh_id = _warehouse_id_for_return_mutation(db, return_id, tenant_id, warehouse_id)
    result = archive_wms_returns_bulk(db, tenant_id, wh_id, [return_id])
    if result.get("errors"):
        db.rollback()
    else:
        db.commit()
    return entity_bulk_delete_result_from_service_dict(result)


_WMS_RETURNS_ROUTE_COUNT = len(router.routes)
print(
    f"IMPORTING WMS RETURNS ROUTER done routes={_WMS_RETURNS_ROUTE_COUNT}",
    flush=True,
)
if _WMS_RETURNS_ROUTE_COUNT == 0:
    print("IMPORTING WMS RETURNS ROUTER WARNING: zero routes on router", flush=True)
