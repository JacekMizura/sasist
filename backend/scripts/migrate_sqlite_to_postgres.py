"""Safe, idempotent SQLite -> PostgreSQL data migration for WMS.

Copies row data from the local SQLite file (default: ``backend/test.db``) into the
PostgreSQL database pointed to by ``DATABASE_URL``. Uses existing SQLAlchemy ORM
metadata for table/column definitions. Does **not** create, drop, or truncate tables.

Default mode is SAFE: dry-run unless ``--yes`` is passed.

Examples (from repository root):

    python -m backend.scripts.migrate_sqlite_to_postgres
    python -m backend.scripts.migrate_sqlite_to_postgres --table orders
    python -m backend.scripts.migrate_sqlite_to_postgres --phase orders --yes

Environment:
    DATABASE_URL  PostgreSQL target (required for a real run)
"""

from __future__ import annotations

import argparse
import logging
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Sequence

from sqlalchemy import (
    BigInteger,
    Boolean,
    Integer,
    MetaData,
    SmallInteger,
    Table,
    and_,
    create_engine,
    func,
    inspect,
    select,
    text,
)
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.schema import Column, ForeignKeyConstraint


BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent
DEFAULT_SQLITE_PATH = BACKEND_DIR / "test.db"

SKIP_TABLE_NAMES = frozenset(
    {
        "alembic_version",
        "schema_migrations",
        "migrations",
    }
)

DEFAULT_BATCH_SIZE = 1_000

logger = logging.getLogger("migrate_sqlite_to_postgres")

PHASE_FOUNDATION = "1_foundation_tenants_users_warehouses"
PHASE_CATALOG = "2_catalog_products_customers"
PHASE_ORDERS = "3_orders"
PHASE_STOCK = "4_stock_inventory"
PHASE_RETURNS = "5_complaints_returns"
PHASE_REST = "6_rest"

PHASE_ALIASES: dict[str, str] = {
    "foundation": PHASE_FOUNDATION,
    "catalog": PHASE_CATALOG,
    "orders": PHASE_ORDERS,
    "stock": PHASE_STOCK,
    "returns": PHASE_RETURNS,
    "rest": PHASE_REST,
}

MIGRATION_PHASES: list[tuple[str, list[str]]] = [
    (
        PHASE_FOUNDATION,
        [
            "workforce_user_groups",
            "workforce_user_status_access",
            "workforce_status_access",
            "warehouses",
            "warehouse_layouts",
            "warehouse_templates",
            "warehouse_maps",
            "label_sizes",
            "label_packs",
            "label_pack_items",
            "label_template_groups",
            "saved_label_templates",
            "printer_profiles",
            "printers",
            "tenants",
            "tenant_warehouses",
            "company_profiles",
            "permission_presets",
            "app_users",
            "app_user_warehouses",
            "user_sessions",
            "user_permissions",
            "user_wms_profiles",
            "employee_cost_profiles",
            "wms_settings",
            "wms_packing_settings",
            "wms_picking_shortage_settings",
            "bdo_settings",
            "document_series",
            "audit_logs",
            "user_activity_logs",
        ],
    ),
    (
        PHASE_CATALOG,
        [
            "manufacturers",
            "suppliers",
            "currency_exchange_rates",
            "products",
            "product_barcodes",
            "product_substitutions",
            "customers",
            "customer_addresses",
            "customer_product_discounts",
            "bundles",
            "bundle_items",
            "supplier_products",
            "shipping_methods",
            "wm_price_tiers",
            "cartons",
            "packaging_materials",
            "carton_shipping_method_links",
            "export_templates",
        ],
    ),
    (
        PHASE_ORDERS,
        [
            "order_ui_statuses",
            "order_ui_panel_subgroups",
            "order_custom_fields",
            "order_custom_field_options",
            "picking_zones",
            "orders",
            "order_items",
            "order_zone",
            "order_documents",
            "order_activity_logs",
            "order_notes",
            "order_operational_notes",
            "order_custom_field_values",
            "order_refund_drafts",
            "order_refund_draft_lines",
            "fulfillment_events",
            "order_item_pick_allocations",
            "wms_order_events",
            "order_issue_tasks",
            "sale_documents",
            "waves",
        ],
    ),
    (
        PHASE_STOCK,
        [
            "locations",
            "warehouse_layout_racks",
            "warehouse_aisles",
            "warehouse_bins",
            "storage_locations",
            "storage_bins",
            "map_elements",
            "location_nodes",
            "warehouse_nodes",
            "warehouse_edges",
            "rack_levels",
            "rack_segments",
            "consolidation_racks",
            "consolidation_rack_levels",
            "zone_slots",
            "storage_units",
            "inventory",
            "inventory_units",
            "inventory_movements",
            "inventory_serials",
            "stock",
            "stock_reservations",
            "stock_movements",
            "warehouse_carrier_groups",
            "warehouse_carriers",
            "warehouse_carrier_items",
            "warehouse_carrier_logs",
            "stock_documents",
            "stock_document_items",
            "stock_operations",
            "stock_item_locations",
            "receiving_scan_logs",
            "receiving_document_carriers",
            "warehouse_inventory_movements",
            "wms_product_warehouse_operations",
            "replenishment_tasks",
        ],
    ),
    (
        PHASE_RETURNS,
        [
            "complaint_ui_statuses",
            "return_ui_statuses",
            "return_ui_panel_subgroups",
            "return_statuses",
            "return_damage_classes",
            "return_damage_reasons",
            "return_product_decisions",
            "return_customer_return_types",
            "return_order_sources",
            "return_detail_layouts",
            "complaints",
            "complaint_lines",
            "complaint_events",
            "complaint_documents",
            "complaint_shipments",
            "complaint_shipment_events",
            "wms_order_returns",
            "rmz_lines",
            "wms_refunds",
            "damage_reports",
            "damage_entries",
            "damage_report_items",
            "damage_report_images",
        ],
    ),
    (
        PHASE_REST,
        [
            "purchasing_alert_rules",
            "purchasing_alert_events",
            "purchasing_auto_drafts",
            "purchase_auto_rules",
            "purchase_auto_runs",
            "purchase_orders",
            "purchase_order_items",
            "deliveries",
            "delivery_items",
            "picking_config",
            "carts",
            "cart_groups",
            "cart_baskets",
            "baskets",
            "picks",
            "pick_tasks",
            "pick_waves",
            "pick_wave_items",
            "pick_wave_tasks",
            "wms_operational_tasks",
            "wms_operation_sessions",
            "wms_packing_sessions",
            "wms_picking_shortage_reports",
            "wms_recovery_pick_tasks",
            "import_logs",
            "bdo_packaging_purchases",
            "bdo_stock_count_sessions",
            "bdo_stock_count_lines",
            "bdo_corrections",
            "bdo_audit_logs",
        ],
    ),
]


@dataclass
class TableMigrationResult:
    table: str
    phase: str
    source_rows: int = 0
    inserted: int = 0
    skipped_duplicate: int = 0
    skipped_missing_sqlite: bool = False
    skipped_no_columns: bool = False
    errors: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


@dataclass
class TableValidation:
    table: str
    source_count: int
    postgres_count: int

    @property
    def missing_in_postgres(self) -> int:
        return max(0, self.source_count - self.postgres_count)

    @property
    def mismatch(self) -> bool:
        return self.postgres_count < self.source_count


@dataclass
class FkViolation:
    child_table: str
    parent_table: str
    fk_columns: tuple[str, ...]
    orphan_rows: int


@dataclass
class MigrationSummary:
    dry_run: bool
    results: list[TableMigrationResult] = field(default_factory=list)
    validations: list[TableValidation] = field(default_factory=list)
    fk_violations: list[FkViolation] = field(default_factory=list)

    def totals(self) -> dict[str, int]:
        return {
            "source_rows": sum(r.source_rows for r in self.results),
            "inserted": sum(r.inserted for r in self.results),
            "skipped_duplicate": sum(r.skipped_duplicate for r in self.results),
            "tables_with_errors": sum(1 for r in self.results if r.errors),
            "count_mismatches": sum(1 for v in self.validations if v.mismatch),
            "fk_violations": len(self.fk_violations),
        }


def _import_backend_metadata() -> tuple[MetaData, str]:
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))

    import backend.models  # noqa: F401
    from backend.database import Base, DATABASE_URL

    return Base.metadata, DATABASE_URL


def _normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


def _table_label(table: Table) -> str:
    return f"{table.schema}.{table.name}" if table.schema else table.name


def _qualified_pg_table_name(table: Table) -> str:
    return _table_label(table)


def _build_migration_table_order(metadata: MetaData) -> list[tuple[str, str]]:
    all_orm_tables = {
        name for name in metadata.tables.keys() if name not in SKIP_TABLE_NAMES
    }
    ordered: list[tuple[str, str]] = []
    seen: set[str] = set()

    for phase_name, table_names in MIGRATION_PHASES:
        for name in table_names:
            if name in SKIP_TABLE_NAMES:
                continue
            if name not in all_orm_tables:
                raise RuntimeError(
                    f"Phase {phase_name} references unknown ORM table: {name}"
                )
            if name in seen:
                raise RuntimeError(f"Table {name} listed in multiple phases")
            ordered.append((phase_name, name))
            seen.add(name)

    for name in sorted(all_orm_tables - seen):
        ordered.append((PHASE_REST, name))
        seen.add(name)

    if seen != all_orm_tables:
        raise RuntimeError(f"Migration plan mismatch: {all_orm_tables ^ seen}")

    return ordered


def _filter_migration_plan(
    plan: list[tuple[str, str]],
    *,
    table_name: str | None,
    phase_alias: str | None,
    metadata: MetaData,
) -> list[tuple[str, str]]:
    if table_name and phase_alias:
        raise RuntimeError("Use only one of --table or --phase.")

    if table_name:
        if table_name in SKIP_TABLE_NAMES:
            raise RuntimeError(f"Table {table_name!r} is excluded from migration.")
        if table_name not in metadata.tables:
            known = ", ".join(sorted(metadata.tables.keys())[:20])
            raise RuntimeError(
                f"Unknown table {table_name!r}. Must be an ORM table name (e.g. orders). "
                f"Sample: {known}, ..."
            )
        for phase, name in plan:
            if name == table_name:
                return [(phase, name)]
        raise RuntimeError(f"Table {table_name!r} not found in migration plan.")

    if phase_alias:
        phase_key = PHASE_ALIASES.get(phase_alias)
        if not phase_key:
            allowed = ", ".join(PHASE_ALIASES)
            raise RuntimeError(f"Unknown phase {phase_alias!r}. Choose: {allowed}")
        filtered = [(phase, name) for phase, name in plan if phase == phase_key]
        if not filtered:
            raise RuntimeError(f"No tables in phase {phase_alias!r}.")
        return filtered

    return plan


def _print_live_warnings(*, dry_run: bool, scope_label: str) -> None:
    print("SQLite -> PostgreSQL migration (idempotent, no truncate)")
    print(f"Scope: {scope_label}")
    print(f"Mode: {'DRY RUN (default — no writes)' if dry_run else 'LIVE (writes enabled)'}")
    print()
    if dry_run:
        print("SAFE MODE: no data will be written. Pass --yes to run a live migration.")
        return

    print("!" * 72)
    print("WARNING: LIVE MIGRATION")
    print("!" * 72)
    print("- Rows will be INSERTed into PostgreSQL (ON CONFLICT DO NOTHING).")
    print("- Existing PostgreSQL rows are NOT deleted or updated.")
    print("- Partial scope (--table / --phase) may leave FK parents missing elsewhere.")
    print("- FK checks are temporarily relaxed during insert (session_replication_role).")
    print("!" * 72)
    print()


def _confirm_live_migration(*, assume_yes: bool) -> None:
    if assume_yes:
        print("Confirmation skipped (--yes).")
        return
    answer = input("Type MIGRATE to run LIVE migration: ").strip()
    if answer != "MIGRATE":
        raise SystemExit("Aborted.")


def _reflect_sqlite_metadata(source_engine: Engine) -> MetaData:
    source_metadata = MetaData()
    source_metadata.reflect(bind=source_engine)
    return source_metadata


def _check_target_tables(
    target_engine: Engine, table_names: Iterable[str], metadata: MetaData
) -> None:
    inspector = inspect(target_engine)
    missing: list[str] = []
    for name in table_names:
        table = metadata.tables[name]
        if not inspector.has_table(table.name, schema=table.schema):
            missing.append(_table_label(table))
    if missing:
        joined = "\n  - ".join(missing)
        raise RuntimeError(
            "Target PostgreSQL is missing ORM tables. Create schema first:\n"
            f"  - {joined}"
        )


def _row_count(conn: Connection, table: Table | None) -> int:
    if table is None:
        return 0
    return int(conn.execute(select(func.count()).select_from(table)).scalar() or 0)


def _pk_column_names(table: Table) -> list[str]:
    return [column.name for column in table.primary_key.columns]


def _coerce_value(column: Column, value: Any) -> Any:
    if value is None:
        return None
    if isinstance(column.type, Boolean):
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "t", "yes", "y"}:
                return True
            if normalized in {"0", "false", "f", "no", "n"}:
                return False
    return value


def _row_payload(
    source_row: dict[str, Any],
    *,
    shared_columns: Sequence[str],
    target_table: Table,
) -> dict[str, Any]:
    column_by_name = {column.name: column for column in target_table.columns}
    return {
        name: _coerce_value(column_by_name[name], source_row[name]) for name in shared_columns
    }


def _shared_column_names(source_table: Table, target_table: Table) -> list[str]:
    target_names = {column.name for column in target_table.columns}
    return [column.name for column in source_table.columns if column.name in target_names]


def _source_select(source_table: Table):
    stmt = select(source_table)
    pk_columns = list(source_table.primary_key.columns)
    if pk_columns:
        stmt = stmt.order_by(*pk_columns)
    return stmt


def _set_replica_role(conn: Connection, enabled: bool) -> None:
    conn.execute(
        text("SET session_replication_role = :role"),
        {"role": "replica" if enabled else "origin"},
    )


def _fetch_existing_pk_set(
    target_conn: Connection,
    target_table: Table,
    pk_names: list[str],
    candidate_keys: list[tuple[Any, ...]],
) -> set[tuple[Any, ...]]:
    if not candidate_keys or not pk_names:
        return set()

    if len(pk_names) == 1:
        pk_col = target_table.c[pk_names[0]]
        existing: set[tuple[Any, ...]] = set()
        chunk = 5_000
        for offset in range(0, len(candidate_keys), chunk):
            slice_keys = [key[0] for key in candidate_keys[offset : offset + chunk]]
            rows = target_conn.execute(
                select(pk_col).where(pk_col.in_(slice_keys))
            ).fetchall()
            existing.update((row[0],) for row in rows)
        return existing

    existing = set()
    for key in candidate_keys:
        conditions = [
            target_table.c[name] == value
            for name, value in zip(pk_names, key, strict=True)
        ]
        found = target_conn.execute(
            select(*[target_table.c[name] for name in pk_names]).where(*conditions).limit(1)
        ).first()
        if found is not None:
            existing.add(key)
    return existing


def _insert_batch(
    target_conn: Connection,
    target_table: Table,
    pk_names: list[str],
    batch: list[dict[str, Any]],
    *,
    dry_run: bool,
) -> tuple[int, int]:
    if not batch:
        return 0, 0

    if dry_run:
        if not pk_names:
            return len(batch), 0
        candidate_keys = [tuple(row[name] for name in pk_names) for row in batch]
        existing = _fetch_existing_pk_set(
            target_conn, target_table, pk_names, candidate_keys
        )
        skipped = sum(1 for key in candidate_keys if key in existing)
        return len(batch) - skipped, skipped

    stmt = pg_insert(target_table).values(batch)
    if pk_names:
        returning_cols = [target_table.c[name] for name in pk_names]
        stmt = stmt.on_conflict_do_nothing(index_elements=pk_names).returning(*returning_cols)
        inserted = len(target_conn.execute(stmt).fetchall())
    else:
        result = target_conn.execute(stmt)
        inserted = (
            result.rowcount if result.rowcount is not None and result.rowcount >= 0 else len(batch)
        )
    return inserted, len(batch) - inserted


def _migrate_one_table(
    *,
    phase: str,
    table_name: str,
    source_conn: Connection,
    target_conn: Connection,
    source_metadata: MetaData,
    target_table: Table,
    batch_size: int,
    dry_run: bool,
) -> TableMigrationResult:
    result = TableMigrationResult(table=table_name, phase=phase)
    source_table = source_metadata.tables.get(table_name)
    if source_table is None:
        result.skipped_missing_sqlite = True
        logger.info("  %s: not in SQLite (skipped)", table_name)
        return result

    shared_columns = _shared_column_names(source_table, target_table)
    if not shared_columns:
        result.skipped_no_columns = True
        logger.warning("  %s: no shared columns (skipped)", table_name)
        return result

    pk_names = _pk_column_names(target_table)
    batch: list[dict[str, Any]] = []

    for row in source_conn.execute(_source_select(source_table)).mappings():
        result.source_rows += 1
        batch.append(
            _row_payload(dict(row), shared_columns=shared_columns, target_table=target_table)
        )
        if len(batch) >= batch_size:
            inserted, skipped = _insert_batch(
                target_conn, target_table, pk_names, batch, dry_run=dry_run
            )
            result.inserted += inserted
            result.skipped_duplicate += skipped
            if not dry_run:
                target_conn.commit()
            batch.clear()

    if batch:
        inserted, skipped = _insert_batch(
            target_conn, target_table, pk_names, batch, dry_run=dry_run
        )
        result.inserted += inserted
        result.skipped_duplicate += skipped
        if not dry_run:
            target_conn.commit()

    logger.info(
        "  %s: source=%s inserted=%s skipped_dup=%s",
        table_name,
        result.source_rows,
        result.inserted,
        result.skipped_duplicate,
    )
    return result


def _is_integer_pk_column(column: Column) -> bool:
    return isinstance(column.type, (Integer, BigInteger, SmallInteger))


def _reset_postgres_sequences(
    conn: Connection, metadata: MetaData, table_names: Iterable[str]
) -> None:
    """Delegate to shared startup sync (migration post-step)."""
    from backend.db.postgres_sequence_sync import ensure_postgres_sequences_synced

    bind = conn.engine
    report = ensure_postgres_sequences_synced(bind, metadata=metadata, table_names=list(table_names))
    print(
        f"\nPostgreSQL sequences: checked={report.checked} fixed={report.fixed} "
        f"ok={report.ok} skipped={report.skipped} errors={report.errors}"
    )


def _validate_row_counts(
    *,
    source_conn: Connection,
    target_conn: Connection,
    source_metadata: MetaData,
    metadata: MetaData,
    table_names: list[str],
) -> list[TableValidation]:
    validations: list[TableValidation] = []
    for name in table_names:
        source_table = source_metadata.tables.get(name)
        target_table = metadata.tables[name]
        validations.append(
            TableValidation(
                table=name,
                source_count=_row_count(source_conn, source_table),
                postgres_count=_row_count(target_conn, target_table),
            )
        )
    return validations


def _fk_constraint_pairs(
    fk_constraint: ForeignKeyConstraint,
) -> tuple[tuple[str, ...], tuple[str, ...], Table]:
    """Local/parent column names and referred table from a FK constraint."""
    local_cols = tuple(column.name for column in fk_constraint.columns)
    parent_cols = tuple(element.column.name for element in fk_constraint.elements)
    if len(local_cols) != len(parent_cols):
        raise RuntimeError(
            f"FK column count mismatch on {fk_constraint.parent.name}: "
            f"{local_cols!r} -> {parent_cols!r}"
        )
    return local_cols, parent_cols, fk_constraint.referred_table


def _verify_fk_integrity(
    target_conn: Connection,
    metadata: MetaData,
    table_names: set[str],
) -> list[FkViolation]:
    """Find orphan FK references in PostgreSQL (child row, missing parent)."""
    violations: list[FkViolation] = []
    checked: set[tuple[str, str, tuple[str, ...]]] = set()

    for child_name in table_names:
        child_table = metadata.tables[child_name]
        for fk_constraint in child_table.foreign_key_constraints:
            local_cols, parent_cols, parent_table = _fk_constraint_pairs(fk_constraint)
            parent_name = parent_table.name
            if parent_name not in metadata.tables:
                continue

            key = (child_name, parent_name, local_cols)
            if key in checked:
                continue
            checked.add(key)

            child_a = child_table.alias(f"{child_name}__fk_child")
            parent_a = parent_table.alias(f"{parent_name}__fk_parent")
            join_on = and_(
                *[
                    child_a.c[local_col] == parent_a.c[parent_col]
                    for local_col, parent_col in zip(local_cols, parent_cols, strict=True)
                ]
            )
            not_null = [child_a.c[local_col].isnot(None) for local_col in local_cols]
            parent_missing = (
                parent_a.c[parent_cols[0]].is_(None)
                if len(parent_cols) == 1
                else and_(*(parent_a.c[col].is_(None) for col in parent_cols))
            )
            orphan_count = target_conn.execute(
                select(func.count())
                .select_from(child_a.outerjoin(parent_a, join_on))
                .where(*not_null, parent_missing)
            ).scalar()

            if orphan_count:
                violations.append(
                    FkViolation(
                        child_table=child_name,
                        parent_table=parent_name,
                        fk_columns=local_cols,
                        orphan_rows=int(orphan_count),
                    )
                )

    return violations


def _print_summary(summary: MigrationSummary) -> None:
    totals = summary.totals()
    print("\n" + "=" * 72)
    print(f"MIGRATION SUMMARY ({'DRY RUN' if summary.dry_run else 'LIVE'})")
    print("=" * 72)
    print(f"  Source rows scanned:      {totals['source_rows']}")
    print(f"  Rows inserted:            {totals['inserted']}")
    print(f"  Rows skipped (duplicate): {totals['skipped_duplicate']}")
    print(f"  Tables with errors:       {totals['tables_with_errors']}")

    by_phase: dict[str, list[TableMigrationResult]] = defaultdict(list)
    for row in summary.results:
        by_phase[row.phase].append(row)

    for phase_name in sorted(by_phase):
        phase_rows = by_phase[phase_name]
        print(
            f"\n[{phase_name}] inserted={sum(r.inserted for r in phase_rows)} "
            f"skipped_dup={sum(r.skipped_duplicate for r in phase_rows)}"
        )
        for row in phase_rows:
            if row.skipped_missing_sqlite or row.skipped_no_columns:
                continue
            if row.source_rows == 0 and not row.errors:
                continue
            status = "OK" if row.ok else "ERROR"
            print(
                f"  {row.table:40} source={row.source_rows:6} "
                f"insert={row.inserted:6} skip={row.skipped_duplicate:6} [{status}]"
            )
            for err in row.errors:
                print(f"      ! {err}")


def _print_validation_summary(validations: list[TableValidation]) -> None:
    print("\n" + "=" * 72)
    print("ROW COUNT VALIDATION (SQLite vs PostgreSQL)")
    print("=" * 72)
    mismatches = [v for v in validations if v.mismatch]
    empty = [v for v in validations if v.source_count == 0 and v.postgres_count == 0]

    for v in validations:
        if v in empty:
            continue
        flag = " MISMATCH" if v.mismatch else ""
        print(
            f"  {v.table:40} sqlite={v.source_count:8} postgres={v.postgres_count:8}"
            f" missing={v.missing_in_postgres:8}{flag}"
        )

    print(f"\n  Tables checked: {len(validations)}")
    print(f"  Mismatches (postgres < sqlite): {len(mismatches)}")
    if mismatches:
        print("\n  Tables with missing rows in PostgreSQL:")
        for v in mismatches:
            print(f"    - {v.table}: need {v.missing_in_postgres} more row(s)")


def _print_fk_summary(violations: list[FkViolation]) -> None:
    print("\n" + "=" * 72)
    print("FOREIGN KEY INTEGRITY CHECK (PostgreSQL)")
    print("=" * 72)
    if not violations:
        print("  No orphan FK references detected in migrated tables.")
        return
    print(f"  Violations found: {len(violations)}")
    for v in violations:
        cols = ", ".join(v.fk_columns)
        print(
            f"  - {v.child_table}.{cols} -> {v.parent_table}: "
            f"{v.orphan_rows} orphan row(s)"
        )


def migrate(
    *,
    sqlite_path: Path,
    assume_yes: bool,
    dry_run: bool,
    batch_size: int,
    table_name: str | None,
    phase_alias: str | None,
    continue_on_error: bool,
) -> MigrationSummary:
    if not sqlite_path.exists():
        raise FileNotFoundError(f"SQLite database not found: {sqlite_path}")

    metadata, raw_database_url = _import_backend_metadata()
    target_url = _normalize_database_url(raw_database_url)

    if target_url.startswith("sqlite"):
        raise RuntimeError("DATABASE_URL points to SQLite. Set PostgreSQL URL first.")
    if not target_url.startswith("postgresql"):
        raise RuntimeError(f"DATABASE_URL must be PostgreSQL, got: {target_url}")

    full_plan = _build_migration_table_order(metadata)
    migration_plan = _filter_migration_plan(
        full_plan,
        table_name=table_name,
        phase_alias=phase_alias,
        metadata=metadata,
    )
    table_names = [name for _, name in migration_plan]

    if table_name:
        scope_label = f"table={table_name}"
    elif phase_alias:
        scope_label = f"phase={phase_alias} ({len(table_names)} tables)"
    else:
        scope_label = f"all tables ({len(table_names)})"

    _print_live_warnings(dry_run=dry_run, scope_label=scope_label)
    print(f"Source file: {sqlite_path}")
    print(f"Target:      {target_url}")
    print()

    if not dry_run:
        _confirm_live_migration(assume_yes=assume_yes)

    sqlite_url = f"sqlite:///{sqlite_path.as_posix()}"
    source_engine = create_engine(sqlite_url)
    target_engine = create_engine(target_url)
    source_metadata = _reflect_sqlite_metadata(source_engine)
    _check_target_tables(target_engine, table_names, metadata)

    summary = MigrationSummary(dry_run=dry_run)
    had_errors = False

    try:
        with source_engine.connect() as source_conn, target_engine.connect() as target_conn:
            if not dry_run:
                _set_replica_role(target_conn, True)

            current_phase: str | None = None
            for phase_name, tbl in migration_plan:
                if phase_name != current_phase:
                    current_phase = phase_name
                    print(f"\n--- Phase: {phase_name} ---")

                target_table = metadata.tables[tbl]
                try:
                    result = _migrate_one_table(
                        phase=phase_name,
                        table_name=tbl,
                        source_conn=source_conn,
                        target_conn=target_conn,
                        source_metadata=source_metadata,
                        target_table=target_table,
                        batch_size=batch_size,
                        dry_run=dry_run,
                    )
                    summary.results.append(result)
                except SQLAlchemyError as exc:
                    had_errors = True
                    if not dry_run:
                        target_conn.rollback()
                    summary.results.append(
                        TableMigrationResult(table=tbl, phase=phase_name, errors=[str(exc)])
                    )
                    logger.error("  %s: FAILED — %s", tbl, exc)
                    if continue_on_error:
                        continue
                    raise RuntimeError(f"Migration stopped at table {tbl!r}: {exc}") from exc

            if not dry_run:
                _set_replica_role(target_conn, False)
                target_conn.commit()
                _reset_postgres_sequences(target_conn, metadata, table_names)
                target_conn.commit()

            _set_replica_role(target_conn, False)
            summary.validations = _validate_row_counts(
                source_conn=source_conn,
                target_conn=target_conn,
                source_metadata=source_metadata,
                metadata=metadata,
                table_names=table_names,
            )
            summary.fk_violations = _verify_fk_integrity(
                target_conn,
                metadata,
                set(table_names),
            )

    except SQLAlchemyError as exc:
        raise RuntimeError(f"Migration failed: {exc}") from exc

    _print_summary(summary)
    _print_validation_summary(summary.validations)
    _print_fk_summary(summary.fk_violations)

    if had_errors and continue_on_error:
        print("\nCompleted with errors (--continue-on-error).")

    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Copy ORM table data from SQLite into PostgreSQL (idempotent, insert-only)."
    )
    parser.add_argument(
        "--sqlite-path",
        type=Path,
        default=DEFAULT_SQLITE_PATH,
        help=f"SQLite file path (default: {DEFAULT_SQLITE_PATH})",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Run LIVE migration (writes to PostgreSQL). Default is dry-run.",
    )
    parser.add_argument(
        "--table",
        metavar="TABLE",
        help="Migrate a single table, e.g. orders",
    )
    parser.add_argument(
        "--phase",
        choices=sorted(PHASE_ALIASES.keys()),
        help="Migrate one phase: foundation|catalog|orders|stock|returns|rest",
    )
    parser.add_argument(
        "--continue-on-error",
        action="store_true",
        help="Log table errors and continue instead of stopping.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Rows per batch (default: {DEFAULT_BATCH_SIZE})",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="Debug logging.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(message)s",
    )
    if args.batch_size < 1:
        raise SystemExit("--batch-size must be >= 1")

    dry_run = not args.yes

    summary = migrate(
        sqlite_path=args.sqlite_path.resolve(),
        assume_yes=args.yes,
        dry_run=dry_run,
        batch_size=args.batch_size,
        table_name=args.table,
        phase_alias=args.phase,
        continue_on_error=args.continue_on_error,
    )

    totals = summary.totals()
    if totals["tables_with_errors"] or totals["count_mismatches"] or totals["fk_violations"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
