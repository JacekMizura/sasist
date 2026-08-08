"""
Pakowanie: oznaczenie linii jako brak + odłożenie zamówienia (status z ustawień).

Nie zastępuje workflow braków ze zbierania — to osobny, prosty tor operatorski na stanowisku pakowania.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session, joinedload

from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.order_ui_status import OrderUiStatus
from ..models.wms_packing_settings import WmsPackingSettings
from .fulfillment_event_service import FE_MISSING, append_event, sync_declared_shortage_column_from_missing_events
from .order_fulfillment_recompute import recompute_order_fulfillment
from .wms_packing_service import PackingScanError, order_item_required_pack_qty

logger = logging.getLogger(__name__)


class PackingShortageError(PackingScanError):
    """Błąd oznaczenia braku z pakowania — te same kody co PackingScanError dla UI."""


def _get_packing_settings(db: Session, *, tenant_id: int, warehouse_id: int) -> WmsPackingSettings | None:
    return (
        db.query(WmsPackingSettings)
        .filter(
            WmsPackingSettings.tenant_id == int(tenant_id),
            WmsPackingSettings.warehouse_id == int(warehouse_id),
        )
        .first()
    )


def packing_mark_line_shortage_and_defer(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    order_item_id: int,
    operator_user_id: int | None = None,
) -> dict[str, Any]:
    """
    Oznacza linię jako brakującą, ustawia status zamówienia na ``missing_status_id``
    z ustawień pakowania i kończy bieżące pakowanie (operator wraca do listy).
    """
    settings = _get_packing_settings(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    missing_sid = getattr(settings, "missing_status_id", None) if settings is not None else None
    if missing_sid is None or int(missing_sid) <= 0:
        raise PackingShortageError(
            "MISSING_STATUS_NOT_CONFIGURED",
            message="Skonfiguruj „Status dla braków w zamówieniu” w Ustawieniach WMS → Pakowanie.",
        )

    status_row = (
        db.query(OrderUiStatus)
        .filter(
            OrderUiStatus.id == int(missing_sid),
            OrderUiStatus.tenant_id == int(tenant_id),
            OrderUiStatus.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if status_row is None:
        raise PackingShortageError(
            "MISSING_STATUS_NOT_CONFIGURED",
            message="Skonfiguruj „Status dla braków w zamówieniu” w Ustawieniach WMS → Pakowanie.",
        )

    order = (
        db.query(Order)
        .options(joinedload(Order.items))
        .filter(
            Order.id == int(order_id),
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if order is None:
        raise PackingShortageError("ORDER_NOT_FOUND", message="Nie znaleziono zamówienia.")

    oi = (
        db.query(OrderItem)
        .filter(
            OrderItem.id == int(order_item_id),
            OrderItem.order_id == int(order_id),
        )
        .first()
    )
    if oi is None:
        raise PackingShortageError("LINE_NOT_FOUND", message="Nie znaleziono pozycji zamówienia.")

    required = int(order_item_required_pack_qty(db, order, oi))
    packed = int(getattr(oi, "packing_quantity_packed", 0) or 0)
    remaining = max(0, required - packed)
    if remaining <= 0:
        raise PackingShortageError(
            "LINE_ALREADY_PACKED",
            message="Ta pozycja jest już spakowana — nie można oznaczyć braku.",
            order_item_id=int(oi.id),
        )

    take = float(remaining)
    declared_ln = float(getattr(oi, "wms_shortage_declared_qty", None) or 0.0)
    oi.wms_shortage_declared_qty = round(declared_ln + take, 6)
    miss_ln = float(getattr(oi, "wms_picking_line_missing_qty", None) or 0.0)
    oi.wms_picking_line_missing_qty = round(miss_ln + take, 6)
    oi.wms_picking_line_status = "missing"

    append_event(
        db,
        order_item_id=int(oi.id),
        event_type=FE_MISSING,
        quantity=float(take),
        metadata={
            "source": "wms_packing_mark_shortage",
            "order_id": int(order.id),
            "order_number": str(getattr(order, "number", None) or f"#{order.id}"),
            "product_id": int(oi.product_id) if oi.product_id is not None else None,
            "operator_user_id": int(operator_user_id) if operator_user_id is not None else None,
        },
    )
    sync_declared_shortage_column_from_missing_events(db, int(oi.id))

    prev_status_id = int(order.order_ui_status_id) if getattr(order, "order_ui_status_id", None) else None
    order.order_ui_status_id = int(status_row.id)

    recompute_order_fulfillment(db, int(order.id), commit=False)

    logger.info(
        "[wms.packing.mark_shortage] order_id=%s order_item_id=%s take=%s "
        "status %s -> %s (%s) operator=%s",
        int(order.id),
        int(oi.id),
        take,
        prev_status_id,
        int(status_row.id),
        str(status_row.name),
        operator_user_id,
    )

    return {
        "ok": True,
        "order_id": int(order.id),
        "order_item_id": int(oi.id),
        "shortage_qty": take,
        "missing_status_id": int(status_row.id),
        "missing_status_name": str(status_row.name),
    }
