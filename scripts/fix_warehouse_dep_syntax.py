"""Fix Annotated warehouse deps → explicit Depends() defaults for Python syntax."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REPLACEMENTS = [
    ("warehouse_id: OperableWarehouseId", "warehouse_id: int = Depends(require_operable_warehouse)"),
    ("warehouse_id: ActiveOperableWarehouseId", "warehouse_id: int = Depends(require_active_operable_warehouse)"),
    (
        "warehouse_id: ActiveOrQueryOperableWarehouseId",
        "warehouse_id: int = Depends(require_active_or_query_operable_warehouse)",
    ),
]

IMPORT_OLD = "from ..auth.warehouse_deps import OperableWarehouseId\n"
IMPORT_NEW = (
    "from fastapi import Depends\n"
    "from ..auth.warehouse_deps import (\n"
    "    require_operable_warehouse,\n"
    "    require_active_operable_warehouse,\n"
    "    require_active_or_query_operable_warehouse,\n"
    "    assert_stock_document_warehouse,\n"
    "    enforce_warehouse_access,\n"
    ")\n"
)


def patch_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    orig = text
    if "require_operable_warehouse" in text and "OperableWarehouseId" not in text:
        return False
    if "OperableWarehouseId" not in text and "ActiveOperableWarehouseId" not in text and "ActiveOrQueryOperableWarehouseId" not in text:
        return False
    for old, new in REPLACEMENTS:
        text = text.replace(old, new)
    if IMPORT_OLD in text:
        text = text.replace(IMPORT_OLD, IMPORT_NEW)
    else:
        m = re.search(r"from \.\.auth\.warehouse_deps import[^\n]+\n", text)
        if m and "require_operable_warehouse" not in text:
            text = text[: m.start()] + IMPORT_NEW + text[m.end() :]
    if "from fastapi import Depends" not in text and "Depends(require_operable" in text:
        text = text.replace("from fastapi import APIRouter", "from fastapi import APIRouter, Depends", 1)
        if "from fastapi import APIRouter, Depends" not in text:
            text = text.replace("from fastapi import ", "from fastapi import Depends, ", 1)
    if text != orig:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def main() -> None:
    for p in (ROOT / "backend" / "api").rglob("*.py"):
        if patch_file(p):
            print("fixed", p.relative_to(ROOT))


if __name__ == "__main__":
    main()
