"""Inventory movement policy — operator-facing lock semantics (no snapshot/soft/hard jargon)."""

from __future__ import annotations

from ...models.inventory_count.constants import (
    LOCK_MODE_HARD,
    LOCK_MODE_SNAPSHOT,
    LOCK_MODE_SOFT,
    MOVEMENT_POLICY_ALLOW,
    MOVEMENT_POLICY_BLOCK_ALL,
    MOVEMENT_POLICY_BLOCK_PICK,
)

# Legacy lock_mode values stored before redesign.
_LEGACY_TO_POLICY: dict[str, str] = {
    LOCK_MODE_SNAPSHOT: MOVEMENT_POLICY_ALLOW,
    LOCK_MODE_SOFT: MOVEMENT_POLICY_BLOCK_PICK,
    LOCK_MODE_HARD: MOVEMENT_POLICY_BLOCK_ALL,
    "snapshot": MOVEMENT_POLICY_ALLOW,
    "soft": MOVEMENT_POLICY_BLOCK_PICK,
    "hard": MOVEMENT_POLICY_BLOCK_ALL,
}

_CANONICAL = frozenset(
    {
        MOVEMENT_POLICY_ALLOW,
        MOVEMENT_POLICY_BLOCK_PICK,
        MOVEMENT_POLICY_BLOCK_ALL,
    }
)


def normalize_movement_policy(value: str | None) -> str:
    """Map stored lock_mode / movement_policy to canonical operator policy."""
    raw = str(value or MOVEMENT_POLICY_ALLOW).strip().lower()
    if raw in _CANONICAL:
        return raw
    return _LEGACY_TO_POLICY.get(raw, MOVEMENT_POLICY_ALLOW)


def movement_policy_creates_locks(policy: str | None) -> bool:
    return normalize_movement_policy(policy) != MOVEMENT_POLICY_ALLOW


def movement_policy_blocks_picking(policy: str | None) -> bool:
    p = normalize_movement_policy(policy)
    return p in (MOVEMENT_POLICY_BLOCK_PICK, MOVEMENT_POLICY_BLOCK_ALL)


def movement_policy_blocks_all_movements(policy: str | None) -> bool:
    return normalize_movement_policy(policy) == MOVEMENT_POLICY_BLOCK_ALL
