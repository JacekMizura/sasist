"""PriorityPolicy protocol / base."""

from __future__ import annotations

from typing import Protocol

from .context import PriorityContext
from .contribution import PriorityContribution


class PriorityPolicy(Protocol):
    """Independent priority policy — no knowledge of other policies."""

    name: str

    def evaluate(self, ctx: PriorityContext) -> list[PriorityContribution]:
        """Return zero or more contributions for this context."""
        ...
