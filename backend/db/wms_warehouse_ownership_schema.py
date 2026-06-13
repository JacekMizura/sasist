"""P2 — warehouse ownership schema evolution + backfills."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from .schema_introspection import get_table_column_names, has_table

logger = logging.getLogger(__name__)

WMS_WAREHOUSE_OWNERSHIP_SCHEMA_VERSION = "2026.06.08.p2.wh_ownership"


def _add_column(engine: Engine, table: str, column: str, ddl_sqlite: str, ddl_pg: str) -> bool:
    if not has_table(engine, table):
        return False
    if column in get_table_column_names(engine, table):
        return False
    ddl = ddl_pg if engine.dialect.name == "postgresql" else ddl_sqlite
    with engine.begin() as conn:
        conn.execute(text(ddl))
    logger.info("[wms_ownership] added %s.%s", table, column)
    return True


def _run_backfills(db: Session, engine: Engine) -> dict[str, int]:
    from ..models.cart import Cart
    from ..models.cart_basket import CartBasket
    from ..models.location import Location
    from ..models.order import Order
    from ..models.pick_task import PickTask
    from ..models.stock_document import StockDocument
    from ..models.warehouse_carrier import WarehouseCarrier
    from ..services.wms_warehouse_ownership_service import apply_mm_warehouse_ids_to_document

    stats: dict[str, int] = {
        "pick_tasks_backfilled": 0,
        "stock_documents_backfilled": 0,
        "carriers_current_wh_backfilled": 0,
        "cart_baskets_backfilled": 0,
        "mm_source_dest_synced": 0,
    }

    pick_cols = get_table_column_names(engine, "pick_tasks") if has_table(engine, "pick_tasks") else set()
    sd_cols = get_table_column_names(engine, "stock_documents") if has_table(engine, "stock_documents") else set()
    carrier_cols = (
        get_table_column_names(engine, "warehouse_carriers") if has_table(engine, "warehouse_carriers") else set()
    )
    basket_cols = get_table_column_names(engine, "cart_baskets") if has_table(engine, "cart_baskets") else set()

    order_wh: dict[int, int] = {}

    # --- PickTask: location → order ---
    if "warehouse_id" in pick_cols:
        pt_rows = db.query(PickTask).filter(PickTask.warehouse_id.is_(None)).all()
        loc_ids = {int(r.location_id) for r in pt_rows}
        loc_wh: dict[int, int] = {}
        if loc_ids:
            for lid, wid in db.query(Location.id, Location.warehouse_id).filter(Location.id.in_(loc_ids)).all():
                if wid is not None:
                    loc_wh[int(lid)] = int(wid)
        order_ids = {int(r.order_id) for r in pt_rows}
        if order_ids:
            for oid, wid in db.query(Order.id, Order.warehouse_id).filter(Order.id.in_(order_ids)).all():
                if wid is not None:
                    order_wh[int(oid)] = int(wid)

        for row in pt_rows:
            wid = loc_wh.get(int(row.location_id)) or order_wh.get(int(row.order_id))
            if wid is not None:
                row.warehouse_id = int(wid)
                stats["pick_tasks_backfilled"] += 1

    # --- StockDocument NULL warehouse_id ---
    if "warehouse_id" in sd_cols:
        sd_rows = db.query(StockDocument).filter(StockDocument.warehouse_id.is_(None)).all()
        for doc in sd_rows:
            apply_mm_warehouse_ids_to_document(db, doc)
            if doc.warehouse_id is not None:
                stats["stock_documents_backfilled"] += 1
                continue
            if doc.order_id is not None:
                ow = order_wh.get(int(doc.order_id))
                if ow is None:
                    o = db.query(Order.warehouse_id).filter(Order.id == int(doc.order_id)).first()
                    if o and o[0] is not None:
                        ow = int(o[0])
                if ow is not None:
                    doc.warehouse_id = int(ow)
                    stats["stock_documents_backfilled"] += 1
                    continue
            if doc.mm_from_location_id is not None:
                loc = db.query(Location.warehouse_id).filter(Location.id == int(doc.mm_from_location_id)).first()
                if loc and loc[0] is not None:
                    doc.warehouse_id = int(loc[0])
                    stats["stock_documents_backfilled"] += 1

    # --- MM source/destination sync ---
    if "source_warehouse_id" in sd_cols and "destination_warehouse_id" in sd_cols:
        mm_docs = db.query(StockDocument).filter(StockDocument.document_type == "MM").all()
    else:
        mm_docs = []
    for doc in mm_docs:
        before = (getattr(doc, "source_warehouse_id", None), getattr(doc, "destination_warehouse_id", None))
        apply_mm_warehouse_ids_to_document(db, doc)
        after = (getattr(doc, "source_warehouse_id", None), getattr(doc, "destination_warehouse_id", None))
        if after != before or (doc.source_warehouse_id is not None and doc.destination_warehouse_id is not None):
            stats["mm_source_dest_synced"] += 1

    # --- Carriers: current_warehouse_id from location ---
    from ..services.wms_warehouse_ownership_service import sync_carrier_current_warehouse

    if "current_warehouse_id" in carrier_cols:
        carriers = db.query(WarehouseCarrier).filter(WarehouseCarrier.current_warehouse_id.is_(None)).all()
    else:
        carriers = []
    for c in carriers:
        if c.current_location_id is None:
            continue
        prev = c.current_warehouse_id
        sync_carrier_current_warehouse(c, db)
        if c.current_warehouse_id is not None and c.current_warehouse_id != prev:
            stats["carriers_current_wh_backfilled"] += 1

    # --- CartBasket from Cart ---
    if "warehouse_id" in basket_cols:
        baskets = (
            db.query(CartBasket)
            .filter(CartBasket.warehouse_id.is_(None))
            .all()
        )
        cart_ids = {int(b.cart_id) for b in baskets}
        cart_wh: dict[int, int] = {}
        if cart_ids:
            for cid, wid in db.query(Cart.id, Cart.warehouse_id).filter(Cart.id.in_(cart_ids)).all():
                cart_wh[int(cid)] = int(wid)
        for b in baskets:
            wid = cart_wh.get(int(b.cart_id))
            if wid is not None:
                b.warehouse_id = int(wid)
                stats["cart_baskets_backfilled"] += 1
    else:
        baskets = []

    db.commit()
    return stats


def ensure_wms_warehouse_ownership_schema(engine: Engine) -> dict[str, Any]:
    """Add P2 ownership columns + backfill. Returns stats dict."""
    stats: dict[str, Any] = {"columns_added": [], "backfill": {}}

    if _add_column(
        engine,
        "pick_tasks",
        "warehouse_id",
        "ALTER TABLE pick_tasks ADD COLUMN warehouse_id INTEGER NULL REFERENCES warehouses(id)",
        "ALTER TABLE pick_tasks ADD COLUMN warehouse_id INTEGER NULL REFERENCES warehouses(id)",
    ):
        stats["columns_added"].append("pick_tasks.warehouse_id")
        with engine.begin() as conn:
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_pick_tasks_warehouse_id ON pick_tasks(warehouse_id)"))

    if _add_column(
        engine,
        "warehouse_carriers",
        "current_warehouse_id",
        "ALTER TABLE warehouse_carriers ADD COLUMN current_warehouse_id INTEGER NULL REFERENCES warehouses(id)",
        "ALTER TABLE warehouse_carriers ADD COLUMN current_warehouse_id INTEGER NULL REFERENCES warehouses(id)",
    ):
        stats["columns_added"].append("warehouse_carriers.current_warehouse_id")
        with engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_wh_carriers_current_wh "
                    "ON warehouse_carriers(current_warehouse_id)"
                )
            )

    for col in ("source_warehouse_id", "destination_warehouse_id"):
        if _add_column(
            engine,
            "stock_documents",
            col,
            f"ALTER TABLE stock_documents ADD COLUMN {col} INTEGER NULL REFERENCES warehouses(id)",
            f"ALTER TABLE stock_documents ADD COLUMN {col} INTEGER NULL REFERENCES warehouses(id)",
        ):
            stats["columns_added"].append(f"stock_documents.{col}")

    if _add_column(
        engine,
        "cart_baskets",
        "warehouse_id",
        "ALTER TABLE cart_baskets ADD COLUMN warehouse_id INTEGER NULL REFERENCES warehouses(id)",
        "ALTER TABLE cart_baskets ADD COLUMN warehouse_id INTEGER NULL REFERENCES warehouses(id)",
    ):
        stats["columns_added"].append("cart_baskets.warehouse_id")

    from ..database import SessionLocal

    db = SessionLocal()
    try:
        db.expire_all()
        stats["backfill"] = _run_backfills(db, engine)
        stats["null_warehouse_report"] = _null_warehouse_report(db, engine)
    except Exception:
        db.rollback()
        logger.exception("[wms_ownership] backfill failed")
        raise
    finally:
        db.close()

    logger.info("[wms_ownership] complete stats=%s", stats)
    return stats


def _null_warehouse_report(db: Session, engine: Engine) -> dict[str, Any]:
    from sqlalchemy import func

    from ..models.pick_task import PickTask
    from ..models.stock_document import StockDocument

    pick_null = 0
    if has_table(engine, "pick_tasks") and "warehouse_id" in get_table_column_names(engine, "pick_tasks"):
        pick_null = int(
            db.query(func.count(PickTask.id)).filter(PickTask.warehouse_id.is_(None)).scalar() or 0
        )

    by_type: dict[str, int] = {}
    if has_table(engine, "stock_documents"):
        by_type = {
            str(r[0] or "?"): int(r[1])
            for r in db.query(StockDocument.document_type, func.count(StockDocument.id))
            .filter(StockDocument.warehouse_id.is_(None))
            .group_by(StockDocument.document_type)
            .all()
        }
    return {
        "stock_documents_null_warehouse_total": sum(by_type.values()),
        "stock_documents_null_by_type": by_type,
        "pick_tasks_null_warehouse": pick_null,
    }
