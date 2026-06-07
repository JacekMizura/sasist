"""Default commercial document print templates — backend SSOT (not React)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = BACKEND_ROOT / "templates"

PRINT_TEMPLATE_PRESETS: dict[int, dict[str, Any]] = {
    1: {"file": "sale_invoice.html.j2", "label_pl": "Faktura — szablon domyślny", "subtype": "INVOICE"},
    2: {"file": "sale_receipt.html.j2", "label_pl": "Paragon — szablon domyślny", "subtype": "RECEIPT"},
    3: {"file": "warehouse_wz.html.j2", "label_pl": "WZ — szablon domyślny", "subtype": "WZ"},
    4: {"file": "sale_correction.html.j2", "label_pl": "Korekta — szablon domyślny", "subtype": "CORRECTION"},
}

DEFAULT_PRINT_TEMPLATE_ID_BY_SUBTYPE: dict[str, int] = {
    "INVOICE": 1,
    "RECEIPT": 2,
    "WZ": 3,
    "CORRECTION": 4,
}


def list_print_template_presets() -> list[dict[str, Any]]:
    return [
        {"id": pid, **meta}
        for pid, meta in sorted(PRINT_TEMPLATE_PRESETS.items())
    ]


def resolve_template_filename(
    *,
    print_template_id: int | None = None,
    print_template_path: str | None = None,
    document_subtype: str | None = None,
) -> str:
    if print_template_id and int(print_template_id) in PRINT_TEMPLATE_PRESETS:
        return str(PRINT_TEMPLATE_PRESETS[int(print_template_id)]["file"])
    custom = str(print_template_path or "").strip()
    if custom:
        if custom.endswith(".j2") or custom.endswith(".html"):
            return custom.split("/")[-1]
        return f"{custom}.html.j2" if not custom.endswith(".html.j2") else custom
    sub = str(document_subtype or "").strip().upper()
    preset_id = DEFAULT_PRINT_TEMPLATE_ID_BY_SUBTYPE.get(sub)
    if preset_id:
        return str(PRINT_TEMPLATE_PRESETS[preset_id]["file"])
    return "sale_receipt.html.j2"
