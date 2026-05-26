"""
Naprawa spójności liczników panelu zamówień i kolejki WMS Braki po usunięciu / archiwizacji zamówień.

Liczniki statusów są liczone na żywo z tabeli ``orders`` (brak osobnej tabeli agregatów) —
``rebuild_*`` czyści kolejkę zadań powiązaną z nieistniejącymi lub zarchiwizowanymi nagłówkami.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from .order_issue_task_service import purge_stale_open_order_issue_tasks, sync_open_issue_tasks_for_warehouse
from .order_ui_status_panel import build_order_ui_status_panel_summary


def rebuild_order_counters_and_wms_queues(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> dict[str, Any]:
    purged = purge_stale_open_order_issue_tasks(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    sync_open_issue_tasks_for_warehouse(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    panel = build_order_ui_status_panel_summary(
        db,
        int(tenant_id),
        int(warehouse_id),
        include_inactive=False,
        include_archived_orders=False,
    )
    total_assigned = sum(g.total_count for g in panel.groups)
    return {
        "purged_open_issue_tasks": purged,
        "panel_total_assigned_orders": int(total_assigned),
        "panel_unassigned_orders": int(panel.unassigned_count),
    }
