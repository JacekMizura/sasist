"""Order › Logi presentation — labels, inline details, WMS message prefixes.

Read-time only. Does not invent events; formats stored ActivityEvent rows.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from .order_event_codes import (
    AUTOMATION_BLOCKED,
    AUTOMATION_FAILED,
    AUTOMATION_SUCCEEDED,
    ORDER_BILLING_ADDRESS_CHANGED,
    ORDER_BUNDLE_ADDED,
    ORDER_CREATED,
    ORDER_CUSTOMER_DATA_CHANGED,
    ORDER_CUSTOM_FIELD_CHANGED,
    ORDER_CUSTOM_FIELD_FILE_ATTACHED,
    ORDER_CUSTOM_FIELD_FILE_REMOVED,
    ORDER_DOCUMENT_SERIES_CHANGED,
    ORDER_IMPORTED,
    ORDER_ITEM_ADDED,
    ORDER_ITEM_DISCOUNT_CHANGED,
    ORDER_ITEM_PRICE_CHANGED,
    ORDER_ITEM_QUANTITY_CHANGED,
    ORDER_ITEM_REMOVED,
    ORDER_ITEM_VAT_CHANGED,
    ORDER_NOTE_ADDED,
    ORDER_NOTE_DELETED,
    ORDER_NOTE_UPDATED,
    ORDER_PAYMENT_METHOD_CHANGED,
    ORDER_PAYMENT_REGISTERED,
    ORDER_PAYMENT_STATUS_CHANGED,
    ORDER_PRIORITY_CHANGED,
    ORDER_SHIPPING_ADDRESS_CHANGED,
    ORDER_SHIPPING_METHOD_CHANGED,
    ORDER_STATUS_CHANGED,
    ORDER_WAREHOUSE_CHANGED,
    SALE_DOCUMENT_CORRECTION_CREATED,
    SALE_DOCUMENT_CREATED,
    SALE_DOCUMENT_FAILED,
    SALE_DOCUMENT_NUMBER_ASSIGNED,
)
from .wms_order_activity import (
    EVT_CARTON_CHANGED,
    EVT_CARTON_SELECTED,
    EVT_LABEL_GENERATED,
    EVT_LABEL_PRINTED,
    EVT_LABEL_REPRINTED,
    EVT_OMS_DECISION_ACCEPTED,
    EVT_OMS_DECISION_WAIT,
    EVT_ORDER_ITEM_REMOVED,
    EVT_ORDER_LINE_REPLACED,
    EVT_ORDER_LINE_SHORTAGE_REPORTED,
    EVT_PACKAGE_WEIGHT_CONFIRMED,
    EVT_PACK_ALL_USED,
    EVT_PACKING_AUTOMATION_FINISHED,
    EVT_PACKING_FINISHED,
    EVT_PACKING_REOPEN_ACKNOWLEDGED,
    EVT_PACKING_STARTED,
    EVT_PICKING_CANCELLED,
    EVT_PICKING_FINISHED,
    EVT_PICKING_STARTED,
    EVT_WMS_PICKING_FINALIZE_FAILED,
    EVT_RECOVERY_FINISHED,
    EVT_RECOVERY_SHORTAGE_REPORTED,
    EVT_RECOVERY_STARTED,
    EVT_REPLACEMENT_ITEM_REMOVED,
    EVT_REPLACEMENT_SHORTAGE_REPORTED,
    EVT_SHIPMENT_GENERATION_REQUESTED,
    EVT_SHORTAGE_REPORTED,
    EVT_SMART_MATCHING_MATCHED,
    EVT_SMART_MATCHING_NO_MATCH,
    EVT_THREE_D_MATCHING_MATCHED,
    EVT_THREE_D_MATCHING_NO_FIT,
    EVT_WAYBILL_ASSIGNED,
    EVT_WMS_VALIDATION_FAILED,
    EVT_WMS_WAREHOUSE_DOCUMENT_CREATED,
)

DetailsDisplay = Literal["inline", "expand", "none"]

# Action verbs for column „Zdarzenie” (what happened).
ORDER_ACTION_LABELS_PL: dict[str, str] = {
    ORDER_CREATED: "Utworzono zamówienie",
    ORDER_IMPORTED: "Zaimportowano zamówienie",
    ORDER_STATUS_CHANGED: "Zmieniono status",
    AUTOMATION_SUCCEEDED: "Automatyzacja",
    AUTOMATION_FAILED: "Automatyzacja",
    AUTOMATION_BLOCKED: "Automatyzacja",
    SALE_DOCUMENT_CREATED: "Utworzono dokument sprzedaży",
    SALE_DOCUMENT_NUMBER_ASSIGNED: "Nadano numer dokumentu",
    SALE_DOCUMENT_CORRECTION_CREATED: "Utworzono korektę",
    SALE_DOCUMENT_FAILED: "Błąd dokumentu sprzedaży",
    ORDER_CUSTOM_FIELD_CHANGED: "Zmieniono pole dodatkowe",
    ORDER_CUSTOM_FIELD_FILE_ATTACHED: "Dodano plik",
    ORDER_CUSTOM_FIELD_FILE_REMOVED: "Usunięto plik",
    ORDER_PAYMENT_REGISTERED: "Zarejestrowano płatność",
    ORDER_PAYMENT_STATUS_CHANGED: "Zmieniono status płatności",
    ORDER_PAYMENT_METHOD_CHANGED: "Zmieniono metodę płatności",
    ORDER_SHIPPING_METHOD_CHANGED: "Zmieniono metodę dostawy",
    ORDER_SHIPPING_ADDRESS_CHANGED: "Zmieniono adres dostawy",
    ORDER_BILLING_ADDRESS_CHANGED: "Zmieniono adres faktury",
    ORDER_CUSTOMER_DATA_CHANGED: "Zmieniono klienta",
    ORDER_NOTE_ADDED: "Dodano notatkę",
    ORDER_NOTE_UPDATED: "Zaktualizowano notatkę",
    ORDER_NOTE_DELETED: "Usunięto notatkę",
    ORDER_ITEM_ADDED: "Dodano produkt",
    ORDER_ITEM_REMOVED: "Usunięto produkt",
    ORDER_ITEM_QUANTITY_CHANGED: "Zmieniono ilość",
    ORDER_ITEM_PRICE_CHANGED: "Zmieniono cenę",
    ORDER_ITEM_DISCOUNT_CHANGED: "Zmieniono rabat",
    ORDER_ITEM_VAT_CHANGED: "Zmieniono VAT",
    ORDER_PRIORITY_CHANGED: "Zmieniono priorytet",
    ORDER_DOCUMENT_SERIES_CHANGED: "Zmieniono serię dokumentu",
    ORDER_WAREHOUSE_CHANGED: "Zmieniono magazyn",
    ORDER_BUNDLE_ADDED: "Dodano zestaw",
    EVT_PICKING_STARTED: "Rozpoczęto zbieranie",
    EVT_PICKING_FINISHED: "Zakończono zbieranie",
    EVT_PICKING_CANCELLED: "Anulowano zbieranie",
    EVT_WMS_PICKING_FINALIZE_FAILED: "Nie udało się zakończyć zbierania",
    EVT_SHORTAGE_REPORTED: "Zgłoszono brak",
    EVT_ORDER_LINE_SHORTAGE_REPORTED: "Zgłoszono brak",
    EVT_REPLACEMENT_SHORTAGE_REPORTED: "Zgłoszono brak",
    EVT_RECOVERY_SHORTAGE_REPORTED: "Zgłoszono brak",
    EVT_RECOVERY_STARTED: "Rozpoczęto dogrywkę",
    EVT_RECOVERY_FINISHED: "Rozwiązano brak",
    EVT_OMS_DECISION_WAIT: "Decyzja OMS — czeka",
    EVT_OMS_DECISION_ACCEPTED: "Zaakceptowano decyzję OMS",
    EVT_ORDER_ITEM_REMOVED: "Usunięto produkt",
    EVT_REPLACEMENT_ITEM_REMOVED: "Usunięto zamiennik",
    EVT_ORDER_LINE_REPLACED: "Zamieniono produkt",
    EVT_PACKING_STARTED: "Rozpoczęto pakowanie",
    EVT_PACKING_FINISHED: "Zakończono pakowanie",
    EVT_PACKING_AUTOMATION_FINISHED: "Zakończono automatykę pakowania",
    EVT_PACKING_REOPEN_ACKNOWLEDGED: "Ponowne wejście do pakowania",
    EVT_PACK_ALL_USED: "Spakuj wszystko",
    EVT_CARTON_SELECTED: "Wybrano karton",
    EVT_CARTON_CHANGED: "Zmieniono karton",
    EVT_PACKAGE_WEIGHT_CONFIRMED: "Potwierdzono wagę",
    EVT_SMART_MATCHING_MATCHED: "Smart Matching",
    EVT_SMART_MATCHING_NO_MATCH: "Smart Matching",
    EVT_THREE_D_MATCHING_MATCHED: "3D Matching",
    EVT_THREE_D_MATCHING_NO_FIT: "3D Matching",
    EVT_SHIPMENT_GENERATION_REQUESTED: "Generowanie przesyłki",
    EVT_WAYBILL_ASSIGNED: "List przewozowy",
    EVT_LABEL_GENERATED: "Wygenerowano etykietę",
    EVT_LABEL_PRINTED: "Wydrukowano etykietę",
    EVT_LABEL_REPRINTED: "Ponowny wydruk etykiety",
    EVT_WMS_WAREHOUSE_DOCUMENT_CREATED: "Dokument magazynowy",
    EVT_WMS_VALIDATION_FAILED: "Walidacja WMS",
}

# Canonical WMS domain prefix for order-facing messages (presentation only).
WMS_PREFIX_BY_EVENT: dict[str, str] = {
    EVT_PICKING_STARTED: "[WMS - Zbieranie]",
    EVT_PICKING_FINISHED: "[WMS - Zbieranie]",
    EVT_PICKING_CANCELLED: "[WMS - Zbieranie]",
    EVT_WMS_PICKING_FINALIZE_FAILED: "[WMS - Zbieranie]",
    EVT_SHORTAGE_REPORTED: "[WMS - Braki]",
    EVT_ORDER_LINE_SHORTAGE_REPORTED: "[WMS - Braki]",
    EVT_REPLACEMENT_SHORTAGE_REPORTED: "[WMS - Braki]",
    EVT_RECOVERY_SHORTAGE_REPORTED: "[WMS - Braki]",
    EVT_RECOVERY_STARTED: "[WMS - Braki]",
    EVT_RECOVERY_FINISHED: "[WMS - Braki]",
    EVT_OMS_DECISION_WAIT: "[WMS - Braki]",
    EVT_OMS_DECISION_ACCEPTED: "[WMS - Braki]",
    EVT_ORDER_LINE_REPLACED: "[WMS - Braki]",
    EVT_REPLACEMENT_ITEM_REMOVED: "[WMS - Braki]",
    EVT_PACKING_STARTED: "[WMS - Pakowanie]",
    EVT_PACKING_FINISHED: "[WMS - Pakowanie]",
    EVT_PACKING_AUTOMATION_FINISHED: "[WMS - Pakowanie]",
    EVT_PACKING_REOPEN_ACKNOWLEDGED: "[WMS - Pakowanie]",
    EVT_PACK_ALL_USED: "[WMS - Pakowanie]",
    EVT_CARTON_SELECTED: "[WMS - Pakowanie]",
    EVT_CARTON_CHANGED: "[WMS - Pakowanie]",
    EVT_PACKAGE_WEIGHT_CONFIRMED: "[WMS - Pakowanie]",
    EVT_WMS_WAREHOUSE_DOCUMENT_CREATED: "[WMS - Pakowanie]",
    EVT_WMS_VALIDATION_FAILED: "[WMS - Pakowanie]",
    EVT_SMART_MATCHING_MATCHED: "[WMS - Smart Matching]",
    EVT_SMART_MATCHING_NO_MATCH: "[WMS - Smart Matching]",
    EVT_THREE_D_MATCHING_MATCHED: "[WMS - 3D Matching]",
    EVT_THREE_D_MATCHING_NO_FIT: "[WMS - 3D Matching]",
    EVT_SHIPMENT_GENERATION_REQUESTED: "[WMS - Wysyłka]",
    EVT_WAYBILL_ASSIGNED: "[WMS - Wysyłka]",
    EVT_LABEL_GENERATED: "[WMS - Wysyłka]",
    EVT_LABEL_PRINTED: "[WMS - Wysyłka]",
    EVT_LABEL_REPRINTED: "[WMS - Wysyłka]",
}

# OMS mutations that should never use expand accordion.
INLINE_DETAIL_CODES: frozenset[str] = frozenset(
    {
        ORDER_SHIPPING_ADDRESS_CHANGED,
        ORDER_BILLING_ADDRESS_CHANGED,
        ORDER_NOTE_ADDED,
        ORDER_NOTE_UPDATED,
        ORDER_NOTE_DELETED,
        ORDER_ITEM_ADDED,
        ORDER_ITEM_REMOVED,
        ORDER_ITEM_QUANTITY_CHANGED,
        ORDER_ITEM_PRICE_CHANGED,
        ORDER_ITEM_VAT_CHANGED,
        ORDER_ITEM_DISCOUNT_CHANGED,
        ORDER_BUNDLE_ADDED,
        ORDER_PRIORITY_CHANGED,
        ORDER_DOCUMENT_SERIES_CHANGED,
        ORDER_WAREHOUSE_CHANGED,
        ORDER_CUSTOMER_DATA_CHANGED,
        ORDER_CUSTOM_FIELD_CHANGED,
        ORDER_PAYMENT_METHOD_CHANGED,
        ORDER_PAYMENT_STATUS_CHANGED,
        ORDER_SHIPPING_METHOD_CHANGED,
        ORDER_STATUS_CHANGED,
        AUTOMATION_SUCCEEDED,
        AUTOMATION_FAILED,
        AUTOMATION_BLOCKED,
        EVT_ORDER_ITEM_REMOVED,
        EVT_WMS_PICKING_FINALIZE_FAILED,
    }
)

EXPAND_DETAIL_CODES: frozenset[str] = frozenset(
    {
        # Full condition/effect tree still lazy-loaded; basics are inline.
    }
)

COMPLETED_SUCCESS_CODES: frozenset[str] = frozenset(
    {
        ORDER_CREATED,
        SALE_DOCUMENT_CREATED,
        SALE_DOCUMENT_NUMBER_ASSIGNED,
        AUTOMATION_SUCCEEDED,
        EVT_PICKING_FINISHED,
        EVT_PACKING_FINISHED,
        EVT_PACKING_AUTOMATION_FINISHED,
        EVT_RECOVERY_FINISHED,
        EVT_PACK_ALL_USED,
        EVT_LABEL_GENERATED,
        EVT_LABEL_PRINTED,
        EVT_WAYBILL_ASSIGNED,
        EVT_WMS_WAREHOUSE_DOCUMENT_CREATED,
    }
)


def _norm(code: str) -> str:
    return str(code or "").strip().upper().replace("-", "_")


def is_wms_sourced(event_code: str, metadata: dict[str, Any] | None) -> bool:
    meta = metadata or {}
    if str(meta.get("source_category") or "").strip().upper() == "WMS":
        return True
    if str(meta.get("timeline_tier") or "").strip().lower() == "business" and _norm(event_code) in WMS_PREFIX_BY_EVENT:
        return True
    cat = str(meta.get("category") or "").strip().lower()
    if cat == "wms":
        return True
    return _norm(event_code) in WMS_PREFIX_BY_EVENT


def wms_prefix_for(event_code: str) -> Optional[str]:
    return WMS_PREFIX_BY_EVENT.get(_norm(event_code))


def apply_wms_prefix(event_code: str, message: str, metadata: dict[str, Any] | None = None) -> str:
    msg = str(message or "").strip()
    if not msg:
        return msg
    if not is_wms_sourced(event_code, metadata):
        return msg
    prefix = wms_prefix_for(event_code)
    if not prefix:
        if msg.startswith("[WMS"):
            return msg
        return f"[WMS] {msg}"
    if msg.startswith("[WMS"):
        return msg
    return f"{prefix} {msg}"


def order_event_action_label(event_code: str, fallback: str | None = None) -> str:
    code = _norm(event_code)
    return ORDER_ACTION_LABELS_PL.get(code) or (fallback or "").strip() or code or "Zdarzenie"


def details_display_for(event_code: str) -> DetailsDisplay:
    code = _norm(event_code)
    if code in INLINE_DETAIL_CODES:
        return "inline"
    if code in EXPAND_DETAIL_CODES:
        return "expand"
    return "none"


def suggest_severity(event_code: str, stored_severity: str | None) -> str:
    """Normalize badge severity without inventing chaos — only upgrade completed ops."""
    raw = str(stored_severity or "INFO").strip().upper()
    if raw in ("ERROR", "ERR", "FAILURE", "FAIL"):
        return "ERROR"
    if raw in ("WARNING", "WARN"):
        return "WARNING"
    if raw in ("SUCCESS", "OK", "AUDIT"):
        return "SUCCESS"
    code = _norm(event_code)
    if code in (AUTOMATION_FAILED, SALE_DOCUMENT_FAILED, EVT_WMS_VALIDATION_FAILED, EVT_WMS_PICKING_FINALIZE_FAILED):
        return "ERROR"
    if code in (AUTOMATION_BLOCKED, EVT_SHORTAGE_REPORTED, EVT_ORDER_LINE_SHORTAGE_REPORTED):
        return "WARNING"
    if code in COMPLETED_SUCCESS_CODES:
        return "SUCCESS"
    return "INFO"


def _dash(v: Any) -> str:
    if v is None:
        return "—"
    s = str(v).strip()
    return s if s else "—"


def _money(meta: dict[str, Any], key: str = "unit_price") -> str | None:
    disp = meta.get("unit_price_display")
    if disp:
        return str(disp)
    if key in meta and meta[key] is not None:
        try:
            from .order_mutation_activity import format_money_pl

            return format_money_pl(meta[key], currency=str(meta.get("currency") or "PLN"))
        except Exception:
            return str(meta[key])
    return None


def build_order_inline_detail_rows(event_code: str, metadata: dict[str, Any] | None) -> list[dict[str, str]]:
    """Compact rows for Efekt column — only fields that add info beyond the summary line."""
    meta = metadata or {}
    code = _norm(event_code)
    rows: list[dict[str, str]] = []

    if code in (ORDER_SHIPPING_ADDRESS_CHANGED, ORDER_BILLING_ADDRESS_CHANGED):
        changed = meta.get("changed_fields")
        if isinstance(changed, list):
            for item in changed:
                if not isinstance(item, dict):
                    continue
                label = str(item.get("label") or item.get("key") or "").strip()
                if not label:
                    continue
                rows.append(
                    {
                        "label": label,
                        "value": f"{_dash(item.get('old'))} → {_dash(item.get('new'))}",
                    }
                )
        return rows

    if code in (ORDER_NOTE_ADDED, ORDER_NOTE_UPDATED):
        # Content is preferred in the summary line; skip duplicate detail card.
        return []

    if code in (ORDER_ITEM_ADDED, ORDER_ITEM_REMOVED, EVT_ORDER_ITEM_REMOVED):
        sku = meta.get("sku")
        ean = meta.get("ean")
        if sku:
            rows.append({"label": "SKU", "value": str(sku)})
        if ean:
            rows.append({"label": "EAN", "value": str(ean)})
        if meta.get("quantity") is not None:
            rows.append({"label": "Ilość", "value": str(meta.get("quantity"))})
        price = _money(meta)
        if price:
            rows.append({"label": "Cena", "value": price})
        return rows

    if code == EVT_WMS_PICKING_FINALIZE_FAILED:
        if meta.get("product_name"):
            rows.append({"label": "Produkt", "value": str(meta["product_name"])})
        if meta.get("sku"):
            rows.append({"label": "SKU", "value": str(meta["sku"])})
        if meta.get("ean"):
            rows.append({"label": "EAN", "value": str(meta["ean"])})
        if meta.get("location_code"):
            rows.append({"label": "Lokalizacja", "value": str(meta["location_code"])})
        if meta.get("required_qty") is not None:
            rows.append({"label": "Wymagane", "value": f"{meta['required_qty']} szt."})
        if meta.get("available_qty") is not None:
            rows.append({"label": "Dostępne", "value": f"{meta['available_qty']} szt."})
        if meta.get("picking_session_id") is not None:
            rows.append({"label": "Sesja zbierania", "value": str(meta["picking_session_id"])})
        return rows

    if code == ORDER_ITEM_QUANTITY_CHANGED:
        sku = meta.get("sku")
        ean = meta.get("ean")
        bits = []
        if sku:
            bits.append(f"SKU: {sku}")
        if ean:
            bits.append(f"EAN: {ean}")
        if bits:
            rows.append({"label": "Identyfikatory", "value": " · ".join(bits)})
        rows.append(
            {
                "label": "Ilość",
                "value": f"{_dash(meta.get('old_quantity'))} → {_dash(meta.get('new_quantity'))}",
            }
        )
        return rows

    if code == ORDER_ITEM_PRICE_CHANGED:
        sku = meta.get("sku")
        ean = meta.get("ean")
        bits = []
        if sku:
            bits.append(f"SKU: {sku}")
        if ean:
            bits.append(f"EAN: {ean}")
        if bits:
            rows.append({"label": "Identyfikatory", "value": " · ".join(bits)})
        rows.append(
            {
                "label": "Cena",
                "value": f"{_dash(meta.get('old_value'))} → {_dash(meta.get('new_value'))}",
            }
        )
        return rows

    if code == ORDER_ITEM_VAT_CHANGED:
        sku = meta.get("sku")
        ean = meta.get("ean")
        bits = []
        if sku:
            bits.append(f"SKU: {sku}")
        if ean:
            bits.append(f"EAN: {ean}")
        if bits:
            rows.append({"label": "Identyfikatory", "value": " · ".join(bits)})
        rows.append(
            {
                "label": "VAT",
                "value": f"{_dash(meta.get('old_value'))} → {_dash(meta.get('new_value'))}",
            }
        )
        return rows

    if code == ORDER_BUNDLE_ADDED:
        if meta.get("quantity") is not None:
            rows.append({"label": "Ilość zestawu", "value": str(meta.get("quantity"))})
        comps = meta.get("components")
        if isinstance(comps, list):
            for c in comps[:20]:
                if not isinstance(c, dict):
                    continue
                nm = str(c.get("name") or c.get("product_name") or "").strip()
                if not nm:
                    continue
                qty = c.get("quantity")
                rows.append({"label": "Składnik", "value": f"{nm}" + (f" × {qty}" if qty is not None else "")})
        return rows

    if code in (ORDER_PRIORITY_CHANGED, ORDER_DOCUMENT_SERIES_CHANGED, ORDER_WAREHOUSE_CHANGED, ORDER_CUSTOMER_DATA_CHANGED):
        if meta.get("old_value") is not None or meta.get("new_value") is not None:
            # Summary already has the sentence — avoid duplicate unless no description context.
            return []
        return rows

    if code in (AUTOMATION_SUCCEEDED, AUTOMATION_FAILED, AUTOMATION_BLOCKED):
        rule = meta.get("rule_name")
        if rule:
            rows.append({"label": "Reguła", "value": str(rule)})
        es = meta.get("effects_succeeded")
        ef = meta.get("effects_failed")
        ec = meta.get("effects_count")
        if es is not None or ef is not None or ec is not None:
            rows.append(
                {
                    "label": "Efekty",
                    "value": f"{int(es or 0)} OK / {int(ef or 0)} błędów"
                    + (f" (łącznie {int(ec)})" if ec is not None else ""),
                }
            )
        if meta.get("error"):
            rows.append({"label": "Błąd", "value": str(meta.get("error"))[:400]})
        return rows

    if code == ORDER_STATUS_CHANGED:
        return []

    changed = meta.get("changed_fields")
    if isinstance(changed, list) and changed:
        for item in changed:
            if not isinstance(item, dict):
                continue
            label = str(item.get("label") or item.get("key") or "").strip()
            if not label:
                continue
            rows.append(
                {
                    "label": label,
                    "value": f"{_dash(item.get('old'))} → {_dash(item.get('new'))}",
                }
            )
        return rows

    return rows


def format_order_effect_message(
    event_code: str,
    *,
    stored_description: str,
    metadata: dict[str, Any] | None,
) -> str:
    """Primary Efekt line — may enrich note/product summaries from snapshot metadata."""
    meta = metadata or {}
    code = _norm(event_code)
    desc = str(stored_description or "").strip()

    if code in (ORDER_NOTE_ADDED, ORDER_NOTE_UPDATED):
        preview = str(meta.get("content_preview") or "").strip()
        if preview:
            verb = "Dodano notatkę" if code == ORDER_NOTE_ADDED else "Zaktualizowano notatkę"
            # Prefer snapshot over bare stored sentence.
            if "„" not in desc and '"' not in desc:
                return f"{verb}:\n„{preview}”"
            if desc in ("Dodano notatkę do zamówienia.", "Zaktualizowano notatkę."):
                return f"{verb}:\n„{preview}”"

    if code == ORDER_ITEM_ADDED:
        name = str(meta.get("product_name") or meta.get("name") or "").strip()
        if name and (not desc or "SKU" not in desc):
            return f"Dodano produkt „{name}”."

    if code in (ORDER_ITEM_REMOVED, EVT_ORDER_ITEM_REMOVED):
        name = str(meta.get("product_name") or meta.get("name") or "").strip()
        if name and desc.startswith("Usunięto pozycję"):
            return f"Usunięto produkt „{name}”."

    if code == ORDER_ITEM_QUANTITY_CHANGED:
        name = str(meta.get("product_name") or "").strip()
        if name:
            return f"Zmieniono ilość produktu „{name}”."

    if code == ORDER_ITEM_PRICE_CHANGED:
        name = str(meta.get("product_name") or "").strip()
        if name:
            return f"Zmieniono cenę produktu „{name}”."

    if code == ORDER_ITEM_VAT_CHANGED:
        name = str(meta.get("product_name") or "").strip()
        if name:
            return f"Zmieniono VAT produktu „{name}”."

    return apply_wms_prefix(event_code, desc, meta)
