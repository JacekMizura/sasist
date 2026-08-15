"""
Presentation helpers for picking-entry readiness gate activity events.

Formats ``metadata.lines`` / MO demand metadata into Polish business copy.
No raw readiness enums in the output. Shared by Activity Log enrich path
(Logi + Historia czynności both consume ``enrich_activity_item``).
"""

from __future__ import annotations

from typing import Any


def _qty_label(v: Any) -> str:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return "0"
    if abs(f - round(f)) < 1e-9:
        return str(int(round(f)))
    return f"{f:.4f}".rstrip("0").rstrip(".")


def _product_heading(line: dict[str, Any]) -> tuple[str, str | None]:
    name = str(line.get("product_name") or "").strip()
    sku = str(line.get("sku") or line.get("product_sku") or "").strip() or None
    if not name:
        pid = line.get("product_id")
        name = f"Produkt #{pid}" if pid is not None else "Produkt"
    return name, sku


def _line_code(line: dict[str, Any]) -> str:
    return str(line.get("code") or "").strip().upper()


def _is_manufacturing_line(code: str) -> bool:
    return code in {
        "MANUFACTURING_MISSING",
        "MANUFACTURING_PARTIAL",
        "INVALID_MANUFACTURING_CONFIG",
    }


def _is_regular_shortage_line(code: str) -> bool:
    return code in {"REGULAR_SHORTAGE", "NO_BOM"}


def format_picking_entry_blocked_line_compact(line: dict[str, Any]) -> str:
    """One compact business line (multi-blocker / mixed)."""
    name, sku = _product_heading(line)
    label = sku or name
    code = _line_code(line)
    required = _qty_label(line.get("required_qty", line.get("required")))
    parts: list[str] = [f"Wymagane {required}"]

    if _is_manufacturing_line(code):
        allocated = _qty_label(line.get("allocated_existing_fg", line.get("would_allocate", 0)))
        prod = _qty_label(line.get("production_required_qty", line.get("production_required", 0)))
        parts.append(f"Przydzielone {allocated}")
        parts.append(f"Do produkcji {prod}")
        mo = str(line.get("mo_number") or "").strip()
        body = f"{label}\n{' · '.join(parts)}"
        if mo:
            body = f"{body}\n{mo}"
        return body

    if _is_regular_shortage_line(code):
        available = _qty_label(line.get("available", 0))
        missing = _qty_label(line.get("missing", 0))
        parts.append(f"Dostępne {available}")
        parts.append(f"Brak magazynowy {missing}")
        return f"{label}\n{' · '.join(parts)}"

    available = _qty_label(line.get("available", 0))
    parts.append(f"Dostępne {available}")
    return f"{label}\n{' · '.join(parts)}"


def format_picking_entry_blocked_line_detailed(line: dict[str, Any]) -> str:
    """Expanded single-line manufacturing block (UAT-friendly)."""
    name, sku = _product_heading(line)
    code = _line_code(line)
    chunks: list[str] = [name]
    if sku:
        chunks.append(sku)

    required = _qty_label(line.get("required_qty", line.get("required")))
    available = _qty_label(line.get("available", 0))
    chunks.append(f"Wymagane: {required}")
    chunks.append(f"Dostępne: {available}")

    if _is_manufacturing_line(code):
        allocated = _qty_label(line.get("allocated_existing_fg", line.get("would_allocate", 0)))
        prod = _qty_label(line.get("production_required_qty", line.get("production_required", 0)))
        chunks.append(f"Przydzielone: {allocated}")
        chunks.append(f"Do wyprodukowania: {prod}")
        mo = str(line.get("mo_number") or "").strip()
        if mo:
            chunks.append(mo)
    elif _is_regular_shortage_line(code):
        missing = _qty_label(line.get("missing", 0))
        chunks.append(f"Brak magazynowy: {missing}")

    return "\n".join(chunks)


def format_picking_entry_gate_blocked_message(
    *,
    stored_description: str | None,
    metadata: dict[str, Any] | None,
) -> str:
    """
    Full action text for ``PICKING_ENTRY_GATE_BLOCKED``.

    Fallback: stored description when ``metadata.lines`` is missing/empty.
    """
    stored = (stored_description or "").strip() or (
        "Nie można rozpocząć zbierania — brak gotowego produktu."
    )
    meta = metadata if isinstance(metadata, dict) else {}
    raw_lines = meta.get("lines")
    if not isinstance(raw_lines, list) or not raw_lines:
        return stored[:2000]

    lines = [ln for ln in raw_lines if isinstance(ln, dict)]
    if not lines:
        return stored[:2000]

    use_detailed = len(lines) == 1 and _is_manufacturing_line(_line_code(lines[0]))
    body_parts = [
        format_picking_entry_blocked_line_detailed(ln)
        if use_detailed
        else format_picking_entry_blocked_line_compact(ln)
        for ln in lines
    ]
    body = "\n\n".join(p for p in body_parts if p.strip())
    if not body:
        return stored[:2000]
    return f"{stored}\n\n{body}"[:2000]


def format_picking_entry_mo_demand_message(
    *,
    stored_description: str | None,
    metadata: dict[str, Any] | None,
) -> str:
    """Full action text for ``PICKING_ENTRY_MO_DEMAND``."""
    meta = metadata if isinstance(metadata, dict) else {}
    stored = (stored_description or "").strip()
    mo = str(meta.get("mo_number") or "").strip()
    qty = _qty_label(meta.get("requested_quantity", meta.get("quantity", 0)))
    if not stored:
        if mo:
            stored = f"Utworzono zapotrzebowanie produkcyjne — {mo}, {qty} szt."
        else:
            stored = f"Utworzono zapotrzebowanie produkcyjne — {qty} szt."

    name = str(meta.get("product_name") or "").strip()
    sku = str(meta.get("sku") or meta.get("product_sku") or "").strip()
    extras: list[str] = []
    if name:
        extras.append(name)
    if sku:
        extras.append(sku)
    if qty and qty != "0":
        extras.append(f"Ilość: {qty}")
    if mo and mo not in stored:
        extras.append(mo)

    if not extras:
        return stored[:2000]
    body = f"{stored}\n" + "\n".join(extras)
    return body[:2000]


def build_picking_entry_detail_rows(metadata: dict[str, Any] | None) -> list[dict[str, str]]:
    """Optional structured detail rows (same facts as the action body)."""
    meta = metadata if isinstance(metadata, dict) else {}
    rows: list[dict[str, str]] = []
    raw_lines = meta.get("lines")
    if isinstance(raw_lines, list):
        for idx, ln in enumerate(raw_lines, start=1):
            if not isinstance(ln, dict):
                continue
            name, sku = _product_heading(ln)
            label = f"Pozycja {idx}" if len(raw_lines) > 1 else "Produkt"
            value = name if not sku else f"{name} ({sku})"
            rows.append({"label": label, "value": value})
            code = _line_code(ln)
            rows.append(
                {
                    "label": "Wymagane",
                    "value": _qty_label(ln.get("required_qty", ln.get("required"))),
                }
            )
            rows.append({"label": "Dostępne", "value": _qty_label(ln.get("available", 0))})
            if _is_manufacturing_line(code):
                rows.append(
                    {
                        "label": "Przydzielone",
                        "value": _qty_label(
                            ln.get("allocated_existing_fg", ln.get("would_allocate", 0))
                        ),
                    }
                )
                rows.append(
                    {
                        "label": "Do wyprodukowania",
                        "value": _qty_label(
                            ln.get("production_required_qty", ln.get("production_required", 0))
                        ),
                    }
                )
                mo = str(ln.get("mo_number") or "").strip()
                if mo:
                    rows.append({"label": "Zlecenie MO", "value": mo})
            elif _is_regular_shortage_line(code):
                rows.append(
                    {"label": "Brak magazynowy", "value": _qty_label(ln.get("missing", 0))}
                )
    mo = str(meta.get("mo_number") or "").strip()
    if mo and not any(r.get("value") == mo for r in rows):
        rows.append({"label": "Zlecenie MO", "value": mo})
    qty = meta.get("requested_quantity")
    if qty is not None and not raw_lines:
        rows.append({"label": "Ilość", "value": _qty_label(qty)})
    pname = str(meta.get("product_name") or "").strip()
    if pname and not raw_lines:
        rows.append({"label": "Produkt", "value": pname})
    return rows
