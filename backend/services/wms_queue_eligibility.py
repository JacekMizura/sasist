"""
Central WMS queue eligibility — THE ONLY place for fulfillment_mode queue filters.

Legacy NULL/empty fulfillment_mode → WMS-eligible (permanent architecture).
Use OperationalFeaturesContext — never read env flags ad-hoc in services.
"""

from __future__ import annotations

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..models.order import Order
from ..schemas.commerce_enums import WMS_ELIGIBLE_FULFILLMENT_MODES
from .operational_features_context import (
    OperationalFeaturesContext,
    resolve_operational_features_context,
)
from .operational_observability import log_wms_eligibility
from .order_operational_mode import resolve_order_operational_mode


def order_eligible_for_wms_queues(
    order: Order,
    *,
    features: OperationalFeaturesContext | None = None,
    db: Session | None = None,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
    queue_name: str = "in_memory",
) -> bool:
    ctx = resolve_operational_features_context(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, features=features
    )
    mode = resolve_order_operational_mode(order)
    if not ctx.immediate_wms_exclusion_active:
        eligible = True
    else:
        eligible = mode.fulfillment_mode in WMS_ELIGIBLE_FULFILLMENT_MODES
    log_wms_eligibility(
        queue_name=queue_name,
        tenant_id=ctx.tenant_id,
        warehouse_id=ctx.warehouse_id,
        exclusion_active=ctx.immediate_wms_exclusion_active,
        clause_count=1 if ctx.immediate_wms_exclusion_active else 0,
        features=ctx.as_log_dict(),
        order_id=int(getattr(order, "id", 0) or 0) or None,
        raw_fulfillment_mode=mode.raw_fulfillment_mode,
        resolved_fulfillment_mode=mode.fulfillment_mode,
        eligible=eligible,
    )
    return eligible


def wms_queue_fulfillment_mode_clauses(
    *,
    features: OperationalFeaturesContext | None = None,
    db: Session | None = None,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
    queue_name: str = "sql",
):
    """
    SQLAlchemy filters for WMS pick/pack queues.

    Returns empty tuple when exclusion inactive (classic WMS unchanged).
    NEVER use ``WHERE fulfillment_mode = 'WMS'`` alone.
    """
    ctx = resolve_operational_features_context(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, features=features
    )
    if not ctx.immediate_wms_exclusion_active:
        log_wms_eligibility(
            queue_name=queue_name,
            tenant_id=ctx.tenant_id,
            warehouse_id=ctx.warehouse_id,
            exclusion_active=False,
            clause_count=0,
            features=ctx.as_log_dict(),
        )
        return ()
    log_wms_eligibility(
        queue_name=queue_name,
        tenant_id=ctx.tenant_id,
        warehouse_id=ctx.warehouse_id,
        exclusion_active=True,
        clause_count=1,
        features=ctx.as_log_dict(),
    )
    return (
        or_(
            Order.fulfillment_mode.is_(None),
            func.trim(Order.fulfillment_mode) == "",
            func.upper(func.trim(Order.fulfillment_mode)).in_(tuple(WMS_ELIGIBLE_FULFILLMENT_MODES)),
        ),
    )
