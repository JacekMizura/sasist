"""
Potwierdzenie pustej lokalizacji podczas zbierania.

A) Zgłoszenie faktu — zawsze dostępne.
B) Skutek magazynowy:
   - HYBRID: RK → stock produktu@lokalizacja = 0
   - DOCUMENTS_ONLY: bez direct update; CONTROL inventory + InventoryLocationLock
     (routing wyklucza lokalizację mimo formalnego stocku).
"""

from __future__ import annotations

import logging
from typing import Any, Sequence

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...models.inventory import Inventory
from ...models.location import Location
from ...models.product import Product
from ..inventory_manual_adjustment_service import apply_manual_stock_correction
from ..inventory_management_policy_service import (
    InventoryManagementPolicyError,
    can_manual_adjust_stock,
)
from ..inventory_count.inventory_movement_guard_service import locked_location_ids_for_picking
from ..inventory_count.picking_empty_location_pending import (
    create_picking_empty_location_pending_correction,
)
from .undo_pick_service import undo_wms_session_picks

logger = logging.getLogger(__name__)


class EmptyLocationError(ValueError):
    def __init__(self, message: str, *, code: str = "EMPTY_LOCATION_FAILED") -> None:
        super().__init__(message)
        self.code = code


def _product_qty_at_location(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    location_id: int,
    for_update: bool = False,
) -> float:
    if for_update:
        rows = (
            db.query(Inventory)
            .filter(
                Inventory.tenant_id == int(tenant_id),
                Inventory.warehouse_id == int(warehouse_id),
                Inventory.product_id == int(product_id),
                Inventory.location_id == int(location_id),
            )
            .with_for_update()
            .all()
        )
        return round(sum(float(r.quantity or 0) for r in rows), 6)
    q = db.query(func.coalesce(func.sum(Inventory.quantity), 0.0)).filter(
        Inventory.tenant_id == int(tenant_id),
        Inventory.warehouse_id == int(warehouse_id),
        Inventory.product_id == int(product_id),
        Inventory.location_id == int(location_id),
        Inventory.quantity > 0,
    )
    return round(float(q.scalar() or 0), 6)


def _alternate_locations(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    exclude_location_id: int,
) -> list[dict[str, Any]]:
    rows = (
        db.query(
            Inventory.location_id,
            Location.name,
            func.coalesce(func.sum(Inventory.quantity), 0.0),
        )
        .join(Location, Location.id == Inventory.location_id)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
            Inventory.location_id != int(exclude_location_id),
            Inventory.quantity > 0,
        )
        .group_by(Inventory.location_id, Location.name)
        .having(func.coalesce(func.sum(Inventory.quantity), 0.0) > 1e-9)
        .order_by(Location.name.asc())
        .all()
    )
    locked = locked_location_ids_for_picking(
        db,
        tenant_id=int(tenant_id),
        location_ids={int(lid) for lid, _n, _q in rows},
    )
    out: list[dict[str, Any]] = []
    for lid, name, qty in rows:
        if int(lid) in locked:
            continue
        out.append(
            {
                "location_id": int(lid),
                "location_code": (name or "").strip() or f"#{lid}",
                "stock_quantity": round(float(qty or 0), 6),
            }
        )
    return out


def confirm_empty_pick_location(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    cart_id: int,
    product_id: int,
    location_id: int,
    observed_stock_qty: float | None = None,
    order_ids: Sequence[int] | None = None,
    operator_user_id: int | None = None,
    source_status_id: int | None = None,
    order_type: str = "all",
    report_product_shortage_if_no_alt: bool = True,
) -> dict[str, Any]:
    """
    „Lokalizacja jest pusta” — zawsze dostępne dla pickera.

    HYBRID: zeruje stock (RK). DOCUMENTS_ONLY: pending CONTROL + lock pickingu.
    Undo draft Picków wyłącznie z tej lokalizacji.
    """
    loc = (
        db.query(Location)
        .filter(Location.id == int(location_id), Location.warehouse_id == int(warehouse_id))
        .first()
    )
    if loc is None:
        raise EmptyLocationError("Nie znaleziono lokalizacji.", code="LOCATION_NOT_FOUND")

    product = (
        db.query(Product)
        .filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id))
        .first()
    )
    if product is None:
        raise EmptyLocationError("Nie znaleziono produktu.", code="PRODUCT_NOT_FOUND")

    previous_qty = _product_qty_at_location(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        location_id=location_id,
        for_update=True,
    )

    if observed_stock_qty is not None and abs(float(observed_stock_qty) - previous_qty) > 1e-6:
        raise EmptyLocationError(
            f"Stan lokalizacji zmienił się (było w UI ~{float(observed_stock_qty):g}, "
            f"aktualnie {previous_qty:g}). Odśwież i potwierdź ponownie.",
            code="STOCK_CHANGED",
        )

    ean = (product.ean or "").strip() or None
    loc_code = (loc.name or "").strip() or f"#{location_id}"
    hybrid = can_manual_adjust_stock(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))

    adj: dict[str, Any] | None = None
    pending: dict[str, Any] | None = None
    stock_effect = "already_zero"
    new_qty = float(previous_qty)

    if previous_qty > 1e-9 and hybrid:
        try:
            adj = apply_manual_stock_correction(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                product_id=int(product_id),
                location_id=int(location_id),
                quantity_delta=-float(previous_qty),
                reason=f"Picking: potwierdzono pustą lokalizację {loc_code} (produkt #{product_id})",
                user_id=int(operator_user_id) if operator_user_id else None,
            )
        except InventoryManagementPolicyError as e:
            raise EmptyLocationError(str(e), code=getattr(e, "code", "INVENTORY_POLICY_BLOCKED")) from e
        except ValueError as e:
            raise EmptyLocationError(str(e), code="STOCK_ADJUST_FAILED") from e
        new_qty = _product_qty_at_location(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            product_id=product_id,
            location_id=location_id,
            for_update=False,
        )
        if new_qty > 1e-9:
            raise EmptyLocationError(
                f"Nie udało się wyzerować lokalizacji (pozostało {new_qty:g}).",
                code="STOCK_NOT_ZERO",
            )
        stock_effect = "zeroed"
    elif previous_qty > 1e-9 and not hybrid:
        # DOCUMENTS_ONLY: fakt + blokada routingu, formalny stock bez zmian do postingu
        pending = create_picking_empty_location_pending_correction(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            location_id=int(location_id),
            product_id=int(product_id),
            expected_quantity=float(previous_qty),
            cart_id=int(cart_id),
            operator_user_id=operator_user_id,
            location_code=loc_code,
            product_ean=ean,
        )
        stock_effect = "pending_document_correction"
        new_qty = float(previous_qty)
    else:
        # Już 0 formalnie — i tak upewnij się, że lokalizacja nie wróci do routingu
        # (np. stary snapshot); opcjonalny soft lock nie jest konieczny gdy qty=0.
        stock_effect = "already_zero"
        new_qty = 0.0

    # Undo WYŁĄCZNIE picków z tej lokalizacji (location-aware)
    undo_res = undo_wms_session_picks(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        cart_id=cart_id,
        product_id=product_id,
        quantity=0,
        location_id=int(location_id),
        order_ids=order_ids,
        operator_user_id=operator_user_id,
        undo_all=True,
    )
    undone_qty = float(undo_res.get("undone_qty") or 0)

    alts = _alternate_locations(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        exclude_location_id=int(location_id),
    )
    has_alt = len(alts) > 0
    shortage_result: dict[str, Any] | None = None
    shortage_kind = "LOCATION_SHORTAGE" if has_alt else "PRODUCT_SHORTAGE"

    from ..wms_audit_service import emit_wms_location_emptied

    emit_wms_location_emptied(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int((order_ids or [0])[0]) if order_ids else None,
        cart_id=int(cart_id),
        product_id=int(product_id),
        product_ean=ean,
        location_id=int(location_id),
        location_code=loc_code,
        previous_qty=float(previous_qty),
        new_qty=0.0 if stock_effect != "pending_document_correction" else float(previous_qty),
        operator_user_id=operator_user_id,
        stock_document_id=int(adj["stock_document_id"]) if adj else None,
        stock_effect=stock_effect,
        inventory_document_id=int(pending["inventory_document_id"]) if pending else None,
    )

    if not has_alt and report_product_shortage_if_no_alt and source_status_id is not None:
        from ..wms_picking_product_list_service import report_wms_picking_product_shortage

        try:
            shortage_result = report_wms_picking_product_shortage(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                source_status_id=int(source_status_id),
                order_type=order_type,  # type: ignore[arg-type]
                product_id=int(product_id),
                location_id=int(location_id),
                missing_qty=1e9,
                cart_id=int(cart_id),
                ui_order_ids=list(order_ids) if order_ids else None,
                operator_user_id=operator_user_id,
            )
        except ValueError as e:
            logger.info("[wms.empty_location] product shortage skipped: %s", e)
            shortage_result = {"ok": False, "skipped": str(e)}

    logger.info(
        "[wms.empty_location] product_id=%s location_id=%s prev=%s effect=%s alts=%s kind=%s",
        product_id,
        location_id,
        previous_qty,
        stock_effect,
        len(alts),
        shortage_kind,
    )
    return {
        "ok": True,
        "shortage_kind": shortage_kind,
        "location_id": int(location_id),
        "location_code": loc_code,
        "product_id": int(product_id),
        "product_ean": ean,
        "previous_qty": float(previous_qty),
        "new_qty": float(new_qty) if stock_effect != "pending_document_correction" else 0.0,
        "formal_stock_qty": float(previous_qty) if stock_effect == "pending_document_correction" else float(new_qty),
        "stock_effect": stock_effect,
        "routing_blocked": True,
        "undone_pick_qty": float(undone_qty),
        "alternate_locations": alts,
        "stock_document_id": int(adj["stock_document_id"]) if adj else None,
        "inventory_document_id": int(pending["inventory_document_id"]) if pending else None,
        "inventory_document_number": pending.get("inventory_document_number") if pending else None,
        "product_shortage": shortage_result,
    }
