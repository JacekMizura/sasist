"""Presentation helpers for production Activity Log events (Polish business copy)."""

from __future__ import annotations

from typing import Any

from .domain_event_codes import (
    PRODUCTION_CANCELLED,
    PRODUCTION_COLLECTION_COMPLETED,
    PRODUCTION_COLLECTION_PROGRESS,
    PRODUCTION_COLLECTION_STARTED,
    PRODUCTION_COMPLETED,
    PRODUCTION_COMPONENT_SHORTAGE,
    PRODUCTION_CREATED_FROM_PLANNING,
    PRODUCTION_DEMAND_REDUCED,
    PRODUCTION_DUE_DATE_CHANGED,
    PRODUCTION_EXTERNAL_STOCK_COVERED_ORDER,
    PRODUCTION_MATERIALS_RESERVED,
    PRODUCTION_MATERIAL_RESERVATIONS_RELEASED,
    PRODUCTION_OPERATOR_ASSIGNED,
    PRODUCTION_OPERATOR_CHANGED,
    PRODUCTION_ORDER_CREATED,
    PRODUCTION_ORDER_DEMAND_FULFILLED,
    PRODUCTION_OUTPUT_REGISTERED,
    PRODUCTION_BATCH_CREATED,
    PRODUCTION_PLANNED_QTY_CHANGED,
    PRODUCTION_PROGRESS_REPORTED,
    PRODUCTION_PUTAWAY_COMPLETED,
    PRODUCTION_PW_CREATED,
    PRODUCTION_RELEASED,
    PRODUCTION_RESUMED,
    PRODUCTION_RW_CREATED,
    PRODUCTION_SENT_TO_PUTAWAY,
    PRODUCTION_SHORTAGE_AUTO_RESUMED,
    PRODUCTION_SHORTAGE_RESOLVED,
    PRODUCTION_SOURCE_DETACHED,
    PRODUCTION_STARTED,
    PRODUCTION_STATUS_AUTO_CHANGED,
    PRODUCTION_TRACEABILITY_BLOCKED,
)


PRODUCTION_EVENT_CODES: frozenset[str] = frozenset(
    {
        PRODUCTION_ORDER_CREATED,
        PRODUCTION_BATCH_CREATED,
        PRODUCTION_CREATED_FROM_PLANNING,
        PRODUCTION_OPERATOR_ASSIGNED,
        PRODUCTION_OPERATOR_CHANGED,
        PRODUCTION_DUE_DATE_CHANGED,
        PRODUCTION_PLANNED_QTY_CHANGED,
        PRODUCTION_RELEASED,
        PRODUCTION_COMPONENT_SHORTAGE,
        PRODUCTION_SHORTAGE_RESOLVED,
        PRODUCTION_MATERIALS_RESERVED,
        PRODUCTION_MATERIAL_RESERVATIONS_RELEASED,
        PRODUCTION_COLLECTION_STARTED,
        PRODUCTION_COLLECTION_PROGRESS,
        PRODUCTION_COLLECTION_COMPLETED,
        PRODUCTION_RW_CREATED,
        PRODUCTION_STARTED,
        PRODUCTION_PROGRESS_REPORTED,
        PRODUCTION_OUTPUT_REGISTERED,
        PRODUCTION_PW_CREATED,
        PRODUCTION_SENT_TO_PUTAWAY,
        PRODUCTION_PUTAWAY_COMPLETED,
        PRODUCTION_ORDER_DEMAND_FULFILLED,
        PRODUCTION_EXTERNAL_STOCK_COVERED_ORDER,
        PRODUCTION_DEMAND_REDUCED,
        PRODUCTION_SOURCE_DETACHED,
        PRODUCTION_COMPLETED,
        PRODUCTION_CANCELLED,
        PRODUCTION_RESUMED,
        PRODUCTION_TRACEABILITY_BLOCKED,
        PRODUCTION_STATUS_AUTO_CHANGED,
        PRODUCTION_SHORTAGE_AUTO_RESUMED,
    }
)


def _qty(v: Any) -> str:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return "0"
    if abs(f - round(f)) < 1e-9:
        return str(int(round(f)))
    return f"{f:.4f}".rstrip("0").rstrip(".")


def _production_label(meta: dict[str, Any]) -> str:
    return str(
        meta.get("production_number")
        or meta.get("mo_number")
        or meta.get("production_batch_number")
        or meta.get("batch_series_number")
        or ""
    ).strip()


def format_production_activity_message(
    *,
    event_code: str,
    stored_description: str | None,
    metadata: dict[str, Any] | None,
) -> str:
    """Build user-facing Polish copy from structured metadata (no raw enums)."""
    code = str(event_code or "").strip().upper().replace("-", "_")
    meta = dict(metadata or {})
    stored = (stored_description or "").strip()
    # Prefer stored business description when already Polish and non-enum.
    if stored and " " in stored and "_" not in stored.split()[0]:
        # Still refine OUTPUT / COMPLETED from metadata when richer.
        if code not in (PRODUCTION_OUTPUT_REGISTERED, PRODUCTION_COMPLETED, PRODUCTION_PW_CREATED):
            return stored

    lbl = _production_label(meta)
    qty = meta.get("quantity")
    planned = meta.get("planned_quantity")
    produced_total = meta.get("produced_total")
    lot = str(meta.get("batch_number") or meta.get("lot_number") or "").strip()
    serial_count = meta.get("serial_count")
    doc_no = str(meta.get("document_number") or meta.get("rw_document_number") or meta.get("pw_document_number") or "").strip()
    order_label = str(meta.get("order_number") or meta.get("order_label") or "").strip()
    if order_label and not order_label.startswith("#"):
        try:
            order_label = f"#{int(order_label)}" if str(order_label).isdigit() else order_label
        except Exception:
            pass
    elif meta.get("order_id") and not order_label:
        order_label = f"#{int(meta['order_id'])}"

    if code == PRODUCTION_ORDER_CREATED:
        q = _qty(planned if planned is not None else qty)
        return f"Utworzono zlecenie produkcji {lbl or 'MO'} na {q} szt." if lbl else f"Utworzono zlecenie produkcji na {q} szt."
    if code == PRODUCTION_BATCH_CREATED:
        q = _qty(planned if planned is not None else qty)
        return f"Utworzono serię produkcyjną {lbl or 'BAT'} na {q} szt." if lbl else f"Utworzono serię produkcyjną na {q} szt."
    if code == PRODUCTION_CREATED_FROM_PLANNING:
        return "Utworzono zlecenie z planowania zapasu." + (f" {lbl}." if lbl else "")
    if code == PRODUCTION_OPERATOR_ASSIGNED:
        name = str(meta.get("operator_name") or meta.get("new_operator_name") or "").strip()
        return f"Przypisano operatora: {name}." if name else "Przypisano operatora."
    if code == PRODUCTION_OPERATOR_CHANGED:
        old = str(meta.get("old_operator_name") or "").strip() or "—"
        new = str(meta.get("new_operator_name") or "").strip() or "—"
        return f"Zmieniono operatora: {old} → {new}."
    if code == PRODUCTION_DUE_DATE_CHANGED:
        old = str(meta.get("old_due_date") or "").strip() or "—"
        new = str(meta.get("new_due_date") or "").strip() or "—"
        return f"Termin zmieniono z {old} na {new}."
    if code == PRODUCTION_PLANNED_QTY_CHANGED:
        return f"Planowana ilość: {_qty(meta.get('old_quantity'))} → {_qty(meta.get('new_quantity'))} szt."
    if code == PRODUCTION_RELEASED:
        return "Zlecenie przekazano do realizacji."
    if code == PRODUCTION_COMPONENT_SHORTAGE:
        sku = str(meta.get("shortage_sku") or meta.get("component_sku") or "").strip()
        missing = meta.get("shortage_qty") or meta.get("missing_qty")
        if sku and missing is not None:
            return f"Nie można rozpocząć produkcji — brakuje {sku}: {_qty(missing)} szt."
        return stored or "Nie można rozpocząć produkcji — brak materiałów."
    if code == PRODUCTION_SHORTAGE_RESOLVED:
        return "Materiały dostępne — zlecenie może zostać wznowione."
    if code == PRODUCTION_MATERIALS_RESERVED:
        return "Zarezerwowano materiały do produkcji."
    if code == PRODUCTION_MATERIAL_RESERVATIONS_RELEASED:
        return "Zwolniono rezerwacje materiałów."
    if code == PRODUCTION_COLLECTION_STARTED:
        return "Rozpoczęto pobieranie komponentów."
    if code == PRODUCTION_COLLECTION_PROGRESS:
        collected = meta.get("collected_qty")
        total = meta.get("required_qty")
        if collected is not None and total is not None:
            return f"Pobrano {_qty(collected)}/{_qty(total)} szt. materiałów."
        return stored or "Postęp pobierania komponentów."
    if code == PRODUCTION_COLLECTION_COMPLETED:
        return "Zakończono pobieranie komponentów."
    if code == PRODUCTION_RW_CREATED:
        return f"Utworzono {doc_no}." if doc_no else (stored or "Utworzono dokument RW.")
    if code == PRODUCTION_STARTED:
        return "Rozpoczęto produkcję."
    if code in (PRODUCTION_OUTPUT_REGISTERED, PRODUCTION_PROGRESS_REPORTED):
        parts = [f"Zarejestrowano produkcję {_qty(qty)} szt."]
        try:
            sc = int(serial_count) if serial_count is not None else 0
        except (TypeError, ValueError):
            sc = 0
        if sc > 0:
            parts = [f"Zarejestrowano produkcję {_qty(qty)} szt. z numerami seryjnymi."]
        elif lot:
            parts.append(f"Partia (LOT): {lot}")
        if produced_total is not None and planned is not None:
            parts.append(f"łącznie {_qty(produced_total)}/{_qty(planned)} szt.")
        return " · ".join(parts)
    if code == PRODUCTION_PW_CREATED:
        if doc_no and qty is not None:
            return f"Utworzono {doc_no} na {_qty(qty)} szt."
        return f"Utworzono {doc_no}." if doc_no else (stored or "Utworzono dokument PW.")
    if code == PRODUCTION_SENT_TO_PUTAWAY:
        return f"Przekazano {_qty(qty)} szt. do rozlokowania." if qty is not None else "Przekazano do rozlokowania."
    if code == PRODUCTION_PUTAWAY_COMPLETED:
        return f"Rozlokowano {_qty(qty)} szt. wyrobu." if qty is not None else (stored or "Rozlokowano wyrób.")
    if code == PRODUCTION_ORDER_DEMAND_FULFILLED:
        return f"Produkcja pokryła zapotrzebowanie zamówienia {order_label}." if order_label else (
            stored or "Produkcja pokryła zapotrzebowanie zamówienia."
        )
    if code == PRODUCTION_EXTERNAL_STOCK_COVERED_ORDER:
        return "Zamówienie pokryto istniejącym stockiem — produkcja pozostaje na wolny zapas."
    if code == PRODUCTION_DEMAND_REDUCED:
        old_q = meta.get("old_quantity") or meta.get("was_outstanding")
        new_q = meta.get("new_quantity") or meta.get("remaining_outstanding")
        if old_q is not None and new_q is not None:
            return f"Zapotrzebowanie produkcyjne zmniejszono {_qty(old_q)} → {_qty(new_q)} szt."
        return stored or "Zmniejszono zapotrzebowanie produkcyjne."
    if code == PRODUCTION_SOURCE_DETACHED:
        return "Zamówienie pokryto z magazynu — produkcja trafia na wolny zapas."
    if code == PRODUCTION_COMPLETED:
        if produced_total is not None and planned is not None:
            return f"Zakończono zlecenie produkcji {_qty(produced_total)}/{_qty(planned)} szt."
        return stored or "Zakończono zlecenie produkcji."
    if code == PRODUCTION_CANCELLED:
        return "Anulowano zlecenie produkcyjne."
    if code == PRODUCTION_RESUMED:
        return "Wznowiono zlecenie produkcyjne."
    if code == PRODUCTION_TRACEABILITY_BLOCKED:
        reason = str(meta.get("reason_message") or meta.get("reason") or "").strip()
        if reason and " " in reason:
            return reason
        return stored or "Nie można zarejestrować produkcji — wymagana identyfikowalność."
    if code == PRODUCTION_STATUS_AUTO_CHANGED:
        fr = str(meta.get("from_status_label") or meta.get("from_status") or "").strip()
        to = str(meta.get("to_status_label") or meta.get("to_status") or "").strip()
        if fr and to:
            return f"Automatycznie przeniesiono z {fr} do {to}."
        return stored or "Automatyczna zmiana statusu produkcji."
    if code == PRODUCTION_SHORTAGE_AUTO_RESUMED:
        return "Wznowiono produkcję po uzupełnieniu materiałów."

    return stored or "Zdarzenie produkcji."


def build_production_detail_rows(meta: dict[str, Any] | None) -> list[dict[str, str]]:
    """Structured expandable rows — no raw enum dumps."""
    m = dict(meta or {})
    rows: list[dict[str, str]] = []
    lbl = _production_label(m)
    if lbl:
        rows.append({"label": "Zlecenie", "value": lbl})
    if m.get("document_number"):
        rows.append({"label": "Dokument", "value": str(m["document_number"])})
    if m.get("batch_number") or m.get("lot_number"):
        rows.append({"label": "Partia (LOT)", "value": str(m.get("batch_number") or m.get("lot_number"))})
    sc = m.get("serial_count")
    if sc:
        rows.append({"label": "Liczba SN", "value": str(sc)})
    serials = m.get("serial_numbers")
    if isinstance(serials, list) and serials:
        shown = ", ".join(str(x) for x in serials[:20])
        if len(serials) > 20:
            shown += f" … (+{len(serials) - 20})"
        rows.append({"label": "Numery seryjne", "value": shown})
    if m.get("order_id") or m.get("order_number"):
        ol = str(m.get("order_number") or m.get("order_id"))
        rows.append({"label": "Zamówienie", "value": ol if str(ol).startswith("#") else f"#{ol}"})
    return rows
