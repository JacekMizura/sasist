"""
Customer CRM + analytics schema — non-destructive sync (PostgreSQL + SQLite).

Adds missing columns on ``customers`` and creates/syncs analytics + CRM-lite tables.
Never drops data or recreates ``customers``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy.engine import Engine
from sqlalchemy.schema import CreateTable

from .schema_introspection import ensure_model_schema_sync, has_table

logger = logging.getLogger(__name__)

CUSTOMER_SCHEMA_VERSION = "2026.06.08.1"


@dataclass(frozen=True)
class CustomerEntitySpec:
    table_name: str
    model: Any
    label: str = ""


def _customer_entity_registry() -> list[CustomerEntitySpec]:
    from ..models.customer import Customer, CustomerAddress, CustomerProductDiscount
    from ..models.customer_analytics import CustomerProductStats, CustomerSalesStats
    from ..models.customer_crm import CustomerCrmEvent, CustomerNote

    return [
        CustomerEntitySpec("customers", Customer, "customer"),
        CustomerEntitySpec("customer_addresses", CustomerAddress, "address"),
        CustomerEntitySpec("customer_product_discounts", CustomerProductDiscount, "discount"),
        CustomerEntitySpec("customer_sales_stats", CustomerSalesStats, "sales_stats"),
        CustomerEntitySpec("customer_product_stats", CustomerProductStats, "product_stats"),
        CustomerEntitySpec("customer_notes", CustomerNote, "note"),
        CustomerEntitySpec("customer_crm_events", CustomerCrmEvent, "crm_event"),
    ]


def _create_table_from_model(engine: Engine, model: Any) -> None:
    from sqlalchemy import text

    ddl = str(CreateTable(model.__table__).compile(dialect=engine.dialect))
    with engine.begin() as conn:
        conn.execute(text(ddl))
    logger.info(
        "[customer.schema] created_table table=%s dialect=%s",
        model.__tablename__,
        engine.dialect.name,
    )


def ensure_customer_crm_schema(engine: Engine) -> int:
    """
    Create missing customer-related tables and sync ORM columns/indexes.

    Safe on production: ADD COLUMN / CREATE TABLE only.
    """
    added = 0
    for spec in _customer_entity_registry():
        if not has_table(engine, spec.table_name):
            if spec.table_name == "customers":
                logger.warning(
                    "[customer.schema] skip_create core table=%s — run Base.metadata.create_all first",
                    spec.table_name,
                )
                continue
            try:
                _create_table_from_model(engine, spec.model)
            except Exception:
                logger.exception("[customer.schema] create_table_failed table=%s", spec.table_name)
                continue
        try:
            added += ensure_model_schema_sync(
                engine,
                spec.model,
                log_prefix="customer.schema.sync",
                sync_indexes=True,
                sync_foreign_keys=spec.table_name != "customers",
            )
        except Exception:
            logger.exception("[customer.schema] sync_failed table=%s", spec.table_name)
    logger.info(
        "[customer.schema] complete version=%s columns_added=%s dialect=%s",
        CUSTOMER_SCHEMA_VERSION,
        added,
        engine.dialect.name,
    )
    return added
