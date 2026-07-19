"""
Bulk shortage orchestration for MULTI baskets — same SSOT as single report.

Atomic all-or-nothing: pre-validate live remaining for every line, then apply
``report_wms_picking_product_shortage`` per ``order_item_id`` in one DB transaction
(caller commits). Never product-level FIFO budget.
"""

from __future__ import annotations

import logging
from typing import Any, Optional, Sequence

from sqlalchemy.orm import Session, joinedload

from ...models.cart import Cart
from ...models.order_item import OrderItem
from ..wms_basket_put.resolve import cart_is_baskets_mode
from ..wms_picking_product_list_service import (
    _line_shortage_report_quantities,
    report_wms_picking_product_shortage,
)

logger = logging.getLogger(__name__)


class BulkShortageError(ValueError):
    """Domain error for bulk shortage — includes failing allocation when known."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "BULK_SHORTAGE_REJECTED",
        order_item_id: int | None = None,
        live_unresolved: float | None = None,
        requested_qty: float | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.order_item_id = int(order_item_id) if order_item_id is not None else None
        self.live_unresolved = live_unresolved
        self.requested_qty = requested_qty

    def as_detail(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "code": self.code,
            "error": self.code,
            "message": str(self),
        }
        if self.order_item_id is not None:
            d["order_item_id"] = self.order_item_id
        if self.live_unresolved is not None:
            d["live_unresolved"] = float(self.live_unresolved)
        if self.requested_qty is not None:
            d["requested_qty"] = float(self.requested_qty)
        return d


def report_wms_picking_bulk_product_shortage(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
    order_type: str,
    product_id: int,
    cart_id: int,
    items: Sequence[dict[str, Any]],
    location_id: Optional[int] = None,
    ui_order_ids: Optional[Sequence[int]] = None,
    recovery_order_id: int | None = None,
    operator_user_id: int | None = None,
) -> dict[str, Any]:
    """
    Apply shortage for many order_items of one product in one transaction.

    Each item: ``{order_item_id: int, missing_qty: float}``.
    """
    pid = int(product_id)
    cid = int(cart_id)
    if not items:
        raise BulkShortageError("Brak pozycji do zgłoszenia braku.", code="BULK_EMPTY")

    normalized: list[tuple[int, float]] = []
    seen: set[int] = set()
    for raw in items:
        oiid = int(raw.get("order_item_id") or 0)
        qty = float(raw.get("missing_qty") or 0)
        if oiid <= 0:
            raise BulkShortageError("Każda pozycja wymaga order_item_id.", code="BULK_INVALID_ITEM")
        if qty <= 1e-9:
            raise BulkShortageError(
                f"Ilość braku musi być > 0 (order_item_id={oiid}).",
                code="BULK_INVALID_QTY",
                order_item_id=oiid,
                requested_qty=qty,
            )
        if oiid in seen:
            raise BulkShortageError(
                f"Duplikat order_item_id={oiid} w żądaniu zbiorczym.",
                code="BULK_DUPLICATE_ITEM",
                order_item_id=oiid,
            )
        seen.add(oiid)
        normalized.append((oiid, round(qty, 6)))

    cart_row = (
        db.query(Cart)
        .filter(
            Cart.id == cid,
            Cart.tenant_id == int(tenant_id),
            Cart.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if cart_row is None:
        raise BulkShortageError("Nie znaleziono wózka sesji (cart_id).", code="CART_NOT_FOUND")

    baskets_mode = False
    try:
        baskets_mode = cart_is_baskets_mode(cart_row)
    except Exception:
        baskets_mode = False
    if not baskets_mode:
        raise BulkShortageError(
            "Zbiorcze rozliczenie braków jest dostępne tylko dla wózków z koszykami.",
            code="BULK_NOT_BASKETS_CART",
        )

    oi_ids = [oiid for oiid, _ in normalized]
    locked = (
        db.query(OrderItem)
        .options(joinedload(OrderItem.product))
        .filter(OrderItem.id.in_(oi_ids))
        .with_for_update()
        .all()
    )
    by_id = {int(r.id): r for r in locked}
    if len(by_id) != len(oi_ids):
        missing = [i for i in oi_ids if i not in by_id]
        raise BulkShortageError(
            f"Nie znaleziono linii zamówienia: {missing[0]}.",
            code="ORDER_ITEM_NOT_FOUND",
            order_item_id=int(missing[0]),
        )

    # Pass 1: live revalidate — fail before any shortage write.
    # remaining=0 → idempotent skip (already settled); remaining>0 but < requested → STALE.
    skip_already: set[int] = set()
    for oiid, req_qty in normalized:
        oi = by_id[oiid]
        if int(oi.product_id) != pid:
            raise BulkShortageError(
                f"product_id nie odpowiada linii order_item_id={oiid}.",
                code="PRODUCT_MISMATCH",
                order_item_id=oiid,
                requested_qty=req_qty,
            )
        q = _line_shortage_report_quantities(db, oi, cid)
        live_unresolved = float(q["remaining_qty"])
        if live_unresolved <= 1e-9:
            skip_already.add(oiid)
            continue
        if req_qty > live_unresolved + 1e-6:
            raise BulkShortageError(
                f"Nie można zgłosić {req_qty:g} szt. braku dla koszyka/linii "
                f"(order_item_id={oiid}) — live nierozliczone: {live_unresolved:g} szt.",
                code="SHORTAGE_STALE",
                order_item_id=oiid,
                live_unresolved=live_unresolved,
                requested_qty=req_qty,
            )

    # Pass 2: apply via single-line SSOT (same domain rules / ledger).
    line_results: list[dict[str, Any]] = []
    order_ids: list[int] = []
    total_shortage = 0.0
    any_applied = False
    all_already = True

    for oiid, req_qty in normalized:
        if oiid in skip_already:
            all_already = all_already and True
            line_results.append(
                {
                    "order_item_id": int(oiid),
                    "missing_qty": float(req_qty),
                    "already_resolved": True,
                    "ok": True,
                }
            )
            continue

        try:
            out = report_wms_picking_product_shortage(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                source_status_id=int(source_status_id),
                order_type=order_type,  # type: ignore[arg-type]
                product_id=pid,
                location_id=location_id,
                missing_qty=float(req_qty),
                cart_id=cid,
                ui_order_ids=ui_order_ids,
                recovery_order_id=recovery_order_id,
                order_item_id=int(oiid),
                operator_user_id=operator_user_id,
            )
        except ValueError as e:
            raise BulkShortageError(
                str(e),
                code="SHORTAGE_LINE_REJECTED",
                order_item_id=oiid,
                requested_qty=req_qty,
            ) from e

        already = bool(out.get("already_resolved"))
        if not already:
            any_applied = True
            all_already = False
            total_shortage += float(req_qty)
        else:
            all_already = all_already and True
        for oid in out.get("order_ids") or []:
            order_ids.append(int(oid))
        line_results.append(
            {
                "order_item_id": int(oiid),
                "missing_qty": float(req_qty),
                "already_resolved": already,
                "ok": bool(out.get("ok", True)),
            }
        )

    logger.info(
        "[shortage.bulk] OK product_id=%s cart_id=%s lines=%s total_shortage=%s already_all=%s",
        pid,
        cid,
        len(normalized),
        total_shortage,
        all_already,
    )

    allow = True
    if line_results:
        # Last single-report returns allow_continue; default True for MULTI.
        allow = True

    return {
        "ok": True,
        "already_resolved": bool(all_already and not any_applied),
        "orders_updated": len(list(dict.fromkeys(order_ids))),
        "order_ids": list(dict.fromkeys(order_ids)),
        "lines": line_results,
        "lines_count": len(line_results),
        "total_shortage_qty": round(total_shortage, 6),
        "target_status_id": None,
        "order_issue_task_ids": [],
        "allow_continue_other_lines_after_shortage": allow,
    }
