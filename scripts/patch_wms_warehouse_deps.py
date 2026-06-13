"""One-off patch: add OperableWarehouseId to WMS API endpoints."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FILES = [
    "backend/api/wave.py",
    "backend/api/wms_picking_entry.py",
    "backend/api/wms_packing_entry.py",
    "backend/api/wms_order_issue_tasks.py",
    "backend/api/wms_operational_tasks.py",
    "backend/api/wms_mm_transfer.py",
    "backend/api/wms_putaway.py",
    "backend/api/wms_relocation.py",
    "backend/api/wms_replenishment.py",
    "backend/api/wms_dashboard.py",
    "backend/api/wms_picking_config.py",
    "backend/api/wms_packing_basket_entry.py",
    "backend/api/wms_products.py",
    "backend/api/wms_settings.py",
    "backend/api/inventory_api.py",
    "backend/api/inventory_count_wms.py",
    "backend/api/inventory_count.py",
    "backend/api/warehouse_layout.py",
    "backend/api/slotting.py",
    "backend/api/product_warehouse_slotting.py",
    "backend/api/stock_documents.py",
    "backend/api/cart.py",
]

IMPORT_LINE = "from ..auth.warehouse_deps import OperableWarehouseId\n"


def patch_file(rel: str) -> str:
    p = ROOT / rel
    if not p.exists():
        return f"skip missing {rel}"
    text = p.read_text(encoding="utf-8")
    orig = text
    if IMPORT_LINE.strip() not in text:
        m = re.search(r"(from \.\.auth\.deps import[^\n]+\n)", text)
        if m:
            text = text[: m.end()] + IMPORT_LINE + text[m.end() :]
        else:
            m2 = re.search(r"(from fastapi import[^\n]+\n)", text)
            if m2:
                text = text[: m2.end()] + "\n" + IMPORT_LINE + text[m2.end() :]
            else:
                return f"no import anchor {rel}"
    text = re.sub(
        r"warehouse_id: int = Query\(\.\.\., ge=1\)",
        "warehouse_id: OperableWarehouseId",
        text,
    )
    text = re.sub(
        r"warehouse_id: int = Query\(\.\.\.\)",
        "warehouse_id: OperableWarehouseId",
        text,
    )
    if text == orig:
        return f"no change {rel}"
    p.write_text(text, encoding="utf-8")
    return f"updated {rel}"


if __name__ == "__main__":
    for f in FILES:
        print(patch_file(f))
