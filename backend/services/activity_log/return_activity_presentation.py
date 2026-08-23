"""Return Activity Log presentation — labels, WMS prefixes, inline details.

Read-time only. Formats stored ActivityEvent rows for object_type=return.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from .domain_event_codes import (
    DOMAIN_EVENT_TITLES_PL,
    RETURN_ARCHIVED,
    RETURN_COMPONENT_RECOVERY,
    RETURN_COMPONENT_SCRAP,
    RETURN_CREATED,
    RETURN_FINALIZED,
    RETURN_ITEM_ADDED,
    RETURN_LINE_DECISION,
    RETURN_PUTAWAY_COMPLETED,
    RETURN_RECEIPT_CREATED,
    RETURN_REFUND_COMPLETED,
    RETURN_STATUS_CHANGED,
    RETURN_STOCK_INTAKE_SELECTED,
)

DetailsDisplay = Literal["inline", "expand", "none"]

WMS_RETURNS_PREFIX = "[WMS - Zwroty]"

RETURN_ACTION_LABELS_PL: dict[str, str] = {
    RETURN_CREATED: "Utworzono zwrot",
    RETURN_STATUS_CHANGED: "Zmieniono status zwrotu",
    RETURN_ITEM_ADDED: "Dodano produkt do zwrotu",
    RETURN_LINE_DECISION: "Zapisano decyzję pozycji",
    RETURN_STOCK_INTAKE_SELECTED: "Sposób przyjęcia magazynowego",
    RETURN_COMPONENT_RECOVERY: "Rozliczono komponent",
    RETURN_COMPONENT_SCRAP: "Rozliczono komponent",
    RETURN_RECEIPT_CREATED: "Utworzono dokument Z-PZ",
    RETURN_PUTAWAY_COMPLETED: "Rozlokowano przyjęcie zwrotu",
    RETURN_REFUND_COMPLETED: "Rozliczono zwrot",
    RETURN_FINALIZED: "Zakończono zwrot",
    RETURN_ARCHIVED: "Zarchiwizowano zwrot",
}

RETURN_WMS_CODES = frozenset(
    {
        RETURN_LINE_DECISION,
        RETURN_STOCK_INTAKE_SELECTED,
        RETURN_COMPONENT_RECOVERY,
        RETURN_COMPONENT_SCRAP,
        RETURN_RECEIPT_CREATED,
        RETURN_PUTAWAY_COMPLETED,
        RETURN_FINALIZED,
    }
)

INLINE_DETAIL_CODES = frozenset(
    {
        RETURN_STATUS_CHANGED,
        RETURN_ITEM_ADDED,
        RETURN_LINE_DECISION,
        RETURN_REFUND_COMPLETED,
        RETURN_STOCK_INTAKE_SELECTED,
        RETURN_COMPONENT_RECOVERY,
        RETURN_RECEIPT_CREATED,
        RETURN_PUTAWAY_COMPLETED,
        RETURN_CREATED,
        RETURN_FINALIZED,
        RETURN_ARCHIVED,
    }
)


def _norm(code: str) -> str:
    return str(code or "").strip().upper().replace("-", "_")


def _meta_str(meta: dict[str, Any], *keys: str) -> str:
    for k in keys:
        v = meta.get(k)
        if v is None:
            continue
        s = str(v).strip()
        if s:
            return s
    return ""


def _dash(v: Any) -> str:
    if v is None:
        return "—"
    s = str(v).strip()
    return s if s else "—"


def is_return_event_code(event_code: str) -> bool:
    code = _norm(event_code)
    return code.startswith("RETURN_") or code in RETURN_ACTION_LABELS_PL


def is_wms_returns_event(event_code: str, metadata: Optional[dict[str, Any]] = None) -> bool:
    code = _norm(event_code)
    meta = metadata if isinstance(metadata, dict) else {}
    if str(meta.get("wms_module") or "").strip().lower() == "returns":
        return True
    if str(meta.get("source_category") or "").strip().upper() == "WMS" and code.startswith("RETURN_"):
        return True
    if code in RETURN_WMS_CODES:
        return True
    if code == RETURN_REFUND_COMPLETED and str(meta.get("refund_source") or "").lower() == "warehouse":
        return True
    return False


def resolve_return_event_title(event_code: str, metadata: Optional[dict[str, Any]] = None) -> Optional[str]:
    """
    Dynamic Zdarzenie label for returns. Returns None when code is not return-specific.
    """
    code = _norm(event_code)
    meta = metadata if isinstance(metadata, dict) else {}

    if code == RETURN_STOCK_INTAKE_SELECTED:
        mode = _meta_str(meta, "stock_intake_mode").upper()
        is_bundle = bool(meta.get("is_bundle")) or _meta_str(meta, "source").lower() == "bundle"
        if mode in ("DISASSEMBLE", "MIXED"):
            base = "Rozmontowano zestaw" if is_bundle else "Rozmontowano produkt"
        elif mode == "FG":
            base = "Przyjęto zestaw w całości" if is_bundle else "Przyjęto gotowy produkt"
        else:
            base = DOMAIN_EVENT_TITLES_PL.get(RETURN_STOCK_INTAKE_SELECTED) or RETURN_ACTION_LABELS_PL.get(code)
    elif code == RETURN_COMPONENT_RECOVERY:
        source = _meta_str(meta, "source").lower()
        if source == "bundle" or bool(meta.get("is_bundle")):
            base = "Rozliczono element zestawu"
        else:
            base = "Rozliczono komponent"
    elif code == RETURN_COMPONENT_SCRAP:
        source = _meta_str(meta, "source").lower()
        if source == "bundle" or bool(meta.get("is_bundle")):
            base = "Rozliczono element zestawu"
        else:
            base = "Rozliczono komponent"
    elif code in RETURN_ACTION_LABELS_PL:
        base = RETURN_ACTION_LABELS_PL[code]
    else:
        return None

    if is_wms_returns_event(code, meta) and base:
        if not str(base).startswith(WMS_RETURNS_PREFIX):
            return f"{WMS_RETURNS_PREFIX} {base}"
    return base


def return_details_display_for(event_code: str) -> DetailsDisplay:
    code = _norm(event_code)
    if code in INLINE_DETAIL_CODES:
        return "inline"
    return "none"


def format_return_effect_message(
    event_code: str,
    *,
    stored_description: str,
    metadata: Optional[dict[str, Any]] = None,
) -> str:
    """Prefer stored narrative; lightly normalize WMS prefix on the effect line when needed."""
    code = _norm(event_code)
    meta = metadata if isinstance(metadata, dict) else {}
    text = str(stored_description or "").strip()
    if not text:
        text = resolve_return_event_title(code, meta) or DOMAIN_EVENT_TITLES_PL.get(code) or code
    if is_wms_returns_event(code, meta) and not text.startswith(WMS_RETURNS_PREFIX):
        # Keep title column with prefix; effect stays readable without double-prefix spam
        # unless description is a short label-only string.
        if text in RETURN_ACTION_LABELS_PL.values() or text == DOMAIN_EVENT_TITLES_PL.get(code):
            return f"{WMS_RETURNS_PREFIX} {text}"
    return text


def build_return_inline_detail_rows(
    event_code: str, metadata: Optional[dict[str, Any]] = None
) -> list[dict[str, str]]:
    """Compact rows for Efekt — only fields that add info beyond the summary line."""
    meta = metadata if isinstance(metadata, dict) else {}
    code = _norm(event_code)
    rows: list[dict[str, str]] = []

    if code == RETURN_STATUS_CHANGED:
        before = _meta_str(meta, "before", "old_status_name")
        after = _meta_str(meta, "after", "new_status_name")
        if before or after:
            rows.append({"label": "Status", "value": f"{_dash(before)} → {_dash(after)}"})
        return rows

    if code == RETURN_ITEM_ADDED:
        name = _meta_str(meta, "product_name")
        sku = _meta_str(meta, "product_sku")
        ean = _meta_str(meta, "product_ean")
        if name:
            rows.append({"label": "Produkt", "value": name})
        id_bits = []
        if sku:
            id_bits.append(f"SKU: {sku}")
        if ean:
            id_bits.append(f"EAN: {ean}")
        if id_bits:
            rows.append({"label": "Identyfikatory", "value": " · ".join(id_bits)})
        if meta.get("quantity") is not None:
            rows.append({"label": "Ilość", "value": _dash(meta.get("quantity"))})
        price = _meta_str(meta, "unit_price_display")
        if price:
            rows.append({"label": "Cena", "value": price})
        return rows

    if code == RETURN_LINE_DECISION:
        name = _meta_str(meta, "product_name")
        sku = _meta_str(meta, "product_sku")
        ean = _meta_str(meta, "product_ean")
        if name or sku:
            rows.append({"label": "Produkt", "value": name or sku})
        id_bits = []
        if sku and name:
            id_bits.append(f"SKU: {sku}")
        if ean:
            id_bits.append(f"EAN: {ean}")
        if id_bits:
            rows.append({"label": "Identyfikatory", "value": " · ".join(id_bits)})
        if meta.get("decision") is not None:
            rows.append({"label": "Decyzja", "value": _dash(meta.get("decision"))})
        return rows

    if code == RETURN_REFUND_COMPLETED:
        amt = _meta_str(meta, "refund_amount_display")
        method = _meta_str(meta, "refund_method_label", "refund_type")
        ship = _meta_str(meta, "refund_shipping_amount_display")
        if amt:
            rows.append({"label": "Kwota", "value": amt})
        if method:
            rows.append({"label": "Metoda", "value": method})
        if ship:
            rows.append({"label": "Wysyłka", "value": ship})
        return rows

    if code in (RETURN_RECEIPT_CREATED, RETURN_PUTAWAY_COMPLETED):
        doc = _meta_str(meta, "document_number")
        if doc:
            rows.append({"label": "Dokument", "value": doc})
        return rows

    return rows
