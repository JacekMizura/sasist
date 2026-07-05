"""Human-readable production block messages — §12."""

from __future__ import annotations

from typing import Any


def build_production_block_message(
    *,
    material_status: str,
    planned_quantity: float,
    producible_now_qty: float,
    waiting_qty: float,
    limiting_component: dict[str, Any] | None,
    components_with_shortage: list[dict[str, Any]],
) -> dict[str, Any]:
    """Structured + Polish summary for blocked/partial production."""
    title = "Można rozpocząć produkcję."
    summary = title
    can_start = material_status != "BLOCKED"

    if material_status == "BLOCKED":
        title = "Nie można rozpocząć produkcji."
        summary = title
    elif material_status == "PARTIAL":
        title = "Produkcja częściowa — można rozpocząć ograniczoną ilość."
        summary = (
            f"{title} Wyprodukuj teraz: {producible_now_qty:g} szt. "
            f"Pozostało do wykonania: {waiting_qty:g} szt."
        )

    lines: list[str] = [summary]
    if limiting_component:
        lines.append(
            f"Składnik ograniczający: {limiting_component.get('product_name')} "
            f"(można max {producible_now_qty:g} szt.)"
        )
        if float(limiting_component.get("missing_qty") or 0) > 1e-6:
            lines.append(
                f"Brak: {limiting_component.get('product_name')} — "
                f"potrzeba {limiting_component.get('required_qty')}, "
                f"dostępne {limiting_component.get('available_qty')}"
            )

    for comp in components_with_shortage[:3]:
        subs = comp.get("substitute_proposals") or []
        usable = [s for s in subs if s.get("can_cover_shortage")]
        if usable:
            best = usable[0]
            lines.append(
                f"Dostępny zamiennik: {best.get('substitute_product_name')} "
                f"(współcz. {best.get('conversion_ratio')}) — użyj zamiennika (decyzja operatora)."
            )

    return {
        "title": title,
        "summary": summary,
        "detail_lines": lines,
        "can_start": can_start,
        "material_status": material_status,
        "planned_quantity": planned_quantity,
        "producible_now_qty": producible_now_qty,
        "waiting_qty": waiting_qty,
        "limiting_component": limiting_component,
    }


def material_status_description(material_status: str) -> str:
    if material_status == "OK":
        return "Wszystkie składniki dostępne w wymaganej ilości. Można zaplanować pełną produkcję."
    if material_status == "PARTIAL":
        return (
            "Materiałów wystarcza tylko na część planu. System proponuje produkcję częściową — "
            "pozostała ilość oczekuje na uzupełnienie stanów."
        )
    return "Brak kluczowych składników — pełna produkcja niemożliwa. Rozważ zamiennik lub zakup."
