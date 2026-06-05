"""
Single resolver for order channel + fulfillment mode.

PERMANENT architecture: legacy NULL/empty columns always default to ONLINE + WMS.
Do NOT plan NOT NULL migration on order_channel / fulfillment_mode — imports, backups,
and external integrations will always produce partial rows.

All services must use this module instead of duplicating fallback logic.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..schemas.commerce_enums import DEFAULT_FULFILLMENT_MODE, DEFAULT_ORDER_CHANNEL


def _clean_upper(raw: object | None) -> str:
    if raw is None:
        return ""
    s = str(raw).strip()
    return s.upper() if s else ""


@dataclass(frozen=True)
class OrderOperationalMode:
    """Resolved operational identity for an order row."""

    order_channel: str
    fulfillment_mode: str
    raw_order_channel: str | None
    raw_fulfillment_mode: str | None
    is_legacy: bool

    @property
    def is_direct_sale(self) -> bool:
        return self.order_channel == "DIRECT_SALE"

    @property
    def is_immediate(self) -> bool:
        return self.fulfillment_mode == "IMMEDIATE"

    @property
    def is_wms_fulfillment(self) -> bool:
        return self.fulfillment_mode == "WMS"


def resolve_order_operational_mode(order: Any) -> OrderOperationalMode:
    """
    NULL / empty DB values → ONLINE + WMS (legacy-compatible).

    Does not mutate the order row.
    """
    raw_ch = getattr(order, "order_channel", None)
    raw_fm = getattr(order, "fulfillment_mode", None)
    ch_up = _clean_upper(raw_ch)
    fm_up = _clean_upper(raw_fm)
    is_legacy = not ch_up and not fm_up
    resolved = OrderOperationalMode(
        order_channel=ch_up or DEFAULT_ORDER_CHANNEL,
        fulfillment_mode=fm_up or DEFAULT_FULFILLMENT_MODE,
        raw_order_channel=str(raw_ch).strip() if raw_ch is not None and str(raw_ch).strip() else None,
        raw_fulfillment_mode=str(raw_fm).strip() if raw_fm is not None and str(raw_fm).strip() else None,
        is_legacy=is_legacy,
    )
    try:
        from .operational_observability import log_order_operational_mode

        log_order_operational_mode(
            order_id=int(getattr(order, "id", 0) or 0) or None,
            tenant_id=int(getattr(order, "tenant_id", 0) or 0) or None,
            raw_order_channel=resolved.raw_order_channel,
            raw_fulfillment_mode=resolved.raw_fulfillment_mode,
            resolved_order_channel=resolved.order_channel,
            resolved_fulfillment_mode=resolved.fulfillment_mode,
            is_legacy=resolved.is_legacy,
        )
    except Exception:
        pass
    return resolved
