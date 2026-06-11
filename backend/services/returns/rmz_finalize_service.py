"""Atomic RMZ finalize — lines, Z-PZ, status, refund in one transaction."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional, Sequence

from sqlalchemy.orm import Session

from ...models.wms_order_return import WmsOrderReturn
from ...models.wms_refund import WmsRefund
from ...models.wms_rmz_line import RMZLine
from ...models.wms_settings import WmsSettings
from ...schemas.wms_return import ReturnsMode, WmsRefundCreate, WmsReturnFinalizeLineIn
from ..audit_service import log_audit_entry
from ..return_status_service import get_by_transition_key, seed_default_statuses_session
from ..rmz_return_receipt_service import ensure_rmz_return_receipt_document
from .errors import RmzFinalizeError
from .rmz_line_split_service import (
    apply_rmz_line_split,
    assert_rmz_editable,
    resolve_finalize_transition_key,
    validate_rmz_lines_ready_for_finalize,
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


def _apply_refund(
    db: Session,
    row: WmsOrderReturn,
    body: WmsRefundCreate,
    settings: WmsSettings,
    mode: ReturnsMode,
) -> None:
    return_type = str(getattr(row, "return_type", "RMA") or "RMA").upper()
    if return_type == "UNCLAIMED":
        refund = db.query(WmsRefund).filter(WmsRefund.rmz_id == row.id).first()
        if not refund:
            refund = WmsRefund(
                rmz_id=row.id,
                refund_type="NONE",
                refund_amount=None,
                refund_shipping=False,
                refund_shipping_amount=None,
                decided_by=body.decided_by,
                decided_at=datetime.utcnow(),
            )
            db.add(refund)
        else:
            refund.refund_type = "NONE"
            refund.refund_amount = None
            refund.refund_shipping = False
            refund.refund_shipping_amount = None
            refund.decided_by = body.decided_by
            refund.decided_at = datetime.utcnow()
        return

    eff_refund_type = str(body.refund_type or "NONE").strip().upper()
    eff_refund_amount = body.refund_amount
    eff_refund_shipping = bool(body.refund_shipping)
    eff_refund_shipping_amount = body.refund_shipping_amount

    if not settings.enable_refund:
        if eff_refund_type != "NONE":
            raise RmzFinalizeError(
                "Refund is disabled by WMS settings — use refund_type NONE to finish receiving only."
            )
        eff_refund_type = "NONE"
        eff_refund_amount = None
        eff_refund_shipping = False
        eff_refund_shipping_amount = None

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
    """
    Single transaction: persist lines → validate → Z-PZ → status → refund → audit.
    Caller must commit() on success or rollback() on failure.
    """
    assert_rmz_editable(row)
    return_type = str(getattr(row, "return_type", "RMA") or "RMA").upper()
    mode: ReturnsMode = settings.returns_mode  # type: ignore[assignment]

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
        )

    rmz_lines = list(lines_by_oi.values())
    validate_rmz_lines_ready_for_finalize(rmz_lines, require_photos=bool(settings.require_photos))

    pz_doc = ensure_rmz_return_receipt_document(db, row)

    refund_applied = bool(process_refund and settings.enable_refund and refund is not None)
    if refund_applied:
        _apply_refund(db, row, refund, settings, mode)

    transition_key = resolve_finalize_transition_key(
        mode,
        rmz_lines,
        enable_refund=bool(settings.enable_refund),
        process_refund=refund_applied,
    )
    _apply_transition(db, row, transition_key)

    log_audit_entry(
        db,
        user_id=actor_user_id,
        action="wms.return.finalize",
        entity_type="wms_order_return",
        entity_id=int(row.id),
        detail={
            "rmz_id": int(row.id),
            "warehouse_id": int(row.warehouse_id),
            "transition": transition_key,
            "z_pz_document_id": getattr(pz_doc, "id", None) if pz_doc is not None else None,
            "process_refund": process_refund,
        },
    )

    logger.info(
        "[returns.finalize.done] return_id=%s transition=%s z_pz_id=%s",
        row.id,
        transition_key,
        getattr(pz_doc, "id", None) if pz_doc is not None else None,
    )
    return row
