"""Read / write warehouse picking terminal scan policy + shared validation resolver."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ..models.wms_picking_terminal_settings import WmsPickingTerminalSettings
from .tenant_default_warehouse import assert_tenant_warehouse_scope


def get_or_create_wms_picking_terminal_settings(
    db: Session, *, tenant_id: int, warehouse_id: int
) -> WmsPickingTerminalSettings:
    assert_tenant_warehouse_scope(db, tenant_id, warehouse_id)
    row = (
        db.query(WmsPickingTerminalSettings)
        .filter(
            WmsPickingTerminalSettings.tenant_id == int(tenant_id),
            WmsPickingTerminalSettings.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if row:
        return row
    row = WmsPickingTerminalSettings(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        list_display_json="{}",
    )
    db.add(row)
    db.flush()
    return row


def touch_wms_picking_terminal_settings_row(row: WmsPickingTerminalSettings) -> None:
    row.updated_at = datetime.utcnow()


def terminal_settings_as_dict(row: WmsPickingTerminalSettings) -> dict[str, bool]:
    return {
        "require_product_scan_at_least_once": bool(row.require_product_scan_at_least_once),
        "require_location_scan": bool(row.require_location_scan),
        "disable_force_location_scan_when_many_locations": bool(
            row.disable_force_location_scan_when_many_locations
        ),
        "allow_reserve_location_picking": bool(row.allow_reserve_location_picking),
        "allow_products_without_ean": bool(getattr(row, "allow_products_without_ean", False)),
    }


def location_scan_required(
    *,
    location_count: int,
    require_location_scan: bool,
    disable_force_when_many: bool,
) -> bool:
    """
    Shared policy for when the operator must scan/select a source location before pick.

    Priority:
    A) require_location_scan → always
    B) multi-location and not disable_force_when_many → require
    C) otherwise → no mandatory location scan (system may auto-pick concrete source)
    """
    if require_location_scan:
        return True
    if int(location_count) > 1 and not disable_force_when_many:
        return True
    return False


def _norm_code(value: Any) -> str:
    return str(value or "").strip()


def product_has_scannable_code(product: Any | None) -> bool:
    """
    True when the product has any identifier accepted by existing scan resolution
    (EAN, internal barcode, SKU/symbol, extra barcodes) — not a second code system.
    """
    if product is None:
        return False
    if _norm_code(getattr(product, "ean", None)):
        return True
    if _norm_code(getattr(product, "barcode", None)):
        return True
    if _norm_code(getattr(product, "sku", None)) or _norm_code(getattr(product, "symbol", None)):
        return True
    extras = getattr(product, "extra_barcodes", None) or []
    for row in extras:
        if _norm_code(getattr(row, "ean", None)):
            return True
    return False


def product_scan_codes(product: Any | None) -> list[str]:
    """Normalized scan codes for the product (EAN / barcode / SKU / extra EANs)."""
    if product is None:
        return []
    out: list[str] = []
    for raw in (
        getattr(product, "ean", None),
        getattr(product, "barcode", None),
        getattr(product, "sku", None),
        getattr(product, "symbol", None),
    ):
        n = _norm_code(raw)
        if n:
            out.append(n)
    for row in getattr(product, "extra_barcodes", None) or []:
        n = _norm_code(getattr(row, "ean", None))
        if n:
            out.append(n)
    # Preserve order, drop case-insensitive duplicates
    seen: set[str] = set()
    uniq: list[str] = []
    for c in out:
        key = c.casefold()
        if key in seen:
            continue
        seen.add(key)
        uniq.append(c)
    return uniq


@dataclass(frozen=True)
class PickingValidationGates:
    """Resolved picking validation gates for one product / location-count context."""

    require_product_scan_at_least_once: bool
    require_location_scan_setting: bool
    disable_force_location_scan_when_many: bool
    allow_reserve_location_picking: bool
    allow_products_without_ean: bool
    location_count: int
    has_scannable_product_code: bool
    needs_location_scan: bool
    #: True when operator must scan product before confirm (deadlock-safe for unscannable).
    needs_product_scan: bool
    #: Unscannable product blocked because allow_products_without_ean is off.
    product_blocked_without_code: bool
    #: Unscannable + allow → manual product confirm is enough even if product scan required.
    allow_manual_product_confirm: bool


def resolve_picking_validation_gates(
    *,
    require_product_scan_at_least_once: bool,
    require_location_scan: bool,
    disable_force_location_scan_when_many: bool,
    allow_reserve_location_picking: bool,
    allow_products_without_ean: bool,
    location_count: int,
    has_scannable_product_code: bool,
) -> PickingValidationGates:
    needs_loc = location_scan_required(
        location_count=int(location_count),
        require_location_scan=bool(require_location_scan),
        disable_force_when_many=bool(disable_force_location_scan_when_many),
    )
    has_code = bool(has_scannable_product_code)
    allow_no_ean = bool(allow_products_without_ean)
    require_prod = bool(require_product_scan_at_least_once)

    blocked = (not has_code) and (not allow_no_ean)
    allow_manual = (not has_code) and allow_no_ean
    # Product scan required unless: setting off, or unscannable+allowed (manual OK).
    needs_prod = bool(require_prod and has_code)

    return PickingValidationGates(
        require_product_scan_at_least_once=require_prod,
        require_location_scan_setting=bool(require_location_scan),
        disable_force_location_scan_when_many=bool(disable_force_location_scan_when_many),
        allow_reserve_location_picking=bool(allow_reserve_location_picking),
        allow_products_without_ean=allow_no_ean,
        location_count=int(location_count),
        has_scannable_product_code=has_code,
        needs_location_scan=needs_loc,
        needs_product_scan=needs_prod,
        product_blocked_without_code=blocked,
        allow_manual_product_confirm=allow_manual,
    )


def resolve_gates_from_terminal_row(
    row: WmsPickingTerminalSettings,
    *,
    location_count: int,
    has_scannable_product_code: bool,
) -> PickingValidationGates:
    return resolve_picking_validation_gates(
        require_product_scan_at_least_once=bool(row.require_product_scan_at_least_once),
        require_location_scan=bool(row.require_location_scan),
        disable_force_location_scan_when_many=bool(
            row.disable_force_location_scan_when_many_locations
        ),
        allow_reserve_location_picking=bool(row.allow_reserve_location_picking),
        allow_products_without_ean=bool(getattr(row, "allow_products_without_ean", False)),
        location_count=int(location_count),
        has_scannable_product_code=bool(has_scannable_product_code),
    )


def assert_pick_terminal_gates(
    gates: PickingValidationGates,
    *,
    product_scan_confirmed: bool,
    location_scan_confirmed: bool,
) -> None:
    """Raise BasketPutError when pick violates terminal validation policy."""
    from .wms_basket_put.error_codes import (
        PICK_LOCATION_REQUIRED,
        PRODUCT_SCAN_REQUIRED,
        PRODUCT_WITHOUT_SCAN_CODE_BLOCKED,
        operator_message,
    )
    from .wms_basket_put.scan_service import BasketPutError

    if gates.product_blocked_without_code:
        raise BasketPutError(
            PRODUCT_WITHOUT_SCAN_CODE_BLOCKED,
            operator_message(PRODUCT_WITHOUT_SCAN_CODE_BLOCKED),
        )
    if gates.needs_product_scan and not product_scan_confirmed:
        raise BasketPutError(PRODUCT_SCAN_REQUIRED, operator_message(PRODUCT_SCAN_REQUIRED))
    if gates.needs_location_scan and not location_scan_confirmed:
        raise BasketPutError(PICK_LOCATION_REQUIRED, operator_message(PICK_LOCATION_REQUIRED))
