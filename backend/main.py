"""
MAIN APPLICATION ENTRY POINT
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine

# Import all models so SQLAlchemy mappers (and relationships like Tenant.storage_units) are registered
# before Base.metadata.create_all() runs.
from . import models  # noqa: F401

from .api.warehouse import router as warehouse_router
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
from .api.warehouse_template import router as warehouse_template_router
from .api.label_template import router as label_template_router


# ==================================================
# APP
# ==================================================

app = FastAPI(title="WMS Backend V2")

# ==================================================
# CORS
# ==================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================================================
# DB INIT
# ==================================================

Base.metadata.create_all(bind=engine)

# Optional: add columns to warehouse_layout_racks if missing (internal layout, color, template_id)
def _migrate_warehouse_layout():
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            r = conn.execute(text("PRAGMA table_info(warehouse_layout_racks)"))
            cols = [row[1] for row in r]
            if "internal_structure" not in cols:
                conn.execute(text("ALTER TABLE warehouse_layout_racks ADD COLUMN internal_structure TEXT"))
            if "color" not in cols:
                conn.execute(text("ALTER TABLE warehouse_layout_racks ADD COLUMN color VARCHAR(32)"))
            if "template_id" not in cols:
                conn.execute(text("ALTER TABLE warehouse_layout_racks ADD COLUMN template_id VARCHAR(64)"))
            layout_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(warehouse_layouts)")).fetchall()]
            if "row_containers_json" not in layout_cols:
                conn.execute(text("ALTER TABLE warehouse_layouts ADD COLUMN row_containers_json TEXT"))
            conn.commit()
    except Exception:
        pass

_migrate_warehouse_layout()


def _migrate_products_assigned_locations():
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            r = conn.execute(text("PRAGMA table_info(products)"))
            cols = [row[1] for row in r]
            if "assigned_locations" not in cols:
                conn.execute(text("ALTER TABLE products ADD COLUMN assigned_locations TEXT"))
            conn.commit()
    except Exception:
        pass


_migrate_products_assigned_locations()


# Weryfikacja, że kluczowe kolumny istnieją (np. po aktualizacji modeli)
def _check_db_schema():
    import logging
    from sqlalchemy import text
    log = logging.getLogger(__name__)
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT used_volume FROM carts LIMIT 1"))
            conn.execute(text("SELECT order_id, used_volume FROM cart_baskets LIMIT 1"))
            conn.execute(text("SELECT cart_id, basket_id, total_volume_dm3 FROM orders LIMIT 1"))
        log.info("Database schema check OK (carts, cart_baskets, orders.cart_id/basket_id/total_volume_dm3)")
    except Exception as e:
        log.warning(
            "Database schema may be outdated. For Order model add: "
            "ALTER TABLE orders ADD COLUMN IF NOT EXISTS basket_id INTEGER REFERENCES cart_baskets(id); "
            "ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_volume_dm3 FLOAT; Error: %s", e
        )

_check_db_schema()

# ==================================================
# ROUTERS
# ==================================================

app.include_router(tenant_router)
app.include_router(warehouse_router)
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
app.include_router(warehouse_template_router)
app.include_router(label_template_router)