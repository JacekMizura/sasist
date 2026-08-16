"""Receipt-FIFO material cost layers for production consume.

Physical stock selection (FIFO/FEFO/LIFO) stays in inventory consume.
This module only prices the already-chosen physical slices using remaining
RECEIPT ledger layers (same warehouse + product), then product card fallback.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any, Optional

from sqlalchemy.orm import Session

from ...models.inventory import Inventory
from ...models.product import Product
from ...models.stock_document import StockDocument, StockDocumentItem
from ...models.stock_operation import (
    STOCK_OP_ADJUSTMENT,
    STOCK_OP_ISSUE,
    STOCK_OP_RECEIPT,
    StockOperation,
)
from ..inventory_lot_keys import normalize_batch_number
from ..order_item_pick_allocation_service import PickLotSlice

COST_SOURCE_RECEIPT = "RECEIPT"
COST_SOURCE_PRODUCT_FALLBACK = "PRODUCT_FALLBACK"


@dataclass
class _Layer:
    remaining: float
    unit_cost_net: float
    source_document_id: int | None
    source_document_line_id: int | None
    batch: str


@dataclass(frozen=True)
class CostedQty:
    quantity: float
    unit_cost_net: float
    cost_source: str
    source_document_id: int | None = None
    source_document_line_id: int | None = None


def _product_fallback_unit(db: Session, *, tenant_id: int, product_id: int) -> float:
    p = (
        db.query(Product)
        .filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id), Product.deleted_at.is_(None))
        .first()
    )
    if p is None:
        return 0.0
    raw = getattr(p, "purchase_price", None)
    try:
        v = float(raw) if raw is not None else 0.0
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, v)


def _line_unit_cost(db: Session, line_id: int) -> Optional[float]:
    line = db.query(StockDocumentItem).filter(StockDocumentItem.id == int(line_id)).first()
    if line is None:
        return None
    raw = getattr(line, "purchase_price_net", None)
    if raw is None:
        return None
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return None
    return v if v >= 0 else None


class ReceiptFifoCostLedger:
    """In-memory remaining RECEIPT layers for one product in a warehouse."""

    def __init__(self, db: Session, *, tenant_id: int, warehouse_id: int, product_id: int):
        self.db = db
        self.tenant_id = int(tenant_id)
        self.warehouse_id = int(warehouse_id)
        self.product_id = int(product_id)
        self._fallback = _product_fallback_unit(db, tenant_id=tenant_id, product_id=product_id)
        self._layers = self._build_layers()

    def _build_layers(self) -> list[_Layer]:
        rows = (
            self.db.query(StockOperation, StockDocument)
            .join(StockDocument, StockDocument.id == StockOperation.document_id)
            .filter(
                StockDocument.tenant_id == self.tenant_id,
                StockDocument.warehouse_id == self.warehouse_id,
                StockOperation.product_id == self.product_id,
                StockOperation.type.in_((STOCK_OP_RECEIPT, STOCK_OP_ISSUE, STOCK_OP_ADJUSTMENT)),
            )
            .order_by(StockOperation.id.asc())
            .all()
        )
        layers: list[_Layer] = []

        def peel(qty: float, *, prefer_batch: str | None = None) -> None:
            need = float(qty)
            if need <= 1e-12:
                return
            # Prefer matching batch when known, then any remaining.
            passes = [prefer_batch] if prefer_batch else [None]
            if prefer_batch is not None:
                passes.append(None)
            for batch_filter in passes:
                if need <= 1e-12:
                    break
                for layer in layers:
                    if need <= 1e-12:
                        break
                    if layer.remaining <= 1e-12:
                        continue
                    if batch_filter is not None and layer.batch != batch_filter:
                        continue
                    take = min(layer.remaining, need)
                    layer.remaining = round(layer.remaining - take, 6)
                    need = round(need - take, 6)

        for op, doc in rows:
            qty = float(op.qty or 0)
            if qty <= 1e-12:
                continue
            bn = normalize_batch_number(getattr(op, "batch", None))
            op_type = str(op.type or "").upper()
            if op_type == STOCK_OP_RECEIPT:
                unit = getattr(op, "unit_price_net", None)
                if unit is None:
                    unit = _line_unit_cost(self.db, int(op.document_line_id))
                if unit is None:
                    continue
                layers.append(
                    _Layer(
                        remaining=float(qty),
                        unit_cost_net=float(unit),
                        source_document_id=int(doc.id) if doc is not None else int(op.document_id),
                        source_document_line_id=int(op.document_line_id) if op.document_line_id else None,
                        batch=bn,
                    )
                )
            elif op_type == STOCK_OP_ISSUE:
                peel(qty, prefer_batch=bn or None)
            elif op_type == STOCK_OP_ADJUSTMENT:
                # Positive adjustment = new stock without receipt price → skip layer (fallback later).
                # Negative adjustment peels FIFO like an issue.
                if qty < -1e-12:
                    peel(abs(qty), prefer_batch=bn or None)
        return [ln for ln in layers if ln.remaining > 1e-12]

    def allocate(
        self,
        quantity: float,
        *,
        batch_number: str | None = None,
        inventory_id: int | None = None,
    ) -> list[CostedQty]:
        qty = float(quantity or 0)
        if qty <= 1e-12:
            return []

        # Explicit inventory → receipt line provenance (damage / future putaway writers).
        if inventory_id is not None:
            inv = self.db.query(Inventory).filter(Inventory.id == int(inventory_id)).first()
            line_id = int(getattr(inv, "source_document_line_id", None) or 0) if inv is not None else 0
            if line_id > 0:
                unit = _line_unit_cost(self.db, line_id)
                if unit is not None:
                    line = self.db.query(StockDocumentItem).filter(StockDocumentItem.id == line_id).first()
                    doc_id = int(line.document_id) if line is not None else None
                    # Also peel matching ledger layer if present (keep remaining consistent).
                    self._peel_from_layers(qty, prefer_batch=normalize_batch_number(batch_number), prefer_line_id=line_id)
                    return [
                        CostedQty(
                            quantity=qty,
                            unit_cost_net=float(unit),
                            cost_source=COST_SOURCE_RECEIPT,
                            source_document_id=doc_id,
                            source_document_line_id=line_id,
                        )
                    ]

        out: list[CostedQty] = []
        need = qty
        prefer_batch = normalize_batch_number(batch_number) or None
        for batch_filter in ([prefer_batch, None] if prefer_batch else [None]):
            if need <= 1e-12:
                break
            for layer in self._layers:
                if need <= 1e-12:
                    break
                if layer.remaining <= 1e-12:
                    continue
                if batch_filter is not None and layer.batch != batch_filter:
                    continue
                take = min(layer.remaining, need)
                layer.remaining = round(layer.remaining - take, 6)
                need = round(need - take, 6)
                out.append(
                    CostedQty(
                        quantity=float(take),
                        unit_cost_net=float(layer.unit_cost_net),
                        cost_source=COST_SOURCE_RECEIPT,
                        source_document_id=layer.source_document_id,
                        source_document_line_id=layer.source_document_line_id,
                    )
                )
        if need > 1e-12:
            out.append(
                CostedQty(
                    quantity=float(need),
                    unit_cost_net=float(self._fallback),
                    cost_source=COST_SOURCE_PRODUCT_FALLBACK,
                )
            )
        return out

    def _peel_from_layers(
        self,
        qty: float,
        *,
        prefer_batch: str | None,
        prefer_line_id: int | None,
    ) -> None:
        need = float(qty)
        if prefer_line_id:
            for layer in self._layers:
                if need <= 1e-12:
                    break
                if layer.source_document_line_id == prefer_line_id and layer.remaining > 1e-12:
                    take = min(layer.remaining, need)
                    layer.remaining = round(layer.remaining - take, 6)
                    need = round(need - take, 6)
        for batch_filter in ([prefer_batch, None] if prefer_batch else [None]):
            if need <= 1e-12:
                break
            for layer in self._layers:
                if need <= 1e-12:
                    break
                if layer.remaining <= 1e-12:
                    continue
                if batch_filter is not None and layer.batch != batch_filter:
                    continue
                take = min(layer.remaining, need)
                layer.remaining = round(layer.remaining - take, 6)
                need = round(need - take, 6)


_LEDGER_CACHE_KEY = "_sasist_receipt_fifo_cost_ledgers"


def _ledger_for(db: Session, *, tenant_id: int, warehouse_id: int, product_id: int) -> ReceiptFifoCostLedger:
    """Request/transaction-scoped ledger cache so multi-slice consume peels consistently."""
    cache: dict[tuple[int, int, int], ReceiptFifoCostLedger] | None = getattr(db, _LEDGER_CACHE_KEY, None)
    if cache is None:
        cache = {}
        setattr(db, _LEDGER_CACHE_KEY, cache)
    key = (int(tenant_id), int(warehouse_id), int(product_id))
    led = cache.get(key)
    if led is None:
        led = ReceiptFifoCostLedger(db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=product_id)
        cache[key] = led
    return led


def expand_pick_slices_with_cost(
    db: Session,
    slices: list[PickLotSlice],
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
) -> list[PickLotSlice]:
    """Split physical consume slices into costed slices (receipt FIFO → product fallback)."""
    if not slices:
        return []
    ledger = _ledger_for(db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=product_id)
    out: list[PickLotSlice] = []
    for sl in slices:
        allocations = ledger.allocate(
            float(sl.quantity),
            batch_number=sl.batch_number,
            inventory_id=sl.inventory_id,
        )
        for alloc in allocations:
            out.append(
                replace(
                    sl,
                    quantity=float(alloc.quantity),
                    unit_cost_net=float(alloc.unit_cost_net),
                    cost_source=str(alloc.cost_source),
                    source_document_id=alloc.source_document_id,
                    source_document_line_id=alloc.source_document_line_id,
                )
            )
    return out


def cost_breakdown_from_slices(slices: list[PickLotSlice] | list[dict[str, Any]]) -> dict[str, Any]:
    """Build auditable frozen cost payload from costed pick / committed slices."""
    items: list[dict[str, Any]] = []
    total = 0.0
    fallback_qty = 0.0
    for sl in slices:
        if isinstance(sl, dict):
            qty = float(sl.get("quantity") or 0)
            unit = float(sl.get("unit_cost_net") or 0)
            source = str(sl.get("cost_source") or COST_SOURCE_PRODUCT_FALLBACK)
            row = {
                "product_id": int(sl.get("product_id") or 0) or None,
                "quantity": qty,
                "unit_cost_net": unit,
                "line_cost_net": round(qty * unit, 4),
                "cost_source": source,
                "batch_number": str(sl.get("batch_number") or "") or None,
                "location_id": int(sl["location_id"]) if sl.get("location_id") else None,
                "source_document_id": int(sl["source_document_id"]) if sl.get("source_document_id") else None,
                "source_document_line_id": (
                    int(sl["source_document_line_id"]) if sl.get("source_document_line_id") else None
                ),
            }
        else:
            qty = float(sl.quantity or 0)
            unit = float(sl.unit_cost_net or 0)
            source = str(sl.cost_source or COST_SOURCE_PRODUCT_FALLBACK)
            row = {
                "quantity": qty,
                "unit_cost_net": unit,
                "line_cost_net": round(qty * unit, 4),
                "cost_source": source,
                "batch_number": str(sl.batch_number or "") or None,
                "source_document_id": sl.source_document_id,
                "source_document_line_id": sl.source_document_line_id,
            }
        if qty <= 1e-12:
            continue
        total += qty * unit
        if source == COST_SOURCE_PRODUCT_FALLBACK:
            fallback_qty += qty
        items.append(row)
    return {
        "version": 1,
        "actual_material_cost": round(total, 4),
        "has_product_fallback": fallback_qty > 1e-12,
        "fallback_quantity": round(fallback_qty, 4),
        "slices": items,
    }


def weighted_unit_cost(slices: list[PickLotSlice] | list[dict[str, Any]]) -> float:
    qty = 0.0
    cost = 0.0
    for sl in slices:
        if isinstance(sl, dict):
            q = float(sl.get("quantity") or 0)
            u = float(sl.get("unit_cost_net") or 0)
        else:
            q = float(sl.quantity or 0)
            u = float(sl.unit_cost_net or 0)
        if q <= 1e-12:
            continue
        qty += q
        cost += q * u
    if qty <= 1e-12:
        return 0.0
    return round(cost / qty, 6)


def ensure_rw_issue_slices_costed(
    db: Session,
    slices: list[Any],
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
) -> list[Any]:
    """Ensure each RW issue slice has frozen unit_cost_net (legacy committed picks)."""
    from ..order_item_pick_allocation_service import SENTINEL_EXPIRY
    from .rw_lot_lines import RwIssueSlice

    if not slices:
        return []
    if all(getattr(s, "unit_cost_net", None) is not None for s in slices):
        return list(slices)

    out: list[Any] = []
    for orig in slices:
        if getattr(orig, "unit_cost_net", None) is not None:
            out.append(orig)
            continue
        bn = str(getattr(orig, "batch_number", "") or "")
        exp = getattr(orig, "expiry_date", None) or SENTINEL_EXPIRY
        qty = float(getattr(orig, "quantity", 0) or 0)
        costed = expand_pick_slices_with_cost(
            db,
            [PickLotSlice(quantity=qty, batch_number=bn, expiry_date=exp)],
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            product_id=int(product_id),
        )
        if isinstance(orig, RwIssueSlice):
            for c in costed:
                out.append(
                    RwIssueSlice(
                        product_id=int(product_id),
                        quantity=float(c.quantity),
                        location_id=int(orig.location_id),
                        batch_number=str(c.batch_number or bn),
                        expiry_date=c.expiry_date or exp,
                        serial_number=orig.serial_number,
                        unit_cost_net=c.unit_cost_net,
                        cost_source=c.cost_source,
                        source_document_id=c.source_document_id,
                        source_document_line_id=c.source_document_line_id,
                    )
                )
        else:
            out.extend(costed)
    return out
