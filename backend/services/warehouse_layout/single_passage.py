"""Hard rule: at most one enabled under-rack passage per rack.

Reject — never pick first, ignore extras, or auto-repair.
"""

from __future__ import annotations

from typing import Any, Mapping, Sequence

SINGLE_ENABLED_PASSAGE_ERROR = "Regał może posiadać tylko jeden przejazd pod regałem."


class MultipleEnabledPassagesError(ValueError):
    """Raised when more than one enabled passage is present."""

    def __init__(self, message: str = SINGLE_ENABLED_PASSAGE_ERROR) -> None:
        super().__init__(message)


def _is_enabled(raw: Any) -> bool:
    if isinstance(raw, Mapping):
        return raw.get("enabled", True) is not False
    return getattr(raw, "enabled", True) is not False


def count_enabled_passages(passages: Sequence[Any] | None) -> int:
    n = 0
    for p in passages or []:
        if p is None:
            continue
        if _is_enabled(p):
            n += 1
    return n


def has_multiple_enabled_passages(passages: Sequence[Any] | None) -> bool:
    return count_enabled_passages(passages) > 1


def assert_at_most_one_enabled_passage(passages: Sequence[Any] | None) -> None:
    """Raise MultipleEnabledPassagesError if more than one enabled passage."""
    if has_multiple_enabled_passages(passages):
        raise MultipleEnabledPassagesError()
