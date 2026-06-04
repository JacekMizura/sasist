"""Powody utworzenia alokacji rozlokowania — tylko wybrane blokują workflow Braki."""

from __future__ import annotations

from typing import Any

RELOCATION_REASON_PICKED_ITEM_REMOVED = "PICKED_ITEM_REMOVED"
RELOCATION_REASON_REPLACEMENT_LEFTOVER = "REPLACEMENT_LEFTOVER"
RELOCATION_REASON_RECOVERY_LEFTOVER = "RECOVERY_LEFTOVER"
RELOCATION_REASON_MANUAL_PUTAWAY = "MANUAL_PUTAWAY"

RELOCATION_REASONS_ACTIVE: frozenset[str] = frozenset(
    {
        RELOCATION_REASON_PICKED_ITEM_REMOVED,
        RELOCATION_REASON_REPLACEMENT_LEFTOVER,
        RELOCATION_REASON_RECOVERY_LEFTOVER,
        RELOCATION_REASON_MANUAL_PUTAWAY,
    }
)

# Historyczny błąd: recovery finalize tworzył rozlokowanie po każdym udanym picku.
_LEGACY_INVALID_SOURCE_PREFIXES: tuple[str, ...] = (
    "recovery_finalize:",
)


def infer_relocation_reason(row: dict[str, Any]) -> str | None:
    """Rozpoznaj powód z pola ``relocation_reason`` lub ``source_event_id``."""
    explicit = (str(row.get("relocation_reason") or "")).strip().upper()
    if explicit in RELOCATION_REASONS_ACTIVE:
        return explicit

    sid = (str(row.get("source_event_id") or "")).strip()
    if not sid:
        return None
    for prefix in _LEGACY_INVALID_SOURCE_PREFIXES:
        if sid.startswith(prefix):
            return None

    low = sid.lower()
    if any(
        x in low
        for x in (
            "order_line_removed",
            "order_item_removed",
            "line_removed",
            "item_removed",
            "oms_remove",
            "manual_oms",
        )
    ):
        return RELOCATION_REASON_PICKED_ITEM_REMOVED
    if "replacement" in low or "substitute" in low or "zamienn" in low:
        return RELOCATION_REASON_REPLACEMENT_LEFTOVER
    if "recovery_leftover" in low or "waiting_supply" in low:
        return RELOCATION_REASON_RECOVERY_LEFTOVER
    if "manual_putaway" in low or "putaway" in low:
        return RELOCATION_REASON_MANUAL_PUTAWAY
    return None


def relocation_reason_is_actionable(reason: str | None) -> bool:
    return reason in RELOCATION_REASONS_ACTIVE
