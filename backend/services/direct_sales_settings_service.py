"""Resolve and persist direct sales WMS business settings."""

from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ..models.direct_sales_settings import TENANT_DEFAULT_WAREHOUSE_ID, DirectSalesSettings
from ..schemas.direct_sales_settings import DirectSalesSettingsConfig, DirectSalesSettingsRead

SYSTEM_DEFAULTS = DirectSalesSettingsConfig().model_dump()


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


def _parse_row(row: DirectSalesSettings | None) -> dict[str, Any]:
    if row is None:
        return {}
    raw = row.settings_json or "{}"
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _config_from_dict(data: dict[str, Any]) -> DirectSalesSettingsConfig:
    merged = _deep_merge(SYSTEM_DEFAULTS, data)
    return DirectSalesSettingsConfig.model_validate(merged)


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


def resolve_direct_sales_settings(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> DirectSalesSettingsRead:
    wh_id = int(warehouse_id)
    tenant_row = _get_row(db, tenant_id, TENANT_DEFAULT_WAREHOUSE_ID)
    wh_row = _get_row(db, tenant_id, wh_id) if wh_id > 0 else None

    tenant_data = _parse_row(tenant_row)
    tenant_defaults = _config_from_dict(_deep_merge(SYSTEM_DEFAULTS, tenant_data))

    wh_data = _parse_row(wh_row)
    warehouse_overrides = _config_from_dict(wh_data) if wh_row and wh_data else None
    has_override = bool(wh_row and wh_data)

    resolved_dict = _deep_merge(tenant_defaults.model_dump(), wh_data if wh_id > 0 else {})
    resolved = DirectSalesSettingsConfig.model_validate(resolved_dict)

    return DirectSalesSettingsRead(
        tenant_id=int(tenant_id),
        warehouse_id=wh_id,
        resolved=resolved,
        tenant_defaults=tenant_defaults,
        warehouse_overrides=warehouse_overrides if has_override else None,
        has_warehouse_override=has_override,
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
    row.settings_json = json.dumps(settings.model_dump(), ensure_ascii=False)
    row.updated_at = datetime.utcnow()
    db.flush()
    target_wh = int(warehouse_id) if int(warehouse_id) > 0 else TENANT_DEFAULT_WAREHOUSE_ID
    return resolve_direct_sales_settings(db, tenant_id=tenant_id, warehouse_id=target_wh)
