"""
Sasist Printer Agent MVP — resilient schema evolution (PostgreSQL + SQLite).

Tier 1 operational module: failures must not block core OMS/WMS startup.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy.engine import Engine
from sqlalchemy.schema import CreateTable

from .schema_introspection import ensure_model_schema_sync, has_table

logger = logging.getLogger(__name__)

PRINTING_SCHEMA_VERSION = "2026.07.11.3"


@dataclass(frozen=True)
class PrintingEntitySpec:
    table_name: str
    model: Any
    label: str = ""


def _printing_entity_registry() -> list[PrintingEntitySpec]:
    from ..models.printing import AgentPrinter, PrintJob, PrinterAgent, PrintingAutoSetting, PrintingDefault

    return [
        PrintingEntitySpec("printer_agents", PrinterAgent, "agent"),
        PrintingEntitySpec("agent_printers", AgentPrinter, "agent_printer"),
        PrintingEntitySpec("print_jobs", PrintJob, "print_job"),
        PrintingEntitySpec("printing_defaults", PrintingDefault, "printing_default"),
        PrintingEntitySpec("printing_auto_settings", PrintingAutoSetting, "printing_auto_setting"),
    ]


def _create_table_from_model(engine: Engine, model: Any) -> None:
    ddl = str(CreateTable(model.__table__).compile(dialect=engine.dialect))
    from sqlalchemy import text

    with engine.begin() as conn:
        conn.execute(text(ddl))
    logger.info(
        "[printing.schema] created_table table=%s dialect=%s",
        model.__tablename__,
        engine.dialect.name,
    )


def ensure_printing_schema(engine: Engine) -> int:
    """
    Create missing printing tables and sync ORM columns.

    Returns number of columns added via sync (table creates are logged separately).
    """
    added = 0
    for spec in _printing_entity_registry():
        if not has_table(engine, spec.table_name):
            try:
                _create_table_from_model(engine, spec.model)
            except Exception:
                logger.exception(
                    "[printing.schema] create_table_failed table=%s",
                    spec.table_name,
                )
                continue
        try:
            added += ensure_model_schema_sync(
                engine,
                spec.model,
                log_prefix="printing.schema.sync",
                sync_indexes=True,
            )
        except Exception:
            logger.exception(
                "[printing.schema] sync_failed table=%s",
                spec.table_name,
            )
    logger.info(
        "[printing.schema] ensure_complete version=%s columns_added=%s",
        PRINTING_SCHEMA_VERSION,
        added,
    )
    return added
