"""One-shot migration: capacity_mode/max_orders → capacity_strategy/capacity_orders/capacity_volume."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from ..services.cart_capacity.enums import LEGACY_CAPACITY_MODE_TO_STRATEGY, CapacityStrategy

logger = logging.getLogger(__name__)


def ensure_cart_capacity_columns(engine: Engine) -> None:
    """
    Ensure carts has capacity_strategy / capacity_orders / capacity_volume.
    Migrates legacy capacity_mode + max_orders when present.
    """
    from .schema_introspection import get_table_column_names, has_table

    if not has_table(engine, "carts"):
        return

    cols = get_table_column_names(engine, "carts")
    dialect = engine.dialect.name

    with engine.begin() as conn:
        if "capacity_strategy" not in cols:
            if dialect == "postgresql":
                conn.execute(
                    text(
                        "ALTER TABLE carts ADD COLUMN capacity_strategy VARCHAR(32) "
                        "NOT NULL DEFAULT 'LIMIT_VOLUME'"
                    )
                )
            else:
                conn.execute(
                    text(
                        "ALTER TABLE carts ADD COLUMN capacity_strategy VARCHAR(32) "
                        "NOT NULL DEFAULT 'LIMIT_VOLUME'"
                    )
                )

        if "capacity_orders" not in cols:
            conn.execute(text("ALTER TABLE carts ADD COLUMN capacity_orders INTEGER"))

        if "capacity_volume" not in cols:
            conn.execute(text("ALTER TABLE carts ADD COLUMN capacity_volume FLOAT"))

    cols = get_table_column_names(engine, "carts")

    with engine.begin() as conn:
        # Copy max_orders → capacity_orders when capacity_orders empty
        if "max_orders" in cols and "capacity_orders" in cols:
            conn.execute(
                text(
                    """
                    UPDATE carts
                    SET capacity_orders = max_orders
                    WHERE capacity_orders IS NULL AND max_orders IS NOT NULL
                    """
                )
            )

        # Remap capacity_mode → capacity_strategy
        if "capacity_mode" in cols:
            for legacy, strategy in LEGACY_CAPACITY_MODE_TO_STRATEGY.items():
                conn.execute(
                    text(
                        """
                        UPDATE carts
                        SET capacity_strategy = :strategy
                        WHERE lower(trim(capacity_mode)) = :legacy
                        """
                    ),
                    {"strategy": strategy.value, "legacy": legacy},
                )
            # MULTI carts always BASKETS
            conn.execute(
                text(
                    """
                    UPDATE carts
                    SET capacity_strategy = :strategy
                    WHERE upper(cast(type AS TEXT)) LIKE '%MULTI%'
                    """
                ),
                {"strategy": CapacityStrategy.BASKETS.value},
            )

        # Normalize any leftover lowercase / legacy strategy strings
        for legacy, strategy in LEGACY_CAPACITY_MODE_TO_STRATEGY.items():
            conn.execute(
                text(
                    """
                    UPDATE carts
                    SET capacity_strategy = :strategy
                    WHERE lower(trim(capacity_strategy)) = :legacy
                    """
                ),
                {"strategy": strategy.value, "legacy": legacy},
            )

    # Drop legacy columns (target architecture — no dual fields).
    # Use live column list (PRAGMA / information_schema) — Inspector cache can lie after ADD.
    with engine.connect() as conn:
        if dialect == "postgresql":
            live = {
                str(r[0])
                for r in conn.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns "
                        "WHERE table_schema = current_schema() AND table_name = 'carts'"
                    )
                ).fetchall()
            }
        else:
            live = {
                str(r[1])
                for r in conn.execute(text("PRAGMA table_info(carts)")).fetchall()
            }
        if "capacity_mode" in live:
            try:
                conn.execute(text("ALTER TABLE carts DROP COLUMN capacity_mode"))
                conn.commit()
            except Exception:
                conn.rollback()
                logger.warning("[cart.capacity] could not DROP capacity_mode", exc_info=True)
        if "max_orders" in live:
            try:
                # Re-read after possible prior commit
                if dialect == "postgresql":
                    live2 = {
                        str(r[0])
                        for r in conn.execute(
                            text(
                                "SELECT column_name FROM information_schema.columns "
                                "WHERE table_schema = current_schema() AND table_name = 'carts'"
                            )
                        ).fetchall()
                    }
                else:
                    live2 = {
                        str(r[1])
                        for r in conn.execute(text("PRAGMA table_info(carts)")).fetchall()
                    }
                if "max_orders" in live2:
                    conn.execute(text("ALTER TABLE carts DROP COLUMN max_orders"))
                    conn.commit()
            except Exception:
                conn.rollback()
                logger.warning("[cart.capacity] could not DROP max_orders", exc_info=True)

    logger.info("[cart.capacity] columns ensured (capacity_strategy / capacity_orders / capacity_volume)")
