"""Validate direct-sale discounts against tenant/warehouse settings."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..direct_sales_settings_service import resolve_direct_sales_settings
from .errors import DirectSaleError


def _discount_settings(db: Session, *, tenant_id: int, warehouse_id: int):
    settings = resolve_direct_sales_settings(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    return settings.resolved.discounts


def validate_line_discount(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    discount_type: str | None,
    discount_value: float,
) -> None:
    dt = str(discount_type or "").strip().lower()
    val = float(discount_value or 0)
    if not dt or val <= 1e-9:
        return

    cfg = _discount_settings(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    if not cfg.allow_line_discounts:
        raise DirectSaleError("Rabaty pozycji są wyłączone.", code="line_discounts_disabled", http_status=400)
    if dt == "percent" and val > float(cfg.max_discount_percent):
        raise DirectSaleError(
            f"Maksymalny rabat to {cfg.max_discount_percent:g}%.",
            code="discount_exceeds_max",
            http_status=400,
        )


def validate_order_discount(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    discount_type: str | None,
    discount_value: float,
) -> None:
    dt = str(discount_type or "").strip().lower()
    val = float(discount_value or 0)
    if not dt or val <= 1e-9:
        return

    cfg = _discount_settings(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    if not cfg.allow_order_discounts:
        raise DirectSaleError("Rabaty zamówienia są wyłączone.", code="order_discounts_disabled", http_status=400)
    if dt == "percent" and val > float(cfg.max_discount_percent):
        raise DirectSaleError(
            f"Maksymalny rabat to {cfg.max_discount_percent:g}%.",
            code="discount_exceeds_max",
            http_status=400,
        )
