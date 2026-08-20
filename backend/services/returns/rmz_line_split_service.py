"""Persist RMZ line split decisions (shared by split-process and atomic finalize)."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import List, Optional, Sequence

from sqlalchemy.orm import Session

from ...models.wms_order_return import WmsOrderReturn
from ...models.wms_rmz_line import RMZLine
from ...models.wms_settings import WmsSettings
from ...schemas.wms_return import WmsReturnLineSplitProcess
from .errors import RmzFinalizeError
from .rmz_workflow_config_service import RmzLineValidationSettings

logger = logging.getLogger(__name__)

_TERMINAL_STATUS_TYPES = frozenset({"done_success", "done_rejected"})
_WAREHOUSE_LOCKED_TRANSITION_KEYS = frozenset({"office_pending"})


def assert_rmz_warehouse_content_editable(row: WmsOrderReturn) -> None:
    if getattr(row, "warehouse_document_id", None):
        raise RmzFinalizeError("Warehouse commit completed — line edits are locked")
    rs = getattr(row, "return_status", None)
    if rs is not None:
        tkey = getattr(rs, "transition_key", None)
        if tkey in _WAREHOUSE_LOCKED_TRANSITION_KEYS:
            raise RmzFinalizeError("Awaiting office refund — warehouse edits are locked")
        if getattr(rs, "type", None) in _TERMINAL_STATUS_TYPES:
            raise RmzFinalizeError("Return is already finished")


def assert_rmz_editable(row: WmsOrderReturn) -> None:
    """Warehouse line/qty edits — not office refund."""
    assert_rmz_warehouse_content_editable(row)


def assert_rmz_refundable(row: WmsOrderReturn, *, allow_legacy_qc_complete: bool = True) -> None:
    rs = getattr(row, "return_status", None)
    if rs is None:
        raise RmzFinalizeError("Return status missing")
    tkey = getattr(rs, "transition_key", None)
    allowed = {"office_pending"}
    if allow_legacy_qc_complete:
        allowed.add("qc_complete")
    if tkey not in allowed:
        raise RmzFinalizeError(f"Refund allowed only in stage office_pending (current: {tkey})")
    if getattr(rs, "type", None) in _TERMINAL_STATUS_TYPES:
        raise RmzFinalizeError("Return is already finished")
    if not getattr(row, "warehouse_document_id", None):
        raise RmzFinalizeError("Warehouse commit required before office refund")


def assert_rmz_warehouse_not_yet_committed(row: WmsOrderReturn) -> None:
    """Block duplicate warehouse commit."""
    if getattr(row, "warehouse_document_id", None):
        raise RmzFinalizeError("Warehouse commit already completed for this return")
    rs = getattr(row, "return_status", None)
    tkey = getattr(rs, "transition_key", None) if rs is not None else None
    if tkey in _WAREHOUSE_LOCKED_TRANSITION_KEYS:
        raise RmzFinalizeError("Warehouse stage already completed — awaiting office refund")
    if rs is not None and getattr(rs, "type", None) in _TERMINAL_STATUS_TYPES:
        raise RmzFinalizeError("Return is already finished")


def parse_damage_entries_raw(raw: object) -> List[dict]:
    if raw is None:
        return []
    s = str(raw).strip()
    if not s or s.lower() in ("null", "none", "[]"):
        return []
    try:
        data = json.loads(s)
    except Exception:
        return []
    return [x for x in data if isinstance(x, dict)] if isinstance(data, list) else []


def rmz_line_has_damage_photos(ln: RMZLine) -> bool:
    parsed = parse_damage_entries_raw(getattr(ln, "damage_entries_json", None))
    if parsed:
        for ent in parsed:
            urls = ent.get("photo_urls") or []
            if any(str(u).strip() for u in urls):
                return True
    raw_photos = getattr(ln, "photo_urls", None)
    if raw_photos:
        try:
            pl = json.loads(str(raw_photos))
            if isinstance(pl, list) and any(str(u).strip() for u in pl):
                return True
        except Exception:
            pass
    return False


def validate_rmz_lines_ready_for_finalize(
    rmz_lines: Sequence[RMZLine],
    *,
    require_photos: bool,
    require_condition: bool = False,
) -> None:
    if not rmz_lines:
        raise RmzFinalizeError("Return has no lines")
    if not all(ln.decision is not None for ln in rmz_lines):
        raise RmzFinalizeError("All return lines must be decided before finalize")

    for ln in rmz_lines:
        total = int(float(ln.quantity or 0))
        if total <= 0:
            continue
        acc = int(ln.accepted_qty or 0)
        dbq = int(ln.damaged_b_qty or 0)
        dcq = int(ln.damaged_c_qty or 0)
        rej = int(ln.rejected_qty or 0)
        dmg = dbq + dcq
        resolved = acc + dmg + rej
        if resolved < total:
            raise RmzFinalizeError(
                f"Line order_item_id={ln.order_item_id} is not fully resolved ({resolved}/{total})"
            )
        if dmg > 0 and dbq + dcq != dmg:
            raise RmzFinalizeError(
                f"Line order_item_id={ln.order_item_id}: damaged_b_qty + damaged_c_qty must equal damaged units"
            )
        if dmg > 0 or ln.decision == "DAMAGED":
            parsed = parse_damage_entries_raw(getattr(ln, "damage_entries_json", None))
            if parsed:
                for ent in parsed:
                    cond = ent.get("condition")
                    if cond not in ("B", "C"):
                        raise RmzFinalizeError(
                            f"Line order_item_id={ln.order_item_id}: each damage entry requires condition B or C"
                        )
            if require_photos and not rmz_line_has_damage_photos(ln):
                raise RmzFinalizeError(
                    f"Line order_item_id={ln.order_item_id}: at least one damage photo is required"
                )
            if require_condition and dmg > 0:
                cond = getattr(ln, "condition", None)
                if cond not in ("B", "C"):
                    raise RmzFinalizeError(
                        f"Line order_item_id={ln.order_item_id}: damage condition B or C is required"
                    )


def apply_rmz_line_split(
    db: Session,
    row: WmsOrderReturn,
    rmz_line: RMZLine,
    body: WmsReturnLineSplitProcess,
    *,
    settings: WmsSettings,
    return_type: str,
    validate_photos: bool = False,
    line_validation: RmzLineValidationSettings | None = None,
) -> None:
    """Apply split-process payload to RMZ line (no commit)."""
    req_photos = line_validation.require_photos if line_validation else bool(settings.require_photos)
    req_condition = line_validation.require_condition if line_validation else bool(settings.require_condition)
    if int(rmz_line.product_id) != int(body.product_id):
        raise RmzFinalizeError("Product mismatch for return line")

    total_qty = int(rmz_line.quantity or 0)
    accepted_qty = int(body.accepted_qty)
    rejected_qty = int(body.rejected_qty)
    entry_rows = list(body.damage_entries or [])
    use_entries = len(entry_rows) > 0

    if use_entries:
        ids_seen = set()
        for e in entry_rows:
            if e.id in ids_seen:
                raise RmzFinalizeError("duplicate damage entry id in request")
            ids_seen.add(e.id)
            if int(e.qty) != 1:
                raise RmzFinalizeError(
                    "Each damage entry must represent exactly one physical unit (qty must be 1)."
                )
        damaged_qty = sum(int(e.qty) for e in entry_rows)
        damaged_b_qty = sum(int(e.qty) for e in entry_rows if e.condition == "B")
        damaged_c_qty = sum(int(e.qty) for e in entry_rows if e.condition == "C")
        resolved_sum = accepted_qty + damaged_qty + rejected_qty
        if resolved_sum > total_qty:
            raise RmzFinalizeError(
                "accepted_qty + sum(damage_entries.qty) + rejected_qty cannot exceed line quantity"
            )
        if resolved_sum < 1:
            raise RmzFinalizeError("At least one unit must be resolved before saving split-process payload")
    else:
        damaged_qty = int(body.damaged_qty)
        damaged_b_qty = int(body.damaged_b_qty)
        damaged_c_qty = int(body.damaged_c_qty)
        resolved_sum = accepted_qty + damaged_qty + rejected_qty
        if resolved_sum > total_qty:
            raise RmzFinalizeError(
                "accepted_qty + damaged_qty + rejected_qty cannot exceed line quantity"
            )
        if resolved_sum < 1:
            raise RmzFinalizeError("At least one unit must be resolved before saving split-process payload")
        if damaged_b_qty + damaged_c_qty != damaged_qty:
            raise RmzFinalizeError("damaged_b_qty + damaged_c_qty must equal damaged_qty")

    if return_type == "UNCLAIMED" and rejected_qty > 0:
        raise RmzFinalizeError("UNCLAIMED return does not allow rejected_qty > 0")

    if use_entries:
        if validate_photos and req_photos:
            for e in entry_rows:
                if not [u for u in (e.photo_urls or []) if str(u).strip()]:
                    raise RmzFinalizeError(
                        "At least one photo_url is required for each damage entry (photo_urls)"
                    )
        serializable = []
        for e in entry_rows:
            created_at_out = (
                e.created_at.astimezone(timezone.utc).isoformat()
                if e.created_at is not None
                else datetime.now(timezone.utc).isoformat()
            )
            row_d: dict = {
                "id": e.id,
                "qty": int(e.qty),
                "condition": e.condition,
                "damage_type": (str(e.damage_type).strip() if e.damage_type else None) or None,
                "photo_urls": [str(u).strip() for u in (e.photo_urls or []) if str(u).strip()],
                "note": (str(e.note).strip() if e.note else None) or None,
                "operator_name": (str(e.operator_name).strip() if e.operator_name else None) or None,
                "created_at": created_at_out,
            }
            if getattr(e, "stock_document_id", None):
                row_d["stock_document_id"] = int(e.stock_document_id)  # type: ignore[arg-type]
            if getattr(e, "stock_document_line_id", None):
                row_d["stock_document_line_id"] = int(e.stock_document_line_id)  # type: ignore[arg-type]
            if getattr(e, "disposition", None):
                row_d["disposition"] = str(e.disposition).strip()[:48]
            if getattr(e, "location_id", None):
                row_d["location_id"] = int(e.location_id)  # type: ignore[arg-type]
            if getattr(e, "putaway_status", None):
                row_d["putaway_status"] = str(e.putaway_status).strip()[:32]
            if getattr(e, "putaway_completed_at", None):
                pca = e.putaway_completed_at
                row_d["putaway_completed_at"] = (
                    pca.astimezone(timezone.utc).isoformat()
                    if isinstance(pca, datetime) and pca.tzinfo is not None
                    else (pca.isoformat() if isinstance(pca, datetime) else str(pca))
                )
            if e.final_disposition:
                row_d["final_disposition"] = e.final_disposition
            serializable.append(row_d)
        rmz_line.damage_entries_json = json.dumps(serializable, ensure_ascii=False)
        rmz_line.photo_urls = None
        rmz_line.damage_type = None
        if damaged_qty > 0:
            rmz_line.condition = "C" if damaged_c_qty > 0 and damaged_b_qty == 0 else "B"
        elif accepted_qty > 0:
            rmz_line.condition = "A"
        else:
            rmz_line.condition = None
    else:
        condition = body.condition
        photo_urls = body.photo_urls or []
        if damaged_qty > 0:
            if req_condition and not condition:
                raise RmzFinalizeError("condition is required for DAMAGED")
            if validate_photos and req_photos and not photo_urls:
                raise RmzFinalizeError("At least one photo_url is required (photo_urls)")

        if damaged_qty > 0:
            if condition is not None:
                rmz_line.condition = condition
            rmz_line.photo_urls = (
                json.dumps(list(photo_urls), ensure_ascii=False) if photo_urls else None
            )
        else:
            rmz_line.photo_urls = None
            if accepted_qty > 0:
                rmz_line.condition = "A"
            else:
                rmz_line.condition = None
        rmz_line.damage_entries_json = None

    complete_line = resolved_sum >= total_qty

    rmz_line.accepted_qty = accepted_qty
    rmz_line.damaged_b_qty = damaged_b_qty
    rmz_line.damaged_c_qty = damaged_c_qty
    rmz_line.rejected_qty = rejected_qty

    dt_raw = str(body.damage_type).strip() if body.damage_type else ""
    if dt_raw:
        rmz_line.damage_type = dt_raw[:512]
    else:
        rmz_line.damage_type = None

    if complete_line:
        if rejected_qty == total_qty:
            rmz_line.decision = "REJECTED"
        elif damaged_qty > 0:
            rmz_line.decision = "DAMAGED"
        else:
            rmz_line.decision = "OK"
        if rejected_qty > 0:
            rmz_line.final_disposition = "RETURN_TO_CUSTOMER"
        elif damaged_c_qty > 0:
            rmz_line.final_disposition = "REPAIR"
        elif damaged_b_qty > 0:
            rmz_line.final_disposition = "OUTLET"
        elif accepted_qty > 0:
            rmz_line.final_disposition = "RESTOCK"
        rmz_line.processed_at = datetime.utcnow()
    else:
        rmz_line.decision = None
        rmz_line.final_disposition = None
        rmz_line.processed_at = None

    # Manufacturing component recovery — independent of commercial REJECTED.
    # Bundle parent / existing bundle component returns take precedence (skip mfg recovery).
    from ...models.order_item import OrderItem
    from ..bundles.bundle_return_service import bundle_component_returns_for_line
    from .manufactured_component_recovery_service import apply_manufacturing_recovery_to_line

    oi = db.query(OrderItem).filter(OrderItem.id == int(rmz_line.order_item_id)).first()
    is_bundle = bool(oi and getattr(oi, "is_bundle_parent", False))
    if not is_bundle:
        is_bundle = bool(bundle_component_returns_for_line(db, int(rmz_line.id)))
    recovery_payload = [
        {
            "composition_line_id": int(r.composition_line_id),
            "component_product_id": getattr(r, "component_product_id", None),
            "accepted_qty": float(r.accepted_qty),
            "scrap_qty": float(r.scrap_qty),
        }
        for r in (body.component_recoveries or [])
    ]
    apply_manufacturing_recovery_to_line(
        db,
        tenant_id=int(row.tenant_id),
        rmz_line=rmz_line,
        settings=settings,
        is_bundle_line=is_bundle,
        stock_intake_mode=getattr(body, "stock_intake_mode", None),
        fg_intake_qty=getattr(body, "fg_intake_qty", None),
        disassembly_qty=getattr(body, "disassembly_qty", None),
        component_recoveries=recovery_payload if recovery_payload else None,
        require_decision=bool(complete_line),
    )

    db.flush()
