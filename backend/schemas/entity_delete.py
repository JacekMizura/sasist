"""Wspólna odpowiedź dla masowego usuwania / archiwizacji encji WMS."""

from __future__ import annotations

from typing import Any, List

from pydantic import BaseModel, Field


class EntityBulkDeleteResult(BaseModel):
    """Podsumowanie dla produktów, zwrotów RMZ itd. (bez surowego 500 przy kontrolowanych błędach)."""

    success_count: int = Field(0, description="Liczba rekordów fizycznie usuniętych z bazy")
    soft_deleted_count: int = Field(0, description="Liczba zarchiwizowanych (np. deleted_at)")
    blocked_count: int = Field(0, description="Liczba celowo zablokowanych (reguła biznesowa)")
    blocked: List[dict[str, Any]] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    skipped_not_found: int = 0
    skipped_already_archived: int = Field(0, description="Rekordy już wcześniej zarchiwizowane / pominięte")
    messages: List[str] = Field(default_factory=list, description="Komunikaty dla UI / toast")
    #: Zachowana kompatybilność z dawnym polem „deleted” (np. produkty)
    deleted: int = Field(0, description="Alias: success_count + soft_deleted_count (łącznie „usunięte z widoku”)")


def entity_bulk_delete_result_from_service_dict(d: dict) -> EntityBulkDeleteResult:
    sc = int(d.get("success_count", 0))
    sd = int(d.get("soft_deleted_count", 0))
    del_total = int(d.get("deleted", sc + sd))
    return EntityBulkDeleteResult(
        success_count=sc,
        soft_deleted_count=sd,
        blocked_count=int(d.get("blocked_count", 0)),
        blocked=list(d.get("blocked") or []),
        errors=list(d.get("errors") or []),
        skipped_not_found=int(d.get("skipped_not_found", 0)),
        skipped_already_archived=int(d.get("skipped_already_archived", 0)),
        messages=list(d.get("messages") or []),
        deleted=del_total,
    )
