"""Defensive assembly for GET /orders — structured errors, graceful degradation."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, List, Optional, Tuple

from sqlalchemy.exc import SQLAlchemyError

from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.order_ui_status import OrderUiStatus
from ..schemas.order import OrderListRead

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def _order_list_source_display(order: Order) -> Optional[str]:
    from .direct_sale.order_display import direct_sale_source_display

    try:
        ds = direct_sale_source_display(order)
        if ds:
            return ds
        from ..api.wms_returns import _normalize_order_source

        raw = getattr(order, "source", None)
        source_raw = str(raw).strip() if raw is not None and str(raw).strip() else None
        return _normalize_order_source(source_raw)
    except Exception:
        raw = getattr(order, "source", None)
        return str(raw).strip() if raw is not None and str(raw).strip() else None


def log_orders_list_error(
    *,
    phase: str,
    exc: BaseException,
    order_id: int | None = None,
    field: str | None = None,
) -> None:
    """Structured server log for order list failures."""
    exc_type = type(exc).__name__
    is_sql = isinstance(exc, SQLAlchemyError)
    msg = str(exc).strip()[:500] or exc_type
    logger.exception(
        "[orders.list.error] phase=%s exc_type=%s sqlalchemy=%s order_id=%s field=%s message=%s",
        phase,
        exc_type,
        is_sql,
        order_id if order_id is not None else "—",
        field or "—",
        msg,
    )


def ensure_orders_list_schema(engine) -> None:
    """Best-effort schema repair before list query (idempotent)."""
    from ..db.schema_upgrade import (
        ensure_fulfillment_events_table,
        ensure_order_items_fulfillment_sync_columns,
        ensure_order_items_oms_line_status,
        ensure_order_items_wms_picking_line_missing_qty,
        ensure_order_items_wms_picking_line_status,
        ensure_orders_fulfillment_state_columns,
        ensure_orders_wms_timeline_columns,
    )

    for fn in (
        ensure_orders_fulfillment_state_columns,
        ensure_orders_wms_timeline_columns,
        ensure_order_items_wms_picking_line_missing_qty,
        ensure_order_items_wms_picking_line_status,
        ensure_order_items_fulfillment_sync_columns,
        ensure_order_items_oms_line_status,
        ensure_fulfillment_events_table,
    ):
        try:
            fn(engine)
        except Exception as exc:
            log_orders_list_error(phase="schema_ensure", exc=exc, field=fn.__name__)


def safe_wms_workflow_phase(order: Order, db: "Session") -> str | None:
    from .wms_workflow_phase import compute_wms_workflow_phase

    try:
        return compute_wms_workflow_phase(order, db=db)
    except Exception as exc:
        log_orders_list_error(
            phase="serializer",
            exc=exc,
            order_id=int(getattr(order, "id", 0) or 0) or None,
            field="wms_workflow_phase",
        )
        return None


def build_order_list_read_row(
    db: "Session",
    *,
    order: Order,
    total_volume: float,
    is_multi_item: bool,
    total_items: int,
    position_count: int,
    list_active: List[OrderItem],
    comm_by_id: dict,
    profit_map: dict[int, tuple[Optional[float], Optional[float]]],
    customer_names_fn,
    item_preview_fn,
    brief_ui_status_fn,
    shipping_display_fn,
    import_meta_fn,
) -> Optional[OrderListRead]:
    """Map one order to list DTO — never raises; returns None only if row is unusable."""
    oid = int(getattr(order, "id", 0) or 0)
    if oid < 1:
        log_orders_list_error(
            phase="serializer",
            exc=ValueError("order missing id"),
            order_id=None,
            field="id",
        )
        return None

    try:
        fn, ln = customer_names_fn(order)
    except Exception as exc:
        log_orders_list_error(phase="serializer", exc=exc, order_id=oid, field="customer_names")
        fn, ln = None, None

    display_lines = []
    preview = []
    try:
        display_lines = [item_preview_fn(it) for it in list_active]
        preview = display_lines[:3]
    except Exception as exc:
        log_orders_list_error(phase="serializer", exc=exc, order_id=oid, field="items_preview")

    ui_brief = None
    try:
        ui_row = getattr(order, "order_ui_status", None)
        if ui_row is None and getattr(order, "order_ui_status_id", None):
            ui_row = db.query(OrderUiStatus).filter(OrderUiStatus.id == order.order_ui_status_id).first()
        ui_brief = brief_ui_status_fn(ui_row)
    except Exception as exc:
        log_orders_list_error(phase="serializer", exc=exc, order_id=oid, field="order_ui_status")

    ship_name, ship_logo, ship_id = None, None, None
    try:
        ship_name, ship_logo, ship_id = shipping_display_fn(order)
    except Exception as exc:
        log_orders_list_error(phase="serializer", exc=exc, order_id=oid, field="shipping_display")

    wms_missing_line_count = 0
    try:
        wms_missing_line_count = sum(
            1
            for it in list_active
            if float(getattr(it, "wms_picking_line_missing_qty", None) or 0) > 1e-9
        )
    except Exception as exc:
        log_orders_list_error(phase="serializer", exc=exc, order_id=oid, field="wms_missing_line_count")

    pay_st_s = None
    pay_mt_s = None
    try:
        meta_list = import_meta_fn(order)
        pay_st = meta_list.get("panel_payment_status")
        pay_mt = meta_list.get("panel_payment_method")
        pay_st_s = str(pay_st).strip()[:256] if pay_st is not None and str(pay_st).strip() else None
        pay_mt_s = str(pay_mt).strip()[:256] if pay_mt is not None and str(pay_mt).strip() else None
    except Exception as exc:
        log_orders_list_error(phase="serializer", exc=exc, order_id=oid, field="panel_payment")

    cf = comm_by_id.get(oid)
    gp_mp = profit_map.get(oid, (None, None))
    preview_internal = (cf.latest_internal_note_preview if cf else None) or ""
    has_internal_note_row = bool(cf and (cf.has_internal_note or bool(preview_internal.strip())))

    pc_raw = getattr(order, "priority_color", None)
    pc_norm = str(pc_raw).strip().lower() if pc_raw is not None and str(pc_raw).strip() else None

    wms_phase = safe_wms_workflow_phase(order, db)

    try:
        return OrderListRead(
            id=oid,
            number=getattr(order, "number", None),
            external_id=getattr(order, "external_id", None),
            sales_document_number=getattr(order, "sales_document_number", None),
            city=getattr(order, "city", None),
            country=getattr(order, "country", None),
            status=getattr(order, "status", None),
            order_date=getattr(order, "order_date", None),
            value=getattr(order, "value", None),
            created_at=getattr(order, "created_at", None),
            source=_order_list_source_display(order),
            shipping_method_id=ship_id,
            shipping_method=ship_name,
            shipping_method_logo_url=ship_logo,
            currency=getattr(order, "currency", None),
            total_volume=total_volume,
            is_multi_item=is_multi_item,
            total_items=total_items,
            position_count=position_count,
            first_name=fn,
            last_name=ln,
            items_preview=preview,
            items_display_lines=display_lines,
            wms_missing_line_count=wms_missing_line_count,
            order_ui_status=ui_brief,
            panel_payment_status=pay_st_s,
            panel_payment_method=pay_mt_s,
            gross_profit=gp_mp[0],
            margin_percent=gp_mp[1],
            priority_color=pc_norm,
            wms_packed_at=getattr(order, "packed_at", None),
            wms_packed_by_label=None,
            wms_workflow_phase=wms_phase,
            has_internal_note=has_internal_note_row,
            has_customer_comment=cf.has_customer_comment if cf else False,
            latest_internal_note_preview=cf.latest_internal_note_preview if cf else None,
            latest_customer_comment_preview=cf.latest_customer_comment_preview if cf else None,
            order_channel=getattr(order, "order_channel", None),
            fulfillment_mode=getattr(order, "fulfillment_mode", None),
        )
    except Exception as exc:
        log_orders_list_error(phase="serializer", exc=exc, order_id=oid, field="OrderListRead")
        return None


def sort_built_order_rows(
    built: List[Tuple[Order, float, bool, int, int, List[OrderItem]]],
    *,
    sort_by: str | None,
    sort_dir: str | None,
    profit_sort_map: dict[int, tuple[Optional[float], Optional[float]]],
) -> List[Tuple[Order, float, bool, int, int, List[OrderItem]]]:
    """In-memory sort with defensive timestamp handling."""
    if not sort_by:
        return built

    sort_d = sort_dir
    if sort_by in ("gross_profit", "margin_percent"):
        reverse = (sort_d or "asc").lower() == "desc"

        def _profit_sort_key(row: Tuple[Order, float, bool, int, int, List[OrderItem]]):
            oid = int(row[0].id)
            gp, mp = profit_sort_map.get(oid, (None, None))
            v = gp if sort_by == "gross_profit" else mp
            return float("-inf") if v is None else float(v)

        built.sort(key=_profit_sort_key, reverse=reverse)
        return built

    if sort_by not in (
        "id",
        "number",
        "status",
        "order_date",
        "total_volume",
        "total_items",
        "order_type",
        "position_count",
    ):
        return built

    reverse = (sort_d or "asc").lower() == "desc"
    try:
        if sort_by == "id":
            built.sort(key=lambda x: x[0].id, reverse=reverse)
        elif sort_by == "number":
            built.sort(key=lambda x: (x[0].number or ""), reverse=reverse)
        elif sort_by == "status":
            built.sort(key=lambda x: (x[0].status or ""), reverse=reverse)
        elif sort_by == "order_date":
            with_d = [x for x in built if getattr(x[0], "order_date", None) is not None]
            without_d = [x for x in built if getattr(x[0], "order_date", None) is None]

            def _ts(row):
                d = getattr(row[0], "order_date", None)
                if d is None:
                    return 0.0
                try:
                    return d.timestamp()
                except (TypeError, OSError, ValueError, AttributeError):
                    return 0.0

            with_d.sort(key=_ts, reverse=reverse)
            built = with_d + without_d
        elif sort_by == "total_volume":
            built.sort(key=lambda x: x[1], reverse=reverse)
        elif sort_by == "total_items":
            built.sort(key=lambda x: x[3], reverse=reverse)
        elif sort_by == "order_type":
            built.sort(key=lambda x: x[2], reverse=reverse)
        elif sort_by == "position_count":
            built.sort(key=lambda x: x[4], reverse=reverse)
    except Exception as exc:
        log_orders_list_error(phase="sort", exc=exc, field=sort_by)
    return built
