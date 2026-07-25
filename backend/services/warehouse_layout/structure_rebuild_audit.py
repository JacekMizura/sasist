"""
Single future entrypoint for structure-rebuild audit.

No tables / logs yet — keep all rebuild commits flowing through `record_structure_rebuild`
so history can be added without hunting call sites.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


RebuildSource = Literal["layout_save", "template_instances", "api", "unknown"]


@dataclass
class StructureRebuildAuditEvent:
    tenant_id: int
    warehouse_id: int
    source: RebuildSource
    rack_keys: list[str] = field(default_factory=list)
    removed_location_uuids: list[str] = field(default_factory=list)
    created_location_uuids: list[str] = field(default_factory=list)
    actor_user_id: int | None = None
    meta: dict[str, Any] = field(default_factory=dict)


def record_structure_rebuild(event: StructureRebuildAuditEvent) -> None:
    """
    Intentional no-op.

    Future: persist who/when/what (removed + created locations).
    Do not call ad-hoc logging from other modules — use this function only.
    """
    _ = event
    return None
