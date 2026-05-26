"""VAT rate from product.metadata_json → product_ui.vat_rate (default 23%)."""

from __future__ import annotations

import json
from typing import Any, Optional

DEFAULT_VAT_PERCENT = 23.0


def product_vat_rate_percent(metadata_json: Optional[Any]) -> float:
    if metadata_json is None:
        return DEFAULT_VAT_PERCENT
    if isinstance(metadata_json, str):
        raw = metadata_json.strip()
        if not raw:
            return DEFAULT_VAT_PERCENT
        try:
            d = json.loads(raw)
        except json.JSONDecodeError:
            return DEFAULT_VAT_PERCENT
    elif isinstance(metadata_json, dict):
        d = metadata_json
    else:
        return DEFAULT_VAT_PERCENT
    if not isinstance(d, dict):
        return DEFAULT_VAT_PERCENT
    ui = d.get("product_ui")
    if not isinstance(ui, dict):
        return DEFAULT_VAT_PERCENT
    v = ui.get("vat_rate")
    if v is None or v == "":
        return DEFAULT_VAT_PERCENT
    s = str(v).strip().replace("%", "").replace(",", ".")
    try:
        x = float(s)
        return max(0.0, x)
    except ValueError:
        return DEFAULT_VAT_PERCENT
