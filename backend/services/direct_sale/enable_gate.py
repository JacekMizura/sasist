"""Business ON/OFF for direct sales (tenant/warehouse settings + rollout stamp).

Deployment / rollout remains ``operational_sales_sessions`` (router 404).
Effective enablement is resolved in ``direct_sales_settings_service`` (SSOT).
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..direct_sales_settings_service import (
    is_direct_sales_expansion_blocked,
    resolve_direct_sales_business_enabled,
)
from .errors import DirectSaleError

DIRECT_SALES_DISABLED_CODE = "direct_sales_disabled"
DIRECT_SALES_DISABLED_MESSAGE = "Sprzedaż bezpośrednia jest wyłączona w ustawieniach."
DIRECT_SALES_EXPANSION_BLOCKED_MESSAGE = (
    "Sprzedaż bezpośrednia jest wyłączona — nie można rozszerzać sesji."
)


def is_direct_sales_business_enabled(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> bool:
    return resolve_direct_sales_business_enabled(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
    )


def assert_direct_sales_business_enabled(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> None:
    """Block starting new sales work when effective enablement is OFF."""
    if is_direct_sales_business_enabled(db, tenant_id=tenant_id, warehouse_id=warehouse_id):
        return
    raise DirectSaleError(
        DIRECT_SALES_DISABLED_MESSAGE,
        code=DIRECT_SALES_DISABLED_CODE,
        http_status=403,
    )


def assert_direct_sales_expansion_allowed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> None:
    """Block expanding an existing session (scan/add/search/qty increase) when stamped OFF."""
    if not is_direct_sales_expansion_blocked(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
    ):
        return
    raise DirectSaleError(
        DIRECT_SALES_EXPANSION_BLOCKED_MESSAGE,
        code=DIRECT_SALES_DISABLED_CODE,
        http_status=403,
    )
