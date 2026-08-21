"""
Status-driven Smart Matching side effects:

- proposal_init_status → wygeneruj propozycję i (gdy brak kartonu) miękko przypisz PRIMARY
- auto_label statuses → spróbuj list przewozowy tylko gdy jest opakowanie
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from ...models.order import Order
from .smart_matching_store import get_or_create_settings, settings_to_out

logger = logging.getLogger(__name__)


def on_order_status_changed_smart_matching(
    db: Session,
    *,
    order: Order,
    new_status_id: Optional[int],
    operator_user_id: Optional[int] = None,
) -> dict[str, Any]:
    """Call after panel status mutation. Soft-fails — never blocks status change."""
    result: dict[str, Any] = {"proposal": None, "auto_label": None}
    if new_status_id is None or int(new_status_id) <= 0:
        return result
    try:
        tid = int(order.tenant_id)
        wid = int(order.warehouse_id)
        settings_row = get_or_create_settings(db, tenant_id=tid, warehouse_id=wid)
        from .smart_matching_store import effective_smart_enabled, effective_three_d_enabled

        if not effective_smart_enabled(settings_row) and not effective_three_d_enabled(settings_row):
            return result
        settings = settings_to_out(settings_row)

        sid = int(new_status_id)
        if settings.proposal_init_status_id is not None and sid == int(settings.proposal_init_status_id):
            result["proposal"] = _apply_proposal_init(db, order=order, tenant_id=tid, warehouse_id=wid)

        if settings.auto_label_enabled and sid in set(settings.auto_label_status_ids):
            result["auto_label"] = _try_auto_label(db, order=order, tenant_id=tid, warehouse_id=wid)
    except Exception:
        logger.exception(
            "smart_matching status trigger failed order_id=%s status=%s",
            getattr(order, "id", None),
            new_status_id,
        )
    return result


def _apply_proposal_init(
    db: Session, *, order: Order, tenant_id: int, warehouse_id: int
) -> dict[str, Any]:
    from .engine import build_packaging_suggestions_for_order

    _combined, primary, _alts, _plan = build_packaging_suggestions_for_order(
        db, order, tenant_id=tenant_id, warehouse_id=warehouse_id
    )
    if primary is None:
        return {"ok": False, "message": "no_suggestion"}

    sel = getattr(order, "selected_carton_id", None)
    sel_s = str(sel).strip() if sel else ""
    if sel_s:
        return {
            "ok": True,
            "message": "carton_already_selected",
            "suggested_package_id": primary.suggested_package_id,
            "assigned": False,
        }

    # Soft-assign Smart / PRIMARY suggestion — same carton model as manual select.
    order.selected_carton_id = str(primary.suggested_package_id)
    db.add(order)
    db.flush()
    logger.info(
        "smart_matching proposal_init assigned order_id=%s carton=%s engine=%s",
        order.id,
        primary.suggested_package_id,
        primary.source_engine,
    )
    return {
        "ok": True,
        "message": "assigned_from_smart_matching",
        "suggested_package_id": primary.suggested_package_id,
        "source_engine": primary.source_engine,
        "assigned": True,
    }


def _try_auto_label(
    db: Session, *, order: Order, tenant_id: int, warehouse_id: int
) -> dict[str, Any]:
    sel = getattr(order, "selected_carton_id", None)
    sel_s = str(sel).strip() if sel else ""
    if not sel_s:
        return {
            "ok": False,
            "message": "no_packaging",
            "detail": "Brak przypisanego opakowania — pominięto auto-generowanie listu.",
        }

    from ..wms_packing_service import _packing_step_generate_shipment, _packing_step_print_label
    from ...schemas.wms_packing_settings import WmsPackingFallbackLabel
    from .smart_matching_store import get_or_create_settings

    # Reuse packing pipeline helpers — do not invent a parallel shipment system.
    _ = get_or_create_settings(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    gen = _packing_step_generate_shipment(db, order)
    print_step = _packing_step_print_label(
        db,
        tenant_id=tenant_id,
        order=order,
        fb=WmsPackingFallbackLabel(),
        offer_replacement_on_missing=False,
    )
    ok = bool(gen.ok and not gen.skipped) or bool(print_step.ok and not print_step.skipped)
    return {
        "ok": ok,
        "message": print_step.message or gen.message,
        "generate_ok": bool(gen.ok),
        "print_ok": bool(print_step.ok),
    }
