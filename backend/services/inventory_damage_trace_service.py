"""Build and persist damage trace on inventory rows (RMZ / complaint → Z-PZ → putaway)."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, List, Optional

from sqlalchemy.orm import Session

from ..models.app_user import AppUser
from ..models.complaint import Complaint
from ..models.complaint_line import ComplaintLine
from ..models.inventory import Inventory
from ..models.return_module_config import ReturnDamageReason
from ..models.stock_document import StockDocumentItem
from ..models.wms_order_return import WmsOrderReturn
from ..models.wms_rmz_line import RMZLine
from ..schemas.inventory_damage_trace import InventoryDamageTraceOut
from .stock_disposition import (
    STOCK_DISPOSITION_OUTLET_B,
    STOCK_DISPOSITION_SERVICE_C,
    damaged_inventory_badge_label,
    normalize_stock_disposition,
    stock_disposition_for_document_line,
)

_logger = logging.getLogger(__name__)


@dataclass
class DamageTraceSnapshot:
    damage_class: Optional[str] = None
    reason_codes: List[str] = field(default_factory=list)
    reason_labels: List[str] = field(default_factory=list)
    source_reference: Optional[str] = None
    source_kind: Optional[str] = None
    source_document_line_id: Optional[int] = None
    decided_at: Optional[datetime] = None
    decided_by_user_id: Optional[int] = None
    operator_name: Optional[str] = None


def _parse_json_list(raw: object) -> List[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()]
    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return []
        try:
            parsed = json.loads(s)
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed if str(x).strip()]
        except (TypeError, ValueError, json.JSONDecodeError):
            return [s]
    return []


def _dump_json_list(values: List[str]) -> Optional[str]:
    cleaned = [str(v).strip() for v in values if str(v).strip()]
    return json.dumps(cleaned, ensure_ascii=False) if cleaned else None


def infer_damage_class_from_line(line: StockDocumentItem | None) -> Optional[str]:
    if line is None:
        return None
    rd = (getattr(line, "return_decision", None) or "").strip().upper()
    if rd == "DAMAGED_B":
        return "B"
    if rd == "DAMAGED_C":
        return "C"
    sd = stock_disposition_for_document_line(line)
    if sd == STOCK_DISPOSITION_OUTLET_B:
        return "B"
    if sd == STOCK_DISPOSITION_SERVICE_C:
        return "C"
    return None


def _parse_damage_entries_json(raw: object) -> List[dict[str, Any]]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [x for x in raw if isinstance(x, dict)]
    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return []
        try:
            parsed = json.loads(s)
            if isinstance(parsed, list):
                return [x for x in parsed if isinstance(x, dict)]
        except (TypeError, ValueError, json.JSONDecodeError):
            return []
    return []


def _resolve_reason_labels(db: Session, tenant_id: int, codes: List[str]) -> List[str]:
    if not codes:
        return []
    uniq = []
    seen: set[str] = set()
    for c in codes:
        k = c.strip()
        if not k or k in seen:
            continue
        seen.add(k)
        uniq.append(k)
    rows = (
        db.query(ReturnDamageReason)
        .filter(
            ReturnDamageReason.tenant_id == int(tenant_id),
            ReturnDamageReason.code.in_(uniq),
        )
        .all()
    )
    by_code = {(r.code or "").strip(): (r.label or "").strip() for r in rows}
    out: List[str] = []
    for c in uniq:
        label = by_code.get(c) or c
        if label not in out:
            out.append(label)
    return out


def _rmz_source_reference(db: Session, rmz_id: int) -> str:
    rmz = db.query(WmsOrderReturn).filter(WmsOrderReturn.id == int(rmz_id)).first()
    if rmz is not None:
        num = (getattr(rmz, "rmz_number", None) or "").strip()
        if num:
            return num if num.upper().startswith("RMZ") else f"RMZ-{num}"
    return f"RMZ-{int(rmz_id)}"


def _complaint_source_reference(db: Session, complaint_id: int) -> str:
    c = db.query(Complaint).filter(Complaint.id == int(complaint_id)).first()
    if c is not None:
        ref = (getattr(c, "reference_code", None) or "").strip()
        if ref:
            return ref if ref.upper().startswith("REK") else f"REK-{ref}"
    return f"REK-{int(complaint_id)}"


def _parse_dt(raw: object) -> Optional[datetime]:
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw
    s = str(raw).strip()
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00").replace("+00:00", ""))
    except (TypeError, ValueError):
        return None


def _find_rmz_damage_entry(
    db: Session,
    *,
    rmz_id: int,
    entry_id: str,
    document_line_id: int,
) -> Optional[dict[str, Any]]:
    base_id = entry_id.split("__", 1)[0].strip()
    lines = db.query(RMZLine).filter(RMZLine.rmz_id == int(rmz_id)).order_by(RMZLine.id.asc()).all()
    for ln in lines:
        for ent in _parse_damage_entries_json(getattr(ln, "damage_entries_json", None)):
            eid = str(ent.get("id") or "").strip()
            sdl = ent.get("stock_document_line_id")
            if eid == entry_id or eid == base_id or (sdl is not None and int(sdl) == int(document_line_id)):
                return ent
        ib = int(getattr(ln, "damaged_b_qty", 0) or 0)
        ic = int(getattr(ln, "damaged_c_qty", 0) or 0)
        rid = int(getattr(ln, "id", 0) or 0)
        if entry_id.startswith("legacy-b-") and ib > 0:
            return {
                "condition": "B",
                "damage_type": getattr(ln, "damage_type", None),
                "operator_name": None,
                "created_at": getattr(ln, "updated_at", None),
                "note": None,
            }
        if entry_id.startswith("legacy-c-") and ic > 0:
            return {
                "condition": "C",
                "damage_type": getattr(ln, "damage_type", None),
                "operator_name": None,
                "created_at": getattr(ln, "updated_at", None),
                "note": None,
            }
    return None


def _complaint_reason_labels(db: Session, complaint: Complaint, line: ComplaintLine | None) -> List[str]:
    labels: List[str] = []
    if line is not None:
        for raw in (getattr(line, "reason", None), getattr(line, "note_warehouse", None)):
            s = (raw or "").strip()
            if s and s not in labels:
                labels.append(s)
    cust = (getattr(complaint, "customer_reason", None) or "").strip()
    if cust and cust not in labels:
        labels.append(cust)
    op_dec = (getattr(complaint, "operational_decision", None) or "").strip()
    if op_dec and op_dec not in labels:
        labels.append(op_dec.replace("_", " ").title())
    return labels


def build_damage_trace_from_document_line(db: Session, line: StockDocumentItem) -> DamageTraceSnapshot:
    tenant_id = int(getattr(getattr(line, "document", None), "tenant_id", 0) or 0)
    if tenant_id <= 0:
        doc = None
        if getattr(line, "document_id", None):
            from ..models.stock_document import StockDocument

            doc = db.query(StockDocument).filter(StockDocument.id == int(line.document_id)).first()
            tenant_id = int(getattr(doc, "tenant_id", 0) or 0)

    snap = DamageTraceSnapshot(
        damage_class=infer_damage_class_from_line(line),
        source_document_line_id=int(getattr(line, "id", 0) or 0) or None,
    )
    reason_codes: List[str] = []
    reason_labels: List[str] = []

    rmz_id = getattr(line, "source_rmz_id", None)
    entry_id = (getattr(line, "rmz_damage_entry_id", None) or "").strip()
    if rmz_id is not None and int(rmz_id) > 0:
        snap.source_kind = "RMZ"
        snap.source_reference = _rmz_source_reference(db, int(rmz_id))
        ent = _find_rmz_damage_entry(
            db,
            rmz_id=int(rmz_id),
            entry_id=entry_id,
            document_line_id=int(line.id),
        )
        if ent is not None:
            cond = str(ent.get("condition") or "").strip().upper()
            if cond in ("B", "C"):
                snap.damage_class = cond
            dt = (str(ent.get("damage_type")).strip() if ent.get("damage_type") else "") or None
            if dt:
                reason_codes.append(dt)
            note = (str(ent.get("note")).strip() if ent.get("note") else "") or None
            if note:
                reason_labels.append(note)
            snap.operator_name = (str(ent.get("operator_name")).strip() if ent.get("operator_name") else None) or None
            snap.decided_at = _parse_dt(ent.get("created_at"))

    cid = getattr(line, "source_complaint_id", None)
    if cid is not None and int(cid) > 0:
        snap.source_kind = "COMPLAINT"
        snap.source_reference = _complaint_source_reference(db, int(cid))
        clid = getattr(line, "source_complaint_line_id", None)
        complaint = db.query(Complaint).filter(Complaint.id == int(cid)).first()
        cline = None
        if clid is not None and int(clid) > 0:
            cline = db.query(ComplaintLine).filter(ComplaintLine.id == int(clid)).first()
        if complaint is not None:
            reason_labels.extend(_complaint_reason_labels(db, complaint, cline))

    if tenant_id > 0 and reason_codes:
        resolved = _resolve_reason_labels(db, tenant_id, reason_codes)
        for lbl in resolved:
            if lbl not in reason_labels:
                reason_labels.append(lbl)
    elif reason_codes:
        for c in reason_codes:
            if c not in reason_labels:
                reason_labels.append(c)

    snap.reason_codes = reason_codes
    snap.reason_labels = reason_labels
    return snap


def apply_damage_trace_to_inventory(inv: Inventory, snap: DamageTraceSnapshot) -> None:
    if snap.damage_class is None and not snap.source_document_line_id and not snap.reason_labels:
        return
    inv.source_document_line_id = snap.source_document_line_id
    inv.damage_class = snap.damage_class
    inv.damage_reason_codes_json = _dump_json_list(snap.reason_codes)
    inv.damage_reason_labels_json = _dump_json_list(snap.reason_labels)
    inv.damage_source_reference = snap.source_reference
    inv.damage_decided_at = snap.decided_at
    inv.damage_decided_by_user_id = snap.decided_by_user_id


def copy_damage_trace_between_inventory(src: Inventory | None, dest: Inventory) -> None:
    if src is None:
        return
    if not (getattr(src, "damage_class", None) or getattr(src, "source_document_line_id", None)):
        return
    dest.source_document_line_id = getattr(src, "source_document_line_id", None)
    dest.damage_class = getattr(src, "damage_class", None)
    dest.damage_reason_codes_json = getattr(src, "damage_reason_codes_json", None)
    dest.damage_reason_labels_json = getattr(src, "damage_reason_labels_json", None)
    dest.damage_source_reference = getattr(src, "damage_source_reference", None)
    dest.damage_decided_at = getattr(src, "damage_decided_at", None)
    dest.damage_decided_by_user_id = getattr(src, "damage_decided_by_user_id", None)


def apply_damage_trace_from_document_line_to_inventory(
    db: Session,
    *,
    inv: Inventory,
    line: StockDocumentItem,
) -> None:
    snap = build_damage_trace_from_document_line(db, line)
    if snap.damage_class is None and infer_damage_class_from_line(line) is None:
        return
    if snap.damage_class is None:
        snap.damage_class = infer_damage_class_from_line(line)
    apply_damage_trace_to_inventory(inv, snap)
    db.add(inv)


def is_damaged_document_line(line: StockDocumentItem) -> bool:
    return infer_damage_class_from_line(line) is not None


def find_dock_inventory_row(
    db: Session,
    *,
    tenant_id: int,
    row: StockDocumentItem,
    doc,
    dock_id: int,
    bn: str,
    ed_store,
    sd: str,
    from_carrier_id: int | None,
) -> Inventory | None:
    q = db.query(Inventory).filter(
        Inventory.tenant_id == int(tenant_id),
        Inventory.product_id == row.product_id,
        Inventory.warehouse_id == doc.warehouse_id,
        Inventory.location_id == int(dock_id),
        Inventory.batch_number == bn,
        Inventory.expiry_date == ed_store,
        Inventory.stock_disposition == sd,
        Inventory.quantity > 1e-9,
    )
    if from_carrier_id is not None:
        q = q.filter(Inventory.carrier_id == int(from_carrier_id))
    else:
        q = q.filter(Inventory.carrier_id.is_(None))
    return q.order_by(Inventory.id.asc()).first()


def materialize_damage_trace_on_dock_inventory(
    db: Session,
    *,
    tenant_id: int,
    row: StockDocumentItem,
    doc,
    dock_id: int,
    bn: str,
    ed_store,
    sd: str,
    from_carrier_id: int | None,
) -> None:
    inv = find_dock_inventory_row(
        db,
        tenant_id=tenant_id,
        row=row,
        doc=doc,
        dock_id=dock_id,
        bn=bn,
        ed_store=ed_store,
        sd=sd,
        from_carrier_id=from_carrier_id,
    )
    if inv is None:
        return
    if not is_damaged_document_line(row):
        return
    apply_damage_trace_from_document_line_to_inventory(db, inv=inv, line=row)


def _operator_display_name(db: Session, user_id: int | None, fallback: str | None = None) -> str | None:
    if fallback and str(fallback).strip():
        return str(fallback).strip()
    if user_id is None or int(user_id) <= 0:
        return None
    u = db.query(AppUser).filter(AppUser.id == int(user_id)).first()
    if u is None:
        return None
    parts = [str(getattr(u, "first_name", "") or "").strip(), str(getattr(u, "last_name", "") or "").strip()]
    name = " ".join(p for p in parts if p).strip()
    return name or (str(getattr(u, "login", "") or "").strip() or None)


def inventory_damage_trace_out(db: Session, inv: Inventory) -> InventoryDamageTraceOut | None:
    sd = normalize_stock_disposition(getattr(inv, "stock_disposition", None))
    dmg_class = (getattr(inv, "damage_class", None) or "").strip().upper() or None
    if dmg_class not in ("B", "C"):
        dmg_class = None

    if sd not in (STOCK_DISPOSITION_OUTLET_B, STOCK_DISPOSITION_SERVICE_C) and not dmg_class:
        return None

    labels = _parse_json_list(getattr(inv, "damage_reason_labels_json", None))
    if not labels:
        codes = _parse_json_list(getattr(inv, "damage_reason_codes_json", None))
        if codes and getattr(inv, "tenant_id", None):
            labels = _resolve_reason_labels(db, int(inv.tenant_id), codes)
        else:
            labels = codes

    if not labels and getattr(inv, "source_document_line_id", None):
        line = db.query(StockDocumentItem).filter(StockDocumentItem.id == int(inv.source_document_line_id)).first()
        if line is not None:
            snap = build_damage_trace_from_document_line(db, line)
            labels = snap.reason_labels
            if not dmg_class:
                dmg_class = snap.damage_class
            if not getattr(inv, "damage_source_reference", None):
                inv.damage_source_reference = snap.source_reference

    source_ref = (getattr(inv, "damage_source_reference", None) or "").strip() or None
    source_kind = None
    if source_ref:
        up = source_ref.upper()
        if up.startswith("RMZ"):
            source_kind = "RMZ"
        elif up.startswith("REK"):
            source_kind = "COMPLAINT"

    operator = _operator_display_name(
        db,
        getattr(inv, "damage_decided_by_user_id", None),
        None,
    )
    if not operator and getattr(inv, "source_document_line_id", None):
        line = db.query(StockDocumentItem).filter(StockDocumentItem.id == int(inv.source_document_line_id)).first()
        if line is not None:
            snap = build_damage_trace_from_document_line(db, line)
            operator = snap.operator_name

    badge = damaged_inventory_badge_label(sd, dmg_class)
    return InventoryDamageTraceOut(
        damage_class=dmg_class,
        damage_reasons=labels,
        source_reference=source_ref,
        source_kind=source_kind,
        decided_at=getattr(inv, "damage_decided_at", None),
        operator_name=operator,
        disposition_badge=badge,
        stock_disposition=sd,
    )


def inventory_damage_trace_dict(db: Session, inv: Inventory) -> dict[str, Any]:
    out = inventory_damage_trace_out(db, inv)
    if out is None:
        sd = normalize_stock_disposition(getattr(inv, "stock_disposition", None))
        badge = damaged_inventory_badge_label(sd, None)
        if not badge:
            return {}
        return {
            "stock_disposition": sd,
            "disposition_badge": badge,
            "damage_trace": None,
        }
    payload = out.model_dump(mode="json")
    return {
        "stock_disposition": out.stock_disposition,
        "disposition_badge": out.disposition_badge,
        "damage_class": out.damage_class,
        "damage_trace": payload,
    }
