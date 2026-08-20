"""Warehouse commit + office refund — single RMZ workflow (snapshot-driven)."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional, Sequence

from sqlalchemy.orm import Session

from ...models.wms_order_return import WmsOrderReturn
from ...models.wms_refund import WmsRefund
from ...models.wms_rmz_line import RMZLine
from ...models.wms_settings import WmsSettings
from ...schemas.wms_return import WmsRefundCreate, WmsReturnFinalizeLineIn
from ..audit_service import log_audit_entry
from ..return_status_service import get_by_transition_key, seed_default_statuses_session
from ..rmz_return_receipt_service import ensure_required_rmz_return_receipt_document
from .errors import RmzFinalizeError
from .rmz_line_split_service import (
    apply_rmz_line_split,
    assert_rmz_refundable,
    assert_rmz_warehouse_not_yet_committed,
    validate_rmz_lines_ready_for_finalize,
)
from .rmz_workflow_config_service import (
    RmzWorkflowSnapshot,
    ensure_rmz_workflow_snapshot,
    line_validation_settings,
    resolve_warehouse_commit_transition,
    validate_warehouse_commit_refund_payload,
)

logger = logging.getLogger(__name__)


def _apply_transition(db: Session, row: WmsOrderReturn, transition_key: str) -> None:
    st = get_by_transition_key(db, row.tenant_id, row.warehouse_id, transition_key)
    if st is None:
        seed_default_statuses_session(db, row.tenant_id, row.warehouse_id)
        st = get_by_transition_key(db, row.tenant_id, row.warehouse_id, transition_key)
    if st is None:
        raise RmzFinalizeError(
            f"Return status '{transition_key}' missing; run migrations",
            status_code=500,
        )
    row.status_id = st.id


def _normalize_refund_payload(body: WmsRefundCreate) -> tuple[str, Optional[float], bool, Optional[float]]:
    eff_refund_type = str(body.refund_type or "NONE").strip().upper()
    eff_refund_amount = body.refund_amount
    eff_refund_shipping = bool(body.refund_shipping)
    eff_refund_shipping_amount = body.refund_shipping_amount

    if eff_refund_type != "NONE":
        if eff_refund_amount is None:
            raise RmzFinalizeError("refund_amount is required for refund_type != NONE")
    else:
        eff_refund_amount = None

    if not eff_refund_shipping:
        eff_refund_shipping_amount = None
    elif eff_refund_shipping_amount is not None:
        try:
            eff_refund_shipping_amount = max(0.0, float(eff_refund_shipping_amount))
        except Exception as exc:
            raise RmzFinalizeError("refund_shipping_amount must be numeric") from exc

    return eff_refund_type, eff_refund_amount, eff_refund_shipping, eff_refund_shipping_amount


def _persist_refund(
    db: Session,
    row: WmsOrderReturn,
    body: WmsRefundCreate,
) -> None:
    eff_refund_type, eff_refund_amount, eff_refund_shipping, eff_refund_shipping_amount = _normalize_refund_payload(body)
    refund = db.query(WmsRefund).filter(WmsRefund.rmz_id == row.id).first()
    if not refund:
        refund = WmsRefund(
            rmz_id=row.id,
            refund_type=eff_refund_type,
            refund_amount=eff_refund_amount,
            refund_shipping=eff_refund_shipping,
            refund_shipping_amount=eff_refund_shipping_amount,
            decided_by=body.decided_by,
            decided_at=datetime.utcnow(),
        )
        db.add(refund)
    else:
        refund.refund_type = eff_refund_type
        refund.refund_amount = eff_refund_amount
        refund.refund_shipping = eff_refund_shipping
        refund.refund_shipping_amount = eff_refund_shipping_amount
        refund.decided_by = body.decided_by
        refund.decided_at = datetime.utcnow()


def warehouse_commit_rmz_return(
    db: Session,
    row: WmsOrderReturn,
    *,
    line_payloads: Sequence[WmsReturnFinalizeLineIn],
    settings: WmsSettings,
    snapshot: RmzWorkflowSnapshot,
    refund: Optional[WmsRefundCreate] = None,
    process_refund: bool = False,
    actor_user_id: Optional[int] = None,
) -> WmsOrderReturn:
    """Persist lines → validate → Z-PZ → optional warehouse refund → status."""
    assert_rmz_warehouse_not_yet_committed(row)
    return_type = str(getattr(row, "return_type", "RMA") or "RMA").upper()

    refund_type_in = str(getattr(refund, "refund_type", None) or "NONE").strip().upper() if refund else "NONE"
    validate_warehouse_commit_refund_payload(
        snapshot, process_refund=bool(process_refund), refund_type=refund_type_in
    )

    line_val = line_validation_settings(snapshot)
    lines_by_oi = {int(ln.order_item_id): ln for ln in db.query(RMZLine).filter(RMZLine.rmz_id == row.id).all()}
    if not lines_by_oi:
        raise RmzFinalizeError("Return has no lines")

    for item in line_payloads:
        oi_id = int(item.order_item_id)
        rmz_line = lines_by_oi.get(oi_id)
        if rmz_line is None:
            raise RmzFinalizeError(f"Return line order_item_id={oi_id} not found")
        apply_rmz_line_split(
            db,
            row,
            rmz_line,
            item,
            settings=settings,
            return_type=return_type,
            validate_photos=True,
            line_validation=line_val,
        )

    rmz_lines = list(lines_by_oi.values())
    validate_rmz_lines_ready_for_finalize(
        rmz_lines,
        require_photos=snapshot.require_photos,
        require_condition=snapshot.require_condition,
    )

    try:
        from .return_domain_activity import (
            emit_component_recoveries_from_line_state,
            emit_return_line_decision,
            emit_return_stock_intake_selected,
        )

        for ln in rmz_lines:
            if getattr(ln, "decision", None):
                emit_return_line_decision(db, rmz=row, line=ln, actor_user_id=actor_user_id)
            if getattr(ln, "stock_intake_mode", None):
                emit_return_stock_intake_selected(db, rmz=row, line=ln, actor_user_id=actor_user_id)
            emit_component_recoveries_from_line_state(
                db, rmz=row, line=ln, actor_user_id=actor_user_id
            )
    except Exception:
        logger.exception("return domain activity (line narrative) failed rmz_id=%s", row.id)

    all_rejected = all(ln.decision == "REJECTED" for ln in rmz_lines)
    pz_doc = None
    if not all_rejected:
        try:
            pz_doc = ensure_required_rmz_return_receipt_document(db, row, actor_user_id=actor_user_id)
        except ValueError as exc:
            raise RmzFinalizeError(str(exc)) from exc

    if snapshot.refund_processing == "warehouse" and process_refund and refund is not None:
        if return_type == "UNCLAIMED":
            _persist_refund(
                db,
                row,
                WmsRefundCreate(refund_type="NONE", decided_by=refund.decided_by),
            )
        else:
            _persist_refund(db, row, refund)

    transition_key = resolve_warehouse_commit_transition(snapshot, rmz_lines, all_rejected=all_rejected)

    _apply_transition(db, row, transition_key)

    log_audit_entry(
        db,
        user_id=actor_user_id,
        action="wms.return.warehouse_commit",
        entity_type="wms_order_return",
        entity_id=int(row.id),
        detail={
            "rmz_id": int(row.id),
            "warehouse_id": int(row.warehouse_id),
            "transition": transition_key,
            "z_pz_document_id": getattr(pz_doc, "id", None) if pz_doc is not None else None,
            "refund_processing": snapshot.refund_processing,
            "process_refund": process_refund,
        },
    )

    try:
        from .return_domain_activity import emit_return_finalized

        emit_return_finalized(
            db,
            rmz=row,
            actor_user_id=actor_user_id,
            transition=transition_key,
            z_pz_document_id=getattr(pz_doc, "id", None) if pz_doc is not None else None,
        )
    except Exception:
        logger.exception("return domain activity on warehouse commit failed rmz_id=%s", row.id)

    logger.info(
        "[returns.warehouse_commit.done] return_id=%s transition=%s z_pz_id=%s",
        row.id,
        transition_key,
        getattr(pz_doc, "id", None) if pz_doc is not None else None,
    )
    return row


def warehouse_commit_rmz_existing_lines(
    db: Session,
    row: WmsOrderReturn,
    *,
    settings: WmsSettings,
    snapshot: RmzWorkflowSnapshot,
    refund: Optional[WmsRefundCreate] = None,
    process_refund: bool = False,
    actor_user_id: Optional[int] = None,
) -> WmsOrderReturn:
    """Warehouse commit when lines were already persisted (commit-wms alias)."""
    assert_rmz_warehouse_not_yet_committed(row)
    return_type = str(getattr(row, "return_type", "RMA") or "RMA").upper()
    refund_type_in = str(getattr(refund, "refund_type", None) or "NONE").strip().upper() if refund else "NONE"
    validate_warehouse_commit_refund_payload(
        snapshot, process_refund=bool(process_refund), refund_type=refund_type_in
    )

    rmz_lines = db.query(RMZLine).filter(RMZLine.rmz_id == row.id).all()
    validate_rmz_lines_ready_for_finalize(
        rmz_lines,
        require_photos=snapshot.require_photos,
        require_condition=snapshot.require_condition,
    )

    all_rejected = all(ln.decision == "REJECTED" for ln in rmz_lines)
    pz_doc = None
    if not all_rejected:
        try:
            pz_doc = ensure_required_rmz_return_receipt_document(db, row, actor_user_id=actor_user_id)
        except ValueError as exc:
            raise RmzFinalizeError(str(exc)) from exc

    if snapshot.refund_processing == "warehouse" and process_refund and refund is not None:
        if return_type == "UNCLAIMED":
            _persist_refund(
                db,
                row,
                WmsRefundCreate(refund_type="NONE", decided_by=refund.decided_by),
            )
        else:
            _persist_refund(db, row, refund)

    transition_key = resolve_warehouse_commit_transition(snapshot, rmz_lines, all_rejected=all_rejected)
    _apply_transition(db, row, transition_key)

    log_audit_entry(
        db,
        user_id=actor_user_id,
        action="wms.return.warehouse_commit",
        entity_type="wms_order_return",
        entity_id=int(row.id),
        detail={
            "rmz_id": int(row.id),
            "transition": transition_key,
            "z_pz_document_id": getattr(pz_doc, "id", None) if pz_doc is not None else None,
        },
    )
    return row


def process_rmz_office_refund(
    db: Session,
    row: WmsOrderReturn,
    body: WmsRefundCreate,
    *,
    snapshot: RmzWorkflowSnapshot,
    actor_user_id: Optional[int] = None,
) -> WmsOrderReturn:
    """Office refund stage — no Z-PZ / inventory changes."""
    if snapshot.refund_processing != "office":
        raise RmzFinalizeError("Office refund is not configured for this return")
    assert_rmz_refundable(row, allow_legacy_qc_complete=True)

    return_type = str(getattr(row, "return_type", "RMA") or "RMA").upper()
    if return_type == "UNCLAIMED":
        _persist_refund(db, row, WmsRefundCreate(refund_type="NONE", decided_by=body.decided_by))
    else:
        _persist_refund(db, row, body)

    _apply_transition(db, row, "success")

    log_audit_entry(
        db,
        user_id=actor_user_id,
        action="wms.return.office_refund",
        entity_type="wms_order_return",
        entity_id=int(row.id),
        detail={"rmz_id": int(row.id), "transition": "success"},
    )
    return row


# Backward-compatible alias used by older imports/tests.
def finalize_rmz_return(
    db: Session,
    row: WmsOrderReturn,
    *,
    line_payloads: Sequence[WmsReturnFinalizeLineIn],
    settings: WmsSettings,
    refund: Optional[WmsRefundCreate] = None,
    process_refund: bool = False,
    actor_user_id: Optional[int] = None,
) -> WmsOrderReturn:
    snapshot = ensure_rmz_workflow_snapshot(db, row)
    return warehouse_commit_rmz_return(
        db,
        row,
        line_payloads=line_payloads,
        settings=settings,
        snapshot=snapshot,
        refund=refund,
        process_refund=process_refund,
        actor_user_id=actor_user_id,
    )
