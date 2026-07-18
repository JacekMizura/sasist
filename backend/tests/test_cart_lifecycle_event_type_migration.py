"""
Regression: legacy cart_lifecycle_events.event_type NOT NULL broke Event Log INSERTs.

Canonical field is event_code (ORM + append_lifecycle_event). ensure_* must
backfill then DROP event_type so writers never hit NotNullViolation.

  python -m pytest backend/tests/test_cart_lifecycle_event_type_migration.py -q
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.db.schema_upgrade import ensure_cart_lifecycle_events_table
from backend.models.cart import Cart
from backend.models.cart_lifecycle_event import CartLifecycleEvent
from backend.models.enums import CartStatus, CartType
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.cart_lifecycle_event_catalog import (
    EVENT_CART_CLAIMED,
    EVENT_CART_RELEASED,
    EVENT_FIRST_PRODUCT_CONFIRMED,
    EVENT_ORDER_PACKED,
    EVENT_PACKING_FINISHED,
    EVENT_PACKING_STARTED,
    EVENT_PICKING_CANCELLED,
    EVENT_PICKING_FINISHED,
    EVENT_PICKING_STARTED,
    EVENT_RESERVATION_TIMED_OUT,
)
from backend.services.cart_lifecycle_extensions import append_lifecycle_event


REQUIRED_EVENT_CODES = (
    EVENT_CART_CLAIMED,
    EVENT_PICKING_STARTED,
    EVENT_FIRST_PRODUCT_CONFIRMED,
    EVENT_PICKING_FINISHED,
    EVENT_PACKING_STARTED,
    EVENT_ORDER_PACKED,
    EVENT_PACKING_FINISHED,
    EVENT_CART_RELEASED,
    EVENT_RESERVATION_TIMED_OUT,
    EVENT_PICKING_CANCELLED,
)


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _pragma_cols(engine) -> set[str]:
    with engine.connect() as conn:
        return {
            str(r[1])
            for r in conn.execute(text("PRAGMA table_info(cart_lifecycle_events)")).fetchall()
        }


def test_orm_model_has_event_code_not_event_type():
    cols = {c.name for c in CartLifecycleEvent.__table__.columns}
    assert "event_code" in cols
    assert "event_type" not in cols


def test_ensure_idempotent_three_runs_on_legacy_then_canonical():
    """1st run retires event_type; 2nd and 3rd are no-op (no error, column stays gone)."""
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE cart_lifecycle_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    tenant_id INTEGER NOT NULL,
                    warehouse_id INTEGER NOT NULL,
                    cart_id INTEGER NOT NULL,
                    event_type VARCHAR(64) NOT NULL,
                    description VARCHAR(512) NOT NULL,
                    occurred_at DATETIME NOT NULL
                )
                """
            )
        )
        conn.execute(
            text(
                "INSERT INTO cart_lifecycle_events "
                "(tenant_id, warehouse_id, cart_id, event_type, description, occurred_at) "
                "VALUES (1, 1, 1, 'cart_claimed', 'legacy', :ts)"
            ),
            {"ts": _utcnow_naive().isoformat(sep=" ")},
        )

    ensure_cart_lifecycle_events_table(engine)
    cols1 = _pragma_cols(engine)
    assert "event_code" in cols1 and "event_type" not in cols1 and "severity" in cols1

    ensure_cart_lifecycle_events_table(engine)
    cols2 = _pragma_cols(engine)
    assert cols2 == cols1

    ensure_cart_lifecycle_events_table(engine)
    cols3 = _pragma_cols(engine)
    assert cols3 == cols1


def test_ensure_retires_legacy_event_type_and_inserts_catalog_events():
    engine = create_engine("sqlite:///:memory:")
    for model in (Tenant, Warehouse, Cart):
        model.__table__.create(engine, checkfirst=True)

    with engine.begin() as conn:
        # Legacy shape: event_type NOT NULL, no event_code (root cause of PG 500).
        conn.execute(
            text(
                """
                CREATE TABLE cart_lifecycle_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    tenant_id INTEGER NOT NULL,
                    warehouse_id INTEGER NOT NULL,
                    cart_id INTEGER NOT NULL,
                    event_type VARCHAR(64) NOT NULL,
                    description VARCHAR(512) NOT NULL,
                    operator_user_id INTEGER,
                    occurred_at DATETIME NOT NULL,
                    session_id INTEGER,
                    batch_id INTEGER,
                    order_id INTEGER,
                    metadata_json TEXT
                )
                """
            )
        )
        conn.execute(
            text(
                "INSERT INTO cart_lifecycle_events "
                "(tenant_id, warehouse_id, cart_id, event_type, description, occurred_at) "
                "VALUES (1, 1, 1, 'cart_claimed', 'legacy row', :ts)"
            ),
            {"ts": _utcnow_naive().isoformat(sep=" ")},
        )

    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        db.add(Tenant(id=1, name="T", default_warehouse_id=1))
        db.add(Warehouse(id=1, tenant_id=1, name="WH"))
        db.add(
            Cart(
                tenant_id=1,
                warehouse_id=1,
                name="WOZ-001",
                code="CART-001",
                type=CartType.BULK,
                status=CartStatus.AVAILABLE.value,
                length=100,
                width=60,
                height=80,
                total_volume=480.0,
                used_volume=0.0,
                capacity_strategy="LIMIT_VOLUME",
            )
        )
        db.commit()
        cart = db.query(Cart).one()
        if int(cart.id) != 1:
            with engine.begin() as conn:
                conn.execute(
                    text("UPDATE cart_lifecycle_events SET cart_id = :cid WHERE id = 1"),
                    {"cid": int(cart.id)},
                )

        ensure_cart_lifecycle_events_table(engine)

        cols = _pragma_cols(engine)
        assert "event_code" in cols
        assert "event_type" not in cols
        assert "severity" in cols

        legacy = db.execute(
            text("SELECT event_code, description FROM cart_lifecycle_events WHERE id = 1")
        ).fetchone()
        assert legacy is not None
        assert legacy[0] == "cart_claimed"

        db.expire_all()
        cart = db.get(Cart, int(cart.id))
        assert cart is not None
        for code in REQUIRED_EVENT_CODES:
            ev = append_lifecycle_event(db, cart=cart, event_code=code)
            assert ev.event_code == code
            assert ev.description
            assert ev.severity
        db.commit()

        codes = [
            r[0]
            for r in db.execute(
                text("SELECT event_code FROM cart_lifecycle_events ORDER BY id")
            ).fetchall()
        ]
        for code in REQUIRED_EVENT_CODES:
            assert code in codes
    finally:
        db.close()
