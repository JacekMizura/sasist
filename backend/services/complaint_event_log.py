"""Insert and query structured complaint_events rows."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..models.complaint_event import ComplaintEvent
from . import complaint_event_types as ET

logger = logging.getLogger(__name__)

# Maps legacy audit `type` (append_complaint_audit_event) → canonical event_type.
# status_change, line_operation, courier_ordered are handled first (from/to transitions).
LEGACY_AUDIT_TYPE_MAP: Dict[str, str] = {
    "complaint_created": ET.COMPLAINT_CREATED,
    "auto_accepted_by_law": ET.COMPLAINT_AUTO_ACCEPTED_LAW,
    "defects_updated": ET.DEFECT_TAGS_UPDATED,
    "resolution_set": ET.RESOLUTION_SET,
    "refund_created": ET.REFUND_CREATED,
    "replacement_order_created": ET.REPLACEMENT_ORDER_CREATED,
    "line_update": ET.LINE_UPDATED,
    "line_settlement_saved": ET.SETTLEMENT_SAVED,
    "customer_photos_added": ET.PHOTO_ADDED,
    "warehouse_photos_added": ET.PHOTO_ADDED,
    "defect_photos_added": ET.PHOTO_ADDED,
    "line_photos_added": ET.PHOTO_ADDED,
    "complaint_document_generated": ET.DOCUMENT_GENERATED,
    "complaint_documents_regenerated": ET.DOCUMENTS_REGENERATED,
    "wms_update": ET.WMS_INSPECTION_SAVED,
}


def _payload_from_legacy_meta(legacy_type: str, meta: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Structured payload only (no free-form Polish sentences)."""
    base: Dict[str, Any] = {}
    if not meta:
        return base
    for k, v in meta.items():
        if k.startswith("_"):
            continue
        try:
            json.dumps(v)
        except (TypeError, ValueError):
            base[k] = str(v)
        else:
            base[k] = v
    if legacy_type in ("customer_photos_added", "warehouse_photos_added", "defect_photos_added", "line_photos_added"):
        base.setdefault("photo_channel", legacy_type.replace("_photos_added", "").replace("line", "line_item"))
    return base


def _line_id_from_meta(meta: Optional[Dict[str, Any]]) -> Optional[int]:
    if not meta:
        return None
    raw = meta.get("complaint_line_id") or meta.get("complaint_item_id")
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _norm_status_segment(raw: Any) -> Optional[str]:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    return s.upper()


def record_status_transition(
    db: Session,
    complaint_id: int,
    event_type: str,
    from_status: Any,
    to_status: Any,
    *,
    line_id: Optional[int] = None,
    extra: Optional[Dict[str, Any]] = None,
    actor: Optional[str] = None,
) -> Optional[str]:
    """
    Append-only audit row with structured from → to (no deduplication; full journal).
    """
    payload: Dict[str, Any] = {
        "from": _norm_status_segment(from_status),
        "to": _norm_status_segment(to_status),
    }
    if extra:
        for k, v in extra.items():
            if v is not None:
                payload[k] = v
    return record_complaint_event(db, complaint_id, event_type, payload, line_id=line_id, actor=actor)


def record_shipment_status_transition(
    db: Session,
    complaint_id: int,
    *,
    shipment_id: int,
    from_status: Any,
    to_status: Any,
    carrier: Optional[str] = None,
    tracking_number: Optional[str] = None,
    role: Optional[str] = None,
    method: Optional[str] = None,
    business_type: Optional[str] = None,
    fulfillment_mode: Optional[str] = None,
    actor: Optional[str] = None,
) -> Optional[str]:
    """SHIPMENT_STATUS — full history; payload includes from, to, shipment_id, context."""
    extra: Dict[str, Any] = {"shipment_id": int(shipment_id)}
    if carrier:
        extra["carrier"] = str(carrier).strip().upper()
    if tracking_number:
        extra["tracking_number"] = str(tracking_number).strip()
    if role:
        extra["role"] = str(role).strip().upper()
    if method:
        extra["method"] = str(method).strip().upper()
    if business_type:
        extra["business_type"] = str(business_type).strip().upper()
    if fulfillment_mode:
        extra["fulfillment_mode"] = str(fulfillment_mode).strip().upper()
    return record_status_transition(
        db,
        complaint_id,
        ET.SHIPMENT_STATUS,
        from_status,
        to_status,
        line_id=None,
        extra=extra,
        actor=actor or "System",
    )


def record_complaint_event(
    db: Session,
    complaint_id: int,
    event_type: str,
    payload: Optional[Dict[str, Any]] = None,
    *,
    line_id: Optional[int] = None,
    actor: Optional[str] = None,
) -> Optional[str]:
    """
    Append one row to complaint_events. Does not commit.
    Returns new row id (uuid string) or None on failure.
    """
    try:
        pid = str(uuid.uuid4())
        body = payload if payload is not None else {}
        row = ComplaintEvent(
            id=pid,
            complaint_id=int(complaint_id),
            line_id=line_id,
            event_type=str(event_type)[:64],
            payload_json=json.dumps(body, ensure_ascii=False, default=str),
            created_at=datetime.utcnow(),
            actor=(actor or "System").strip()[:128] or "System",
        )
        db.add(row)
        return pid
    except Exception:
        logger.exception("record_complaint_event failed complaint_id=%s type=%s", complaint_id, event_type)
        return None


def record_from_legacy_audit_append(
    db: Session,
    complaint_id: int,
    legacy_type: str,
    meta: Optional[Dict[str, Any]],
    user: Optional[str],
) -> None:
    """
    Dual-write path: called from append_complaint_audit_event with the same meta as JSON audit.
    Payload is structured data only (meta), never the Polish message string.
    """
    lt = str(legacy_type)[:64]
    actor = (user or "System").strip() or "System"

    if lt == "status_change" and meta:
        record_status_transition(
            db,
            complaint_id,
            ET.COMPLAINT_PROCESS_STATUS,
            meta.get("from"),
            meta.get("to"),
            actor=actor,
        )
        return

    if lt == "line_operation" and meta:
        lid = _line_id_from_meta(meta)
        extra_lo: Dict[str, Any] = {}
        if meta.get("action"):
            extra_lo["action"] = str(meta["action"]).strip().upper()
        fr_m = meta.get("from")
        to_m = meta.get("to")
        if fr_m is None and to_m is None and meta.get("action"):
            to_m = meta.get("action")
        record_status_transition(
            db,
            complaint_id,
            ET.LINE_PROCESS_STATUS,
            fr_m,
            to_m,
            line_id=lid,
            extra=extra_lo if extra_lo else None,
            actor=actor,
        )
        return

    if lt == "courier_ordered" and meta:
        sid = meta.get("shipment_id")
        if sid is not None:
            try:
                sid_int = int(sid)
            except (TypeError, ValueError):
                sid_int = None
            if sid_int is not None:
                record_shipment_status_transition(
                    db,
                    complaint_id,
                    shipment_id=sid_int,
                    from_status=None,
                    to_status="ORDERED",
                    carrier=meta.get("carrier"),
                    tracking_number=meta.get("tracking_number"),
                    role=meta.get("role"),
                    method=meta.get("method"),
                    actor=actor,
                )
                return

    canonical = LEGACY_AUDIT_TYPE_MAP.get(legacy_type, ET.LEGACY_AUDIT)
    payload = _payload_from_legacy_meta(legacy_type, meta)
    if canonical == ET.LEGACY_AUDIT:
        payload["legacy_audit_type"] = legacy_type[:64]
    line_id = _line_id_from_meta(meta)
    record_complaint_event(db, complaint_id, canonical, payload, line_id=line_id, actor=actor)


def list_events_for_complaint(
    db: Session,
    complaint_id: int,
    *,
    limit: int = 500,
    offset: int = 0,
) -> Tuple[List[ComplaintEvent], int]:
    """Newest first. Returns (rows, total_count)."""
    cid = int(complaint_id)
    base = db.query(ComplaintEvent).filter(ComplaintEvent.complaint_id == cid)
    total = base.count()
    rows = (
        base.order_by(desc(ComplaintEvent.created_at), desc(ComplaintEvent.id))
        .offset(max(0, offset))
        .limit(min(10000, max(1, limit)))
        .all()
    )
    return rows, total


def rows_to_read(rows: List[ComplaintEvent]):
    """Build Pydantic ComplaintEventRead list (lazy import avoids circular imports)."""
    from ..schemas.complaint import ComplaintEventRead

    out = []
    for r in rows:
        payload: Dict[str, Any] = {}
        try:
            parsed = json.loads(r.payload_json or "{}")
            if isinstance(parsed, dict):
                payload = parsed
        except Exception:
            payload = {}
        out.append(
            ComplaintEventRead(
                id=r.id,
                complaint_id=r.complaint_id,
                line_id=r.line_id,
                event_type=r.event_type,
                payload=payload,
                created_at=r.created_at,
                actor=(r.actor or "System").strip() or "System",
            )
        )
    return out
