"""Idempotent data migration for customer CRM field evolution."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .customer_constants import CUSTOMER_FLAGS, dump_customer_flags, parse_customer_flags
from ...db.schema_introspection import get_table_column_names, has_table

logger = logging.getLogger(__name__)


def _merge_flags_json(raw: object, patch: dict[str, bool]) -> str:
    current = parse_customer_flags(raw)
    for key in CUSTOMER_FLAGS:
        if key in patch:
            current[key] = bool(patch[key])
    return dump_customer_flags(current)


def migrate_customer_crm_legacy_values(engine: Engine) -> int:
    """
    Non-destructive, idempotent (raw SQL — safe on partial schemas):
    - customer_type b2b → wholesale (+ sales_channel b2b_portal when still store)
    - customer_type marketplace → retail + flags.marketplace (+ sales_channel marketplace_other)
    """
    if not has_table(engine, "customers"):
        return 0

    cols = set(get_table_column_names(engine, "customers"))
    if "customer_type" not in cols:
        return 0

    has_channel = "sales_channel" in cols
    has_flags = "flags_json" in cols
    changed = 0

    with engine.begin() as conn:
        b2b_count = int(
            conn.execute(
                text(
                    "SELECT COUNT(*) FROM customers WHERE lower(coalesce(customer_type, '')) = 'b2b'"
                )
            ).scalar()
            or 0
        )
        if b2b_count:
            if has_channel:
                conn.execute(
                    text(
                        """
                        UPDATE customers
                        SET customer_type = 'wholesale',
                            sales_channel = CASE
                                WHEN lower(coalesce(sales_channel, 'store')) = 'store' THEN 'b2b_portal'
                                ELSE sales_channel
                            END
                        WHERE lower(coalesce(customer_type, '')) = 'b2b'
                        """
                    )
                )
            else:
                conn.execute(
                    text(
                        """
                        UPDATE customers
                        SET customer_type = 'wholesale'
                        WHERE lower(coalesce(customer_type, '')) = 'b2b'
                        """
                    )
                )
            changed += b2b_count

        if has_flags:
            mp_rows = conn.execute(
                text(
                    """
                    SELECT id, flags_json FROM customers
                    WHERE lower(coalesce(customer_type, '')) = 'marketplace'
                    """
                )
            ).fetchall()
            for row in mp_rows:
                flags_json = _merge_flags_json(row.flags_json, {"marketplace": True})
                if has_channel:
                    conn.execute(
                        text(
                            """
                            UPDATE customers
                            SET customer_type = 'retail',
                                flags_json = :flags_json,
                                sales_channel = 'marketplace_other'
                            WHERE id = :id
                            """
                        ),
                        {"id": row.id, "flags_json": flags_json},
                    )
                else:
                    conn.execute(
                        text(
                            """
                            UPDATE customers
                            SET customer_type = 'retail', flags_json = :flags_json
                            WHERE id = :id
                            """
                        ),
                        {"id": row.id, "flags_json": flags_json},
                    )
            changed += len(mp_rows)
        else:
            mp_count = int(
                conn.execute(
                    text(
                        """
                        SELECT COUNT(*) FROM customers
                        WHERE lower(coalesce(customer_type, '')) = 'marketplace'
                        """
                    )
                ).scalar()
                or 0
            )
            if mp_count:
                if has_channel:
                    conn.execute(
                        text(
                            """
                            UPDATE customers
                            SET customer_type = 'retail', sales_channel = 'marketplace_other'
                            WHERE lower(coalesce(customer_type, '')) = 'marketplace'
                            """
                        )
                    )
                else:
                    conn.execute(
                        text(
                            """
                            UPDATE customers
                            SET customer_type = 'retail'
                            WHERE lower(coalesce(customer_type, '')) = 'marketplace'
                            """
                        )
                    )
                changed += mp_count

    if changed:
        logger.info(
            "[customer.migration] legacy_types_migrated count=%s dialect=%s",
            changed,
            engine.dialect.name,
        )
    return changed
