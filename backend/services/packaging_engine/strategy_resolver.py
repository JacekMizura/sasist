"""
Packaging strategy SSOT (Phase 3).

SmartResult | None + ThreeDResult | None → StrategyResolver → final primary carton.

Strategies:
  SMART_ONLY              — Smart v2 only; no automatic carton if absent/conflict
  THREE_D_ONLY            — ignore Smart; use 3D fit
  SMART_THEN_3D           — Smart if unambiguous; else 3D (DEFAULT)
  THREE_D_OVERRIDE_SMART  — valid 3D fit wins over Smart candidate

No soft merge of Smart bonus into 3D score as the primary resolver.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from .smart_matching_v2.constants import DEFAULT_PACKAGING_STRATEGY, PACKAGING_STRATEGIES
from .suggestions import PackagingSuggestionDraft


@dataclass(frozen=True)
class SmartResult:
    """Single unambiguous Smart suggestion, or empty/ambiguous."""

    draft: Optional[PackagingSuggestionDraft] = None
    ambiguous: bool = False
    reason: str = ""


@dataclass
class ThreeDResult:
    """3D engine output; packages[] reserved for multi-package persistence (Phase 5)."""

    primary: Optional[PackagingSuggestionDraft] = None
    alternatives: list[PackagingSuggestionDraft] = field(default_factory=list)
    packages: list[dict] = field(default_factory=list)  # future: [{carton_id, items}]
    fits: bool = False


@dataclass
class StrategyOutcome:
    primary: Optional[PackagingSuggestionDraft]
    alternatives: list[PackagingSuggestionDraft]
    strategy: str
    smart: SmartResult
    three_d: ThreeDResult
    source: str  # SMART | THREE_D | NONE


def _is_reject(d: PackagingSuggestionDraft) -> bool:
    return "Odrzucony:" in (d.reason or "")


def smart_result_from_drafts(
    drafts: list[PackagingSuggestionDraft], *, ambiguous: bool = False
) -> SmartResult:
    if ambiguous:
        return SmartResult(draft=None, ambiguous=True, reason="AMBIGUOUS")
    usable = [d for d in drafts if not _is_reject(d)]
    if not usable:
        return SmartResult(draft=None, ambiguous=False, reason="NO_SMART")
    usable.sort(
        key=lambda d: (-float(d.confidence_score), -float(d.sort_key), str(d.suggested_package_id))
    )
    return SmartResult(draft=usable[0], ambiguous=False, reason="OK")


def three_d_result_from_drafts(
    drafts: list[PackagingSuggestionDraft],
    *,
    fits: bool = False,
    packages: Optional[list[dict]] = None,
) -> ThreeDResult:
    usable = [d for d in drafts if not _is_reject(d)]
    rejects = [d for d in drafts if _is_reject(d)]
    usable.sort(
        key=lambda d: (-float(d.sort_key), -float(d.confidence_score), str(d.suggested_package_id))
    )
    primary = usable[0] if usable else None
    alts = usable[1:5] + rejects[:3]
    return ThreeDResult(
        primary=primary,
        alternatives=alts,
        packages=list(packages or []),
        fits=bool(fits) or primary is not None,
    )


def normalize_strategy(raw: Optional[str]) -> str:
    s = str(raw or DEFAULT_PACKAGING_STRATEGY).strip().upper()
    return s if s in PACKAGING_STRATEGIES else DEFAULT_PACKAGING_STRATEGY


def resolve_packaging_strategy(
    strategy: Optional[str],
    *,
    smart: SmartResult,
    three_d: ThreeDResult,
) -> StrategyOutcome:
    """
    Pure strategy resolution — no DB. Callers supply already-filtered engine results.
    """
    st = normalize_strategy(strategy)

    def _none(src: str = "NONE") -> StrategyOutcome:
        return StrategyOutcome(
            primary=None,
            alternatives=list(three_d.alternatives)[:4],
            strategy=st,
            smart=smart,
            three_d=three_d,
            source=src,
        )

    if st == "SMART_ONLY":
        if smart.ambiguous or smart.draft is None:
            return _none("NONE")
        return StrategyOutcome(
            primary=smart.draft,
            alternatives=list(three_d.alternatives)[:4],
            strategy=st,
            smart=smart,
            three_d=three_d,
            source="SMART",
        )

    if st == "THREE_D_ONLY":
        if three_d.primary is None:
            return _none("NONE")
        return StrategyOutcome(
            primary=three_d.primary,
            alternatives=list(three_d.alternatives)[:4],
            strategy=st,
            smart=smart,
            three_d=three_d,
            source="THREE_D",
        )

    if st == "THREE_D_OVERRIDE_SMART":
        if three_d.primary is not None and three_d.fits:
            return StrategyOutcome(
                primary=three_d.primary,
                alternatives=_alts_with_smart(three_d, smart),
                strategy=st,
                smart=smart,
                three_d=three_d,
                source="THREE_D",
            )
        if smart.draft is not None and not smart.ambiguous:
            return StrategyOutcome(
                primary=smart.draft,
                alternatives=list(three_d.alternatives)[:4],
                strategy=st,
                smart=smart,
                three_d=three_d,
                source="SMART",
            )
        return _none("NONE")

    # SMART_THEN_3D (default)
    if smart.draft is not None and not smart.ambiguous:
        return StrategyOutcome(
            primary=smart.draft,
            alternatives=list(three_d.alternatives)[:4],
            strategy=st,
            smart=smart,
            three_d=three_d,
            source="SMART",
        )
    if three_d.primary is not None:
        return StrategyOutcome(
            primary=three_d.primary,
            alternatives=list(three_d.alternatives)[:4],
            strategy=st,
            smart=smart,
            three_d=three_d,
            source="THREE_D",
        )
    return _none("NONE")


def _alts_with_smart(three_d: ThreeDResult, smart: SmartResult) -> list[PackagingSuggestionDraft]:
    alts = list(three_d.alternatives)[:4]
    if smart.draft is not None and not smart.ambiguous:
        sid = str(smart.draft.suggested_package_id)
        if three_d.primary is None or sid != str(three_d.primary.suggested_package_id):
            if all(str(a.suggested_package_id) != sid for a in alts):
                alts = [smart.draft] + alts
                alts = alts[:4]
    return alts
