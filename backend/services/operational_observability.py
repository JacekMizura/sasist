"""Structured observability for operational sales + WMS eligibility."""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


def _dump(fields: dict[str, Any]) -> str:
    clean = {k: v for k, v in fields.items() if v is not None}
    try:
        return json.dumps(clean, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        return str(clean)


def log_wms_eligibility(
    *,
    queue_name: str,
    tenant_id: int | None,
    warehouse_id: int | None,
    exclusion_active: bool,
    clause_count: int,
    features: dict[str, Any] | None = None,
    order_id: int | None = None,
    raw_fulfillment_mode: str | None = None,
    resolved_fulfillment_mode: str | None = None,
    eligible: bool | None = None,
) -> None:
    logger.info(
        "[wms.eligibility] %s",
        _dump(
            {
                "queue": queue_name,
                "tenant_id": tenant_id,
                "warehouse_id": warehouse_id,
                "exclusion_active": exclusion_active,
                "clause_count": clause_count,
                "order_id": order_id,
                "fulfillment_mode": raw_fulfillment_mode,
                "resolved_mode": resolved_fulfillment_mode,
                "eligible": eligible,
                "features": features,
            }
        ),
    )


def log_order_operational_mode(
    *,
    order_id: int | None,
    tenant_id: int | None,
    raw_order_channel: str | None,
    raw_fulfillment_mode: str | None,
    resolved_order_channel: str,
    resolved_fulfillment_mode: str,
    is_legacy: bool,
) -> None:
    logger.debug(
        "[order.operational-mode] %s",
        _dump(
            {
                "order_id": order_id,
                "tenant_id": tenant_id,
                "order_channel": raw_order_channel,
                "fulfillment_mode": raw_fulfillment_mode,
                "resolved_channel": resolved_order_channel,
                "resolved_mode": resolved_fulfillment_mode,
                "is_legacy": is_legacy,
            }
        ),
    )


def log_reservation_lifecycle(
    *,
    action: str,
    reservation_id: int | None = None,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
    order_id: int | None = None,
    session_id: int | None = None,
    product_id: int | None = None,
    qty: float | None = None,
    reason: str | None = None,
) -> None:
    logger.info(
        "[reservation.lifecycle] %s",
        _dump(
            {
                "action": action,
                "reservation_id": reservation_id,
                "tenant_id": tenant_id,
                "warehouse_id": warehouse_id,
                "order_id": order_id,
                "session_id": session_id,
                "product_id": product_id,
                "qty": qty,
                "reason": reason,
            }
        ),
    )


def log_document_pipeline(
    *,
    action: str,
    job_id: int | None = None,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
    order_id: int | None = None,
    session_id: int | None = None,
    status: str | None = None,
    series_id: str | None = None,
    document_number: str | None = None,
    fiscal_ref: str | None = None,
    error: str | None = None,
) -> None:
    logger.info(
        "[document.pipeline] %s",
        _dump(
            {
                "action": action,
                "job_id": job_id,
                "tenant_id": tenant_id,
                "warehouse_id": warehouse_id,
                "order_id": order_id,
                "session_id": session_id,
                "status": status,
                "series_id": series_id,
                "document_number": document_number,
                "fiscal_ref": fiscal_ref,
                "error": error,
            }
        ),
    )


def log_pickup_flow(
    *,
    action: str,
    order_id: int | None = None,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
    task_id: int | None = None,
    zone_id: int | None = None,
    operator_id: int | None = None,
    workstation_id: int | None = None,
) -> None:
    logger.info(
        "[pickup.flow] %s",
        _dump(
            {
                "action": action,
                "order_id": order_id,
                "tenant_id": tenant_id,
                "warehouse_id": warehouse_id,
                "task_id": task_id,
                "zone_id": zone_id,
                "operator_id": operator_id,
                "workstation_id": workstation_id,
            }
        ),
    )


def log_payment_orchestration(
    *,
    action: str,
    payment_id: int | None = None,
    order_id: int | None = None,
    session_id: int | None = None,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
    amount: float | None = None,
    provider: str | None = None,
    method: str | None = None,
    settlement_state: str | None = None,
    operator_id: int | None = None,
    workstation_id: int | None = None,
) -> None:
    logger.info(
        "[payment.orchestration] %s",
        _dump(
            {
                "action": action,
                "payment_id": payment_id,
                "order_id": order_id,
                "session_id": session_id,
                "tenant_id": tenant_id,
                "warehouse_id": warehouse_id,
                "amount": amount,
                "provider": provider,
                "method": method,
                "settlement_state": settlement_state,
                "operator_id": operator_id,
                "workstation_id": workstation_id,
            }
        ),
    )


def log_direct_sale_complete(
    *,
    session_id: int,
    order_id: int | None,
    tenant_id: int,
    warehouse_id: int,
    payment_id: int | None = None,
    total_amount: float | None = None,
    status: str = "ok",
    error: str | None = None,
    features: dict[str, Any] | None = None,
) -> None:
    logger.info(
        "[direct-sales.complete] %s",
        _dump(
            {
                "session_id": session_id,
                "order_id": order_id,
                "tenant_id": tenant_id,
                "warehouse_id": warehouse_id,
                "payment_id": payment_id,
                "total_amount": total_amount,
                "status": status,
                "error": error,
                "features": features,
            }
        ),
    )
