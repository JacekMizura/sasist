"""
Archiwizacja zwrotów RMZ: usuwa linie operacyjne (RMZ + zwrot), żeby odblokować FK do zamówień;
nagłówek zostaje ze znacznikiem deleted_at (ślad audytowy).
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models.wms_order_return import WmsOrderReturn
from ..models.wms_refund import WmsRefund
from ..models.wms_rmz_line import RMZLine

logger = logging.getLogger(__name__)


def archive_wms_returns_bulk_transaction(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    id_list: list[int],
) -> dict[str, Any]:
    """Caller robi commit/rollback. Zwraca success_count = zarchiwizowane RMZ."""
    errors: list[str] = []
    messages: list[str] = []
    raw_ids: list[int] = []
    for x in id_list:
        try:
            n = int(x)
            if n > 0:
                raw_ids.append(n)
        except (TypeError, ValueError):
            continue
    if not raw_ids:
        return _empty()

    unique_ids = list(dict.fromkeys(raw_ids))
    unique_set = set(unique_ids)

    rows = list(
        db.scalars(
            select(WmsOrderReturn.id).where(
                WmsOrderReturn.tenant_id == tenant_id,
                WmsOrderReturn.warehouse_id == warehouse_id,
                WmsOrderReturn.id.in_(unique_ids),
            )
        ).all()
    )
    found_set = set(int(x) for x in rows)
    skipped_not_found = len(unique_set - found_set)
    if not found_set:
        return {**_empty(), "skipped_not_found": skipped_not_found}

    already = list(
        db.scalars(
            select(WmsOrderReturn.id).where(
                WmsOrderReturn.tenant_id == tenant_id,
                WmsOrderReturn.warehouse_id == warehouse_id,
                WmsOrderReturn.id.in_(found_set),
                WmsOrderReturn.deleted_at.isnot(None),
            )
        ).all()
    )
    already_set = set(int(x) for x in already)
    to_archive = sorted(found_set - already_set)
    skipped_archived = len(already_set)

    if not to_archive:
        out = {**_empty(), "skipped_not_found": skipped_not_found}
        if skipped_archived:
            out["messages"] = [f"Pominięto już zarchiwizowane zwroty: {skipped_archived}."]
        return out

    now = datetime.utcnow()
    try:
        db.execute(delete(WmsRefund).where(WmsRefund.rmz_id.in_(to_archive)))
        db.execute(delete(RMZLine).where(RMZLine.rmz_id.in_(to_archive)))
        db.execute(
            update(WmsOrderReturn)
            .where(
                WmsOrderReturn.tenant_id == tenant_id,
                WmsOrderReturn.warehouse_id == warehouse_id,
                WmsOrderReturn.id.in_(to_archive),
            )
            .values(deleted_at=now)
        )
        n = len(to_archive)
        messages.append(
            f"Zarchiwizowano {n} zwrotów RMZ (usunięto linie operacyjne; nagłówek pozostaje w bazie). "
            "Powiązane zamówienia można teraz usunąć, jeśli nie ma innych aktywnych zwrotów."
        )
        return {
            "success_count": 0,
            "soft_deleted_count": n,
            "blocked_count": 0,
            "blocked": [],
            "errors": errors,
            "skipped_not_found": skipped_not_found,
            "messages": messages,
            "deleted": n,
            "skipped_already_archived": skipped_archived,
        }
    except IntegrityError as e:
        logger.warning("wms return archive IntegrityError: %s", e)
        return {
            "success_count": 0,
            "soft_deleted_count": 0,
            "blocked_count": 0,
            "blocked": [],
            "errors": [f"Naruszenie klucza obcego: {getattr(e, 'orig', e)!s}"],
            "skipped_not_found": skipped_not_found,
            "messages": [],
            "deleted": 0,
            "skipped_already_archived": skipped_archived,
        }


def _empty() -> dict[str, Any]:
    return {
        "success_count": 0,
        "soft_deleted_count": 0,
        "blocked_count": 0,
        "blocked": [],
        "errors": [],
        "skipped_not_found": 0,
        "messages": [],
        "deleted": 0,
        "skipped_already_archived": 0,
    }
