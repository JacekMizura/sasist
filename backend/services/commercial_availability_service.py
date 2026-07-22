"""
Commercial availability overlay — purchase PZ line sales blocks without inventory grain change.

``commercially_sellable_qty`` = ``saleable_available_qty`` − ``effective_sales_block``
where ``effective_sales_block`` uses LIFO virtual consumption of ISSUE operations per PZ line.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Dict, Iterable, List, Sequence, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.location import Location
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.stock_operation import STOCK_OP_ISSUE, StockOperation
from .product_disposition_snapshot_service import get_product_disposition_stock
from .purchase_sales_block_constants import COMMERCIAL_STOCK_UNAVAILABLE_MSG, PURCHASE_PZ_DOCUMENT_TYPE
from .stock_disposition import DEFAULT_STOCK_DISPOSITION, STOCK_DISPOSITION_SALEABLE, normalize_stock_disposition

_EPS = 1e-9


@dataclass(frozen=True)
class LineCommercialState:
    line_id: int
    received_quantity: float
    sales_blocked_qty: float
    line_remaining_qty: float
    effective_sales_block: float


def empty_commercial_snapshot() -> dict[str, float]:
    return {
        "commercially_sellable_qty": 0.0,
        "sales_blocked_qty": 0.0,
    }


def is_purchase_pz_line(doc: StockDocument, line: StockDocumentItem) -> bool:
    if str(getattr(doc, "document_type", "") or "").strip().upper() != PURCHASE_PZ_DOCUMENT_TYPE:
        return False
    if getattr(line, "product_id", None) is None:
        return False
    if getattr(line, "wm_kind", None):
        return False
    return True


def _total_saleable_issued_by_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_ids: Sequence[int],
) -> Dict[int, float]:
    if not product_ids:
        return {}
    rows = (
        db.query(
            StockOperation.product_id,
            func.coalesce(func.sum(StockOperation.qty), 0.0),
        )
        .join(Location, Location.id == StockOperation.location_id)
        .filter(
            StockOperation.product_id.in_(tuple(int(x) for x in product_ids)),
            StockOperation.type == STOCK_OP_ISSUE,
            StockOperation.stock_disposition == STOCK_DISPOSITION_SALEABLE,
            Location.warehouse_id == int(warehouse_id),
        )
        .group_by(StockOperation.product_id)
        .all()
    )
    return {int(pid): float(qty or 0) for pid, qty in rows}


def _purchase_lines_for_products(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_ids: Sequence[int],
) -> Dict[int, List[Tuple[StockDocumentItem, StockDocument]]]:
    if not product_ids:
        return {}
    try:
        rows = (
            db.query(StockDocumentItem, StockDocument)
            .join(StockDocument, StockDocument.id == StockDocumentItem.document_id)
            .filter(
                StockDocument.tenant_id == int(tenant_id),
                StockDocument.warehouse_id == int(warehouse_id),
                func.upper(StockDocument.document_type) == PURCHASE_PZ_DOCUMENT_TYPE,
                StockDocumentItem.product_id.in_(tuple(int(x) for x in product_ids)),
                StockDocumentItem.received_quantity > _EPS,
            )
            .order_by(StockDocument.created_at.desc(), StockDocumentItem.id.desc())
            .all()
        )
    except Exception as exc:
        # ORM added requires_putaway; stale DB without startup migration → explode add-product.
        msg = str(exc).lower()
        if "requires_putaway" in msg or "default_requires_putaway" in msg:
            from ..db.schema_upgrade import ensure_stock_document_item_requires_putaway_column

            ensure_stock_document_item_requires_putaway_column(db.get_bind())
            db.rollback()
            rows = (
                db.query(StockDocumentItem, StockDocument)
                .join(StockDocument, StockDocument.id == StockDocumentItem.document_id)
                .filter(
                    StockDocument.tenant_id == int(tenant_id),
                    StockDocument.warehouse_id == int(warehouse_id),
                    func.upper(StockDocument.document_type) == PURCHASE_PZ_DOCUMENT_TYPE,
                    StockDocumentItem.product_id.in_(tuple(int(x) for x in product_ids)),
                    StockDocumentItem.received_quantity > _EPS,
                )
                .order_by(StockDocument.created_at.desc(), StockDocumentItem.id.desc())
                .all()
            )
        else:
            raise
    out: Dict[int, List[Tuple[StockDocumentItem, StockDocument]]] = defaultdict(list)
    for line, doc in rows:
        if not is_purchase_pz_line(doc, line):
            continue
        sd = normalize_stock_disposition(getattr(line, "stock_disposition", None))
        if sd != STOCK_DISPOSITION_SALEABLE:
            continue
        out[int(line.product_id)].append((line, doc))
    return out


def _line_remaining_map_lifo(
    lines: Iterable[Tuple[StockDocumentItem, StockDocument]],
    total_issued: float,
) -> Dict[int, float]:
    """Allocate ``total_issued`` to lines newest-first (LIFO); return remaining qty per line id."""
    remaining: Dict[int, float] = {}
    for line, _doc in lines:
        remaining[int(line.id)] = max(0.0, float(line.received_quantity or 0))

    outbound = max(0.0, float(total_issued or 0))
    for line, _doc in lines:
        lid = int(line.id)
        cur = remaining.get(lid, 0.0)
        if outbound <= _EPS:
            break
        take = min(cur, outbound)
        remaining[lid] = cur - take
        outbound -= take
    return remaining


def line_commercial_states_for_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    lines: List[Tuple[StockDocumentItem, StockDocument]] | None = None,
    total_issued: float | None = None,
) -> list[LineCommercialState]:
    pid = int(product_id)
    line_rows = lines if lines is not None else _purchase_lines_for_products(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_ids=[pid]
    ).get(pid, [])
    if total_issued is None:
        issued_map = _total_saleable_issued_by_product(
            db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_ids=[pid]
        )
        total_issued = float(issued_map.get(pid, 0.0))

    remaining_by_line = _line_remaining_map_lifo(line_rows, float(total_issued or 0))
    states: list[LineCommercialState] = []
    for line, _doc in line_rows:
        lid = int(line.id)
        blocked = max(0.0, float(getattr(line, "sales_blocked_qty", 0) or 0))
        line_rem = float(remaining_by_line.get(lid, 0.0))
        effective = min(blocked, line_rem)
        states.append(
            LineCommercialState(
                line_id=lid,
                received_quantity=float(line.received_quantity or 0),
                sales_blocked_qty=blocked,
                line_remaining_qty=line_rem,
                effective_sales_block=effective,
            )
        )
    return states


def effective_sales_block_for_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
) -> float:
    states = line_commercial_states_for_product(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=int(product_id)
    )
    return sum(s.effective_sales_block for s in states)


def commercially_sellable_qty(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
) -> float:
    snap = get_product_disposition_stock(
        db,
        product_id=int(product_id),
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
    )
    saleable_available = float(snap.get("saleable_available_qty") or 0.0)
    block = effective_sales_block_for_product(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id), product_id=int(product_id)
    )
    return max(0.0, saleable_available - block)


def commercial_snapshots_for_products(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_ids: Sequence[int],
) -> Dict[int, dict[str, float]]:
    pids = [int(x) for x in product_ids if int(x) > 0]
    if not pids:
        return {}

    disp_map: Dict[int, dict] = {}
    for pid in pids:
        disp_map[pid] = get_product_disposition_stock(
            db, product_id=pid, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
        )

    issued_map = _total_saleable_issued_by_product(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id), product_ids=pids
    )
    lines_map = _purchase_lines_for_products(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id), product_ids=pids
    )

    out: Dict[int, dict[str, float]] = {}
    for pid in pids:
        states = line_commercial_states_for_product(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            product_id=pid,
            lines=lines_map.get(pid, []),
            total_issued=float(issued_map.get(pid, 0.0)),
        )
        block = sum(s.effective_sales_block for s in states)
        saleable_available = float(disp_map.get(pid, {}).get("saleable_available_qty") or 0.0)
        out[pid] = {
            "commercially_sellable_qty": max(0.0, saleable_available - block),
            "sales_blocked_qty": block,
        }
    return out


def get_commercial_availability_snapshot(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
) -> dict[str, float]:
    m = commercial_snapshots_for_products(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id), product_ids=[int(product_id)]
    )
    return m.get(int(product_id), empty_commercial_snapshot())


def assert_commercially_sellable_qty(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    quantity: float,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
) -> None:
    sd = normalize_stock_disposition(stock_disposition)
    if sd != STOCK_DISPOSITION_SALEABLE:
        return
    need = float(quantity or 0)
    if need <= _EPS:
        return
    avail = commercially_sellable_qty(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id), product_id=int(product_id)
    )
    if avail + _EPS < need:
        raise ValueError(COMMERCIAL_STOCK_UNAVAILABLE_MSG)


__all__ = [
    "COMMERCIAL_STOCK_UNAVAILABLE_MSG",
    "LineCommercialState",
    "assert_commercially_sellable_qty",
    "commercial_snapshots_for_products",
    "commercially_sellable_qty",
    "effective_sales_block_for_product",
    "empty_commercial_snapshot",
    "get_commercial_availability_snapshot",
    "is_purchase_pz_line",
    "line_commercial_states_for_product",
]
