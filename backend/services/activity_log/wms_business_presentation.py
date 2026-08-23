"""Shared WMS business presentation (Order › Logi + Historia WMS).

Formats stored audit metadata for operators. Does not mutate or strip raw audit.
"""

from __future__ import annotations

import re
from typing import Any, Optional


DetailRow = dict[str, str]

_TECHNICAL_TOKENS = (
    "disabled_in_settings",
    "no_consumables",
    "change_order_status",
    "create_document",
    "packaging_rw",
    "generate_shipment",
    "print_document",
    "print_label",
    "packed_status_id",
)

_UUID_RE = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
    re.IGNORECASE,
)


def fmt_qty(q: float | int | None) -> str:
    if q is None:
        return "0"
    try:
        f = float(q)
    except (TypeError, ValueError):
        return str(q)
    if abs(f - round(f)) < 1e-6:
        return str(int(round(f)))
    return f"{f:g}"


def product_operation_title(*, verb: str, quantity: float | int | None, product_name: str | None, sku: str | None) -> str:
    """e.g. Zebrano 2 × Sznurówadła CAT 100 cm  /  Spakowano 1 × BR-02141"""
    q = fmt_qty(quantity)
    name = (product_name or "").strip()
    code = (sku or "").strip()
    if name:
        return f"{verb} {q} × {name}"
    if code:
        return f"{verb} {q} × {code}"
    return f"{verb} {q} szt."


def carton_source_label(source: str | None) -> str | None:
    src = (source or "").strip().upper()
    if not src:
        return None
    if src in ("THREE_D", "3D", "3D_MATCHING"):
        return "3D Matching"
    if src in ("SMART", "SMART_MATCHING"):
        return "Rekomendacja"
    if src in ("MANUAL", "OPERATOR", "USER"):
        return "Ręcznie"
    if src in ("NONE", "NO_CARTON"):
        return None
    # Avoid leaking unknown backend enums
    if src.isupper() and "_" in src:
        return None
    return src[:80]


def carton_phrase(*, name: str | None, dimensions: str | None, carton_id: str | None = None) -> str:
    nm = (name or "").strip()
    dim = (dimensions or "").strip()
    if nm and dim:
        return f"„{nm}” ({dim})"
    if nm:
        return f"„{nm}”"
    if dim:
        return dim
    cid = (carton_id or "").strip()
    if cid and not _UUID_RE.fullmatch(cid):
        return f"„{cid}”"
    return "opakowanie"


def _parse_document_number(message: str) -> str | None:
    msg = (message or "").strip()
    if not msg:
        return None
    m = re.search(r"(?:^|;)\s*number=([^;]+)", msg, re.IGNORECASE)
    if m:
        return m.group(1).strip() or None
    # Plain document number without technical prefixes
    if "id=" in msg.lower() or _UUID_RE.search(msg):
        return None
    if any(t in msg for t in _TECHNICAL_TOKENS):
        return None
    if len(msg) <= 80 and "/" in msg:
        return msg
    return None


def format_post_pack_step_rows(steps: list[Any] | None) -> list[DetailRow]:
    """Business rows for post-pack pipeline (status / document / shipment)."""
    rows: list[DetailRow] = []
    if not isinstance(steps, list):
        return rows

    for raw in steps:
        if not isinstance(raw, dict):
            continue
        step = str(raw.get("step") or "").strip()
        if not step:
            continue
        ok = bool(raw.get("ok"))
        skipped = bool(raw.get("skipped"))
        msg = str(raw.get("message") or "").strip()

        if step == "change_order_status":
            if skipped or msg == "disabled_in_settings":
                # Silent when disabled — status unchanged is not a business highlight
                continue
            if ok and msg and msg not in _TECHNICAL_TOKENS and "packed_status" not in msg:
                rows.append({"label": "Status", "value": msg})
            elif not ok:
                rows.append({"label": "Status", "value": "Nie zmieniono"})
            continue

        if step == "create_document":
            if skipped or msg == "disabled_in_settings":
                rows.append({"label": "Dokument", "value": "Nie utworzono (wyłączone)"})
                continue
            number = _parse_document_number(msg)
            if ok and number:
                rows.append({"label": "Dokument", "value": number})
            elif ok:
                rows.append({"label": "Dokument", "value": "Utworzono"})
            else:
                rows.append({"label": "Dokument", "value": "Nie udało się utworzyć"})
            continue

        if step == "generate_shipment":
            if skipped or msg == "disabled_in_settings":
                rows.append({"label": "Przesyłka", "value": "Nie utworzono (wyłączona)"})
                continue
            if ok and not skipped:
                tracking = msg if msg and not any(t in msg for t in _TECHNICAL_TOKENS) and not _UUID_RE.search(msg) else None
                rows.append({"label": "Przesyłka", "value": tracking or "Utworzono"})
            elif not ok:
                rows.append({"label": "Przesyłka", "value": "Nie udało się utworzyć"})
            continue

        if step == "packaging_rw":
            # Hide no_consumables / empty RW — not useful for operators
            if skipped or msg in ("no_consumables", "disabled_in_settings"):
                continue
            if ok and msg.startswith("id="):
                rows.append({"label": "RW opakowań", "value": "Utworzono"})
            elif ok:
                rows.append({"label": "RW opakowań", "value": "Utworzono"})
            elif not ok:
                rows.append({"label": "RW opakowań", "value": "Nie udało się utworzyć"})
            continue

        if step in ("print_document", "print_label"):
            if skipped or msg == "disabled_in_settings":
                continue
            label = "Wydruk dokumentu" if step == "print_document" else "Wydruk etykiety"
            if ok:
                rows.append({"label": label, "value": "Wykonano"})
            else:
                rows.append({"label": label, "value": "Nie udało się"})
            continue

        # Unknown steps: never dump raw step/message codes into UI
        continue

    return rows


def packing_automation_detail_rows(meta: dict[str, Any] | None) -> list[DetailRow]:
    meta = meta or {}
    rows: list[DetailRow] = []
    if meta.get("packing_duration_label"):
        rows.append({"label": "Czas", "value": str(meta["packing_duration_label"])})
    rows.extend(format_post_pack_step_rows(meta.get("post_pack_steps")))
    return rows


def packing_finished_detail_rows(meta: dict[str, Any] | None) -> list[DetailRow]:
    meta = meta or {}
    rows: list[DetailRow] = []
    if meta.get("no_carton"):
        rows.append({"label": "Opakowanie", "value": "Bez dodatkowego opakowania"})
    elif meta.get("carton_name") or meta.get("carton_label"):
        rows.append(
            {
                "label": "Opakowanie",
                "value": carton_phrase(
                    name=meta.get("carton_name"),
                    dimensions=meta.get("carton_label"),
                    carton_id=str(meta.get("selected_carton_id") or "") or None,
                ),
            }
        )
    if meta.get("packing_duration_label"):
        rows.append({"label": "Czas", "value": str(meta["packing_duration_label"])})
    return rows


def picking_finished_detail_rows(meta: dict[str, Any] | None) -> list[DetailRow]:
    meta = meta or {}
    rows: list[DetailRow] = []
    bits: list[str] = []
    if meta.get("units_count") is not None:
        bits.append(f"{fmt_qty(meta['units_count'])} szt.")
    if meta.get("products_count") is not None:
        bits.append(f"{fmt_qty(meta['products_count'])} produkty" if int(meta["products_count"] or 0) != 1 else "1 produkt")
    if meta.get("locations_count") is not None:
        n = int(meta["locations_count"] or 0)
        bits.append(f"{n} lokalizacje" if n != 1 else "1 lokalizacja")
    if bits:
        rows.append({"label": "Podsumowanie", "value": " · ".join(bits)})
    if meta.get("picking_duration_label"):
        rows.append({"label": "Czas", "value": str(meta["picking_duration_label"])})
    if meta.get("new_order_ui_status_name"):
        rows.append({"label": "Status", "value": str(meta["new_order_ui_status_name"])})
    return rows


def pick_item_detail_rows(meta: dict[str, Any] | None) -> list[DetailRow]:
    meta = meta or {}
    rows: list[DetailRow] = []
    sku = (meta.get("sku") or "").strip()
    name = (meta.get("product_name") or "").strip()
    if sku and name:
        rows.append({"label": "SKU", "value": sku})
    elif sku and not name:
        pass  # SKU already in title
    loc = (meta.get("source_location") or meta.get("location_code") or "").strip()
    if loc:
        rows.append({"label": "Lokalizacja", "value": loc})
    cart = (meta.get("target_cart") or "").strip()
    if cart and cart.lower() not in ("bez wózka", "none"):
        rows.append({"label": "Wózek", "value": cart})
    return rows


def pack_item_detail_rows(meta: dict[str, Any] | None) -> list[DetailRow]:
    meta = meta or {}
    rows: list[DetailRow] = []
    sku = (meta.get("sku") or "").strip()
    name = (meta.get("product_name") or "").strip()
    if sku and name:
        rows.append({"label": "SKU", "value": sku})
    if meta.get("workstation_id") is not None:
        rows.append({"label": "Stanowisko", "value": f"#{meta['workstation_id']}"})
    return rows


def carton_event_detail_rows(meta: dict[str, Any] | None, *, changed: bool = False) -> list[DetailRow]:
    meta = meta or {}
    rows: list[DetailRow] = []
    if changed and (meta.get("old_carton_name") or meta.get("old_carton_label")):
        old_p = carton_phrase(
            name=meta.get("old_carton_name"),
            dimensions=meta.get("old_carton_label"),
            carton_id=str(meta.get("old_carton_id") or "") or None,
        )
        new_p = carton_phrase(
            name=meta.get("carton_name"),
            dimensions=meta.get("carton_label"),
            carton_id=str(meta.get("new_carton_id") or "") or None,
        )
        rows.append({"label": "Zmiana", "value": f"{old_p} → {new_p}"})
    else:
        if meta.get("no_carton"):
            rows.append({"label": "Opakowanie", "value": "Bez dodatkowego opakowania"})
        else:
            phrase = carton_phrase(
                name=meta.get("carton_name"),
                dimensions=meta.get("carton_label") or meta.get("dimensions"),
                carton_id=str(meta.get("new_carton_id") or meta.get("selected_carton_id") or "") or None,
            )
            if phrase != "opakowanie":
                rows.append({"label": "Opakowanie", "value": phrase})
            elif meta.get("carton_label"):
                rows.append({"label": "Wymiary", "value": str(meta["carton_label"])})
    src = carton_source_label(meta.get("source") if isinstance(meta.get("source"), str) else None)
    if src:
        rows.append({"label": "Źródło", "value": src})
    return rows


def rendered_text_is_business_safe(text: str) -> bool:
    """Test helper: rendered business timeline must not leak technical tokens/UUIDs."""
    t = text or ""
    if _UUID_RE.search(t):
        return False
    low = t.lower()
    for tok in _TECHNICAL_TOKENS:
        if tok in low:
            return False
    return True
