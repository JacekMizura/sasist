"""Document-driven movement history for packaging catalog (Carton / PackagingMaterial).

SSOT: ``stock_operations`` + ``stock_documents`` for products with
``stock_item_kind`` in {CARTON, PACKAGING_MATERIAL}. No BDO ledger.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.carton import Carton
from ...models.packaging_material import PackagingMaterial
from ...models.product import Product
from ...models.stock_document import StockDocument
from ...models.stock_operation import StockOperation
from .constants import STOCK_ITEM_KIND_CARTON, STOCK_ITEM_KINDS_PACKAGING

_DOC_TYPE_BY_OP: dict[str, str] = {
    "RECEIPT": "PZ",
    "ISSUE": "RW",
    "MOVE": "MM",
    "MOVE_OUT": "MM",
    "MOVE_IN": "MM",
    "PUTAWAY": "PZ",
    "ADJUSTMENT": "KOREKTA",
}


@dataclass(frozen=True)
class PackagingMovementRow:
    id: str
    occurred_at: datetime
    movement_type: str
    document_type: str
    document_number: str | None
    document_id: int | None
    wm_kind: str
    wm_id: str | None
    material_name: str
    sku: str | None
    qty: float
    warehouse_id: int | None
    reference: str | None
    notes: str | None


def _op_to_movement_type(op_type: str, document_type: str | None) -> str:
    t = (op_type or "").strip().upper()
    dt = (document_type or "").strip().upper()
    if t in ("RECEIPT", "PUTAWAY"):
        return "PZ"
    if t == "ISSUE":
        return "RW"
    if t in ("MOVE", "MOVE_OUT", "MOVE_IN"):
        return "MM"
    if t == "ADJUSTMENT":
        return "KOREKTA"
    if dt in ("PZ", "RW", "MM", "WZ"):
        return dt
    return t or "OTHER"


def list_packaging_stock_movements(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None = None,
    movement_type: str | None = None,
    limit: int = 200,
) -> list[PackagingMovementRow]:
    """Recent stock ops for packaging stockables (Inventory SSOT)."""
    lim = max(1, min(int(limit or 200), 500))
    mt_filter = (movement_type or "").strip().upper() or None

    q = (
        db.query(StockOperation, StockDocument, Product)
        .join(StockDocument, StockDocument.id == StockOperation.document_id)
        .join(Product, Product.id == StockOperation.product_id)
        .filter(
            StockDocument.tenant_id == int(tenant_id),
            Product.stock_item_kind.in_(tuple(STOCK_ITEM_KINDS_PACKAGING)),
        )
        .order_by(StockOperation.id.desc())
    )
    if warehouse_id is not None:
        q = q.filter(StockDocument.warehouse_id == int(warehouse_id))

    # Prefetch catalog names by product_id
    carton_by_pid: dict[int, Carton] = {
        int(c.product_id): c
        for c in db.query(Carton)
        .filter(Carton.tenant_id == int(tenant_id), Carton.product_id.isnot(None))
        .all()
        if c.product_id is not None
    }
    pack_by_pid: dict[int, PackagingMaterial] = {
        int(m.product_id): m
        for m in db.query(PackagingMaterial)
        .filter(PackagingMaterial.tenant_id == int(tenant_id), PackagingMaterial.product_id.isnot(None))
        .all()
        if m.product_id is not None
    }

    out: list[PackagingMovementRow] = []
    # Over-fetch slightly when filtering by movement type in Python (op→label mapping).
    fetch_n = lim * 3 if mt_filter else lim
    for op, doc, product in q.limit(fetch_n).all():
        kind = str(getattr(product, "stock_item_kind", "") or "")
        wm_kind = "carton" if kind == STOCK_ITEM_KIND_CARTON else "packaging"
        pid = int(product.id)
        name = str(product.name or "").strip()
        sku = getattr(product, "sku", None)
        wm_id: str | None = None
        if wm_kind == "carton" and pid in carton_by_pid:
            c = carton_by_pid[pid]
            wm_id = str(c.id)
            name = str(c.name or name)
            sku = c.sku or sku
        elif wm_kind == "packaging" and pid in pack_by_pid:
            m = pack_by_pid[pid]
            wm_id = str(m.id)
            name = str(m.name or name)
            sku = m.sku or sku

        doc_type = str(getattr(doc, "document_type", None) or "")
        label = _op_to_movement_type(str(op.type or ""), doc_type)
        if mt_filter and label != mt_filter and str(op.type or "").upper() != mt_filter:
            continue

        occurred = getattr(doc, "updated_at", None) or getattr(doc, "created_at", None) or datetime.utcnow()
        doc_no = getattr(doc, "document_number", None)
        out.append(
            PackagingMovementRow(
                id=f"so-{int(op.id)}",
                occurred_at=occurred if isinstance(occurred, datetime) else datetime.utcnow(),
                movement_type=label,
                document_type=doc_type or _DOC_TYPE_BY_OP.get(str(op.type or "").upper(), label),
                document_number=str(doc_no).strip() if doc_no else None,
                document_id=int(doc.id) if doc is not None else None,
                wm_kind=wm_kind,
                wm_id=wm_id,
                material_name=name or f"#{pid}",
                sku=str(sku).strip() if sku else None,
                qty=float(op.qty or 0),
                warehouse_id=int(doc.warehouse_id) if getattr(doc, "warehouse_id", None) is not None else None,
                reference=str(doc_no).strip() if doc_no else f"DOC-{doc.id}",
                notes=None,
            )
        )
        if len(out) >= lim:
            break
    return out


def movement_row_to_bdo_dict(row: PackagingMovementRow) -> dict[str, Any]:
    """Map catalog movement → BdoMovementRead-compatible dict (report projection)."""
    wm_ref = None
    if row.wm_id:
        wm_ref = f"{row.wm_kind}:{row.wm_id}"
    return {
        "id": row.id,
        "occurred_at": row.occurred_at,
        "movement_type": row.movement_type,
        "wm_ref": wm_ref,
        "material_name": row.material_name,
        "qty": row.qty,
        "amount_pln": None,
        "reference": row.reference,
        "notes": row.notes,
    }
