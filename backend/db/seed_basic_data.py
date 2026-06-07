"""
Seed minimal rows for an empty SQLite database so the office panel can operate.

Must stay aligned with ``frontend/src/constants/panelTenant.ts`` (DAMAGE_TENANT_ID = 1).
"""

from __future__ import annotations

import logging
from sqlalchemy.orm import Session

from ..models.order_ui_status import OrderUiStatus
from ..models.tenant import Tenant
from ..models.tenant_warehouse import TenantWarehouse
from ..models.warehouse import Warehouse

logger = logging.getLogger(__name__)

# Same as frontend DAMAGE_TENANT_ID / panel tenant.
PANEL_TENANT_ID = 1


def _ensure_panel_tenant(db: Session) -> Tenant | None:
    row = db.query(Tenant).filter(Tenant.id == PANEL_TENANT_ID).first()
    if row is not None:
        return row
    if db.query(Tenant).count() == 0:
        t = Tenant(id=PANEL_TENANT_ID, name="Tenant główny")
        db.add(t)
        db.commit()
        db.refresh(t)
        return t
    logger.warning(
        "seed_basic_data: tenants exist but tenant id=%s is missing; skip seed (panel expects id=%s)",
        PANEL_TENANT_ID,
        PANEL_TENANT_ID,
    )
    return None


def _default_warehouse_id_for_tenant(db: Session, tenant_id: int) -> int | None:
    tw = (
        db.query(TenantWarehouse)
        .filter(TenantWarehouse.tenant_id == tenant_id, TenantWarehouse.is_default == 1)
        .first()
    )
    if tw is not None:
        return int(tw.warehouse_id)
    tw2 = db.query(TenantWarehouse).filter(TenantWarehouse.tenant_id == tenant_id).first()
    if tw2 is not None:
        return int(tw2.warehouse_id)
    return None


def seed_basic_data(db: Session) -> None:
    """
    Create default tenant (id=1), warehouse, tenant link, and panel order UI statuses when missing.

    Idempotent: safe on every application startup.
    """
    tenant = _ensure_panel_tenant(db)
    if tenant is None or int(tenant.id) != PANEL_TENANT_ID:
        if tenant is None:
            logger.warning("seed_basic_data: no tenant id=%s — skipping warehouse/status seed", PANEL_TENANT_ID)
        return

    tenant_id = PANEL_TENANT_ID

    wh_id = _default_warehouse_id_for_tenant(db, tenant_id)
    if wh_id is None:
        wh = Warehouse(name="Magazyn główny", tenant_id=tenant_id)
        db.add(wh)
        db.flush()
        db.add(
            TenantWarehouse(
                tenant_id=tenant_id,
                warehouse_id=int(wh.id),
                role="owner",
                is_default=1,
            )
        )
        if getattr(tenant, "default_warehouse_id", None) is None:
            tenant.default_warehouse_id = int(wh.id)
        db.commit()
        db.refresh(wh)
        wh_id = int(wh.id)

    if (
        db.query(OrderUiStatus)
        .filter(OrderUiStatus.tenant_id == tenant_id, OrderUiStatus.warehouse_id == wh_id)
        .count()
        == 0
    ):
        defaults: list[tuple[str, str, str]] = [
            ("NEW", "Nowe", "#3b82f6"),
            ("IN_PROGRESS", "W toku", "#eab308"),
            ("DONE", "Zakończone", "#22c55e"),
        ]
        for i, (main_group, name, color) in enumerate(defaults):
            db.add(
                OrderUiStatus(
                    tenant_id=tenant_id,
                    warehouse_id=wh_id,
                    main_group=main_group,
                    name=name,
                    color=color,
                    sort_order=i,
                    is_system=True,
                )
            )
        db.commit()

    from ..services.document_series_seed_service import seed_default_document_series

    try:
        seed_default_document_series(db)
    except Exception:
        logger.exception("seed_basic_data: document series seed failed")

    try:
        from ..services.document_label_template_seed_service import ensure_document_label_templates_for_all_tenants

        ensure_document_label_templates_for_all_tenants(db)
    except Exception:
        logger.exception("seed_basic_data: document label templates seed failed")


def seed_wms_panel_defaults(db: Session) -> None:
    """Return workflow statuses, return module config, packing settings for panel tenant (id=1)."""
    from ..models.wms_packing_settings import WmsPackingSettings
    from ..services.return_module_config_service import seed_defaults_session
    from ..services.return_status_service import seed_default_statuses_session

    tenant_id = PANEL_TENANT_ID
    wh_id = _default_warehouse_id_for_tenant(db, tenant_id)
    if wh_id is None:
        logger.warning("seed_wms_panel_defaults: no default warehouse for tenant id=%s", tenant_id)
        return

    seed_default_statuses_session(db, tenant_id, wh_id)
    seed_defaults_session(db, tenant_id, wh_id)
    db.commit()

    if (
        db.query(WmsPackingSettings)
        .filter(
            WmsPackingSettings.tenant_id == tenant_id,
            WmsPackingSettings.warehouse_id == wh_id,
        )
        .first()
        is None
    ):
        db.add(
            WmsPackingSettings(
                tenant_id=tenant_id,
                warehouse_id=wh_id,
                auto_actions_json="{}",
                document_settings_json="{}",
                fallback_label_json="{}",
                interface_display_json="{}",
            )
        )
        db.commit()


def seed_app_users(db: Session) -> None:
    """Bootstrap super_admin when no such account exists and DB has no other users (safe default)."""
    from ..auth.config import INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_LOGIN, INITIAL_ADMIN_PASSWORD
    from ..auth.passwords import hash_password
    from ..models.app_user import AppUser, UserWmsProfile

    if db.query(AppUser).filter(AppUser.role.in_(["super_admin", "superadmin"])).first():
        return
    if db.query(AppUser).count() > 0:
        return
    login = (INITIAL_ADMIN_LOGIN or "admin").strip() or "admin"
    pw = INITIAL_ADMIN_PASSWORD or "admin"
    email = (INITIAL_ADMIN_EMAIL or "admin@local").strip() or "admin@local"
    u = AppUser(
        login=login,
        email=email,
        password_hash=hash_password(pw),
        first_name="Super",
        last_name="Admin",
        role="super_admin",
        is_active=True,
        language="pl",
        wms_language="pl",
        wms_currency="PLN",
        is_system_seed=True,
        password_must_change=True,
    )
    db.add(u)
    db.flush()
    db.add(
        UserWmsProfile(
            user_id=u.id,
            language="pl",
            timezone="Europe/Warsaw",
            require_scan_every_product=False,
            can_edit_products_preview=False,
        )
    )
    db.commit()
    logger.warning(
        "seed_app_users: created system superadmin login=%r email=%r — change password before production",
        login,
        email,
    )
