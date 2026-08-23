"""Complaint Activity Log presentation — labels, WMS prefixes, inline details."""

from __future__ import annotations

from typing import Any, Literal, Optional

from .. import complaint_event_types as ET

DetailsDisplay = Literal["inline", "expand", "none"]

WMS_COMPLAINTS_PREFIX = "[WMS - Reklamacje]"

COMPLAINT_ACTION_LABELS_PL: dict[str, str] = {
    ET.COMPLAINT_CREATED: "Utworzono reklamację",
    ET.COMPLAINT_PROCESS_STATUS: "Zmieniono etap reklamacji",
    ET.COMPLAINT_STATUS_CHANGED: "Zmieniono etap reklamacji",
    ET.COMPLAINT_AUTO_ACCEPTED_LAW: "Uznano automatycznie z mocy prawa",
    ET.COMPLAINT_DECISION_FLAGS_UPDATED: "Zaktualizowano decyzje",
    ET.LINE_UPDATED: "Zaktualizowano pozycję",
    ET.LINE_DECISION_SET: "Ustawiono decyzję pozycji",
    ET.LINE_PROCESS_STATUS: "Status operacyjny pozycji",
    ET.SETTLEMENT_SAVED: "Rozliczenie pozycji",
    ET.RESOLUTION_SET: "Ustawiono rozliczenie",
    ET.REFUND_CREATED: "Zapisano zwrot pieniędzy",
    ET.REPLACEMENT_ORDER_CREATED: "Utworzono zamówienie wymiany",
    ET.PHOTO_ADDED: "Dodano zdjęcia",
    ET.PHOTO_REMOVED: "Usunięto zdjęcie",
    ET.DOCUMENT_GENERATED: "Wygenerowano dokument",
    ET.DOCUMENTS_REGENERATED: "Przegenerowano dokumenty",
    ET.WMS_INSPECTION_SAVED: "Zapisano inspekcję WMS",
    ET.SHIPMENT_STATUS: "Status przesyłki",
    ET.SHIPMENT_CREATED: "Utworzono przesyłkę",
    ET.DEFECT_TAGS_UPDATED: "Zaktualizowano tagi wad",
    "COMPLAINT_PHYSICAL_RECEIPT_MODE": "Sposób obsługi towaru",
    "COMPLAINT_WAREHOUSE_RECEIVE": "Przyjęcie magazynowe",
    "COMPLAINT_UI_STATUS_CHANGED": "Zmieniono status panelu",
    "COMPLAINT_ARCHIVED": "Zarchiwizowano reklamację",
    "COMPLAINT_LOGISTICS_CHANGED": "Dane logistyczne",
    ET.LEGACY_AUDIT: "Zdarzenie reklamacji",
}

_WMS_CODES = frozenset(
    {
        ET.WMS_INSPECTION_SAVED,
        ET.LINE_PROCESS_STATUS,
        "COMPLAINT_WAREHOUSE_RECEIVE",
        "COMPLAINT_PHYSICAL_RECEIPT_MODE",
    }
)

INLINE_CODES = frozenset(COMPLAINT_ACTION_LABELS_PL.keys())


def _norm(code: str) -> str:
    return str(code or "").strip().upper().replace("-", "_")


def is_complaint_event_code(event_code: str) -> bool:
    code = _norm(event_code)
    if code in COMPLAINT_ACTION_LABELS_PL:
        return True
    if code.startswith("COMPLAINT_") or code.startswith("LINE_") or code in (
        "RESOLUTION_SET",
        "REFUND_CREATED",
        "REPLACEMENT_ORDER_CREATED",
        "PHOTO_ADDED",
        "PHOTO_REMOVED",
        "DOCUMENT_GENERATED",
        "DOCUMENTS_REGENERATED",
        "WMS_INSPECTION_SAVED",
        "SHIPMENT_STATUS",
        "SHIPMENT_CREATED",
        "SETTLEMENT_SAVED",
        "DEFECT_TAGS_UPDATED",
        "LEGACY_AUDIT",
        "OPERATION_STEP_DONE",
    ):
        return True
    return False


def is_wms_complaint_event(event_code: str, metadata: Optional[dict[str, Any]] = None) -> bool:
    code = _norm(event_code)
    meta = metadata if isinstance(metadata, dict) else {}
    if str(meta.get("wms_module") or "").strip().lower() == "complaints":
        return True
    if str(meta.get("source_category") or "").upper() == "WMS" and is_complaint_event_code(code):
        return True
    return code in _WMS_CODES


def resolve_complaint_event_title(
    event_code: str, metadata: Optional[dict[str, Any]] = None
) -> Optional[str]:
    code = _norm(event_code)
    meta = metadata if isinstance(metadata, dict) else {}
    if not is_complaint_event_code(code):
        return None
    base = COMPLAINT_ACTION_LABELS_PL.get(code) or code
    if is_wms_complaint_event(code, meta) and not str(base).startswith(WMS_COMPLAINTS_PREFIX):
        return f"{WMS_COMPLAINTS_PREFIX} {base}"
    return base


def complaint_details_display_for(event_code: str) -> DetailsDisplay:
    if _norm(event_code) in INLINE_CODES:
        return "inline"
    return "none"


def format_complaint_effect_message(
    event_code: str,
    *,
    stored_description: str,
    metadata: Optional[dict[str, Any]] = None,
) -> str:
    text = str(stored_description or "").strip()
    if text:
        return text
    return resolve_complaint_event_title(event_code, metadata) or _norm(event_code)


def build_complaint_inline_detail_rows(
    event_code: str, metadata: Optional[dict[str, Any]] = None
) -> list[dict[str, str]]:
    meta = metadata if isinstance(metadata, dict) else {}
    code = _norm(event_code)
    rows: list[dict[str, str]] = []

    def dash(v: Any) -> str:
        if v is None:
            return "—"
        s = str(v).strip()
        return s if s else "—"

    if code in (ET.COMPLAINT_PROCESS_STATUS, ET.COMPLAINT_STATUS_CHANGED, "COMPLAINT_UI_STATUS_CHANGED"):
        fr = meta.get("from") or meta.get("before") or meta.get("old_status_name")
        to = meta.get("to") or meta.get("after") or meta.get("new_status_name")
        if fr or to:
            rows.append({"label": "Status", "value": f"{dash(fr)} → {dash(to)}"})
        return rows

    if code == ET.SHIPMENT_STATUS:
        fr, to = meta.get("from"), meta.get("to")
        if fr or to:
            rows.append({"label": "Status", "value": f"{dash(fr)} → {dash(to)}"})
        if meta.get("tracking_number"):
            rows.append({"label": "Tracking", "value": dash(meta.get("tracking_number"))})
        return rows

    if code in (ET.REFUND_CREATED, ET.RESOLUTION_SET, ET.SETTLEMENT_SAVED):
        if meta.get("amount") is not None:
            cur = meta.get("currency") or "PLN"
            rows.append({"label": "Kwota", "value": f"{meta.get('amount')} {cur}"})
        if meta.get("resolution_type") or meta.get("settlement_type") or meta.get("kind"):
            rows.append(
                {
                    "label": "Typ",
                    "value": dash(
                        meta.get("resolution_type") or meta.get("settlement_type") or meta.get("kind")
                    ),
                }
            )
        return rows

    if code == "COMPLAINT_WAREHOUSE_RECEIVE" and meta.get("stock_document_id"):
        rows.append({"label": "Dokument", "value": f"#{meta.get('stock_document_id')}"})
        return rows

    if code == ET.PHOTO_ADDED:
        if meta.get("count") or meta.get("added") or meta.get("files"):
            rows.append(
                {
                    "label": "Liczba",
                    "value": dash(meta.get("count") or meta.get("added") or meta.get("files")),
                }
            )
        return rows

    return rows
