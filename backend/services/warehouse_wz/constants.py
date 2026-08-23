"""WZ settlement modes and idempotency key builders (Phase 2)."""

from __future__ import annotations

# WZ owns physical inventory decrement (direct sale / explicit issue).
SETTLEMENT_WZ_ISSUE = "WZ_ISSUE"

# Physical decrement already executed by WMS pick finalize — WZ is documentary only.
SETTLEMENT_WMS_PICK = "WMS_PICK"


def wms_pick_finalize_idempotency_key(
    *,
    tenant_id: int,
    warehouse_id: int,
    session_key: str | int,
    order_id: int,
) -> str:
    """One documentary WZ per order per pick-finalize session."""
    return f"warehouse-wz:wms-pick:{int(tenant_id)}:{int(warehouse_id)}:{session_key}:{int(order_id)}"


def direct_sale_wz_idempotency_key(*, order_id: int, sale_document_id: str) -> str:
    return f"warehouse-wz:direct-sale:{int(order_id)}:{str(sale_document_id).strip()}"
