"""Batch fields for order list: operational notes + customer comms indicators (no N+1)."""

from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import desc, func, or_
from sqlalchemy.orm import Session

from ..models.order import Order
from ..models.order_note import OrderNote
from ..models.order_operational_note import OrderOperationalNote

META_COMMENT_KEYS = (
    "customer_comment",
    "uwagi",
    "Uwagi",
    "buyer_message",
    "message_to_seller",
    "comment",
    "Komentarz",
)


def customer_comment_from_import_meta(meta: Optional[dict[str, Any]]) -> Optional[str]:
    if not meta:
        return None
    for key in META_COMMENT_KEYS:
        raw = meta.get(key)
        if raw is not None and str(raw).strip():
            return str(raw).strip()
    return None


def _truncate(s: str, max_len: int = 220) -> str:
    t = (s or "").strip().replace("\r\n", "\n").replace("\r", "\n")
    if len(t) <= max_len:
        return t
    return t[: max_len - 1].rstrip() + "…"


def _import_meta_dict(order: Order) -> dict[str, Any]:
    raw = getattr(order, "import_metadata_json", None) or ""
    if not str(raw).strip():
        return {}
    try:
        v = json.loads(raw)
        return v if isinstance(v, dict) else {}
    except json.JSONDecodeError:
        return {}


def _history_preview_snippet(meta: dict[str, Any]) -> Optional[str]:
    hist = meta.get("panel_fulfillment_history")
    if not isinstance(hist, list) or not hist:
        return None
    last = hist[-1]
    if not isinstance(last, dict):
        return None
    raw_lines = last.get("lines")
    lines: list[str] = []
    if isinstance(raw_lines, list):
        lines = [str(x).strip() for x in raw_lines if x is not None and str(x).strip()]
    at_e = str(last.get("at") or "").strip()
    joined = " · ".join(lines[:3]) if lines else ""
    if joined:
        return _truncate((at_e + ": " + joined) if at_e else joined)
    return None


MODULE_VIS_LABELS: tuple[tuple[str, str], ...] = (
    ("show_in_picking", "Zbieranie"),
    ("show_in_packing", "Pakowanie"),
    ("show_in_returns", "Zwroty"),
    ("show_in_complaints", "Reklamacje"),
)


def _short_dt(dt: Optional[datetime]) -> str:
    if dt is None:
        return ""
    try:
        return dt.strftime("%d.%m.%Y %H:%M")
    except (TypeError, ValueError, OSError):
        return ""


def format_operational_note_preview_line(note: OrderOperationalNote, *, max_body: int = 140) -> str:
    tags = [lbl for attr, lbl in MODULE_VIS_LABELS if getattr(note, attr, None)]
    prefix = ", ".join(tags) if tags else "Ogólne"
    body = (note.content or "").strip().replace("\n", " ")
    body = _truncate(body, max_body)
    ts = _short_dt(getattr(note, "updated_at", None) or getattr(note, "created_at", None))
    core = f"{prefix}: {body}"
    return f"{ts} · {core}" if ts else core


@dataclass(frozen=True)
class OrderListCommunicationFields:
    has_internal_note: bool
    has_customer_comment: bool
    latest_internal_note_preview: Optional[str]
    latest_customer_comment_preview: Optional[str]


def batch_order_list_communication_fields(db: Session, orders: list[Order]) -> dict[int, OrderListCommunicationFields]:
    if not orders:
        return {}
    order_ids = [int(o.id) for o in orders]

    op_rows = (
        db.query(OrderOperationalNote)
        .filter(OrderOperationalNote.order_id.in_(order_ids))
        .order_by(
            OrderOperationalNote.order_id.asc(),
            desc(func.coalesce(OrderOperationalNote.updated_at, OrderOperationalNote.created_at)),
            desc(OrderOperationalNote.id),
        )
        .all()
    )
    op_by_oid: dict[int, list[OrderOperationalNote]] = {}
    for row in op_rows:
        oid = int(row.order_id)
        op_by_oid.setdefault(oid, []).append(row)

    cust_counts = dict(
        db.query(OrderNote.order_id, func.count())
        .filter(OrderNote.order_id.in_(order_ids), OrderNote.type == "customer")
        .group_by(OrderNote.order_id)
        .all()
    )

    cn_rows = (
        db.query(OrderNote)
        .filter(OrderNote.order_id.in_(order_ids), OrderNote.type == "customer")
        .order_by(
            OrderNote.order_id.asc(),
            desc(OrderNote.created_at),
            desc(OrderNote.id),
        )
        .all()
    )
    latest_cn_text: dict[int, str] = {}
    for r in cn_rows:
        oid = int(r.order_id)
        if oid in latest_cn_text:
            continue
        c = str(getattr(r, "content", None) or "").strip()
        if c:
            latest_cn_text[oid] = c

    cn_top_by_oid: dict[int, list[OrderNote]] = defaultdict(list)
    for r in cn_rows:
        oid = int(r.order_id)
        if len(cn_top_by_oid[oid]) < 3:
            cn_top_by_oid[oid].append(r)

    out: dict[int, OrderListCommunicationFields] = {}
    for o in orders:
        oid = int(o.id)
        op_list = op_by_oid.get(oid) or []
        has_op = len(op_list) > 0
        internal_preview: Optional[str] = None
        if op_list:
            internal_preview = "\n".join(format_operational_note_preview_line(n) for n in op_list[:3])

        meta = _import_meta_dict(o)
        cc = customer_comment_from_import_meta(meta)
        hist = meta.get("panel_fulfillment_history")
        has_hist = isinstance(hist, list) and len(hist) > 0
        cn_n = int(cust_counts.get(oid, 0) or 0)
        has_customer_comms = bool(cc) or has_hist or cn_n > 0

        cust_preview: Optional[str] = None
        cust_lines: list[str] = []
        if cc:
            cust_lines.append(_truncate(cc, 260))
        note_rows = cn_top_by_oid.get(oid) or []
        for nr in note_rows:
            raw_c = str(getattr(nr, "content", None) or "").strip()
            if not raw_c:
                continue
            ts = _short_dt(getattr(nr, "created_at", None))
            piece = _truncate(raw_c, 220)
            cust_lines.append(f"{ts} · {piece}" if ts else piece)
        if cust_lines:
            cust_preview = "\n".join(cust_lines[:3])
        elif latest_cn_text.get(oid):
            cust_preview = _truncate(latest_cn_text[oid], 260)
        else:
            cust_preview = _history_preview_snippet(meta)

        out[oid] = OrderListCommunicationFields(
            has_internal_note=has_op,
            has_customer_comment=has_customer_comms,
            latest_internal_note_preview=internal_preview,
            latest_customer_comment_preview=cust_preview,
        )
    return out


def operational_notes_for_module(
    db: Session,
    order_id: int,
    *,
    picking: bool = False,
    packing: bool = False,
    returns_mod: bool = False,
    complaints_mod: bool = False,
) -> list[OrderOperationalNote]:
    """Notes visible in the given WMS module (OR of matching visibility flags)."""
    q = db.query(OrderOperationalNote).filter(OrderOperationalNote.order_id == int(order_id))

    crit = []
    if picking:
        crit.append(OrderOperationalNote.show_in_picking.is_(True))
    if packing:
        crit.append(OrderOperationalNote.show_in_packing.is_(True))
    if returns_mod:
        crit.append(OrderOperationalNote.show_in_returns.is_(True))
    if complaints_mod:
        crit.append(OrderOperationalNote.show_in_complaints.is_(True))
    if not crit:
        return []
    rows = (
        q.filter(or_(*crit))
        .order_by(
            desc(func.coalesce(OrderOperationalNote.updated_at, OrderOperationalNote.created_at)),
            desc(OrderOperationalNote.id),
        )
        .all()
    )
    return rows
