"""Parse inventory document strategy — result policy and operator settings."""

from __future__ import annotations

import json
from typing import Any

from ...models.inventory_count.constants import (
    RESULT_POLICY_COUNT_ONLY,
    RESULT_POLICY_REPORT_ONLY,
    RESULT_POLICY_UPDATE_STOCK,
)
from ...models.inventory_count.document import InventoryDocument

_RESULT_POLICIES = frozenset(
    {
        RESULT_POLICY_UPDATE_STOCK,
        RESULT_POLICY_COUNT_ONLY,
        RESULT_POLICY_REPORT_ONLY,
    }
)


def parse_strategy(doc: InventoryDocument) -> dict[str, Any]:
    if not doc.strategy_json:
        return {}
    try:
        data = json.loads(doc.strategy_json)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def get_result_policy(doc: InventoryDocument) -> str:
    strategy = parse_strategy(doc)
    raw = str(strategy.get("result_policy") or RESULT_POLICY_UPDATE_STOCK).strip().lower()
    if raw in _RESULT_POLICIES:
        return raw
    return RESULT_POLICY_UPDATE_STOCK


def result_policy_updates_stock(doc: InventoryDocument) -> bool:
    return get_result_policy(doc) == RESULT_POLICY_UPDATE_STOCK


def build_operator_strategy(
    *,
    count_mode: str,
    movement_policy: str,
    result_policy: str,
) -> dict[str, Any]:
    """Minimal strategy blob — no ERP-academic placeholders."""
    return {
        "result_policy": result_policy,
        "movement_policy": movement_policy,
        "blind_count": count_mode == "blind",
        "visible_quantities": count_mode == "visible",
    }
