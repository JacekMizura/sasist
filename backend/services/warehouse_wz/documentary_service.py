"""Thin shim — canonical logic lives in post_pick_settlement."""

from __future__ import annotations

from ...models.order import Order
from sqlalchemy.orm import Session

from .constants import FULFILLMENT_KIND_CART
from .post_pick_settlement import (
    DocumentaryWzResult,
    count_issue_operations_for_wz,
    ensure_documentary_wz_for_pick_settlement,
    load_wz_by_idempotency_key,
)

__all__ = [
    "DocumentaryWzResult",
    "count_issue_operations_for_wz",
    "create_documentary_wz_for_wms_pick_finalize",
    "load_wz_by_idempotency_key",
]


def create_documentary_wz_for_wms_pick_finalize(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    pick_ids: list[int],
    session_key: str | int,
    performed_by_user_id: int | None = None,
) -> DocumentaryWzResult | None:
    return ensure_documentary_wz_for_pick_settlement(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order=order,
        pick_ids=pick_ids,
        fulfillment_kind=FULFILLMENT_KIND_CART,
        fulfillment_session_id=session_key,
        performed_by_user_id=performed_by_user_id,
        metadata_extra={"cart_id": int(session_key) if str(session_key).isdigit() else session_key},
    )
