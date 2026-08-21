"""
Status-driven packaging workflow orchestrator (Smart + 3D triggers).

- Independent proposal-init statuses per engine → one pipeline call with intents
- Independent auto-label statuses → one label attempt if any fires
- Single selected_carton_id assign policy (see packaging_assign)
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from ...models.order import Order
from .packaging_assign import (
    CARTON_SOURCE_SMART,
    CARTON_SOURCE_THREE_D,
    decide_status_triggered_assignment,
    existing_carton_id,
    existing_carton_source,
    set_order_selected_carton,
)
from .smart_matching_store import (
    effective_smart_auto_label_enabled,
    effective_smart_auto_label_status_ids,
    effective_smart_enabled,
    effective_smart_proposal_init_status_id,
    effective_three_d_auto_label_enabled,
    effective_three_d_auto_label_status_ids,
    effective_three_d_enabled,
    effective_three_d_proposal_init_status_id,
    get_or_create_settings,
)
from .strategy_resolver import normalize_strategy

logger = logging.getLogger(__name__)


def on_order_status_changed_packaging(
    db: Session,
    *,
    order: Order,
    new_status_id: Optional[int],
    operator_user_id: Optional[int] = None,
) -> dict[str, Any]:
    """Call after panel status mutation. Soft-fails — never blocks status change."""
    result: dict[str, Any] = {
        "want_smart": False,
        "want_3d": False,
        "proposal": None,
        "auto_label": None,
        "skipped": None,
    }
    if new_status_id is None or int(new_status_id) <= 0:
        return result
    try:
        tid = int(order.tenant_id)
        wid = int(order.warehouse_id)
        settings = get_or_create_settings(db, tenant_id=tid, warehouse_id=wid)
        sid = int(new_status_id)
        strategy = normalize_strategy(getattr(settings, "packaging_strategy", None))

        smart_on = effective_smart_enabled(settings)
        three_d_on = effective_three_d_enabled(settings)
        smart_init = effective_smart_proposal_init_status_id(settings)
        three_d_init = effective_three_d_proposal_init_status_id(settings)

        want_smart = bool(smart_on and smart_init is not None and sid == int(smart_init))
        want_3d = bool(three_d_on and three_d_init is not None and sid == int(three_d_init))
        result["want_smart"] = want_smart
        result["want_3d"] = want_3d

        if want_smart or want_3d:
            if _should_skip_late_3d_only(
                order=order, strategy=strategy, want_smart=want_smart, want_3d=want_3d
            ):
                result["skipped"] = "late_3d_skip_existing_smart_or_protected"
                result["proposal"] = {
                    "ok": True,
                    "message": "skipped_late_3d",
                    "assigned": False,
                }
            else:
                result["proposal"] = _apply_proposal_init(
                    db,
                    order=order,
                    tenant_id=tid,
                    warehouse_id=wid,
                    want_smart=want_smart,
                    want_3d=want_3d,
                    strategy=strategy,
                    triggered_by_user_id=operator_user_id,
                )

        fire_smart_label = bool(
            effective_smart_auto_label_enabled(settings)
            and sid in set(effective_smart_auto_label_status_ids(settings))
        )
        fire_3d_label = bool(
            effective_three_d_auto_label_enabled(settings)
            and sid in set(effective_three_d_auto_label_status_ids(settings))
        )
        if fire_smart_label or fire_3d_label:
            result["auto_label"] = _try_auto_label(
                db, order=order, tenant_id=tid, warehouse_id=wid
            )
    except Exception:
        logger.exception(
            "packaging status trigger failed order_id=%s status=%s",
            getattr(order, "id", None),
            new_status_id,
        )
    return result


# Legacy alias — single active hook (rename target).
on_order_status_changed_smart_matching = on_order_status_changed_packaging


def _should_skip_late_3d_only(
    *,
    order: Order,
    strategy: str,
    want_smart: bool,
    want_3d: bool,
) -> bool:
    """Late 3D-only trigger: skip engine when SMART_THEN_3D already has Smart carton / protected."""
    if not want_3d or want_smart:
        return False
    existing = existing_carton_id(order)
    if not existing:
        return False
    src = existing_carton_source(order)
    st = str(strategy or "").strip().upper()
    if st == "SMART_THEN_3D":
        # Existing Smart assignment → no reassignment / no 3D run.
        if src == CARTON_SOURCE_SMART:
            return True
        # MANUAL / unknown → protected; do not run 3D to overwrite.
        if src is None or src == "MANUAL":
            return True
    if st == "SMART_ONLY":
        return True
    # THREE_D_OVERRIDE / THREE_D_ONLY: run engine; assign policy decides overwrite.
    return False


def _apply_proposal_init(
    db: Session,
    *,
    order: Order,
    tenant_id: int,
    warehouse_id: int,
    want_smart: bool,
    want_3d: bool,
    strategy: str,
    triggered_by_user_id: Optional[int] = None,
) -> dict[str, Any]:
    from .engine import build_packaging_suggestions_for_order
    from .three_d_matching_history import attach_selected_carton_to_latest_attempt

    _combined, primary, _alts, _plan = build_packaging_suggestions_for_order(
        db,
        order,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        trigger="STATUS",
        triggered_by_user_id=triggered_by_user_id,
        want_smart=want_smart,
        want_3d=want_3d,
    )
    if primary is None:
        return {"ok": False, "message": "no_suggestion", "assigned": False}

    outcome_source = CARTON_SOURCE_SMART
    eng = str(getattr(primary, "source_engine", "") or "")
    if eng == "THREE_D_MATCHING":
        outcome_source = CARTON_SOURCE_THREE_D
    elif eng == "SMART_MATCHING":
        outcome_source = CARTON_SOURCE_SMART
    else:
        # COMBINED / unknown — prefer 3D tag only when strategy selected THREE_D
        if "THREE_D" in (getattr(primary, "reason", "") or ""):
            outcome_source = CARTON_SOURCE_THREE_D

    decision = decide_status_triggered_assignment(
        order,
        strategy=strategy,
        primary_carton_id=str(primary.suggested_package_id or ""),
        outcome_source=outcome_source,
    )
    if not decision.assign or not decision.carton_id:
        return {
            "ok": True,
            "message": decision.reason,
            "suggested_package_id": primary.suggested_package_id,
            "assigned": False,
            "source_engine": eng,
        }

    set_order_selected_carton(order, carton_id=decision.carton_id, source=decision.source or outcome_source)
    db.add(order)
    db.flush()
    if decision.source == CARTON_SOURCE_THREE_D:
        try:
            attach_selected_carton_to_latest_attempt(
                db,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                order_id=int(order.id),
                carton_id=str(decision.carton_id),
                carton_name=getattr(primary, "package_name", None),
            )
        except Exception:
            logger.exception("attach_selected_carton_to_latest_attempt order_id=%s", order.id)
    logger.info(
        "packaging proposal_init assigned order_id=%s carton=%s source=%s engine=%s",
        order.id,
        decision.carton_id,
        decision.source,
        eng,
    )
    return {
        "ok": True,
        "message": decision.reason,
        "suggested_package_id": decision.carton_id,
        "source_engine": eng,
        "assigned": True,
        "carton_source": decision.source,
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
