"""WZ settlement modes, fulfillment keys, and idempotency builders (Phase 2)."""

from __future__ import annotations

# WZ owns physical inventory decrement (direct sale / explicit issue).
SETTLEMENT_WZ_ISSUE = "WZ_ISSUE"

# Physical decrement already executed by WMS pick finalize — WZ is documentary only.
SETTLEMENT_WMS_PICK = "WMS_PICK"

FULFILLMENT_KIND_CART = "cart"
FULFILLMENT_KIND_CARTLESS = "cartless"
FULFILLMENT_KIND_RECOVERY = "recovery"


def build_fulfillment_key(*, kind: str, session_id: str | int) -> str:
    """Canonical fulfillment identifier shared across cart / cartless / recovery."""
    k = str(kind or "").strip().lower()
    sid = str(session_id).strip()
    if not k or not sid:
        raise ValueError("fulfillment kind and session_id are required")
    return f"{k}:{sid}"


def wms_pick_idempotency_key(
    *,
    tenant_id: int,
    warehouse_id: int,
    fulfillment_key: str,
    order_id: int,
) -> str:
    return (
        f"warehouse-wz:wms-pick:{int(tenant_id)}:{int(warehouse_id)}:"
        f"{str(fulfillment_key).strip()}:{int(order_id)}"
    )


def direct_sale_wz_idempotency_key(*, order_id: int, sale_document_id: str) -> str:
    return f"warehouse-wz:direct-sale:{int(order_id)}:{str(sale_document_id).strip()}"
