"""
Tiered schema policy — core platform stability.

Tier 0: orders, order_items, locations, products, inventory — sync before first request.
Tier 1: operational feature tables — background, fail independently.
Tier 2: experimental/runtime — never block startup (not wired here).
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Sequence, Type

from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase

from .schema_introspection import (
    ensure_operational_core_orm_columns,
    ensure_tier0_document_warehouse_schema,
    get_table_column_names,
    has_table,
    sync_tier0_orm_columns_from_models,
    verify_tier0_sql_probes,
)
from .schema_reconciliation import reconcile_startup_schema

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tier classification (mandatory before new schema additions)
# ---------------------------------------------------------------------------

TIER0_TABLES: frozenset[str] = frozenset(
    {
        "orders",
        "order_items",
        "locations",
        "products",
        "inventory",
        "inventory_units",
        "stock_documents",
        "stock_document_items",
        "sale_documents",
        "sale_document_stock_links",
        "document_series",
        "order_documents",
    }
)

TIER1_TABLES: frozenset[str] = frozenset(
    {
        "direct_sale_sessions",
        "operational_alerts",
        "operational_replenishment_rules",
        "operational_live_events",
        "operational_feature_scopes",
        "device_sessions",
        "operator_runtime_context",
        "operational_workstations",
        "operational_commerce_events",
        "document_generation_jobs",
    }
)


class CoreSchemaValidationError(RuntimeError):
    """Tier 0 ORM/DB mismatch — platform must not boot."""

    def __init__(self, mismatches: list[dict[str, Any]]) -> None:
        self.mismatches = mismatches
        lines = [
            f"{m['table']}: missing {m['missing_columns']}"
            for m in mismatches
        ]
        super().__init__(
            "Core schema validation failed — ORM columns missing in database: "
            + "; ".join(lines)
        )


class Tier0SchemaError(RuntimeError):
    """Tier 0 ensure step failed — platform must not boot."""

    def __init__(self, failures: list[tuple[str, Exception]]) -> None:
        self.failures = failures
        super().__init__(
            "Tier 0 schema ensure failed: "
            + "; ".join(f"{name}: {exc}" for name, exc in failures)
        )


@dataclass(frozen=True)
class Tier0Result:
    added_columns: int
    steps_run: int
    duration_ms: float
    failures: tuple[tuple[str, str], ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class ValidationResult:
    ok: bool
    checked_tables: int
    mismatches: tuple[dict[str, Any], ...]
    duration_ms: float


@dataclass(frozen=True)
class Tier1Result:
    steps_run: int
    duration_ms: float
    failures: tuple[tuple[str, str], ...] = field(default_factory=tuple)


def _orm_column_names(model: Type[DeclarativeBase]) -> set[str]:
    return {c.key for c in model.__table__.columns}


def _tier0_orm_models() -> Sequence[Type[DeclarativeBase]]:
    from ..models.location import Location
    from ..models.order import Order
    from ..models.order_item import OrderItem
    from ..models.product import Product

    models: list[Type[DeclarativeBase]] = [Order, OrderItem, Location, Product]
    try:
        from ..models.inventory import Inventory

        models.append(Inventory)
    except Exception:
        pass
    try:
        from ..models.inventory_unit import InventoryUnit

        models.append(InventoryUnit)
    except Exception:
        pass
    return models


def _run_steps(
    engine: Engine,
    steps: Sequence[tuple[str, Callable[[Engine], Any]]],
    *,
    tier_tag: str,
) -> tuple[int, list[tuple[str, Exception]]]:
    from ..observability.platform_debug import log_schema_tier

    failures: list[tuple[str, Exception]] = []
    t0 = time.perf_counter()
    for name, fn in steps:
        step_t0 = time.perf_counter()
        try:
            fn(engine)
            log_schema_tier(
                tier_tag,
                step=name,
                duration_ms=round((time.perf_counter() - step_t0) * 1000, 2),
                ok=True,
            )
        except Exception as exc:
            failures.append((name, exc))
            logger.exception("[%s] step failed name=%s", tier_tag, name)
            log_schema_tier(
                tier_tag,
                step=name,
                duration_ms=round((time.perf_counter() - step_t0) * 1000, 2),
                ok=False,
                error=f"{type(exc).__name__}: {exc}",
            )
    duration_ms = round((time.perf_counter() - t0) * 1000, 2)
    log_schema_tier(tier_tag, step="complete", duration_ms=duration_ms, ok=not failures)
    return len(steps), failures


def _tier0_ensure_steps() -> list[tuple[str, Callable[[Engine], Any]]]:
    """Synchronous ensures for shared core tables — never run in background threads."""
    from . import schema_upgrade as su

    return [
        ("locations_columns", su.ensure_locations_columns),
        ("warehouse_layout_identity_columns", su.ensure_warehouse_layout_identity_columns),
        ("warehouse_layout_building_columns", su.ensure_warehouse_layout_building_columns),
        ("warehouse_layout_rack_name_unique_index", su.ensure_warehouse_layout_rack_name_unique_index),
        ("products_physical_columns", su.ensure_products_physical_columns),
        ("products_stack_columns", su.ensure_products_stack_columns),
        ("products_stack_behavior_column", su.ensure_products_stack_behavior_column),
        ("products_import_metadata_columns", su.ensure_products_import_metadata_columns),
        ("products_replenishment_levels_columns", su.ensure_products_replenishment_levels_columns),
        ("products_reserve_replenishment_columns", su.ensure_products_reserve_replenishment_columns),
        ("products_stock_alert_columns", su.ensure_products_stock_alert_columns),
        ("products_carton_columns", su.ensure_products_carton_columns),
        ("products_carton_stacking_columns", su.ensure_products_carton_stacking_columns),
        ("products_receiving_requirements_columns", su.ensure_products_receiving_requirements_columns),
        ("products_deleted_at_column", su.ensure_products_deleted_at_column),
        ("orders_deleted_at_column", su.ensure_orders_deleted_at_column),
        ("inventory_location_uuid_columns", su.ensure_inventory_location_uuid_columns),
        ("orders_customer_id_column", su.ensure_orders_customer_id_column),
        ("orders_fulfillment_state_columns", su.ensure_orders_fulfillment_state_columns),
        ("orders_picking_handoff_mode_column", su.ensure_orders_picking_handoff_mode_column),
        ("orders_priority_color_column", su.ensure_orders_priority_color_column),
        ("orders_discount_columns", su.ensure_orders_discount_columns),
        ("orders_wms_timeline_columns", su.ensure_orders_wms_timeline_columns),
        ("orders_wms_packing_automation_finished_at_column", su.ensure_orders_wms_packing_automation_finished_at_column),
        ("order_items_packing_quantity_packed_column", su.ensure_order_items_packing_quantity_packed_column),
        ("order_items_wms_picking_line_missing_qty", su.ensure_order_items_wms_picking_line_missing_qty),
        ("order_items_wms_picking_line_status", su.ensure_order_items_wms_picking_line_status),
        ("order_items_fulfillment_sync_columns", su.ensure_order_items_fulfillment_sync_columns),
        ("order_items_bundle_hierarchy_columns", su.ensure_order_items_bundle_hierarchy_columns),
        ("order_items_oms_line_status", su.ensure_order_items_oms_line_status),
        ("picking_shortage_support", su.ensure_picking_shortage_support),
    ]


def ensure_tier0_schema(engine: Engine) -> Tier0Result:
    """
    Tier 0 — blocking, synchronous, before ORM usage on core tables.
    Raises Tier0SchemaError on failure.

    PostgreSQL: legacy schema_upgrade helpers are SQLite-only no-ops in main.py;
    ORM column sync (dialect-agnostic) is the primary migration path.
    """
    t0 = time.perf_counter()
    added = ensure_operational_core_orm_columns(engine)
    added += sync_tier0_orm_columns_from_models(engine)
    added += ensure_tier0_document_warehouse_schema(engine)
    reconcile = reconcile_startup_schema(engine, phase="tier0")
    added += reconcile.columns_added
    if engine.dialect.name == "sqlite":
        steps_run, failures = _run_steps(engine, _tier0_ensure_steps(), tier_tag="schema.tier0")
    else:
        from ..observability.platform_debug import log_schema_tier

        log_schema_tier(
            "schema.tier0",
            step="postgres_orm_reconcile",
            duration_ms=reconcile.duration_ms,
            ok=not reconcile.errors,
            tables_created=reconcile.tables_created,
            columns_added=reconcile.columns_added,
            indexes_added=reconcile.indexes_added,
            foreign_keys_added=reconcile.foreign_keys_added,
            errors=len(reconcile.errors),
        )
        steps_run, failures = 0, []
    duration_ms = round((time.perf_counter() - t0) * 1000, 2)
    result = Tier0Result(
        added_columns=added,
        steps_run=steps_run,
        duration_ms=duration_ms,
        failures=tuple((n, f"{type(e).__name__}: {e}") for n, e in failures),
    )
    if failures:
        raise Tier0SchemaError(failures)
    return result


def validate_core_schema(engine: Engine) -> ValidationResult:
    """
    Verify Tier 0 ORM models match database columns.
    Raises CoreSchemaValidationError when mismatches exist.
    """
    from ..observability.platform_debug import log_startup_validation

    t0 = time.perf_counter()
    mismatches: list[dict[str, Any]] = []
    checked = 0

    for model in _tier0_orm_models():
        table = model.__tablename__
        if not has_table(engine, table):
            mismatches.append(
                {
                    "table": table,
                    "missing_columns": ["<table missing>"],
                    "orm_columns": sorted(_orm_column_names(model)),
                }
            )
            checked += 1
            continue

        db_cols = set(get_table_column_names(engine, table))
        orm_cols = _orm_column_names(model)
        missing = sorted(orm_cols - db_cols)
        checked += 1
        if missing:
            mismatches.append(
                {
                    "table": table,
                    "missing_columns": missing,
                    "orm_column_count": len(orm_cols),
                    "db_column_count": len(db_cols),
                }
            )

    duration_ms = round((time.perf_counter() - t0) * 1000, 2)
    ok = not mismatches
    log_startup_validation(
        ok=ok,
        checked_tables=checked,
        mismatch_count=len(mismatches),
        duration_ms=duration_ms,
        mismatches=mismatches if mismatches else None,
    )
    result = ValidationResult(
        ok=ok,
        checked_tables=checked,
        mismatches=tuple(mismatches),
        duration_ms=duration_ms,
    )
    if mismatches:
        raise CoreSchemaValidationError(mismatches)
    return result


def _tier1_ensure_steps() -> list[tuple[str, Callable[[Engine], Any]]]:
    from . import schema_upgrade as su

    return [
        ("operational_sales_phase1", su.ensure_operational_sales_phase1_schema),
        ("operational_sales_phase2", su.ensure_operational_sales_phase2_schema),
        ("operational_sales_phase3", su.ensure_operational_sales_phase3_schema),
        ("operational_runtime_phase4", su.ensure_operational_runtime_phase4_schema),
        ("operational_feature_scopes", su.ensure_operational_feature_scopes_schema),
        ("inventory_count", su.ensure_inventory_count_schema),
        ("printing", su.ensure_printing_schema),
        ("integration_api_keys", su.ensure_integration_api_keys_schema),
        ("slotting", su.ensure_slotting_schema),
    ]


def ensure_tier1_operational_schema(engine: Engine) -> Tier1Result:
    """
    Tier 1 — operational feature schema. Safe in background; failures are logged, not fatal.
    """
    t0 = time.perf_counter()
    steps_run, failures = _run_steps(engine, _tier1_ensure_steps(), tier_tag="schema.tier1")
    reconcile = reconcile_startup_schema(engine, phase="tier1")
    if reconcile.errors:
        for err in reconcile.errors[:20]:
            logger.warning("[schema.tier1] reconcile_warning %s", err)
    duration_ms = round((time.perf_counter() - t0) * 1000, 2)
    return Tier1Result(
        steps_run=steps_run,
        duration_ms=duration_ms,
        failures=tuple((n, f"{type(e).__name__}: {e}") for n, e in failures),
    )


def validate_core_schema_or_fail(engine: Engine) -> ValidationResult:
    """Hard startup gate — raises CoreSchemaValidationError if Tier 0 ORM/DB mismatch."""
    return validate_core_schema(engine)


def bootstrap_tier0_platform_schema(engine: Engine) -> tuple[Tier0Result, ValidationResult]:
    """
    Full Tier 0 bootstrap: ensure + SQL probes + validate.
    Call synchronously before first HTTP request. Raises on failure.
    """
    from ..observability.platform_debug import log_startup_validation

    tier0 = ensure_tier0_schema(engine)
    probe_failures = verify_tier0_sql_probes(engine)
    if probe_failures:
        log_startup_validation(
            ok=False,
            checked_tables=0,
            mismatch_count=len(probe_failures),
            mismatches=probe_failures,
        )
        raise CoreSchemaValidationError(
            [{"table": f["table"], "missing_columns": [f["error"]]} for f in probe_failures]
        )
    validation = validate_core_schema_or_fail(engine)
    return tier0, validation
