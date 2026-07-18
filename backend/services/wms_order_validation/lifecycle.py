"""
Aplikacja wyniku walidacji: status FAIL / PASS revalidate + Activity Log.

Bez skonfigurowanego statusu FAIL: walidacja nadal działa jako gate (nie Capacity),
ale NIE zmienia order_ui_status_id (bezpieczne — zero przypadkowych ID).
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)
from typing import Any, Optional

from sqlalchemy.orm import Session

from ...models.order import Order
from ...models.order_ui_status import OrderUiStatus
from ...models.wms_order_event import EVT_WMS_VALIDATION_FAILED, EVT_WMS_VALIDATION_PASSED
from ...services.wms_picking_shortage_settings_service import get_or_create_wms_picking_shortage_settings
from .types import WmsOrderValidationResult

logger = logging.getLogger(__name__)

# Klucze w order.import_metadata_json (nie kolidują z OMS import — namespaced)
_META_PREV_UI = "wms_validation_previous_ui_status_id"
_META_ISSUES = "wms_validation_issues"
_META_FAILED_AT = "wms_validation_failed_at"


def get_configured_validation_fail_status_id(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> Optional[int]:
    ss = get_or_create_wms_picking_shortage_settings(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
    )
    sid = getattr(ss, "wms_validation_failed_order_ui_status_id", None)
    if sid is None:
        return None
    sid_i = int(sid)
    return sid_i if sid_i > 0 else None


def _order_meta(order: Order) -> dict[str, Any]:
    raw = getattr(order, "import_metadata_json", None)
    if not raw or not str(raw).strip():
        return {}
    try:
        m = json.loads(raw)
        return m if isinstance(m, dict) else {}
    except json.JSONDecodeError:
        return {}


def _save_order_meta(order: Order, meta: dict[str, Any]) -> None:
    order.import_metadata_json = json.dumps(meta, ensure_ascii=False)


def _status_name(db: Session, status_id: Optional[int]) -> str:
    if status_id is None or int(status_id) <= 0:
        return "—"
    row = db.query(OrderUiStatus).filter(OrderUiStatus.id == int(status_id)).first()
    if row is None:
        return f"#{int(status_id)}"
    return str(getattr(row, "name", None) or getattr(row, "label", None) or f"#{int(status_id)}")


def apply_wms_validation_fail(
    db: Session,
    *,
    order: Order,
    result: WmsOrderValidationResult,
    tenant_id: int,
    warehouse_id: int,
    operator_user_id: Optional[int] = None,
    emit_activity: bool = True,
) -> dict[str, Any]:
    """
    Ustawia status FAIL (jeśli skonfigurowany), zapisuje previous status + issues w metadata,
    jeden event Activity Log.

    Zwraca dict: status_changed, previous_status_id, new_status_id, config_missing.
    """
    if result.ok:
        return {"status_changed": False, "skipped": "pass_result"}

    if result.is_technical_error:
        logger.warning(
            "[wms.validation] technical ERROR (no Activity FAIL) order_id=%s code=%s",
            int(order.id),
            result.error_code,
        )
        return {
            "status_changed": False,
            "skipped": "technical_error",
            "error_code": result.error_code,
        }

    fail_sid = get_configured_validation_fail_status_id(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
    )
    prev = getattr(order, "order_ui_status_id", None)
    prev_i = int(prev) if prev is not None else None

    meta = _order_meta(order)
    already_on_fail = fail_sid is not None and prev_i == int(fail_sid)
    already_gated_no_status = fail_sid is None and bool(meta.get(_META_ISSUES))

    # Nie nadpisuj previous, jeśli już jesteśmy na statusie FAIL (rewalidacja / ponowny FAIL)
    if fail_sid is not None and prev_i != int(fail_sid):
        meta[_META_PREV_UI] = prev_i
    meta[_META_ISSUES] = [i.to_dict() for i in result.issues]
    meta[_META_FAILED_AT] = _utc_now().isoformat(timespec="seconds") + "Z"
    _save_order_meta(order, meta)

    status_changed = False
    if fail_sid is None:
        logger.warning(
            "[wms.validation] FAIL without configured status order_id=%s tenant=%s wh=%s — gate only",
            int(order.id),
            tenant_id,
            warehouse_id,
        )
    elif prev_i != int(fail_sid):
        order.order_ui_status_id = int(fail_sid)
        status_changed = True

    do_emit = emit_activity and not already_on_fail and not already_gated_no_status
    if do_emit:
        _emit_validation_failed_activity(
            db,
            order=order,
            result=result,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            operator_user_id=operator_user_id,
            previous_status_id=prev_i,
            new_status_id=int(fail_sid) if fail_sid is not None else prev_i,
            status_changed=status_changed,
        )

    return {
        "status_changed": status_changed,
        "previous_status_id": prev_i,
        "new_status_id": int(fail_sid) if fail_sid is not None else None,
        "config_missing": fail_sid is None,
    }


def apply_wms_validation_pass_revalidate(
    db: Session,
    *,
    order: Order,
    result: WmsOrderValidationResult,
    tenant_id: int,
    warehouse_id: int,
    operator_user_id: Optional[int] = None,
) -> dict[str, Any]:
    """
    Po ręcznej rewalidacji PASS: przywróć ``wms_validation_previous_ui_status_id`` z metadata.
    Bez previous — nie zgaduj statusu (zwróć needs_manual_status=True).
    """
    if not result.ok:
        return apply_wms_validation_fail(
            db,
            order=order,
            result=result,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            operator_user_id=operator_user_id,
        )

    meta = _order_meta(order)
    prev_raw = meta.get(_META_PREV_UI)
    try:
        restore_sid = int(prev_raw) if prev_raw is not None else None
    except (TypeError, ValueError):
        restore_sid = None

    old_sid = getattr(order, "order_ui_status_id", None)
    status_changed = False
    needs_manual = False

    if restore_sid is not None and restore_sid > 0:
        if old_sid is None or int(old_sid) != restore_sid:
            order.order_ui_status_id = int(restore_sid)
            status_changed = True
    else:
        needs_manual = True

    meta.pop(_META_PREV_UI, None)
    meta.pop(_META_ISSUES, None)
    meta.pop(_META_FAILED_AT, None)
    meta["wms_validation_last_pass_at"] = _utc_now().isoformat(timespec="seconds") + "Z"
    _save_order_meta(order, meta)

    from ..wms_audit_service import append_order_activity_for_wms, insert_wms_order_event

    old_name = _status_name(db, int(old_sid) if old_sid is not None else None)
    new_name = _status_name(db, int(order.order_ui_status_id) if order.order_ui_status_id else None)
    if status_changed:
        msg = (
            f"Zamówienie #{int(order.id)} przeszło ponowną Walidację WMS. "
            f"Przywrócono status z „{old_name}” na „{new_name}”."
        )
    elif needs_manual:
        msg = (
            f"Zamówienie #{int(order.id)} przeszło ponowną Walidację WMS. "
            f"Brak zapisanego poprzedniego statusu — ustaw status ręcznie."
        )
    else:
        msg = f"Zamówienie #{int(order.id)} przeszło ponowną Walidację WMS."

    insert_wms_order_event(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order.id),
        operator_user_id=operator_user_id,
        event_type=EVT_WMS_VALIDATION_PASSED,
        metadata={"validation_status": "PASS", "status_changed": status_changed},
    )
    append_order_activity_for_wms(
        db,
        order_id=int(order.id),
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        event_type=EVT_WMS_VALIDATION_PASSED,
        message=msg,
        operator_user_id=operator_user_id,
        metadata={"validation_status": "PASS"},
    )

    return {
        "status_changed": status_changed,
        "restored_status_id": restore_sid,
        "needs_manual_status": needs_manual,
    }


def _emit_validation_failed_activity(
    db: Session,
    *,
    order: Order,
    result: WmsOrderValidationResult,
    tenant_id: int,
    warehouse_id: int,
    operator_user_id: Optional[int],
    previous_status_id: Optional[int],
    new_status_id: Optional[int],
    status_changed: bool,
) -> None:
    from ..wms_audit_service import append_order_activity_for_wms, insert_wms_order_event

    old_name = _status_name(db, previous_status_id)
    new_name = _status_name(db, new_status_id)
    if status_changed:
        msg = (
            f"Zamówienie #{int(order.id)} nie przeszło Walidacji WMS. "
            f"Zmieniono status z „{old_name}” na „{new_name}”."
        )
    else:
        msg = (
            f"Zamówienie #{int(order.id)} nie przeszło Walidacji WMS "
            f"(status błędu nie skonfigurowany — zamówienie nie trafia do Capacity)."
        )

    issue_lines = []
    for iss in result.issues[:20]:
        who = iss.ean or iss.sku or (f"#{iss.product_id}" if iss.product_id else "?")
        issue_lines.append(f"{who} — {iss.reason_label}")

    meta = {
        "validation_status": "FAIL",
        "issues": [i.to_dict() for i in result.issues],
        "previous_status_id": previous_status_id,
        "new_status_id": new_status_id,
        "status_changed": status_changed,
        "issue_summary": issue_lines,
    }

    insert_wms_order_event(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order.id),
        operator_user_id=operator_user_id,
        event_type=EVT_WMS_VALIDATION_FAILED,
        metadata=meta,
    )
    append_order_activity_for_wms(
        db,
        order_id=int(order.id),
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        event_type=EVT_WMS_VALIDATION_FAILED,
        message=msg,
        operator_user_id=operator_user_id,
        metadata=meta,
    )


def read_validation_state_from_order(order: Order) -> dict[str, Any]:
    """Odczyt stanu walidacji z metadata zamówienia (UI detail)."""
    meta = _order_meta(order)
    issues = meta.get(_META_ISSUES) or []
    if not isinstance(issues, list):
        issues = []
    failed_at = meta.get(_META_FAILED_AT)
    prev = meta.get(_META_PREV_UI)
    return {
        "has_failure": bool(issues) or bool(failed_at),
        "failed_at": failed_at,
        "previous_ui_status_id": prev,
        "issues": issues,
    }
