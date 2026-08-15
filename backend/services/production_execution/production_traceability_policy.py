"""Production-only traceability policy.

This module is intentionally independent from the receiving validation policy.
Product ``track_*`` fields are capabilities; production settings and overrides
decide which identities production must capture.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from typing import Any

from sqlalchemy.orm import Session

from ...models.product import Product
from ...models.wms_settings import WmsSettings

TRACE_MODE_OFF = "OFF"
TRACE_MODE_CONFIGURED = "CONFIGURED"
TRACE_OVERRIDE_INHERIT = "INHERIT"
TRACE_OVERRIDE_REQUIRE = "REQUIRE"
TRACE_OVERRIDE_OFF = "OFF"
TRACE_OVERRIDE_VALUES = frozenset({TRACE_OVERRIDE_INHERIT, TRACE_OVERRIDE_REQUIRE, TRACE_OVERRIDE_OFF})


@dataclass(frozen=True)
class ProductionTraceabilityPolicy:
    require_batch: bool = False
    require_serial: bool = False
    require_expiry: bool = False

    def to_dict(self) -> dict[str, bool]:
        return asdict(self)


def parse_production_traceability_settings(raw: str | dict[str, Any] | None) -> dict[str, Any]:
    parsed: Any = raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw) if raw.strip() else {}
        except (TypeError, ValueError, json.JSONDecodeError):
            parsed = {}
    if not isinstance(parsed, dict):
        parsed = {}
    mode = str(parsed.get("mode") or TRACE_MODE_OFF).strip().upper()
    if mode not in {TRACE_MODE_OFF, TRACE_MODE_CONFIGURED}:
        mode = TRACE_MODE_OFF
    return {
        "mode": mode,
        "require_batch": bool(parsed.get("require_batch", False)),
        "require_serial": bool(parsed.get("require_serial", False)),
        "require_expiry": bool(parsed.get("require_expiry", False)),
    }


def normalize_product_trace_mode(value: Any) -> str:
    mode = str(value or TRACE_OVERRIDE_INHERIT).strip().upper()
    if mode not in TRACE_OVERRIDE_VALUES:
        raise ValueError("Tryb śledzenia produkcji musi mieć wartość INHERIT, REQUIRE albo OFF.")
    return mode


def validate_product_production_trace_modes(product: Product) -> None:
    for suffix, capability in (
        ("batch", bool(getattr(product, "track_batch", False))),
        ("serial", bool(getattr(product, "track_serial", False))),
        ("expiry", bool(getattr(product, "track_expiry", False))),
    ):
        mode = normalize_product_trace_mode(getattr(product, f"production_trace_{suffix}_mode", None))
        if mode == TRACE_OVERRIDE_REQUIRE and not capability:
            labels = {"batch": "Numer partii (LOT)", "serial": "Numer seryjny (SN)", "expiry": "Data ważności"}
            raise ValueError(
                f"Nie można ustawić „Wymagany” dla {labels.get(suffix, suffix)} — "
                "produkt nie obsługuje tej identyfikowalności (capability wyłączona)."
            )


def load_production_traceability_settings(
    db: Session, *, tenant_id: int, warehouse_id: int
) -> dict[str, Any]:
    try:
        from sqlalchemy import inspect

        if not inspect(db.connection()).has_table("wms_settings"):
            return parse_production_traceability_settings(None)
    except Exception:
        return parse_production_traceability_settings(None)
    row = (
        db.query(WmsSettings)
        .filter(
            WmsSettings.tenant_id == int(tenant_id),
            WmsSettings.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    return parse_production_traceability_settings(
        getattr(row, "production_traceability_json", None) if row is not None else None
    )


def resolve_effective_production_traceability(
    product: Product,
    settings: WmsSettings | dict[str, Any] | str | None,
) -> ProductionTraceabilityPolicy:
    raw = (
        getattr(settings, "production_traceability_json", None)
        if settings is not None and not isinstance(settings, (dict, str))
        else settings
    )
    cfg = parse_production_traceability_settings(raw)
    if cfg["mode"] == TRACE_MODE_OFF:
        return ProductionTraceabilityPolicy()

    def effective(suffix: str, capability: bool) -> bool:
        if not capability:
            return False
        override = normalize_product_trace_mode(
            getattr(product, f"production_trace_{suffix}_mode", TRACE_OVERRIDE_INHERIT)
        )
        if override == TRACE_OVERRIDE_OFF:
            return False
        if override == TRACE_OVERRIDE_REQUIRE:
            return True
        return bool(cfg[f"require_{suffix}"])

    return ProductionTraceabilityPolicy(
        require_batch=effective("batch", bool(getattr(product, "track_batch", False))),
        require_serial=effective("serial", bool(getattr(product, "track_serial", False))),
        require_expiry=effective("expiry", bool(getattr(product, "track_expiry", False))),
    )


def resolve_effective_production_traceability_for_product(
    db: Session, *, tenant_id: int, warehouse_id: int, product: Product
) -> ProductionTraceabilityPolicy:
    return resolve_effective_production_traceability(
        product,
        load_production_traceability_settings(
            db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
        ),
    )
