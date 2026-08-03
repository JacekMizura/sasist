"""PriorityContribution — atomic output of one PriorityPolicy."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PriorityContribution:
    """
    One policy's contribution to delivery priority.

    ``score`` is the additive amount used by the resolver (CP1: already weighted).
    ``weight`` documents the policy weight for future packs (architecture only).
    ``source`` is a stable factor key (e.g. ``phase``, ``eta``) — not Explainable UI.
    """

    score: float
    reason: str
    weight: float
    source: str
