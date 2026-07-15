"""Read-only schema diagnostics for supplier_products."""

from __future__ import annotations

from typing import Any

from sqlalchemy import inspect
from sqlalchemy.engine import Engine

from ...db.schema_introspection import audit_model_schema
from ...models.supplier_product import SupplierProduct


def inspect_supplier_product_links_schema(engine: Engine) -> dict[str, Any]:
    audit = audit_model_schema(engine, SupplierProduct)
    table = SupplierProduct.__tablename__
    indexes: list[dict[str, Any]] = []
    foreign_keys: list[dict[str, Any]] = []

    if audit.get("exists"):
        insp = inspect(engine)
        for idx in insp.get_indexes(table):
            indexes.append(
                {
                    "name": idx.get("name"),
                    "columns": idx.get("column_names") or idx.get("columns") or [],
                    "unique": bool(idx.get("unique", False)),
                }
            )
        for fk in insp.get_foreign_keys(table):
            foreign_keys.append(
                {
                    "name": fk.get("name"),
                    "constrained_columns": fk.get("constrained_columns") or [],
                    "referred_table": fk.get("referred_table"),
                    "referred_columns": fk.get("referred_columns") or [],
                }
            )

    return {
        "table": table,
        "table_exists": bool(audit.get("exists")),
        "missing_columns": audit.get("missing_in_db") or [],
        "db_columns": audit.get("db_columns") or [],
        "orm_columns": audit.get("orm_columns") or [],
        "extra_columns_in_db": audit.get("extra_in_db") or [],
        "indexes": indexes,
        "foreign_keys": foreign_keys,
        "missing_indexes": audit.get("missing_indexes") or [],
        "fk_mismatches": audit.get("fk_mismatches") or [],
        "type_mismatches": audit.get("type_mismatches") or [],
        "nullable_mismatches": audit.get("nullable_mismatches") or [],
    }
