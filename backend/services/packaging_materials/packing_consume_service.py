"""Packing finish → RW document consuming carton + optional packaging materials."""

from __future__ import annotations

import logging
from datetime import date
from typing import Optional, Sequence

from sqlalchemy.orm import Session

from ...models.carton import Carton
from ...models.order import Order
from ...models.packaging_material import PackagingMaterial
from ...models.stock_document import StockDocument, StockDocumentItem
from ...services.document_number_service import require_warehouse_series
from ...services.stock_document_factory import create_stock_document
from ...services.stock_operation_issue_service import append_issue_operation
from .inventory_apply import apply_packaging_inventory_issue
from .inventory_qty import packaging_inventory_quantity
from .stockable_bridge import (
    ensure_carton_stockable_product,
    ensure_packaging_stockable_product,
)

_logger = logging.getLogger(__name__)
_EPS = 1e-9


class PackagingConsumeLine:
    __slots__ = ("wm_kind", "wm_id", "qty", "location_id")

    def __init__(
        self,
        *,
        wm_kind: str,
        wm_id: str,
        qty: float = 1.0,
        location_id: Optional[int] = None,
    ) -> None:
        self.wm_kind = wm_kind
        self.wm_id = wm_id
        self.qty = float(qty)
        self.location_id = location_id


def _load_wm_row(db: Session, tenant_id: int, wm_kind: str, wm_id: str):
    k = (wm_kind or "").strip().lower()
    if k == "carton":
        return db.query(Carton).filter(Carton.id == wm_id, Carton.tenant_id == int(tenant_id)).first()
    if k == "packaging":
        return (
            db.query(PackagingMaterial)
            .filter(PackagingMaterial.id == wm_id, PackagingMaterial.tenant_id == int(tenant_id))
            .first()
        )
    return None


def build_default_packing_consume_lines(order: Order) -> list[PackagingConsumeLine]:
    """Carton from order.selected_carton_id; extra materials from order metadata when present."""
    lines: list[PackagingConsumeLine] = []
    cid = getattr(order, "selected_carton_id", None)
    if cid:
        lines.append(PackagingConsumeLine(wm_kind="carton", wm_id=str(cid).strip(), qty=1.0))
    raw = getattr(order, "packing_consumables_json", None)
    if raw:
        import json

        try:
            data = json.loads(raw) if isinstance(raw, str) else raw
        except Exception:
            data = None
        if isinstance(data, list):
            for item in data:
                if not isinstance(item, dict):
                    continue
                kind = str(item.get("wm_kind") or item.get("kind") or "").strip().lower()
                wid = str(item.get("wm_id") or item.get("id") or "").strip()
                qty = float(item.get("qty") or 1)
                if kind in ("carton", "packaging") and wid and qty > _EPS:
                    # Avoid double carton if already from selected_carton_id
                    if kind == "carton" and cid and wid == str(cid).strip():
                        continue
                    loc = item.get("location_id")
                    lines.append(
                        PackagingConsumeLine(
                            wm_kind=kind,
                            wm_id=wid,
                            qty=qty,
                            location_id=int(loc) if loc is not None else None,
                        )
                    )
    return lines


def create_packing_packaging_rw(
    db: Session,
    *,
    order: Order,
    tenant_id: int,
    warehouse_id: int,
    operator_user_id: Optional[int] = None,
    lines: Optional[Sequence[PackagingConsumeLine]] = None,
    allow_negative: bool = False,
) -> Optional[StockDocument]:
    """
    Create and post RW for packaging consumed at packing finish.
    Idempotent: if order.packing_packaging_rw_document_id is set, return existing doc.

    ``allow_negative``: packing finish przekazuje True — brak stanu opakowań nie blokuje
    spakowania (ostrzeżenie w logu); kontrola stanu pozostaje ostrzegawcza.
    """
    existing_id = getattr(order, "packing_packaging_rw_document_id", None)
    if existing_id is not None:
        doc = db.query(StockDocument).filter(StockDocument.id == int(existing_id)).first()
        if doc is not None:
            return doc

    consume = list(lines) if lines is not None else build_default_packing_consume_lines(order)
    consume = [c for c in consume if c.qty > _EPS]
    if not consume:
        return None

    series = require_warehouse_series(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        subtype="RW",
    )
    doc = create_stock_document(
        db,
        context="packing_packaging_rw",
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        document_type="RW",
        # document_series.id is UUID string (String(36)), not an integer PK
        document_series_id=str(series.id) if series is not None else None,
        status="DONE",
        created_by_user_id=operator_user_id,
        order_id=int(order.id),
    )
    # Number assignment — best effort via series helper used elsewhere
    try:
        from ...services.document_number_service import assign_series_number_to_stock_document

        assign_series_number_to_stock_document(db, doc, series)
    except Exception:
        _logger.exception("packing RW number assign failed order_id=%s", order.id)

    for line in consume:
        row = _load_wm_row(db, tenant_id, line.wm_kind, line.wm_id)
        if row is None:
            raise ValueError(f"Nie znaleziono materiału: {line.wm_kind}:{line.wm_id}")
        if line.wm_kind == "carton":
            product = ensure_carton_stockable_product(db, row)
        else:
            product = ensure_packaging_stockable_product(db, row)

        sdi = StockDocumentItem(
            document_id=int(doc.id),
            product_id=int(product.id),
            wm_kind=line.wm_kind,
            wm_id=line.wm_id,
            ordered_quantity=float(line.qty),
            received_quantity=float(line.qty),
            quantity=float(line.qty),
            batch_number="",
            expiry_date=date(9999, 12, 31),
        )
        db.add(sdi)
        db.flush()

        avail = packaging_inventory_quantity(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            product_id=int(product.id),
            location_id=line.location_id,
        )
        if avail + _EPS < float(line.qty):
            _logger.warning(
                "PACKING_PACKAGING_RW_STOCK_SHORTAGE order_id=%s wm_kind=%s wm_id=%s product_id=%s "
                "need=%s avail=%s allow_negative=%s",
                order.id,
                line.wm_kind,
                line.wm_id,
                product.id,
                float(line.qty),
                avail,
                bool(allow_negative),
            )

        from_loc = apply_packaging_inventory_issue(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            product_id=int(product.id),
            qty=float(line.qty),
            location_id=line.location_id,
            allow_negative=allow_negative,
        )
        append_issue_operation(
            db,
            doc,
            sdi,
            float(line.qty),
            from_location_id=int(from_loc),
            operator_admin_id=operator_user_id,
            metadata={
                "order_id": int(order.id),
                "source": "packing_finish",
                "wm_kind": line.wm_kind,
                "wm_id": line.wm_id,
            },
        )

    order.packing_packaging_rw_document_id = int(doc.id)
    _logger.info(
        "PACKING_PACKAGING_RW order_id=%s document_id=%s lines=%s",
        order.id,
        doc.id,
        len(consume),
    )
    return doc
