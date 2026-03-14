"""
MAIN APPLICATION ENTRY POINT
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.requests import Request

from .database import Base, engine
from .middleware.request_metrics import record_request, record_error

# Import all models so SQLAlchemy mappers (and relationships like Tenant.storage_units) are registered
# before Base.metadata.create_all() runs.
from . import models  # noqa: F401

from .api.warehouse import router as warehouse_router
from .api.warehouses import router as warehouses_router
from .api.tenant_warehouse import router as tenant_warehouse_router
from .api.simulation import router as simulation_router, router_assign as simulation_assign_router
from .api.analysis import router as analysis_router
from .api.tenant import router as tenant_router
from .api.planning import router as planning_router
from .api.cart import router as cart_router
from .api.import_api import router as import_router
from .api.order import router as order_router
from .api.product import router as product_router
from .api.optimizer import router as optimizer_router
from .api.picking_zone import router as picking_zone_router
from .api.consolidation_rack import router as consolidation_rack_router
from .api.warehouse_map import router as warehouse_map_router
from .api.warehouse_layout import router as warehouse_layout_router
from .api.warehouse_graph import router as warehouse_graph_router
from .api.warehouse_template import router as warehouse_template_router
from .api.label_template import router as label_template_router
from .api.label_sizes import router as label_sizes_router
from .api.labels import router as labels_router
from .api.label_pack import router as label_pack_router
from .api.label_preview import router as label_preview_router
from .api.printer_profiles import router as printer_profiles_router
from .api.printers import router as printers_router
from .api.qz import router as qz_router
from .api.wave import router as wave_router
from .api.scan import router as scan_router
from .api.inventory_api import router as inventory_router
from .api.picks import router as picks_router
from .api.system import router as system_router
from .api.dev import router as dev_router


# ==================================================
# APP
# ==================================================

app = FastAPI(title="WMS Backend V2")


# ==================================================
# CORS + REQUEST METRICS
# ==================================================

app.middleware("http")(record_request)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================================================
# GLOBAL EXCEPTION HANDLER (error count last 24h)
# ==================================================

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    await record_error(request, exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

# ==================================================
# DB INIT
# ==================================================
# All models are imported via "from . import models" above so they are
# registered with Base.metadata before create_all.
Base.metadata.create_all(bind=engine)

# Ensure new columns exist on existing SQLite DBs (create_all does not alter tables)
def _ensure_order_columns():
    from sqlalchemy import text
    try:
        with engine.begin() as conn:
            r = conn.execute(text("PRAGMA table_info(order_items)"))
            cols = {row[1] for row in r}
            for col, typ in [("unit_price", "REAL"), ("total_price", "REAL"), ("unit", "TEXT")]:
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE order_items ADD COLUMN {col} {typ}"))
            r = conn.execute(text("PRAGMA table_info(orders)"))
            cols = {row[1] for row in r}
            if "created_at" not in cols:
                conn.execute(text("ALTER TABLE orders ADD COLUMN created_at DATETIME"))
    except Exception:
        pass


def _ensure_location_warehouse_columns():
    """Add location coordinates (x, y, z) and warehouse start position (start_x, start_y). Existing rows get NULL/0."""
    from sqlalchemy import text
    try:
        with engine.begin() as conn:
            r = conn.execute(text("PRAGMA table_info(locations)"))
            cols = {row[1] for row in r}
            for col, typ in [("x", "REAL"), ("y", "REAL"), ("z", "REAL")]:
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE locations ADD COLUMN {col} {typ}"))
            if "graph_node_id" not in cols:
                conn.execute(text("ALTER TABLE locations ADD COLUMN graph_node_id INTEGER"))
            if "location_type" not in cols:
                conn.execute(text("ALTER TABLE locations ADD COLUMN location_type VARCHAR(20) NOT NULL DEFAULT 'NORMAL'"))
            if "pick_sequence" not in cols:
                conn.execute(text("ALTER TABLE locations ADD COLUMN pick_sequence INTEGER"))
            r = conn.execute(text("PRAGMA table_info(warehouses)"))
            cols = {row[1] for row in r}
            for col, typ in [("start_x", "REAL"), ("start_y", "REAL")]:
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE warehouses ADD COLUMN {col} {typ}"))
    except Exception:
        pass


def _ensure_pick_columns():
    """Add Pick event fields: warehouse_id, order_item_id, picked_at, picker_id. Make inventory_unit_id nullable for simulated picks."""
    from sqlalchemy import text
    try:
        with engine.begin() as conn:
            r = conn.execute(text("PRAGMA table_info(picks)"))
            rows = r.fetchall()
            cols = {row[1] for row in rows}
            # notnull is index 3 in PRAGMA table_info: (cid, name, type, notnull, dflt_value, pk)
            notnull_by_name = {row[1]: row[3] for row in rows}
            for col, typ in [
                ("warehouse_id", "INTEGER"),
                ("order_item_id", "INTEGER"),
                ("picked_at", "DATETIME"),
                ("picker_id", "INTEGER"),
            ]:
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE picks ADD COLUMN {col} {typ}"))
            # Backfill warehouse_id from order (for existing rows after adding column)
            try:
                conn.execute(text(
                    "UPDATE picks SET warehouse_id = (SELECT warehouse_id FROM orders WHERE orders.id = picks.order_id) WHERE warehouse_id IS NULL"
                ))
            except Exception:
                pass
            # SQLite: make inventory_unit_id nullable by recreating table if it is currently NOT NULL
            if notnull_by_name.get("inventory_unit_id") == 1:
                conn.execute(text("""
                    CREATE TABLE picks_new (
                        id INTEGER PRIMARY KEY,
                        created_at DATETIME NOT NULL,
                        updated_at DATETIME NOT NULL,
                        tenant_id INTEGER NOT NULL,
                        warehouse_id INTEGER,
                        order_id INTEGER NOT NULL,
                        order_item_id INTEGER,
                        product_id INTEGER NOT NULL,
                        location_id INTEGER NOT NULL,
                        quantity FLOAT NOT NULL,
                        picked_at DATETIME,
                        picker_id INTEGER,
                        inventory_unit_id INTEGER,
                        status VARCHAR(20) NOT NULL,
                        FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
                        FOREIGN KEY(warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
                        FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
                        FOREIGN KEY(order_item_id) REFERENCES order_items(id) ON DELETE SET NULL,
                        FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
                        FOREIGN KEY(location_id) REFERENCES locations(id) ON DELETE CASCADE,
                        FOREIGN KEY(inventory_unit_id) REFERENCES inventory_units(id)
                    )
                """))
                conn.execute(text("""
                    INSERT INTO picks_new (id, created_at, updated_at, tenant_id, warehouse_id, order_id, order_item_id, product_id, location_id, quantity, picked_at, picker_id, inventory_unit_id, status)
                    SELECT id, created_at, updated_at, tenant_id, warehouse_id, order_id, order_item_id, product_id, location_id, quantity, picked_at, picker_id, inventory_unit_id, status FROM picks
                """))
                conn.execute(text("DROP TABLE picks"))
                conn.execute(text("ALTER TABLE picks_new RENAME TO picks"))
    except Exception:
        pass


_ensure_order_columns()
_ensure_location_warehouse_columns()
_ensure_pick_columns()

# ==================================================
# ROUTERS
# ==================================================

app.include_router(tenant_router)
app.include_router(warehouse_router)
app.include_router(warehouses_router)
app.include_router(tenant_warehouse_router)
app.include_router(product_router)
app.include_router(order_router)
app.include_router(import_router)
app.include_router(cart_router)
app.include_router(planning_router)
app.include_router(simulation_router)
app.include_router(simulation_assign_router)
app.include_router(analysis_router)
app.include_router(optimizer_router)
app.include_router(picking_zone_router)
app.include_router(consolidation_rack_router)
app.include_router(warehouse_map_router)
app.include_router(warehouse_layout_router)
app.include_router(warehouse_graph_router)
app.include_router(warehouse_template_router)
app.include_router(label_template_router)
app.include_router(label_sizes_router)
app.include_router(labels_router)
app.include_router(label_pack_router)
app.include_router(label_preview_router)
app.include_router(printer_profiles_router)
app.include_router(printers_router)
app.include_router(qz_router)
app.include_router(wave_router)
app.include_router(scan_router)
app.include_router(inventory_router)
app.include_router(picks_router)
app.include_router(system_router)
app.include_router(dev_router)