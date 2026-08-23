"""Emit Activity Log for complaints — projection from structured complaint_events SSOT.

Does not replace complaint_events / audit_events_json; dual-writes user-facing Activity.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from ...models.complaint import Complaint
from ..activity_log.domain_activity import record_domain_activity
from .. import complaint_event_types as ET

logger = logging.getLogger(__name__)

_STATUS_LABEL_PL: dict[str, str] = {
    "NOWE": "Nowe",
    "OCZEKIWANIE_NA_PRODUKT": "Oczekiwanie na produkt",
    "WERYFIKACJA": "Weryfikacja",
    "DECYZJA": "Decyzja",
    "ZAAKCEPTOWANA": "Zaakceptowana",
    "ODRZUCONA": "Odrzucona",
}

_WMS_CODES = frozenset(
    {
        ET.WMS_INSPECTION_SAVED,
        ET.LINE_PROCESS_STATUS,
        "COMPLAINT_WAREHOUSE_RECEIVE",
        "COMPLAINT_PHYSICAL_RECEIPT_MODE",
    }
)


def _status_pl(raw: Any) -> str:
    s = str(raw or "").strip().upper()
    if not s:
        return "—"
    return _STATUS_LABEL_PL.get(s, s)


def _actor_meta(actor_user_id: Optional[int], actor_label: Optional[str] = None) -> dict[str, Any]:
    if actor_user_id is not None:
        return {"actor_kind": "USER"}
    label = str(actor_label or "").strip()
    if label and label.lower() not in ("system", "systemowy"):
        # Legacy string actor without user id — still not invent USER
        return {"actor_kind": "SYSTEM", "actor_label": label[:128]}
    return {"actor_kind": "SYSTEM", "actor_label": "System"}


def _description_for(
    event_type: str,
    payload: dict[str, Any],
    *,
    reference_code: Optional[str],
) -> str:
    code = str(event_type or "").strip().upper()
    ref = str(reference_code or "").strip()

    if code == ET.COMPLAINT_CREATED:
        return f"Utworzono reklamację{f' {ref}' if ref else ''}."

    if code in (ET.COMPLAINT_PROCESS_STATUS, ET.COMPLAINT_STATUS_CHANGED):
        fr = _status_pl(payload.get("from") or payload.get("from_status"))
        to = _status_pl(payload.get("to") or payload.get("to_status") or payload.get("status"))
        return f"Zmieniono etap reklamacji:\n{fr} → {to}"

    if code == ET.COMPLAINT_AUTO_ACCEPTED_LAW:
        return "Reklamacja uznana automatycznie z mocy prawa."

    if code == ET.LINE_UPDATED:
        bits = payload.get("changed") or payload.get("fields")
        extra = ""
        if isinstance(bits, list) and bits:
            extra = " (" + ", ".join(str(x) for x in bits[:8]) + ")"
        return f"Zaktualizowano pozycję reklamacji{extra}."

    if code == ET.LINE_DECISION_SET:
        return f"Ustawiono decyzję pozycji: {_dash(payload.get('decision') or payload.get('line_decision'))}."

    if code == ET.LINE_PROCESS_STATUS:
        fr = _dash(payload.get("from"))
        to = _dash(payload.get("to") or payload.get("action"))
        return f"Zmieniono status operacyjny pozycji:\n{fr} → {to}"

    if code == ET.SETTLEMENT_SAVED:
        st = _dash(payload.get("settlement_type"))
        amt = payload.get("amount")
        line = f"Zapisano rozliczenie pozycji ({st})."
        if amt is not None:
            line += f"\nKwota: {amt}"
        return line

    if code == ET.RESOLUTION_SET:
        return f"Ustawiono rozliczenie reklamacji: {_dash(payload.get('resolution_type') or payload.get('type'))}."

    if code == ET.REFUND_CREATED:
        amt = payload.get("amount")
        cur = payload.get("currency") or "PLN"
        return f"Zapisano zwrot pieniędzy{f': {amt} {cur}' if amt is not None else ''}."

    if code == ET.REPLACEMENT_ORDER_CREATED:
        oid = payload.get("order_id") or payload.get("replacement_order_id")
        return f"Utworzono zamówienie wymiany{f' #{oid}' if oid else ''}."

    if code == ET.PHOTO_ADDED:
        ch = payload.get("photo_channel") or payload.get("kind") or "zdjęcia"
        n = payload.get("added") or payload.get("count") or payload.get("files")
        return f"Dodano zdjęcia ({ch}){f': {n}' if n else ''}."

    if code == ET.PHOTO_REMOVED:
        return "Usunięto zdjęcie."

    if code == ET.DOCUMENT_GENERATED:
        return f"Wygenerowano dokument{f' {_dash(payload.get('document_type'))}' if payload.get('document_type') else ''}."

    if code == ET.DOCUMENTS_REGENERATED:
        return "Przegenerowano dokumenty reklamacji."

    if code == ET.WMS_INSPECTION_SAVED:
        n = payload.get("items")
        return f"Zapisano dane WMS / inspekcję{f' ({n} poz.)' if n else ''}."

    if code == ET.SHIPMENT_STATUS:
        fr = _dash(payload.get("from"))
        to = _dash(payload.get("to"))
        track = payload.get("tracking_number")
        base = f"Zmieniono status przesyłki:\n{fr} → {to}"
        if track:
            base += f"\nTracking: {track}"
        return base

    if code == ET.SHIPMENT_CREATED:
        return "Utworzono przesyłkę reklamacyjną."

    if code == ET.DEFECT_TAGS_UPDATED:
        return "Zaktualizowano tagi wad."

    if code == ET.COMPLAINT_DECISION_FLAGS_UPDATED:
        return "Zaktualizowano decyzje nagłówka reklamacji."

    if code == "COMPLAINT_PHYSICAL_RECEIPT_MODE":
        fr = _dash(payload.get("from"))
        to = _dash(payload.get("to"))
        return f"Zmieniono sposób obsługi towaru:\n{fr} → {to}"

    if code == "COMPLAINT_WAREHOUSE_RECEIVE":
        doc = payload.get("stock_document_id")
        return f"Przyjęto towar z reklamacji na magazyn{f' (dok. #{doc})' if doc else ''}."

    if code == "COMPLAINT_UI_STATUS_CHANGED":
        fr = _dash(payload.get("old_status_name") or payload.get("before"))
        to = _dash(payload.get("new_status_name") or payload.get("after"))
        return f"Zmieniono status panelu reklamacji:\n{fr} → {to}"

    if code == "COMPLAINT_ARCHIVED":
        return f"Zarchiwizowano reklamację{f' {ref}' if ref else ''}."

    if code == "COMPLAINT_LOGISTICS_CHANGED":
        return "Zaktualizowano dane logistyczne reklamacji."

    if code == ET.LEGACY_AUDIT:
        legacy = payload.get("legacy_audit_type")
        return f"Zdarzenie reklamacji{f' ({legacy})' if legacy else ''}."

    return f"Zdarzenie reklamacji: {code}"


def _dash(v: Any) -> str:
    if v is None:
        return "—"
    s = str(v).strip()
    return s if s else "—"


def project_complaint_event_to_activity(
    db: Session,
    *,
    complaint_id: int,
    event_type: str,
    payload: Optional[dict[str, Any]] = None,
    line_id: Optional[int] = None,
    actor: Optional[str] = None,
    actor_user_id: Optional[int] = None,
    event_row_id: Optional[str] = None,
) -> None:
    """
    Project one structured complaint event into Activity Log (object_type=complaint).
    Idempotent via correlation_id = complaint-event:{uuid} when event_row_id set.
    """
    try:
        c = db.query(Complaint).filter(Complaint.id == int(complaint_id)).first()
        if c is None:
            return
        body = dict(payload or {})
        if line_id is not None:
            body.setdefault("complaint_line_id", int(line_id))
        code = str(event_type or "").strip().upper()
        # Normalize legacy mapped types that stay LEGACY_AUDIT with subtype
        if code == ET.LEGACY_AUDIT:
            legacy = str(body.get("legacy_audit_type") or "").strip().lower()
            if legacy == "physical_receipt_mode":
                code = "COMPLAINT_PHYSICAL_RECEIPT_MODE"
            elif legacy == "warehouse_receive":
                code = "COMPLAINT_WAREHOUSE_RECEIVE"

        ref = str(getattr(c, "reference_code", None) or "").strip() or None
        desc = _description_for(code, body, reference_code=ref)
        cid = (
            f"complaint-event:{event_row_id}"[:64]
            if event_row_id
            else f"complaint:{int(complaint_id)}:{code}:{hash(frozenset(body.items()) if body else 0) & 0xFFFFFFFF:x}"[:64]
        )

        is_wms = code in _WMS_CODES or str(body.get("source_category") or "").upper() == "WMS"
        meta: dict[str, Any] = {
            **_actor_meta(actor_user_id, actor),
            "complaint_id": int(complaint_id),
            "reference_code": ref,
            "complaint_event_type": code,
            **body,
        }
        if is_wms:
            meta["source_category"] = "WMS"
            meta["wms_module"] = "complaints"

        # Complaint Activity SSOT: link complaint only (not Order Logi spam).
        record_domain_activity(
            db,
            tenant_id=int(c.tenant_id),
            warehouse_id=int(c.warehouse_id) if getattr(c, "warehouse_id", None) else None,
            event_type=code,
            description=desc,
            actor_user_id=actor_user_id,
            complaint_id=int(complaint_id),
            stock_document_id=int(body["stock_document_id"])
            if body.get("stock_document_id") not in (None, "")
            else None,
            correlation_id=cid,
            source_module="complaints",
            category="wms" if is_wms else "status",
            severity="SUCCESS"
            if code
            in (
                ET.COMPLAINT_CREATED,
                ET.RESOLUTION_SET,
                ET.REFUND_CREATED,
                ET.REPLACEMENT_ORDER_CREATED,
                ET.DOCUMENT_GENERATED,
            )
            else ("WARNING" if code == "COMPLAINT_ARCHIVED" else "INFO"),
            complaint_label=ref or f"#{complaint_id}",
            metadata=meta,
        )
    except Exception:
        logger.exception(
            "complaint activity projection failed complaint_id=%s type=%s",
            complaint_id,
            event_type,
        )


def emit_complaint_ui_status_changed(
    db: Session,
    *,
    complaint: Complaint,
    old_status_id: Optional[int],
    new_status_id: Optional[int],
    old_status_name: Optional[str] = None,
    new_status_name: Optional[str] = None,
    actor_user_id: Optional[int] = None,
) -> None:
    if old_status_id == new_status_id:
        return
    before = str(old_status_name or "").strip() or ("—" if old_status_id is None else f"#{old_status_id}")
    after = str(new_status_name or "").strip() or ("—" if new_status_id is None else f"#{new_status_id}")
    project_complaint_event_to_activity(
        db,
        complaint_id=int(complaint.id),
        event_type="COMPLAINT_UI_STATUS_CHANGED",
        payload={
            "old_status_id": old_status_id,
            "new_status_id": new_status_id,
            "old_status_name": before,
            "new_status_name": after,
            "before": before,
            "after": after,
        },
        actor_user_id=actor_user_id,
        event_row_id=f"ui-status:{complaint.id}:{old_status_id}:{new_status_id}",
    )


def emit_complaint_archived(
    db: Session,
    *,
    complaint: Complaint,
    actor_user_id: Optional[int] = None,
) -> None:
    project_complaint_event_to_activity(
        db,
        complaint_id=int(complaint.id),
        event_type="COMPLAINT_ARCHIVED",
        payload={},
        actor_user_id=actor_user_id,
        event_row_id=f"archived:{complaint.id}",
    )
