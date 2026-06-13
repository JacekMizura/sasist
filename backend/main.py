"""
MAIN APPLICATION ENTRY POINT
"""

if __name__ == "__main__" and __package__ is None:
    raise RuntimeError("Run backend using: python -m backend")

from pathlib import Path
import logging
import os
import sys
import traceback

from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.requests import Request

# Import all ORM models first so every table is registered on Base.metadata before create_all.
from . import models  # noqa: F401

from .database import create_all_tables, engine
from .db.schema_upgrade import (
    ensure_locations_columns,
    ensure_warehouse_layout_identity_columns,
    ensure_warehouse_layout_building_columns,
    ensure_warehouse_layout_rack_name_unique_index,
    ensure_products_physical_columns,
    ensure_products_stack_columns,
    ensure_products_stack_behavior_column,
    ensure_products_import_metadata_columns,
    ensure_products_replenishment_levels_columns,
    ensure_products_reserve_replenishment_columns,
    ensure_replenishment_tasks_table,
    ensure_replenishment_tasks_sources_json_column,
    ensure_warehouse_carrier_tables,
    ensure_inventory_carrier_id_column,
    ensure_inventory_carrier_unique_indexes,
    ensure_stock_document_item_suggested_carrier_column,
    ensure_receiving_document_carriers_table,
    ensure_stock_document_item_line_warehouse_carrier_column,
    ensure_wms_product_warehouse_operations_table,
    ensure_products_stock_alert_columns,
    ensure_products_carton_columns,
    ensure_products_carton_stacking_columns,
    ensure_products_receiving_requirements_columns,
    ensure_products_deleted_at_column,
    ensure_orders_deleted_at_column,
    ensure_customers_deleted_at_column,
    ensure_bundles_deleted_at_column,
    ensure_wms_order_returns_deleted_at_column,
    ensure_inventory_location_uuid_columns,
    ensure_damage_report_columns,
    ensure_wms_order_returns_columns,
    ensure_rmz_line_split_columns,
    ensure_rmz_line_damage_entries_json,
    ensure_wms_refunds_columns,
    ensure_return_statuses_and_rmz,
    ensure_return_ui_statuses_and_column,
    ensure_order_ui_statuses_and_column,
    ensure_order_ui_statuses_is_system_column,
    ensure_panel_ui_statuses_advanced_columns,
    ensure_orders_complaint_origin_columns,
    ensure_complaints_and_complaint_ui_statuses,
    ensure_complaint_shipments_tables,
    ensure_complaint_order_and_lines,
    ensure_complaint_process_status_column,
    ensure_complaint_deleted_at_column,
    ensure_complaint_defects_reason_columns,
    ensure_complaint_response_deadline_columns,
    ensure_complaint_decision_hierarchy_columns,
    ensure_complaint_resolution_columns,
    ensure_complaint_documents_table,
    ensure_order_documents_and_activity_logs_tables,
    ensure_complaint_logistics_columns,
    ensure_complaint_customer_snapshot_columns,
    ensure_complaint_production_columns,
    ensure_complaint_events_table,
    ensure_production_tables,
    ensure_product_compositions_and_batches,
    ensure_production_batch_schema_sync,
    ensure_production_schema_evolution,
    ensure_bundles_tables_and_order_item_bundle_columns,
    ensure_manufacturers_table_and_product_manufacturer_id,
    ensure_suppliers_and_inbound_deliveries_tables,
    ensure_deliveries_name_column,
    ensure_supplier_assortment_columns_and_product_default_supplier,
    ensure_supplier_products_table,
    ensure_supplier_purchasing_columns,
    ensure_purchase_orders_tables,
    ensure_currency_exchange_rates_table,
    ensure_purchase_order_tax_invoice_columns,
    ensure_products_purchase_snapshot_columns,
    ensure_products_extra_cost_columns,
    ensure_purchasing_alert_tables,
    ensure_purchase_auto_reorder_tables,
    ensure_deliveries_purchase_order_id_column,
    ensure_manufacturer_supplier_business_entity_columns,
    ensure_tenant_business_profile_columns,
    ensure_tenant_default_warehouse_column,
    ensure_stock_documents_tables,
    ensure_stock_document_item_ordered_received_columns,
    ensure_stock_documents_receiving_status_column,
    ensure_wms_ad_hoc_receiving_schema,
    ensure_stock_documents_created_by_columns,
    ensure_stock_documents_updated_at_column,
    migrate_stock_documents_nullable_warehouse_location,
    ensure_stock_document_items_return_receipt_columns,
    ensure_warehouse_sqlite_schema_stabilization,
    ensure_return_product_decisions_creates_stock_document_column,
    ensure_workforce_operational_tables,
    ensure_workforce_user_groups_schema,
    migrate_orders_sales_document_misassigned_number,
    ensure_product_barcodes_table,
    ensure_product_track_batch_expiry_columns,
    ensure_inventory_serials_table,
    ensure_stock_document_item_lot_columns,
    ensure_stock_document_item_quantity_putaway_column,
    ensure_stock_document_item_putaway_meta_columns,
    ensure_stock_document_item_mm_line_from_location_column,
    ensure_stock_document_item_wms_line_source_column,
    ensure_stock_document_items_wm_receipt_columns,
    ensure_stock_document_item_receiving_split_columns,
    ensure_receiving_scan_logs_table,
    ensure_stock_item_locations_table,
    ensure_stock_documents_financial_columns,
    ensure_stock_documents_relocation_status_column,
    ensure_stock_documents_mm_location_columns,
    ensure_stock_documents_return_receipt_schema,
    ensure_z_pz_return_receipt_columns,
    ensure_stock_operations_unit_price_net_column,
    migrate_inventory_lot_unique_sqlite,
    ensure_inventory_stock_disposition_columns,
    ensure_stock_disposition_stage2_columns,
    ensure_product_sales_offers_schema,
    ensure_inventory_management_policy_schema,
    ensure_purchase_sales_block_schema,
    ensure_tenant_warehouse_fulfillment_schema,
    ensure_stock_document_items_stock_disposition_column,
    ensure_stock_document_items_stock_disposition_column,
    ensure_stock_operations_stock_disposition_column,
    ensure_stock_reservation_lot_columns,
    ensure_pick_task_lot_columns,
    ensure_pick_lot_columns,
    ensure_order_item_pick_allocations_table,
    ensure_wms_product_warehouse_operations_traceability_columns,
    ensure_warehouse_inventory_movements_table,
    ensure_picks_cart_id_column,
    ensure_picking_config_workflow_columns,
    ensure_picking_shortage_support,
    ensure_carts_code_column,
    ensure_esp_scan_code_columns,
    ensure_order_items_packing_quantity_packed_column,
    ensure_direct_sales_settings_table,
    ensure_wms_packing_settings_table,
    ensure_shipping_methods_table_and_order_fk,
    ensure_warehouse_materials_tables,
    ensure_warehouse_materials_bdo_columns,
    ensure_warehouse_materials_master_data,
    ensure_warehouse_materials_purchasing_columns,
    ensure_wm_last_purchase_extension_columns,
    ensure_delivery_items_warehouse_material_lines,
    ensure_supplier_product_tiers_and_delivery_price_manual_columns,
    ensure_delivery_item_catalog_snapshot_columns,
    ensure_bdo_packaging_wm_ref_migration,
    ensure_document_series_extended_columns,
    ensure_stock_document_series_columns,
    ensure_sale_documents_table,
    ensure_orders_customer_id_column,
    ensure_order_issue_tasks_table,
    ensure_order_issue_tasks_archive_columns,
    ensure_order_issue_tasks_lifecycle_columns,
    ensure_order_issue_task_items_table,
    ensure_wms_operational_tasks_table,
    ensure_orders_fulfillment_state_columns,
    ensure_orders_priority_color_column,
    ensure_orders_discount_columns,
    ensure_orders_wms_timeline_columns,
    ensure_orders_wms_packing_automation_finished_at_column,
    ensure_wms_packing_sessions_automation_finished_at_column,
    ensure_order_items_wms_picking_line_missing_qty,
    ensure_order_items_wms_picking_line_status,
    ensure_order_items_fulfillment_sync_columns,
    ensure_order_items_bundle_hierarchy_columns,
    ensure_order_items_oms_line_status,
    ensure_fulfillment_events_table,
    ensure_export_templates_table,
    ensure_order_notes_table,
    ensure_order_operational_notes_table,
    ensure_order_custom_fields_tables,
    ensure_app_users_bootstrap_columns,
    ensure_user_wms_profiles_table,
    ensure_wms_audit_tables,
    ensure_company_profile_table,
)
from .middleware.exception_logging import (
    log_unhandled_exception,
    outer_request_logger_middleware,
)
from .middleware.readiness_gate import platform_readiness_gate_middleware
from .services.pdf_deps import PdfGenerationUnavailable

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s %(name)s %(message)s",
    stream=sys.stderr,
    force=True,
)
logger = logging.getLogger(__name__)

from .api.warehouse import router as warehouse_router
from .api.warehouses import router as warehouses_router
from .api.tenant_warehouse import router as tenant_warehouse_router
from .api.simulation import router as simulation_router, router_assign as simulation_assign_router
from .api.analysis import router as analysis_router
from .api.tenant import router as tenant_router
from .api.planning import router as planning_router
from .api.cart import router as cart_router
from .api.import_api import router as import_router
from .api.export_api import router as export_router
# Load before order.py (order used to import helpers from wms_returns at module level).
from .api.wms_returns import WMS_RETURNS_ROUTING_VERSION
from .api.wms_returns import lookup_router as wms_returns_lookup_router
from .api.wms_returns import returns_id_router as wms_returns_id_router
from .api.wms_returns import router as wms_returns_router
from .api.order import router as order_router
from .api.order_custom_fields import router as order_custom_fields_router
from .api.returns_bulk import router as returns_bulk_router
from .api.shipping_methods import router as shipping_methods_router
from .api.cartons import router as cartons_router
from .api.packaging_materials import router as packaging_materials_router
from .api.product import router as product_router
from .api.product_sales_offers import router as product_sales_offers_router
from .api.offer_stock_pool import router as offer_stock_pool_router
from .api.product_warehouse_slotting import router as product_warehouse_slotting_router
from .api.bundle import router as bundle_router
from .api.compositions import router as compositions_router
from .api.production import router as production_router
from .api.manufacturer import router as manufacturer_router
from .api.purchasing import router as purchasing_router
from .api.supplier import router as supplier_router
from .api.customers import router as customers_router
from .api.supplier_product import router as supplier_product_router
from .api.supplier_product_links import router as supplier_product_links_router
from .api.delivery import router as inbound_delivery_router
from .api.stock_documents import documents_router as documents_alias_router
from .api.stock_documents import router as stock_documents_router
from .api.supplier_orders import router as supplier_orders_router
from .api.optimizer import router as optimizer_router
from .api.picking_zone import router as picking_zone_router
from .api.consolidation_rack import router as consolidation_rack_router
from .api.warehouse_map import router as warehouse_map_router
from .api.warehouse_layout import router as warehouse_layout_router
from .api.warehouse_graph import router as warehouse_graph_router
from .api.route import router as route_router
from .api.warehouse_template import router as warehouse_template_router
from .api.label_template import router as label_template_router
from .api.label_template_portability import router as label_template_portability_router
from .api.message_templates import router as message_templates_router
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
from .api.inventory_count import router as inventory_count_router
from .api.inventory_count_wms import router as inventory_count_wms_router
from .api.slotting import router as slotting_router
from .api.picks import router as picks_router
from .api.system import router as system_router
from .api.dev import router as dev_router
from .api.reports import router as reports_router
from .api.damage_reports import router as damage_reports_router
from .api.wms_receiving import router as wms_receiving_router
from .api.wms_putaway import router as wms_putaway_router
from .api.wms_relocation import router as wms_relocation_router
from .api.wms_mm_transfer import router as wms_mm_transfer_router
from .api.wms_replenishment import router as wms_replenishment_router
from .api.wms_carriers import router as wms_carriers_router
from .api.wms_locations import router as wms_locations_router
from .api.office_return_ui import router as office_return_ui_router
from .api.office_return_module import router as office_return_module_router
from .api.wms_return_module import router as wms_return_module_router
from .api.office_order_ui import router as office_order_ui_router
from .api.order_substatuses import router as order_substatuses_router
from .api.office_complaint_ui import router as office_complaint_ui_router
from .api.complaint import router as complaint_router
from .api.complaint_line import router as complaint_line_router
from .api.complaint_shipment import router as complaint_shipment_router
from .api.return_statuses import router as return_statuses_router
from .api.wms_settings import router as wms_settings_router
from .api.inventory_management_policy_api import router as inventory_management_policy_router
from .api.order_statuses import router as order_statuses_router
from .api.document_series import router as document_series_router
from .api.wms_picking_config import router as wms_picking_config_router
from .api.wms_picking_entry import router as wms_picking_entry_router
from .api.wms_order_issue_tasks import router as wms_order_issue_tasks_router
from .api.wms_operational_tasks import router as wms_operational_tasks_router
from .api.location_stock import router as location_stock_router
from .api.direct_sales import router as direct_sales_router
from .api.sale_documents import router as sale_documents_router
from .api.document_generation_jobs import router as document_generation_jobs_router
from .api.operational_pickup import router as operational_pickup_router
from .api.operational_workstations import router as operational_workstations_router
from .api.operational_features import router as operational_features_router
from .api.operational_runtime import router as operational_runtime_router
from .api.operational_replenishment import router as operational_replenishment_router
from .api.operational_alerts import router as operational_alerts_router
from .api.operational_orchestration import router as operational_orchestration_router
from .api.wms_packing_entry import router as wms_packing_entry_router
from .api.wms_packing_basket_entry import router as wms_packing_basket_entry_router
from .api.wms_dashboard import router as wms_dashboard_router
from .api.warehouse_operations import router as warehouse_operations_router
from .api.packaging_intelligence import router as packaging_intelligence_router
from .api.wms_products import router as wms_products_router
from .api.wms_photo_upload import router as wms_photo_upload_router
from .api.auth import router as auth_router
from .api.workforce_api import router as workforce_router
from .api.company_profile import router as company_profile_router
from .api.admin_users import router as admin_users_router
from .api.uploads import router as uploads_router
from .api.bdo_packaging import router as bdo_packaging_router


# On-disk damage evidence (same path as `services/damage_image_upload.UPLOAD_ROOT`).
UPLOADS_DIR = Path(__file__).resolve().parent / "uploads"


# ==================================================
# APP
# ==================================================

app = FastAPI(title="WMS Backend V2")

# Railway / reverse proxy: respect X-Forwarded-Proto so slash redirects use https://, not http://.
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")


@app.get("/")
async def root() -> dict[str, bool]:
    return {"ok": True}


@app.get("/healthz")
def healthz() -> dict[str, bool]:
    print("[HEALTHZ HIT]", flush=True)
    return {"ok": True}


@app.get("/health/schema")
def health_schema() -> dict:
    """Production schema integrity — Railway probes, CI validation, support diagnostics."""
    from .db.production_schema import get_production_schema_health
    from .platform_state import get_production_schema_health_snapshot, is_production_schema_valid

    if is_production_schema_valid():
        snap = get_production_schema_health_snapshot()
        if snap is not None:
            return snap
    return get_production_schema_health(engine)


@app.get("/readyz")
def readyz() -> dict:
    """Readiness — Tier 0 schema validated. Railway liveness stays on /healthz."""
    from .db.schema_introspection import verify_tier0_sql_probes
    from .platform_state import (
        get_tier0_validation_snapshot,
        is_operational_features_force_disabled,
        is_platform_ready,
        is_recovery_mode_env,
    )

    if not is_platform_ready():
        from fastapi import HTTPException

        raise HTTPException(
            status_code=503,
            detail={"ok": False, "code": "PLATFORM_NOT_READY", "tier0": False},
        )
    probe_failures = verify_tier0_sql_probes(engine)
    if probe_failures:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=503,
            detail={
                "ok": False,
                "code": "TIER0_SQL_PROBE_FAILED",
                "failures": probe_failures,
            },
        )
    return {
        "ok": True,
        "tier0": True,
        "dialect": engine.dialect.name,
        "recovery_mode": is_recovery_mode_env(),
        "operational_forced_off": is_operational_features_force_disabled(),
        "validation": get_tier0_validation_snapshot(),
    }


print("[healthz] route registered on app", flush=True)


# ==================================================
# CORS (health routes above — outer logger bypasses / and /healthz)
# ==================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Type", "Cache-Control", "Connection"],
)

from starlette.middleware.base import BaseHTTPMiddleware

from .middleware.direct_sales_raw_request import direct_sales_raw_request_middleware


class _DirectSalesRawRequestLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        return await direct_sales_raw_request_middleware(request, call_next)


app.add_middleware(_DirectSalesRawRequestLogMiddleware)

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


# ==================================================
# GLOBAL EXCEPTION HANDLER (error count last 24h)
# ==================================================


async def record_error(request: Request, exc: Exception):
    log_unhandled_exception(f"{request.method} {request.url.path} (exception_handler)", exc)


def _cors_headers_for_request(request: Request) -> dict[str, str]:
    if request.headers.get("origin"):
        return {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        }
    return {}


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    response = JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    for k, v in _cors_headers_for_request(request).items():
        response.headers[k] = v
    return response


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(request: Request, exc: RequestValidationError):
    from .services.direct_sale.direct_sales_validation_log import log_direct_sales_validation

    log_direct_sales_validation(request, exc)
    response = JSONResponse(status_code=422, content={"detail": exc.errors()})
    for k, v in _cors_headers_for_request(request).items():
        response.headers[k] = v
    return response


@app.exception_handler(PdfGenerationUnavailable)
async def pdf_generation_unavailable_handler(request: Request, exc: PdfGenerationUnavailable):
    response = JSONResponse(status_code=503, content={"detail": str(exc)})
    for k, v in _cors_headers_for_request(request).items():
        response.headers[k] = v
    return response


def _is_direct_sales_complete_path(path: str) -> bool:
    norm = (path or "").rstrip("/").lower()
    return "/direct-sales/session/" in norm and norm.endswith("/complete")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    try:
        from .services.direct_sale.complete_debug_log import (
            log_raw_exception,
            raw_complete_failure_response,
            safe_exception_str,
        )

        summary = safe_exception_str(exc)
    except Exception:
        summary = type(exc).__name__

    print(
        f"[exception_handler] {request.method} {request.url.path} "
        f"{type(exc).__name__}: {summary}",
        flush=True,
    )
    print(traceback.format_exc(), flush=True)
    try:
        if _is_direct_sales_complete_path(request.url.path):
            tb = traceback.format_exc()
            log_raw_exception(exc, stage="global_exception_handler", context="main_handler")
            response = raw_complete_failure_response(
                exc,
                stage="global_exception_handler",
                traceback_str=tb,
            )
        else:
            await record_error(request, exc)
            response = JSONResponse(status_code=500, content={"detail": "Internal server error"})
        for k, v in _cors_headers_for_request(request).items():
            response.headers[k] = v
        return response
    except Exception as handler_exc:
        print("[exception_handler] handler itself failed", flush=True)
        print(traceback.format_exc(), flush=True)
        log_unhandled_exception(
            f"{request.method} {request.url.path} (exception_handler wrapper)",
            handler_exc,
        )
        raise

# ==================================================
# DB INIT
# ==================================================
# models package imported at top; create_all_tables() runs after all API imports
# (APIs do not define new ORM tables).


def ensure_sqlite_tables(*, announce: bool = False) -> None:
    """
    Bootstrap missing tables on first connect (idempotent).

    Column/index/FK drift is handled by ``reconcile_startup_schema`` in Tier 0 —
    not by repeated create_all migrations.
    """
    if announce:
        print("Creating database tables...")
    create_all_tables()


# Tier 0 bootstrap (end of this module) runs create_all + core schema sync before routers load.
# Tier 1+ migrations run in startup background thread after Tier 0 validate.


def _is_sqlite_engine() -> bool:
    return engine.dialect.name == "sqlite"


def _sqlite_only_schema_helper(fn):
    import functools

    @functools.wraps(fn)
    def _wrapped(*args, **kwargs):
        bind = args[0] if args else engine
        dialect = getattr(getattr(bind, "dialect", None), "name", None)
        if dialect != "sqlite":
            logging.getLogger(__name__).debug(
                "[schema.platform] SCHEMA_HELPER_SKIPPED_POSTGRES name=%s dialect=%s",
                fn.__name__,
                dialect,
            )
            return None
        return fn(*args, **kwargs)

    return _wrapped


# Legacy schema helpers in backend.db.schema_upgrade use PRAGMA / SQLite ALTER-workarounds.
# PostgreSQL: explicit allowlist only — never silently disable production schema evolution.
_POSTGRES_SAFE_SCHEMA_FUNCS = frozenset({
    "ensure_order_issue_tasks_archive_columns",
    "ensure_order_issue_tasks_lifecycle_columns",
    "ensure_order_issue_task_items_table",
    # Production module — MUST run on PostgreSQL (not SQLite-only legacy helpers).
    "ensure_production_tables",
    "ensure_product_compositions_and_batches",
    "ensure_production_batch_schema_sync",
    "ensure_production_schema_evolution",
    # Workforce — ORM-based sync (PostgreSQL + SQLite).
    "ensure_workforce_operational_tables",
    "ensure_workforce_user_groups_schema",
})
_POSTGRES_SQLITE_ONLY_HELPERS: list[str] = []
if not _is_sqlite_engine():
    for _name, _fn in list(globals().items()):
        if _name in _POSTGRES_SAFE_SCHEMA_FUNCS:
            continue
        if (
            callable(_fn)
            and getattr(_fn, "__module__", "").endswith(".db.schema_upgrade")
            and (_name.startswith("ensure_") or _name.startswith("migrate_"))
        ):
            globals()[_name] = _sqlite_only_schema_helper(_fn)
            _POSTGRES_SQLITE_ONLY_HELPERS.append(_name)
    if _POSTGRES_SQLITE_ONLY_HELPERS:
        logging.getLogger(__name__).warning(
            "[schema.platform] %d legacy ensure_/migrate_ helpers are SQLite-only on PostgreSQL "
            "(allowlist=%s). Unsupported ops log SCHEMA_HELPER_SKIPPED_POSTGRES at DEBUG.",
            len(_POSTGRES_SQLITE_ONLY_HELPERS),
            sorted(_POSTGRES_SAFE_SCHEMA_FUNCS),
        )

# Ensure new columns exist on existing SQLite DBs (create_all does not alter tables)
def _ensure_order_columns():
    from sqlalchemy import text
    try:
        with engine.begin() as conn:
            r = conn.execute(text("PRAGMA table_info(order_items)"))
            cols = {row[1] for row in r}
            for col, typ in [
                ("unit_price", "REAL"),
                ("total_price", "REAL"),
                ("unit", "TEXT"),
                ("metadata_json", "TEXT"),
                ("vat_percent", "REAL"),
                ("list_price", "REAL"),
            ]:
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE order_items ADD COLUMN {col} {typ}"))
            r = conn.execute(text("PRAGMA table_info(orders)"))
            cols = {row[1] for row in r}
            if "created_at" not in cols:
                conn.execute(text("ALTER TABLE orders ADD COLUMN created_at DATETIME"))
            for col, typ in [
                ("external_id", "VARCHAR(128)"),
                ("sales_document_number", "VARCHAR(128)"),
                ("import_metadata_json", "TEXT"),
                ("addresses_json", "TEXT"),
                ("selected_carton_id", "VARCHAR(36)"),
                ("discount_type", "VARCHAR(16)"),
                ("discount_value", "REAL"),
            ]:
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE orders ADD COLUMN {col} {typ}"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_orders_sales_document_number ON orders(sales_document_number)"))
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_order_tenant_warehouse_external_id "
                    "ON orders(tenant_id, warehouse_id, external_id)"
                )
            )
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
    """Add Pick fields: warehouse_id, order_item_id, picked_at, picker_id, cart_id. Make inventory_unit_id nullable for simulated picks."""
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
            # WMS / karty wózków: nullable cart_id (dopiero po ewentualnym recreate — PRAGMA ponownie)
            r3 = conn.execute(text("PRAGMA table_info(picks)"))
            cols_final = {row[1] for row in r3.fetchall()}
            if "cart_id" not in cols_final:
                conn.execute(
                    text("ALTER TABLE picks ADD COLUMN cart_id INTEGER REFERENCES carts(id) ON DELETE SET NULL")
                )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_picks_cart_id ON picks(cart_id)"))
    except Exception:
        pass


def _ensure_warehouse_template_level_max_load_kg():
    """Add template storage columns to warehouse_templates if missing (safe SQLite schema upgrade)."""
    from sqlalchemy import text
    try:
        with engine.begin() as conn:
            r = conn.execute(text("PRAGMA table_info(warehouse_templates)"))
            cols = {row[1] for row in r}
            if "level_max_load_kg" not in cols:
                conn.execute(text(
                    "ALTER TABLE warehouse_templates ADD COLUMN level_max_load_kg FLOAT DEFAULT 500"
                ))
            if "bin_type_map_json" not in cols:
                conn.execute(text(
                    "ALTER TABLE warehouse_templates ADD COLUMN bin_type_map_json TEXT"
                ))
            conn.execute(text(
                "UPDATE warehouse_templates SET level_max_load_kg = 500 WHERE level_max_load_kg IS NULL"
            ))
    except Exception:
        pass


if _is_sqlite_engine():
    _ensure_order_columns()
    _ensure_location_warehouse_columns()
    _ensure_pick_columns()
    _ensure_warehouse_template_level_max_load_kg()

# RMZ: add external_id / status on older DBs (create_all does not ALTER existing wms_order_returns)
ensure_wms_order_returns_columns(engine)
ensure_wms_order_returns_deleted_at_column(engine)
ensure_orders_deleted_at_column(engine)
ensure_rmz_line_split_columns(engine)
ensure_rmz_line_damage_entries_json(engine)
ensure_wms_refunds_columns(engine)
# Panel return UI statuses: run at import so first request works even before startup hook.
try:
    ensure_return_ui_statuses_and_column(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_return_ui_statuses_and_column failed at import")
try:
    ensure_order_ui_statuses_and_column(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_order_ui_statuses_and_column failed at import")
try:
    ensure_order_ui_statuses_is_system_column(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_order_ui_statuses_is_system_column failed at import")
try:
    ensure_panel_ui_statuses_advanced_columns(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_panel_ui_statuses_advanced_columns failed at import")
try:
    ensure_orders_complaint_origin_columns(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_orders_complaint_origin_columns failed at import")
try:
    ensure_complaints_and_complaint_ui_statuses(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_complaints_and_complaint_ui_statuses failed at import")
try:
    ensure_complaint_shipments_tables(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_complaint_shipments_tables failed at import")
try:
    ensure_complaint_order_and_lines(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_complaint_order_and_lines failed at import")
try:
    ensure_complaint_response_deadline_columns(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_complaint_response_deadline_columns failed at import")
try:
    ensure_complaint_decision_hierarchy_columns(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_complaint_decision_hierarchy_columns failed at import")
try:
    ensure_complaint_resolution_columns(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_complaint_resolution_columns failed at import")
try:
    ensure_complaint_documents_table(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_complaint_documents_table failed at import")
try:
    ensure_order_documents_and_activity_logs_tables(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_order_documents_and_activity_logs_tables failed at import")
try:
    ensure_complaint_logistics_columns(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_complaint_logistics_columns failed at import")
try:
    ensure_complaint_customer_snapshot_columns(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_complaint_customer_snapshot_columns failed at import")
try:
    ensure_complaint_production_columns(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_complaint_production_columns failed at import")
try:
    ensure_bundles_tables_and_order_item_bundle_columns(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_bundles_tables_and_order_item_bundle_columns failed at import")
try:
    ensure_production_tables(engine)
    ensure_product_compositions_and_batches(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_production base tables failed at import")
    raise
try:
    from .db.production_schema import run_production_schema_startup_gate

    run_production_schema_startup_gate(engine, phase="import")
except Exception:
    logging.getLogger(__name__).exception("run_production_schema_startup_gate failed at import")
    raise
try:
    ensure_manufacturers_table_and_product_manufacturer_id(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_manufacturers_table_and_product_manufacturer_id failed at import")
try:
    ensure_suppliers_and_inbound_deliveries_tables(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_suppliers_and_inbound_deliveries_tables failed at import")
try:
    ensure_deliveries_name_column(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_deliveries_name_column failed at import")
try:
    ensure_supplier_assortment_columns_and_product_default_supplier(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_supplier_assortment_columns_and_product_default_supplier failed at import")
try:
    ensure_supplier_products_table(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_supplier_products_table failed at import")
try:
    ensure_supplier_purchasing_columns(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_supplier_purchasing_columns failed at import")
try:
    ensure_purchase_orders_tables(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_purchase_orders_tables failed at import")
try:
    ensure_currency_exchange_rates_table(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_currency_exchange_rates_table failed at import")
try:
    ensure_purchase_order_tax_invoice_columns(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_purchase_order_tax_invoice_columns failed at import")
try:
    ensure_products_purchase_snapshot_columns(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_products_purchase_snapshot_columns failed at import")
try:
    ensure_products_extra_cost_columns(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_products_extra_cost_columns failed at import")
try:
    ensure_purchasing_alert_tables(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_purchasing_alert_tables failed at import")
try:
    ensure_purchase_auto_reorder_tables(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_purchase_auto_reorder_tables failed at import")
try:
    ensure_deliveries_purchase_order_id_column(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_deliveries_purchase_order_id_column failed at import")
try:
    ensure_manufacturer_supplier_business_entity_columns(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_manufacturer_supplier_business_entity_columns failed at import")
try:
    ensure_tenant_business_profile_columns(engine)
    ensure_tenant_default_warehouse_column(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_tenant_business_profile_columns failed at import")
# Z-PZ schema — blocking; must run before any StockDocument ORM query at import.
try:
    from .db.z_pz_schema import require_z_pz_schema_or_raise

    require_z_pz_schema_or_raise(engine, phase="import")
except Exception:
    logging.getLogger(__name__).exception("require_z_pz_schema_or_raise failed at import")
    raise
try:
    ensure_stock_documents_tables(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_stock_documents_tables failed at import")
try:
    ensure_stock_document_item_ordered_received_columns(engine)
    ensure_stock_document_item_quantity_putaway_column(engine)
    ensure_stock_document_item_putaway_meta_columns(engine)
    ensure_stock_document_item_mm_line_from_location_column(engine)
    ensure_stock_document_item_wms_line_source_column(engine)
    ensure_stock_document_items_wm_receipt_columns(engine)
    ensure_stock_document_item_receiving_split_columns(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_stock_document_item_columns failed at import")
try:
    ensure_receiving_scan_logs_table(engine)
    ensure_stock_item_locations_table(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_receiving_scan_logs_table failed at import")
try:
    ensure_stock_documents_financial_columns(engine)
    ensure_stock_documents_relocation_status_column(engine)
    ensure_stock_documents_mm_location_columns(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_stock_documents_header_columns failed at import")
try:
    ensure_stock_operations_unit_price_net_column(engine)
    ensure_stock_operations_stock_disposition_column(engine)
    ensure_document_series_extended_columns(engine)
    ensure_stock_document_series_columns(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_stock_operations_and_series_columns failed at import")
try:
    ensure_stock_documents_return_receipt_schema(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_stock_documents_return_receipt_schema failed at import")
try:
    ensure_stock_documents_receiving_status_column(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_stock_documents_receiving_status_column failed at import")
try:
    ensure_wms_ad_hoc_receiving_schema(engine)
    ensure_stock_documents_created_by_columns(engine)
    ensure_stock_documents_updated_at_column(engine)
    migrate_stock_documents_nullable_warehouse_location(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_stock_documents_wms_meta failed at import")
try:
    ensure_z_pz_return_receipt_columns(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_z_pz_return_receipt_columns failed at import")
try:
    ensure_stock_document_items_return_receipt_columns(engine)
    ensure_stock_document_items_stock_disposition_column(engine)
    ensure_return_product_decisions_creates_stock_document_column(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_stock_document_items_return_columns failed at import")
try:
    ensure_workforce_operational_tables(engine)
    ensure_workforce_user_groups_schema(engine)
    ensure_company_profile_table(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_workforce_and_company_profile failed at import")
try:
    ensure_stock_document_item_lot_columns(engine)
    migrate_inventory_lot_unique_sqlite(engine)
    ensure_inventory_stock_disposition_columns(engine)
    ensure_stock_disposition_stage2_columns(engine)
    ensure_product_sales_offers_schema(engine)
    from .db.offer_stock_pool_schema import ensure_offer_stock_pool_schema

    ensure_offer_stock_pool_schema(engine)
    from .db.user_warehouse_assignment_schema import ensure_user_warehouse_assignment_schema

    ensure_user_warehouse_assignment_schema(engine)
    from .db.wms_warehouse_ownership_schema import ensure_wms_warehouse_ownership_schema

    ensure_wms_warehouse_ownership_schema(engine)
    from .services.wms_warehouse_ownership_service import register_stock_document_warehouse_guard

    register_stock_document_warehouse_guard()
    ensure_inventory_management_policy_schema(engine)
    ensure_purchase_sales_block_schema(engine)
    ensure_tenant_warehouse_fulfillment_schema(engine)
    from .db.product_warehouse_slotting_schema import (
        ensure_product_warehouse_slotting_schema,
        run_startup_slotting_backfill,
    )

    ensure_product_warehouse_slotting_schema(engine)
    run_startup_slotting_backfill(engine)
    ensure_warehouse_sqlite_schema_stabilization(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_stock_lot_and_inventory_sqlite failed at import")
try:
    ensure_stock_documents_created_by_columns(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_stock_documents_created_by_columns failed at import")
try:
    from .db.customer_schema import ensure_customer_crm_schema

    ensure_customer_crm_schema(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_customer_crm_schema failed at import")
try:
    ensure_product_barcodes_table(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_product_barcodes_table failed at import")


@app.on_event("startup")
async def upgrade_schema() -> None:
    """
    Startup order (tiered schema policy):
    1. Tier 0 ensure + validate (sync, blocking)
    2. Tier 1+ migrations, seeds, workers (background)
    """
    import asyncio

    print("[startup] tier0 bootstrap: sync", flush=True)
    try:
        await asyncio.to_thread(_bootstrap_tier0_platform_schema, phase="startup_sync")
    except Exception as exc:
        log_unhandled_exception("startup tier0 bootstrap (sync)", exc)
        raise

    print("[startup] tier1+ schema: scheduled (background thread)", flush=True)

    async def _run() -> None:
        try:
            await asyncio.to_thread(_upgrade_schema_background)
        except Exception as exc:
            log_unhandled_exception("startup upgrade_schema (background)", exc)

    asyncio.create_task(_run())


def _upgrade_schema_background() -> None:
    """Tier 1+ and non-core migrations — never mutate Tier 0 tables here."""
    from . import models as _orm_models  # noqa: F401 — all tables on Base.metadata before create_all
    from .db.schema_tiers import ensure_tier1_operational_schema
    from .observability.platform_debug import log_startup_schema

    print("[startup] upgrade_schema_background: begin", flush=True)
    ensure_replenishment_tasks_table(engine)
    ensure_replenishment_tasks_sources_json_column(engine)
    try:
        ensure_warehouse_carrier_tables(engine)
        ensure_inventory_carrier_id_column(engine)
        ensure_inventory_carrier_unique_indexes(engine)
        ensure_stock_document_item_suggested_carrier_column(engine)
        ensure_receiving_document_carriers_table(engine)
        ensure_stock_document_item_line_warehouse_carrier_column(engine)
    except Exception:
        logging.getLogger(__name__).exception("warehouse carriers schema failed")
    ensure_wms_product_warehouse_operations_table(engine)
    ensure_wms_product_warehouse_operations_traceability_columns(engine)
    ensure_warehouse_inventory_movements_table(engine)
    ensure_order_item_pick_allocations_table(engine)
    ensure_customers_deleted_at_column(engine)
    try:
        from .db.customer_schema import ensure_customer_crm_schema

        ensure_customer_crm_schema(engine)
    except Exception:
        logging.getLogger(__name__).exception("ensure_customer_crm_schema failed in background upgrade")
    ensure_bundles_deleted_at_column(engine)
    ensure_damage_report_columns(engine)
    ensure_wms_refunds_columns(engine)
    try:
        migrate_orders_sales_document_misassigned_number(engine)
    except Exception:
        pass
    try:
        ensure_return_statuses_and_rmz(engine)
    except Exception:
        pass
    try:
        ensure_wms_order_returns_deleted_at_column(engine)
    except Exception:
        pass
    try:
        ensure_return_ui_statuses_and_column(engine)
    except Exception:
        pass
    try:
        ensure_order_ui_statuses_and_column(engine)
    except Exception:
        pass
    try:
        ensure_order_ui_statuses_is_system_column(engine)
    except Exception:
        pass
    try:
        ensure_panel_ui_statuses_advanced_columns(engine)
    except Exception:
        pass
    try:
        ensure_complaints_and_complaint_ui_statuses(engine)
    except Exception:
        pass
    try:
        ensure_complaint_shipments_tables(engine)
    except Exception:
        pass
    try:
        ensure_complaint_order_and_lines(engine)
    except Exception:
        pass
    try:
        ensure_complaint_process_status_column(engine)
    except Exception:
        pass
    try:
        ensure_complaint_deleted_at_column(engine)
    except Exception:
        pass
    try:
        ensure_complaint_defects_reason_columns(engine)
    except Exception:
        pass
    try:
        ensure_complaint_response_deadline_columns(engine)
    except Exception:
        pass
    try:
        ensure_complaint_decision_hierarchy_columns(engine)
    except Exception:
        pass
    try:
        ensure_complaint_resolution_columns(engine)
    except Exception:
        pass
    try:
        ensure_complaint_documents_table(engine)
    except Exception:
        pass
    try:
        ensure_order_documents_and_activity_logs_tables(engine)
    except Exception:
        pass
    try:
        ensure_complaint_logistics_columns(engine)
    except Exception:
        pass
    try:
        ensure_complaint_customer_snapshot_columns(engine)
    except Exception:
        pass
    try:
        ensure_complaint_production_columns(engine)
    except Exception:
        pass
    try:
        ensure_complaint_events_table(engine)
    except Exception:
        pass
    try:
        ensure_bundles_tables_and_order_item_bundle_columns(engine)
    except Exception:
        pass
    try:
        ensure_production_tables(engine)
    except Exception:
        pass
    try:
        ensure_product_compositions_and_batches(engine)
    except Exception:
        pass
    try:
        from .db.production_schema import run_production_schema_startup_gate

        run_production_schema_startup_gate(engine, phase="background_upgrade")
    except Exception:
        logging.getLogger(__name__).exception(
            "run_production_schema_startup_gate failed in background_upgrade — workers blocked"
        )
        print("[startup] upgrade_schema_background: aborted (production schema invalid)", flush=True)
        return
    try:
        ensure_manufacturers_table_and_product_manufacturer_id(engine)
    except Exception:
        pass
    try:
        ensure_suppliers_and_inbound_deliveries_tables(engine)
    except Exception:
        pass
    try:
        ensure_deliveries_name_column(engine)
    except Exception:
        pass
    try:
        ensure_supplier_assortment_columns_and_product_default_supplier(engine)
    except Exception:
        pass
    try:
        ensure_supplier_products_table(engine)
    except Exception:
        pass
    try:
        ensure_supplier_purchasing_columns(engine)
    except Exception:
        pass
    try:
        ensure_purchase_orders_tables(engine)
    except Exception:
        pass
    try:
        ensure_currency_exchange_rates_table(engine)
    except Exception:
        pass
    try:
        ensure_purchase_order_tax_invoice_columns(engine)
    except Exception:
        pass
    try:
        ensure_products_purchase_snapshot_columns(engine)
        ensure_products_extra_cost_columns(engine)
    except Exception:
        pass
    try:
        ensure_purchasing_alert_tables(engine)
    except Exception:
        pass
    try:
        ensure_purchase_auto_reorder_tables(engine)
    except Exception:
        pass
    try:
        ensure_deliveries_purchase_order_id_column(engine)
    except Exception:
        pass
    try:
        ensure_manufacturer_supplier_business_entity_columns(engine)
    except Exception:
        pass
    try:
        ensure_tenant_business_profile_columns(engine)
    except Exception:
        pass
    try:
        ensure_tenant_default_warehouse_column(engine)
    except Exception:
        pass
    try:
        from .db.z_pz_schema import require_z_pz_schema_or_raise

        require_z_pz_schema_or_raise(engine, phase="startup_background")
    except Exception:
        logging.getLogger(__name__).exception("require_z_pz_schema_or_raise failed at startup")
        raise
    try:
        ensure_stock_documents_tables(engine)
    except Exception:
        logging.getLogger(__name__).exception("ensure_stock_documents_tables failed at startup")
    try:
        ensure_stock_document_item_ordered_received_columns(engine)
        ensure_stock_document_item_quantity_putaway_column(engine)
        ensure_stock_document_item_putaway_meta_columns(engine)
        ensure_stock_document_item_mm_line_from_location_column(engine)
        ensure_stock_document_item_wms_line_source_column(engine)
        ensure_stock_document_items_wm_receipt_columns(engine)
        ensure_stock_document_item_receiving_split_columns(engine)
    except Exception:
        logging.getLogger(__name__).exception("ensure_stock_document_item_columns failed at startup")
    try:
        ensure_receiving_scan_logs_table(engine)
        ensure_stock_item_locations_table(engine)
    except Exception:
        pass
    try:
        ensure_stock_documents_financial_columns(engine)
        ensure_stock_documents_relocation_status_column(engine)
        ensure_stock_documents_mm_location_columns(engine)
    except Exception:
        pass
    try:
        ensure_stock_operations_unit_price_net_column(engine)
        ensure_stock_operations_stock_disposition_column(engine)
        ensure_document_series_extended_columns(engine)
        ensure_stock_document_series_columns(engine)
    except Exception:
        pass
    try:
        ensure_stock_documents_return_receipt_schema(engine)
    except Exception:
        logging.getLogger(__name__).exception("ensure_stock_documents_return_receipt_schema failed at startup")
    try:
        ensure_stock_documents_receiving_status_column(engine)
    except Exception:
        logging.getLogger(__name__).exception("ensure_stock_documents_receiving_status_column failed at startup")
    try:
        ensure_wms_ad_hoc_receiving_schema(engine)
        ensure_stock_documents_created_by_columns(engine)
        ensure_stock_documents_updated_at_column(engine)
        migrate_stock_documents_nullable_warehouse_location(engine)
    except Exception:
        logging.getLogger(__name__).exception("ensure_stock_documents_wms_meta failed at startup")
    try:
        ensure_z_pz_return_receipt_columns(engine)
    except Exception:
        logging.getLogger(__name__).exception("ensure_z_pz_return_receipt_columns failed at startup")
    try:
        from .db.inventory_damage_trace_schema import ensure_inventory_damage_trace_columns

        ensure_inventory_damage_trace_columns(engine)
    except Exception:
        logging.getLogger(__name__).exception("ensure_inventory_damage_trace_columns failed at startup")
    try:
        ensure_stock_document_items_return_receipt_columns(engine)
        ensure_stock_document_items_stock_disposition_column(engine)
        ensure_return_product_decisions_creates_stock_document_column(engine)
    except Exception:
        pass
    try:
        ensure_workforce_operational_tables(engine)
        ensure_workforce_user_groups_schema(engine)
        ensure_company_profile_table(engine)
    except Exception:
        pass
    try:
        ensure_stock_documents_created_by_columns(engine)
    except Exception:
        logging.getLogger(__name__).exception("ensure_stock_documents_created_by_columns failed at startup")
    try:
        from .database import SessionLocal
        from .services.wms_putaway_service import (
            backfill_stock_item_locations_if_needed,
            migrate_sil_to_stock_operations,
        )

        _db_bf = SessionLocal()
        try:
            migrate_sil_to_stock_operations(_db_bf)
            backfill_stock_item_locations_if_needed(_db_bf)
        finally:
            _db_bf.close()
    except Exception:
        logging.getLogger(__name__).exception("migrate_sil_to_stock_operations / backfill_putaway failed")
    try:
        ensure_product_barcodes_table(engine)
    except Exception:
        pass
    try:
        ensure_product_track_batch_expiry_columns(engine)
        ensure_inventory_serials_table(engine)
        ensure_stock_document_item_lot_columns(engine)
        migrate_inventory_lot_unique_sqlite(engine)
        ensure_inventory_stock_disposition_columns(engine)
        ensure_stock_disposition_stage2_columns(engine)
        ensure_product_sales_offers_schema(engine)
        from .db.offer_stock_pool_schema import ensure_offer_stock_pool_schema

        ensure_offer_stock_pool_schema(engine)
        from .db.user_warehouse_assignment_schema import ensure_user_warehouse_assignment_schema

        ensure_user_warehouse_assignment_schema(engine)
        ensure_inventory_management_policy_schema(engine)
        ensure_purchase_sales_block_schema(engine)
        ensure_tenant_warehouse_fulfillment_schema(engine)
        from .db.product_warehouse_slotting_schema import (
            ensure_product_warehouse_slotting_schema,
            run_startup_slotting_backfill,
        )

        ensure_product_warehouse_slotting_schema(engine)
        run_startup_slotting_backfill(engine)
        ensure_stock_reservation_lot_columns(engine)
        ensure_pick_task_lot_columns(engine)
        ensure_pick_lot_columns(engine)
        ensure_order_item_pick_allocations_table(engine)
        ensure_wms_product_warehouse_operations_traceability_columns(engine)
        ensure_warehouse_inventory_movements_table(engine)
        ensure_picks_cart_id_column(engine)
        ensure_carts_code_column(engine)
        ensure_esp_scan_code_columns(engine)
        ensure_picking_config_workflow_columns(engine)
        ensure_picking_shortage_support(engine)
        ensure_order_items_packing_quantity_packed_column(engine)
        ensure_direct_sales_settings_table(engine)
        ensure_wms_packing_settings_table(engine)
        ensure_shipping_methods_table_and_order_fk(engine)
        ensure_warehouse_materials_tables(engine)
        ensure_warehouse_materials_bdo_columns(engine)
        ensure_warehouse_materials_master_data(engine)
        ensure_warehouse_materials_purchasing_columns(engine)
        ensure_wm_last_purchase_extension_columns(engine)
        ensure_delivery_items_warehouse_material_lines(engine)
        ensure_supplier_product_tiers_and_delivery_price_manual_columns(engine)
        ensure_delivery_item_catalog_snapshot_columns(engine)
        ensure_bdo_packaging_wm_ref_migration(engine)
        ensure_document_series_extended_columns(engine)
        ensure_stock_document_series_columns(engine)
        ensure_sale_documents_table(engine)
        ensure_order_issue_tasks_table(engine)
        ensure_order_issue_tasks_archive_columns(engine)
        ensure_order_issue_tasks_lifecycle_columns(engine)
        ensure_order_issue_task_items_table(engine)
        ensure_wms_operational_tasks_table(engine)
        ensure_fulfillment_events_table(engine)
        ensure_export_templates_table(engine)
        ensure_order_notes_table(engine)
        ensure_order_operational_notes_table(engine)
        ensure_order_custom_fields_tables(engine)
        ensure_wms_audit_tables(engine)
        ensure_workforce_operational_tables(engine)
        ensure_workforce_user_groups_schema(engine)
        ensure_company_profile_table(engine)
    except Exception:
        logging.getLogger(__name__).exception("batch/expiry schema migration failed")
    try:
        ensure_warehouse_sqlite_schema_stabilization(engine)
    except Exception:
        logging.getLogger(__name__).exception("ensure_warehouse_sqlite_schema_stabilization failed")
    try:
        ensure_app_users_bootstrap_columns(engine)
        ensure_user_wms_profiles_table(engine)
    except Exception:
        logging.getLogger(__name__).exception("ensure_app_users_bootstrap_columns failed")
    try:
        tier1 = ensure_tier1_operational_schema(engine)
        log_startup_schema("tier1_operational_complete", duration_ms=tier1.duration_ms)
    except Exception:
        logging.getLogger(__name__).exception("[schema.tier1] ensure_tier1_operational_schema failed")
    try:
        from .database import SessionLocal
        from .db.seed_basic_data import seed_app_users, seed_basic_data, seed_wms_panel_defaults

        _seed_db = SessionLocal()
        try:
            seed_basic_data(_seed_db)
            seed_app_users(_seed_db)
            seed_wms_panel_defaults(_seed_db)
        finally:
            _seed_db.close()
    except Exception:
        logging.getLogger(__name__).exception("seed_basic_data failed")
    try:
        from .services.replenishment_automation import install_replenishment_listeners

        install_replenishment_listeners()
    except Exception:
        logging.getLogger(__name__).exception("install_replenishment_listeners failed")
    try:
        from .database import SessionLocal
        from .platform_state import is_production_schema_valid
        from .workers.document_generation_worker import process_pending_document_jobs
        from .workers.replenishment_scan_worker import run_replenishment_scan_worker
        from .workers.reservation_expiration_worker import run_reservation_lifecycle_worker
        from .workers.schema_guard import require_production_schema_valid

        require_production_schema_valid(context="background_worker_startup", engine=engine)
        if not is_production_schema_valid():
            raise RuntimeError("production schema gate not passed — workers blocked")

        _ops_db = SessionLocal()
        try:
            run_reservation_lifecycle_worker(_ops_db)
            process_pending_document_jobs(_ops_db, limit=20)
            run_replenishment_scan_worker(_ops_db)
            _ops_db.commit()
        finally:
            _ops_db.close()
    except Exception:
        logging.getLogger(__name__).exception("operational_commerce_workers startup failed")

    print("[startup] upgrade_schema_background: done", flush=True)


try:
    ensure_document_series_extended_columns(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_document_series_extended_columns failed at import")
try:
    ensure_stock_document_series_columns(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_stock_document_series_columns failed at import")
try:
    ensure_sale_documents_table(engine)
    ensure_orders_customer_id_column(engine)
    ensure_order_issue_tasks_table(engine)
    ensure_order_issue_tasks_archive_columns(engine)
    ensure_order_issue_tasks_lifecycle_columns(engine)
    ensure_order_issue_task_items_table(engine)
    ensure_wms_operational_tasks_table(engine)
    ensure_orders_fulfillment_state_columns(engine)
    ensure_orders_priority_color_column(engine)
    ensure_orders_discount_columns(engine)
    ensure_orders_wms_timeline_columns(engine)
    ensure_orders_wms_packing_automation_finished_at_column(engine)
    ensure_wms_packing_sessions_automation_finished_at_column(engine)
    ensure_order_items_wms_picking_line_missing_qty(engine)
    ensure_order_items_wms_picking_line_status(engine)
    ensure_order_items_fulfillment_sync_columns(engine)
    ensure_order_items_bundle_hierarchy_columns(engine)
    ensure_order_items_oms_line_status(engine)
    ensure_fulfillment_events_table(engine)
    ensure_order_notes_table(engine)
    ensure_order_operational_notes_table(engine)
    ensure_order_custom_fields_tables(engine)
    ensure_wms_audit_tables(engine)
    ensure_workforce_operational_tables(engine)
    ensure_workforce_user_groups_schema(engine)
    ensure_company_profile_table(engine)
except Exception:
    logging.getLogger(__name__).exception("ensure_sale_documents_table failed at import")
try:
    from .database import SessionLocal as _SessImp
    from .services.fulfillment_event_service import backfill_all_fulfillment_events as _bff

    _dbi = _SessImp()
    try:
        _bff(_dbi)
        _dbi.commit()
    finally:
        _dbi.close()
except Exception:
    logging.getLogger(__name__).exception("fulfillment_events backfill failed at import")


def _bootstrap_tier0_platform_schema(*, phase: str) -> None:
    """
    Tier 0 policy: synchronous schema ensure + ORM validation before HTTP traffic.
    Raises on failure — platform must not boot partially.
    """
    import time

    from .database import recycle_connection_pool
    from .db.schema_tiers import bootstrap_tier0_platform_schema
    from .observability.platform_debug import log_startup_features, log_startup_schema
    from .platform_state import (
        activate_operational_safety_latch,
        is_recovery_mode_env,
        mark_tier0_ready,
    )

    from .db.production_schema import run_production_schema_startup_gate

    recycle_connection_pool()
    t0 = time.perf_counter()
    try:
        from .db.z_pz_schema import require_z_pz_schema_or_raise

        require_z_pz_schema_or_raise(engine, phase=phase)
    except Exception:
        logging.getLogger(__name__).exception(
            "[startup] z_pz.schema ensure/verify failed phase=%s",
            phase,
        )
        raise
    ensure_sqlite_tables(announce=(phase == "import"))
    tier0, validation = bootstrap_tier0_platform_schema(engine)
    try:
        from .db.customer_schema import ensure_customer_crm_schema, verify_customer_schema_columns

        crm_added = ensure_customer_crm_schema(engine)
        missing = verify_customer_schema_columns(engine)
        if missing:
            raise RuntimeError(f"customers schema missing columns after sync: {missing}")
        if crm_added:
            print(f"[startup] customer.schema synced phase={phase} columns_added={crm_added}", flush=True)
    except Exception:
        logging.getLogger(__name__).exception(
            "[startup] customer.schema ensure/verify failed phase=%s",
            phase,
        )
        raise
    run_production_schema_startup_gate(engine, phase=phase)
    duration_ms = round((time.perf_counter() - t0) * 1000, 2)
    log_startup_schema(
        phase,
        added=tier0.added_columns,
        duration_ms=duration_ms,
    )
    if is_recovery_mode_env():
        activate_operational_safety_latch(reason="PLATFORM_RECOVERY_MODE")
        log_startup_features(recovery_mode=True, operational_forced_off=True)
    mark_tier0_ready(
        validation={
            "ok": validation.ok,
            "checked_tables": validation.checked_tables,
            "duration_ms": validation.duration_ms,
            "dialect": engine.dialect.name,
            "phase": phase,
        }
    )
    print(
        f"[startup] tier0 ready phase={phase} dialect={engine.dialect.name} "
        f"duration_ms={duration_ms} added_columns={tier0.added_columns}",
        flush=True,
    )


_bootstrap_tier0_platform_schema(phase="import")


# ==================================================
# ROUTERS (most HTTP API under /api — set VITE_API_URL to e.g. http://host:8010/api)
# Exception: wms_photo_upload_router → /wms/photo-upload (see below).
# ==================================================

API_PREFIX = "/api"
WMS_RETURNS_MOUNT_PREFIX = f"{API_PREFIX}/wms/returns"
WMS_RETURNS_LOOKUP_PATHS = (
    f"{WMS_RETURNS_MOUNT_PREFIX}/orders/lookup",
    f"{WMS_RETURNS_MOUNT_PREFIX}/orders/advanced-lookup",
    f"{WMS_RETURNS_MOUNT_PREFIX}/lookup",
)

def _promote_wms_returns_lookup_routes_on_app() -> None:
    """Hoist /orders/lookup to the front of app.routes (Starlette first-match wins)."""
    lookup_paths = set(WMS_RETURNS_LOOKUP_PATHS)
    promoted: list = []
    rest: list = []
    for route in app.routes:
        path = getattr(route, "path", None)
        if path in lookup_paths:
            promoted.append(route)
        else:
            rest.append(route)
    if promoted:
        app.router.routes = promoted + rest
        print(
            f"[routes] promoted wms lookup routes={len(promoted)} "
            f"paths={[getattr(r, 'path', None) for r in promoted]}",
            flush=True,
        )


# WMS returns: lookup router MUST be registered before static/id routers (route match order).
app.include_router(wms_returns_lookup_router, prefix=WMS_RETURNS_MOUNT_PREFIX)
app.include_router(wms_returns_router, prefix=WMS_RETURNS_MOUNT_PREFIX)
app.include_router(wms_returns_id_router, prefix=WMS_RETURNS_MOUNT_PREFIX)
print(
    f"[routes] wms_returns mounted prefix={WMS_RETURNS_MOUNT_PREFIX} "
    f"version={WMS_RETURNS_ROUTING_VERSION}",
    flush=True,
)

_API_ROUTERS = (
    auth_router,
    workforce_router,
    company_profile_router,
    admin_users_router,
    uploads_router,
    tenant_router,
    warehouse_router,
    warehouses_router,
    tenant_warehouse_router,
    product_warehouse_slotting_router,
    product_router,
    product_sales_offers_router,
    offer_stock_pool_router,
    bundle_router,
    compositions_router,
    production_router,
    manufacturer_router,
    purchasing_router,
    supplier_router,
    customers_router,
    supplier_product_links_router,
    inbound_delivery_router,
    stock_documents_router,
    documents_alias_router,
    supplier_orders_router,
    order_router,
    order_custom_fields_router,
    returns_bulk_router,
    shipping_methods_router,
    cartons_router,
    packaging_materials_router,
    import_router,
    export_router,
    cart_router,
    planning_router,
    simulation_router,
    simulation_assign_router,
    analysis_router,
    optimizer_router,
    picking_zone_router,
    consolidation_rack_router,
    warehouse_map_router,
    warehouse_layout_router,
    warehouse_graph_router,
    route_router,
    warehouse_template_router,
    label_sizes_router,
    labels_router,
    label_pack_router,
    label_preview_router,
    printer_profiles_router,
    printers_router,
    qz_router,
    wave_router,
    scan_router,
    inventory_router,
    inventory_count_router,
    inventory_count_wms_router,
    slotting_router,
    picks_router,
    system_router,
    dev_router,
    reports_router,
    damage_reports_router,
    wms_settings_router,
    inventory_management_policy_router,
    order_statuses_router,
    document_series_router,
    wms_picking_config_router,
    wms_picking_entry_router,
    wms_order_issue_tasks_router,
    wms_operational_tasks_router,
    location_stock_router,
    direct_sales_router,
    sale_documents_router,
    document_generation_jobs_router,
    operational_pickup_router,
    operational_workstations_router,
    operational_features_router,
    operational_runtime_router,
    operational_replenishment_router,
    operational_alerts_router,
    operational_orchestration_router,
    wms_packing_entry_router,
    wms_packing_basket_entry_router,
    wms_dashboard_router,
    warehouse_operations_router,
    packaging_intelligence_router,
    wms_products_router,
    return_statuses_router,
    wms_receiving_router,
    wms_putaway_router,
    wms_relocation_router,
    wms_mm_transfer_router,
    wms_replenishment_router,
    wms_carriers_router,
    wms_locations_router,
    office_return_ui_router,
    office_return_module_router,
    wms_return_module_router,
    office_order_ui_router,
    order_substatuses_router,
    office_complaint_ui_router,
    complaint_router,
    complaint_line_router,
    complaint_shipment_router,
    bdo_packaging_router,
)
for _r in _API_ROUTERS:
    app.include_router(_r, prefix=API_PREFIX)

_promote_wms_returns_lookup_routes_on_app()


def _log_returns_route_table() -> None:
    for r in app.routes:
        path = getattr(r, "path", None)
        if path and WMS_RETURNS_MOUNT_PREFIX in str(path):
            print("[ROUTE]", path, flush=True)


def _ensure_wms_returns_router_mounted() -> None:
    """Guarantee /api/wms/returns/* exists on the app (Railway startup verification)."""
    app_paths = [
        getattr(r, "path", None)
        for r in app.routes
        if getattr(r, "path", None) and str(getattr(r, "path")).startswith(WMS_RETURNS_MOUNT_PREFIX)
    ]
    if f"{WMS_RETURNS_MOUNT_PREFIX}/queue-counts" not in app_paths:
        print("[routes] wms_returns REMOUNT", flush=True)
        app.include_router(wms_returns_lookup_router, prefix=WMS_RETURNS_MOUNT_PREFIX)
        app.include_router(wms_returns_router, prefix=WMS_RETURNS_MOUNT_PREFIX)
        app.include_router(wms_returns_id_router, prefix=WMS_RETURNS_MOUNT_PREFIX)
        _promote_wms_returns_lookup_routes_on_app()
        app_paths = [
            getattr(r, "path", None)
            for r in app.routes
            if getattr(r, "path", None) and str(getattr(r, "path")).startswith(WMS_RETURNS_MOUNT_PREFIX)
        ]
    print(
        f"[routes] wms_returns lookup_routes={len(wms_returns_lookup_router.routes)} "
        f"static_routes={len(wms_returns_router.routes)} "
        f"id_routes={len(wms_returns_id_router.routes)} app_paths={len(app_paths)}",
        flush=True,
    )
    for _lookup_path in WMS_RETURNS_LOOKUP_PATHS:
        if _lookup_path not in app_paths:
            print("[routes] MISSING", _lookup_path, flush=True)
    if not app_paths:
        print("[routes] CRITICAL: no /api/wms/returns/* mounted", flush=True)
    _promote_wms_returns_lookup_routes_on_app()
    _log_returns_route_table()


_ensure_wms_returns_router_mounted()


_MSG_ADMIN = f"{API_PREFIX}/admin/message-templates"
_MSG_LEGACY = f"{API_PREFIX}/message-templates"
app.include_router(message_templates_router, prefix=_MSG_ADMIN)
app.include_router(message_templates_router, prefix=_MSG_LEGACY)

# Szablony etykiet / wydruków: ta sama logika pod `/label-templates`, `/print-templates` i `/admin/print-templates`.
_LABEL_TPL_API = f"{API_PREFIX}/label-templates"
_PRINT_TPL_API = f"{API_PREFIX}/print-templates"
_ADMIN_PRINT_TPL_API = f"{API_PREFIX}/admin/print-templates"
app.include_router(label_template_router, prefix=_LABEL_TPL_API)
app.include_router(label_template_portability_router, prefix=_LABEL_TPL_API)
app.include_router(label_template_router, prefix=_PRINT_TPL_API)
app.include_router(label_template_portability_router, prefix=_PRINT_TPL_API)
app.include_router(label_template_router, prefix=_ADMIN_PRINT_TPL_API)
app.include_router(label_template_portability_router, prefix=_ADMIN_PRINT_TPL_API)

# Alias for warehouse-materials UI: same handlers as /cartons under /materials/cartons
app.include_router(cartons_router, prefix=f"{API_PREFIX}/materials")

app.include_router(supplier_product_router, prefix=API_PREFIX)

# WMS phone QR upload: mounted at /wms/photo-upload (not under /api) so same-origin dev proxy + phones work.
app.include_router(wms_photo_upload_router)

app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

# Outermost on incoming requests (registered last). Bypasses / and /healthz inside the logger.
app.middleware("http")(platform_readiness_gate_middleware)
app.middleware("http")(outer_request_logger_middleware)

from .middleware.activity_tracking_middleware import activity_tracking_middleware

app.middleware("http")(activity_tracking_middleware)


@app.on_event("startup")
async def _log_backend_startup() -> None:
    from .serve import UVICORN_HOST, resolve_port

    print(
        f"[startup] healthz ready bind_host={UVICORN_HOST} port={resolve_port()} "
        f"PORT env={os.getenv('PORT')!r}",
        flush=True,
    )
    # Deploy fingerprint — compare with GitHub commit on Railway → Deployments.
    print(
        f"[startup] wms_returns_lookup_build={WMS_RETURNS_ROUTING_VERSION}",
        flush=True,
    )
    print(
        f"[startup] railway_git_commit={os.getenv('RAILWAY_GIT_COMMIT_SHA')!r} "
        f"railway_git_branch={os.getenv('RAILWAY_GIT_BRANCH')!r}",
        flush=True,
    )
    print(
        f"[startup] app ready routes={len(app.routes)} "
        f"bind_host={UVICORN_HOST} PORT env={os.getenv('PORT')!r}",
        flush=True,
    )
    try:
        _ensure_wms_returns_router_mounted()
    except Exception as exc:
        log_unhandled_exception("startup _ensure_wms_returns_router_mounted", exc)
    for r in app.routes:
        path = getattr(r, "path", None)
        if path and "/wms/inventory-count/" in str(path):
            methods = sorted(getattr(r, "methods", None) or [])
            print(f"[ROUTE] {path} {methods}", flush=True)
    print("Backend started OK", flush=True)


if __name__ == "__main__":
    raise RuntimeError("Run backend using: python -m backend")