"""Resolve and persist direct sales WMS business settings."""

from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ..models.direct_sales_settings import TENANT_DEFAULT_WAREHOUSE_ID, DirectSalesSettings
from ..schemas.direct_sales_settings import DirectSalesSettingsConfig, DirectSalesSettingsRead
from .order_status_select_service import (
    resolve_order_status_id_by_legacy_name_hints,
    resolve_order_status_id_with_fallback,
)

SYSTEM_DEFAULTS = DirectSalesSettingsConfig().model_dump()

_LEGACY_DEFAULT_ORDER_STATUS_KEY = "default_order_status"
# Pre-f0fa7a2e system default stamped transfer=False into saved settings JSON.
_DS_PAYMENT_METHODS_V2_KEY = "ds_payment_methods_v2"
# Rollout: until stamped, ``enabled=false`` does not block (legacy fail-open).
DS_ENABLED_V1_KEY = "ds_enabled_v1"
# Removed from UI/schema — persist on save so historical JSON is not wiped.
LEGACY_WORKFLOW_STATUS_ID_KEYS: tuple[str, ...] = (
    "session_created_order_status_id",
    "paid_order_status_id",
    "issued_order_status_id",
    "cancelled_order_status_id",
)
# Removed from UI/schema — preserve in JSON on save for safe round-trip.
LEGACY_STOCK_SETTING_KEYS: tuple[str, ...] = ("allow_oversell",)

_LEGACY_ALLOCATION_STRATEGY_MAP: dict[str, str] = {
    "auto": "auto_split",
    "store_first": "auto_split",
    "pick_face": "single_location",
}


def normalize_allocation_strategy(raw: object | None) -> str:
    """Map legacy allocation_strategy values to the three live strategies."""
    s = str(raw or "").strip().lower()
    if s in _LEGACY_ALLOCATION_STRATEGY_MAP:
        return _LEGACY_ALLOCATION_STRATEGY_MAP[s]
    if s in ("auto_split", "single_location", "manual"):
        return s
    return "auto_split"


def _extensions_dict(data: dict[str, Any]) -> dict[str, Any]:
    ext = data.get("extensions")
    return ext if isinstance(ext, dict) else {}


def _has_enabled_v1_stamp(data: dict[str, Any]) -> bool:
    return bool(_extensions_dict(data).get(DS_ENABLED_V1_KEY))


def _stored_enabled(data: dict[str, Any]) -> bool:
    merged = _deep_merge(SYSTEM_DEFAULTS, data)
    return bool(merged.get("enabled", False))


@dataclass(frozen=True)
class DirectSalesEnableState:
    """Resolved enable semantics for a tenant/warehouse scope."""

    stored_enabled: bool
    enabled_effective: bool
    enabled_enforced: bool

    @property
    def expansion_blocked(self) -> bool:
        """New work / qty increase blocked — enforced scope with effective OFF."""
        return self.enabled_enforced and not self.enabled_effective


def resolve_direct_sales_enable_state(
    *,
    tenant_data: dict[str, Any],
    wh_data: dict[str, Any],
    warehouse_id: int,
    resolved_stored_enabled: bool,
) -> DirectSalesEnableState:
    """Single SSOT for rollout stamp + tenant/warehouse inheritance."""
    wh_id = int(warehouse_id)
    tenant_stamped = _has_enabled_v1_stamp(tenant_data)
    wh_stamped = _has_enabled_v1_stamp(wh_data) if wh_id > 0 else False

    if wh_id > 0 and wh_stamped:
        return DirectSalesEnableState(
            stored_enabled=bool(resolved_stored_enabled),
            enabled_effective=bool(resolved_stored_enabled),
            enabled_enforced=True,
        )

    if tenant_stamped:
        tenant_enabled = _stored_enabled(tenant_data)
        return DirectSalesEnableState(
            stored_enabled=bool(resolved_stored_enabled),
            enabled_effective=tenant_enabled,
            enabled_enforced=True,
        )

    # Legacy fail-open: feature flag alone governed sales before v1 stamp.
    return DirectSalesEnableState(
        stored_enabled=bool(resolved_stored_enabled),
        enabled_effective=True,
        enabled_enforced=False,
    )


def resolve_direct_sales_business_enabled(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> bool:
    """Effective business ON/OFF — use for terminal visibility and new-work gate."""
    try:
        read = resolve_direct_sales_settings(
            db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
        )
        return bool(read.enabled_effective)
    except Exception:
        return True


def is_direct_sales_expansion_blocked(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> bool:
    """True when stamped OFF — blocks create/scan/add/search and qty increases."""
    try:
        read = resolve_direct_sales_settings(
            db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
        )
        return bool(read.enabled_enforced and not read.enabled_effective)
    except Exception:
        return False


def preserve_legacy_workflow_status_ids(
    existing: dict[str, Any],
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Echo historical workflow status IDs into saved JSON without exposing them on the live config."""
    out = deepcopy(payload)
    for key in LEGACY_WORKFLOW_STATUS_ID_KEYS:
        if key in existing and key not in out:
            out[key] = existing[key]
    return out


def preserve_legacy_stock_setting_keys(
    existing: dict[str, Any],
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Echo removed stock keys (e.g. allow_oversell) into saved JSON without live config exposure."""
    out = deepcopy(payload)
    for key in LEGACY_STOCK_SETTING_KEYS:
        if key in existing and key not in out:
            out[key] = existing[key]
    return out


def _migrate_allocation_strategy_field(data: dict[str, Any]) -> dict[str, Any]:
    out = deepcopy(data)
    if "allocation_strategy" in out:
        out["allocation_strategy"] = normalize_allocation_strategy(out.get("allocation_strategy"))
    return out


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    out = deepcopy(base)
    for key, val in override.items():
        if key == "extensions" and isinstance(val, dict):
            ext = out.get("extensions")
            if not isinstance(ext, dict):
                ext = {}
            merged_ext = deepcopy(ext)
            merged_ext.update(val)
            out["extensions"] = merged_ext
            continue
        if isinstance(val, dict) and isinstance(out.get(key), dict):
            nested = deepcopy(out[key])
            nested.update(val)
            out[key] = nested
        else:
            out[key] = val
    return out


def _migrate_payment_methods_defaults(data: dict[str, Any]) -> dict[str, Any]:
    """Enable TRANSFER when old system default (false) was persisted before product default flipped.

    Persisted ``extensions.ds_payment_methods_v2`` (written on save) means operator choice is final.
    """
    out = deepcopy(data)
    ext = out.get("extensions")
    if isinstance(ext, dict) and ext.get(_DS_PAYMENT_METHODS_V2_KEY):
        return out
    pm = out.get("payment_methods")
    if isinstance(pm, dict) and pm.get("transfer") is False:
        pm = deepcopy(pm)
        pm["transfer"] = True
        out["payment_methods"] = pm
    return out


def _upgrade_raw_settings_payload(raw: dict[str, Any]) -> dict[str, Any]:
    """Upgrade persisted row JSON before merge so warehouse overrides cannot re-stamp legacy false."""
    return _migrate_payment_methods_defaults(raw)


def _parse_row(row: DirectSalesSettings | None) -> dict[str, Any]:
    if row is None:
        return {}
    raw = row.settings_json or "{}"
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _migrate_legacy_status_fields(
    db: Session,
    data: dict[str, Any],
    *,
    tenant_id: int,
    warehouse_id: int,
) -> dict[str, Any]:
    """Map deprecated string status keys to panel status ids; strip legacy keys."""
    out = deepcopy(data)
    if int(warehouse_id) <= 0:
        out.pop(_LEGACY_DEFAULT_ORDER_STATUS_KEY, None)
        return out
    legacy = out.pop(_LEGACY_DEFAULT_ORDER_STATUS_KEY, None)
    if legacy and not out.get("default_order_status_id"):
        migrated = resolve_order_status_id_by_legacy_name_hints(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            legacy_key=str(legacy),
        )
        if migrated is not None:
            out["default_order_status_id"] = migrated
    return out


def _apply_status_id_fallbacks(
    db: Session,
    cfg: DirectSalesSettingsConfig,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> DirectSalesSettingsConfig:
    if int(warehouse_id) <= 0:
        return cfg
    payload = cfg.model_dump()
    default_raw = payload.get("default_order_status_id")
    default_configured = int(default_raw) if default_raw is not None else None
    if default_configured is None:
        default_configured = resolve_order_status_id_by_legacy_name_hints(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            legacy_key="paid",
        )
    payload["default_order_status_id"] = resolve_order_status_id_with_fallback(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        configured_id=default_configured,
    )
    return DirectSalesSettingsConfig.model_validate(payload)


def _config_from_dict(
    data: dict[str, Any],
    *,
    db: Session | None = None,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
    apply_status_fallbacks: bool = False,
) -> DirectSalesSettingsConfig:
    merged = _deep_merge(SYSTEM_DEFAULTS, data)
    merged = _migrate_allocation_strategy_field(merged)
    merged = _migrate_payment_methods_defaults(merged)
    for key in LEGACY_STOCK_SETTING_KEYS:
        merged.pop(key, None)
    if db is not None and tenant_id is not None and warehouse_id is not None and int(warehouse_id) > 0:
        merged = _migrate_legacy_status_fields(db, merged, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    cfg = DirectSalesSettingsConfig.model_validate(merged)
    if apply_status_fallbacks and db is not None and tenant_id is not None and warehouse_id is not None:
        cfg = _apply_status_id_fallbacks(db, cfg, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    return cfg


def _get_row(db: Session, tenant_id: int, warehouse_id: int) -> DirectSalesSettings | None:
    return (
        db.query(DirectSalesSettings)
        .filter(
            DirectSalesSettings.tenant_id == int(tenant_id),
            DirectSalesSettings.warehouse_id == int(warehouse_id),
        )
        .first()
    )


def _get_or_create_row(db: Session, tenant_id: int, warehouse_id: int) -> DirectSalesSettings:
    row = _get_row(db, tenant_id, warehouse_id)
    if row:
        return row
    row = DirectSalesSettings(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        settings_json=json.dumps({}, ensure_ascii=False),
    )
    db.add(row)
    db.flush()
    return row


def _settings_version_for_read(
    *,
    tenant_row: DirectSalesSettings | None,
    wh_row: DirectSalesSettings | None,
    resolved: DirectSalesSettingsConfig,
) -> tuple[str, str | None]:
    """Stable version hash + latest updated_at for cache invalidation."""
    parts: list[str] = []
    latest: datetime | None = None
    for row in (tenant_row, wh_row):
        if row is None:
            continue
        parts.append(str(row.settings_json or "{}"))
        ts = getattr(row, "updated_at", None) or getattr(row, "created_at", None)
        if isinstance(ts, datetime):
            parts.append(ts.isoformat())
            if latest is None or ts > latest:
                latest = ts
    if not parts:
        parts.append(resolved.model_dump_json())
    digest = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:16]
    return digest, latest.isoformat() if latest else None


def resolve_direct_sales_settings(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> DirectSalesSettingsRead:
    wh_id = int(warehouse_id)
    tenant_row = _get_row(db, tenant_id, TENANT_DEFAULT_WAREHOUSE_ID)
    wh_row = _get_row(db, tenant_id, wh_id) if wh_id > 0 else None

    tenant_data = _upgrade_raw_settings_payload(_parse_row(tenant_row))
    resolve_wh = wh_id if wh_id > 0 else None
    tenant_defaults = _config_from_dict(
        _deep_merge(SYSTEM_DEFAULTS, tenant_data),
        db=db if resolve_wh else None,
        tenant_id=int(tenant_id),
        warehouse_id=resolve_wh,
        apply_status_fallbacks=False,
    )

    wh_data = _upgrade_raw_settings_payload(_parse_row(wh_row))
    warehouse_overrides = (
        _config_from_dict(
            wh_data,
            db=db,
            tenant_id=int(tenant_id),
            warehouse_id=wh_id,
            apply_status_fallbacks=False,
        )
        if wh_row and wh_data
        else None
    )
    has_override = bool(wh_row and wh_data)

    resolved_dict = _deep_merge(tenant_defaults.model_dump(), wh_data if wh_id > 0 else {})
    resolved = _config_from_dict(
        resolved_dict,
        db=db if resolve_wh else None,
        tenant_id=int(tenant_id),
        warehouse_id=resolve_wh,
        apply_status_fallbacks=resolve_wh is not None,
    )

    enable_state = resolve_direct_sales_enable_state(
        tenant_data=tenant_data,
        wh_data=wh_data if wh_id > 0 else {},
        warehouse_id=wh_id,
        resolved_stored_enabled=bool(resolved.enabled),
    )

    version, updated_at = _settings_version_for_read(
        tenant_row=tenant_row,
        wh_row=wh_row,
        resolved=resolved,
    )
    return DirectSalesSettingsRead(
        tenant_id=int(tenant_id),
        warehouse_id=wh_id,
        resolved=resolved,
        tenant_defaults=tenant_defaults,
        warehouse_overrides=warehouse_overrides if has_override else None,
        has_warehouse_override=has_override,
        enabled_effective=enable_state.enabled_effective,
        enabled_enforced=enable_state.enabled_enforced,
        settings_version=version,
        updated_at=updated_at,
    )


def save_direct_sales_settings(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    settings: DirectSalesSettingsConfig,
) -> DirectSalesSettingsRead:
    scope_wh = TENANT_DEFAULT_WAREHOUSE_ID if int(warehouse_id) <= 0 else int(warehouse_id)
    row = _get_or_create_row(db, tenant_id, scope_wh)
    payload = settings.model_dump()
    payload["allocation_strategy"] = normalize_allocation_strategy(payload.get("allocation_strategy"))
    for key in LEGACY_STOCK_SETTING_KEYS:
        payload.pop(key, None)
    ext = payload.get("extensions") if isinstance(payload.get("extensions"), dict) else {}
    ext = {**ext, _DS_PAYMENT_METHODS_V2_KEY: True}
    # Conscious save stamps v1 — checkbox becomes the business gate for this scope.
    if "enabled" in payload:
        ext = {**ext, DS_ENABLED_V1_KEY: True}
    payload["extensions"] = ext
    existing_raw = _parse_row(row)
    payload = preserve_legacy_workflow_status_ids(existing_raw, payload)
    payload = preserve_legacy_stock_setting_keys(existing_raw, payload)
    row.settings_json = json.dumps(payload, ensure_ascii=False)
    row.updated_at = datetime.utcnow()
    db.flush()
    target_wh = int(warehouse_id) if int(warehouse_id) > 0 else TENANT_DEFAULT_WAREHOUSE_ID
    return resolve_direct_sales_settings(db, tenant_id=tenant_id, warehouse_id=target_wh)
