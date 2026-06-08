"""Tests for operator-first inventory strategy configuration."""

from __future__ import annotations

import pytest

from backend.models.inventory_count.constants import (
    MOVEMENT_POLICY_ALLOW,
    MOVEMENT_POLICY_BLOCK_ALL,
    MOVEMENT_POLICY_BLOCK_PICK,
    RESULT_POLICY_COUNT_ONLY,
    RESULT_POLICY_UPDATE_STOCK,
)
from backend.services.inventory_count.movement_policy_service import (
    movement_policy_blocks_all_movements,
    movement_policy_blocks_picking,
    movement_policy_creates_locks,
    normalize_movement_policy,
)
from backend.services.inventory_count.strategy_service import (
    build_operator_strategy,
    get_result_policy,
)


class _DocStub:
    def __init__(self, strategy_json: str | None = None, lock_mode: str = MOVEMENT_POLICY_ALLOW):
        self.strategy_json = strategy_json
        self.lock_mode = lock_mode


def test_normalize_movement_policy_legacy():
    assert normalize_movement_policy("snapshot") == MOVEMENT_POLICY_ALLOW
    assert normalize_movement_policy("soft") == MOVEMENT_POLICY_BLOCK_PICK
    assert normalize_movement_policy("hard") == MOVEMENT_POLICY_BLOCK_ALL
    assert normalize_movement_policy("block_picking") == MOVEMENT_POLICY_BLOCK_PICK


def test_movement_policy_lock_semantics():
    assert movement_policy_creates_locks(MOVEMENT_POLICY_ALLOW) is False
    assert movement_policy_creates_locks(MOVEMENT_POLICY_BLOCK_PICK) is True
    assert movement_policy_blocks_picking(MOVEMENT_POLICY_BLOCK_PICK) is True
    assert movement_policy_blocks_all_movements(MOVEMENT_POLICY_BLOCK_ALL) is True
    assert movement_policy_blocks_picking(MOVEMENT_POLICY_ALLOW) is False


def test_result_policy_from_strategy():
    import json

    doc = _DocStub(strategy_json=json.dumps({"result_policy": RESULT_POLICY_COUNT_ONLY}))
    assert get_result_policy(doc) == RESULT_POLICY_COUNT_ONLY
    assert get_result_policy(_DocStub()) == RESULT_POLICY_UPDATE_STOCK


def test_build_operator_strategy_minimal():
    strat = build_operator_strategy(
        count_mode="blind",
        movement_policy=MOVEMENT_POLICY_BLOCK_ALL,
        result_policy=RESULT_POLICY_UPDATE_STOCK,
    )
    assert strat["blind_count"] is True
    assert strat["visible_quantities"] is False
    assert strat["movement_policy"] == MOVEMENT_POLICY_BLOCK_ALL
    assert strat["result_policy"] == RESULT_POLICY_UPDATE_STOCK
    assert "confidence_scoring" not in strat
