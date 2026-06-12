"""Disposition → disposition_stock snapshot keys."""

from __future__ import annotations

from ..stock_disposition import (
    STOCK_DISPOSITION_OUTLET_B,
    STOCK_DISPOSITION_QUARANTINE,
    STOCK_DISPOSITION_REJECTED_STOCK,
    STOCK_DISPOSITION_SALEABLE,
    STOCK_DISPOSITION_SCRAP,
    STOCK_DISPOSITION_SERVICE_C,
    normalize_stock_disposition,
)

_DISPOSITION_ON_HAND_KEY: dict[str, str] = {
    STOCK_DISPOSITION_SALEABLE: "saleable_qty",
    STOCK_DISPOSITION_OUTLET_B: "outlet_qty",
    STOCK_DISPOSITION_SERVICE_C: "service_qty",
    STOCK_DISPOSITION_QUARANTINE: "quarantine_qty",
    STOCK_DISPOSITION_SCRAP: "scrap_qty",
    STOCK_DISPOSITION_REJECTED_STOCK: "rejected_qty",
}


def disposition_on_hand_key(stock_disposition: str) -> str:
    sd = normalize_stock_disposition(stock_disposition)
    key = _DISPOSITION_ON_HAND_KEY.get(sd)
    if key:
        return key
    if sd == STOCK_DISPOSITION_SALEABLE:
        return "saleable_qty"
    return "other_qty"
