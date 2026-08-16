"""
Picking-entry readiness gate (Phase 1: dry-run / diagnostics only).

Full-order classification using the same pickable ATP SSOT as WMS picking.
Does NOT create MO, change panel status, or create SALES_ORDER reservations
unless a future Phase-2 flag enables allocation.
"""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass, field
from typing import Any

from sqlalchemy.orm import Session, joinedload

from ..models.order import Order
from ..models.order_item import OrderItem, order_item_is_replaced_line
from ..models.picking_config import PickingConfig
from ..models.product_composition import ProductComposition
from .bundle_order_item_ops import order_item_skip_bundle_commercial_header_for_ops
from .production_config_query import get_production_config_by_source_status
from .production_manufacturing_composition import get_active_manufacturing_composition
from .wms_picking_atp import pickable_available_qty

logger = logging.getLogger(__name__)

# --- Line codes ---
LINE_READY = "READY"
LINE_MANUFACTURING_PARTIAL = "MANUFACTURING_PARTIAL"
LINE_MANUFACTURING_MISSING = "MANUFACTURING_MISSING"
LINE_REGULAR_SHORTAGE = "REGULAR_SHORTAGE"
LINE_NO_BOM = "NO_BOM"
LINE_INVALID_MANUFACTURING_CONFIG = "INVALID_MANUFACTURING_CONFIG"

# --- Order codes ---
ORDER_READY_FOR_PICKING = "READY_FOR_PICKING"
ORDER_BLOCKED_MANUFACTURING = "BLOCKED_MANUFACTURING"
ORDER_BLOCKED_REGULAR_SHORTAGE = "BLOCKED_REGULAR_SHORTAGE"
ORDER_BLOCKED_MIXED = "BLOCKED_MIXED"
ORDER_BLOCKED_CONFIG = "BLOCKED_CONFIG"

_MANUFACTURING_LINE = frozenset(
    {LINE_MANUFACTURING_PARTIAL, LINE_MANUFACTURING_MISSING}
)
_REGULARISH_LINE = frozenset({LINE_REGULAR_SHORTAGE, LINE_NO_BOM})
_CONFIG_LINE = frozenset({LINE_INVALID_MANUFACTURING_CONFIG})


def picking_entry_readiness_dry_run_enabled() -> bool:
    from .picking_entry_gate_service import MODE_DRY_RUN, picking_entry_readiness_mode

    return picking_entry_readiness_mode() == MODE_DRY_RUN


def picking_entry_readiness_allocate_enabled() -> bool:
    from .picking_entry_gate_service import MODE_ACTIVE, picking_entry_readiness_mode

    return picking_entry_readiness_mode() == MODE_ACTIVE


@dataclass
class OrderItemReadinessResult:
    order_item_id: int
    product_id: int
    code: str
    required: float
    available: float
    would_allocate: float = 0.0
    production_required: float = 0.0
    missing: float = 0.0
    has_active_bom: bool = False
    detail: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class OrderReadinessResult:
    order_id: int
    tenant_id: int
    warehouse_id: int
    code: str
    lines: list[OrderItemReadinessResult] = field(default_factory=list)
    dry_run: bool = True
    side_effects: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "order_id": self.order_id,
            "tenant_id": self.tenant_id,
            "warehouse_id": self.warehouse_id,
            "code": self.code,
            "dry_run": self.dry_run,
            "side_effects": list(self.side_effects),
            "lines": [ln.to_dict() for ln in self.lines],
        }


def _has_inactive_or_any_manufacturing_composition(
    db: Session, *, tenant_id: int, product_id: int
) -> bool:
    row = (
        db.query(ProductComposition.id)
        .filter(
            ProductComposition.tenant_id == int(tenant_id),
            ProductComposition.product_id == int(product_id),
            ProductComposition.composition_mode == "manufacturing",
        )
        .first()
    )
    return row is not None


def classify_order_item_readiness(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    order_item: OrderItem,
) -> OrderItemReadinessResult:
    from .stock_disposition import resolve_order_item_required_disposition

    pid = int(order_item.product_id)
    required = float(order_item.quantity or 0)
    sd = resolve_order_item_required_disposition(order_item)
    available = pickable_available_qty(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        product_id=pid,
        exclude_order_id=int(order_id),
        stock_disposition=sd,
    )
    active_bom = get_active_manufacturing_composition(
        db, tenant_id=int(tenant_id), product_id=pid
    )
    has_bom = active_bom is not None

    if required <= 1e-9:
        return OrderItemReadinessResult(
            order_item_id=int(order_item.id),
            product_id=pid,
            code=LINE_READY,
            required=0.0,
            available=available,
            would_allocate=0.0,
            has_active_bom=has_bom,
        )

    cover = min(required, available)
    short = max(0.0, required - available)

    if short <= 1e-9:
        return OrderItemReadinessResult(
            order_item_id=int(order_item.id),
            product_id=pid,
            code=LINE_READY,
            required=required,
            available=available,
            would_allocate=required,
            production_required=0.0,
            missing=0.0,
            has_active_bom=has_bom,
        )

    if has_bom:
        bom_lines = list(getattr(active_bom, "lines", None) or [])
        if not bom_lines:
            return OrderItemReadinessResult(
                order_item_id=int(order_item.id),
                product_id=pid,
                code=LINE_INVALID_MANUFACTURING_CONFIG,
                required=required,
                available=available,
                would_allocate=cover,
                production_required=short,
                missing=short,
                has_active_bom=True,
                detail="active_bom_without_component_lines",
            )
        if cover <= 1e-9:
            return OrderItemReadinessResult(
                order_item_id=int(order_item.id),
                product_id=pid,
                code=LINE_MANUFACTURING_MISSING,
                required=required,
                available=available,
                would_allocate=0.0,
                production_required=required,
                missing=required,
                has_active_bom=True,
            )
        return OrderItemReadinessResult(
            order_item_id=int(order_item.id),
            product_id=pid,
            code=LINE_MANUFACTURING_PARTIAL,
            required=required,
            available=available,
            would_allocate=cover,
            production_required=short,
            missing=short,
            has_active_bom=True,
        )

    if _has_inactive_or_any_manufacturing_composition(
        db, tenant_id=tenant_id, product_id=pid
    ):
        return OrderItemReadinessResult(
            order_item_id=int(order_item.id),
            product_id=pid,
            code=LINE_NO_BOM,
            required=required,
            available=available,
            would_allocate=cover,
            missing=short,
            has_active_bom=False,
            detail="manufacturing_composition_present_but_not_active",
        )

    return OrderItemReadinessResult(
        order_item_id=int(order_item.id),
        product_id=pid,
        code=LINE_REGULAR_SHORTAGE,
        required=required,
        available=available,
        would_allocate=cover,
        missing=short,
        has_active_bom=False,
    )


def aggregate_order_readiness_code(lines: list[OrderItemReadinessResult]) -> str:
    codes = {ln.code for ln in lines}
    if not codes or codes == {LINE_READY}:
        return ORDER_READY_FOR_PICKING
    has_cfg = bool(codes & _CONFIG_LINE)
    has_mfg = bool(codes & _MANUFACTURING_LINE)
    has_reg = bool(codes & _REGULARISH_LINE)
    if has_cfg and not has_mfg and not has_reg:
        return ORDER_BLOCKED_CONFIG
    if has_cfg:
        # Config blocker dominates when mixed with others.
        return ORDER_BLOCKED_CONFIG
    if has_mfg and has_reg:
        return ORDER_BLOCKED_MIXED
    if has_mfg:
        return ORDER_BLOCKED_MANUFACTURING
    if has_reg:
        return ORDER_BLOCKED_REGULAR_SHORTAGE
    return ORDER_READY_FOR_PICKING


def evaluate_order_picking_entry_readiness(
    db: Session,
    *,
    order: Order,
    dry_run: bool = True,
) -> OrderReadinessResult:
    """
    Classify all operational lines. Phase 1 always dry-run (no reserve / MO / status).
    """
    tid = int(order.tenant_id)
    wid = int(order.warehouse_id)
    oid = int(order.id)
    lines: list[OrderItemReadinessResult] = []
    for oi in order.items or []:
        if order_item_is_replaced_line(oi):
            continue
        if order_item_skip_bundle_commercial_header_for_ops(oi):
            continue
        lines.append(
            classify_order_item_readiness(
                db,
                tenant_id=tid,
                warehouse_id=wid,
                order_id=oid,
                order_item=oi,
            )
        )
    code = aggregate_order_readiness_code(lines)
    # Phase 1: never allocate even if allocate flag is set — guard explicitly.
    side_effects: list[str] = []
    if not dry_run and picking_entry_readiness_allocate_enabled():
        side_effects.append("allocate_skipped_phase1_hard_guard")
    result = OrderReadinessResult(
        order_id=oid,
        tenant_id=tid,
        warehouse_id=wid,
        code=code,
        lines=lines,
        dry_run=True if dry_run else False,
        side_effects=side_effects,
    )
    logger.info(
        "[picking_entry_readiness] %s",
        {
            "order_id": oid,
            "code": code,
            "dry_run": result.dry_run,
            "lines": [
                {
                    "order_item_id": ln.order_item_id,
                    "product_id": ln.product_id,
                    "code": ln.code,
                    "required": ln.required,
                    "available": ln.available,
                    "would_allocate": ln.would_allocate,
                    "production_required": ln.production_required,
                    "missing": ln.missing,
                }
                for ln in lines
            ],
        },
    )
    return result


def is_picking_entry_source_status(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    status_id: int | None,
) -> bool:
    """True when status is a non-production PickingConfig.source_status."""
    if status_id is None:
        return False
    row = (
        db.query(PickingConfig)
        .filter(
            PickingConfig.tenant_id == int(tenant_id),
            PickingConfig.warehouse_id == int(warehouse_id),
            PickingConfig.source_status_id == int(status_id),
            PickingConfig.is_production_mode.is_(False),
            PickingConfig.is_active.is_(True),
        )
        .first()
    )
    return row is not None


def maybe_run_picking_entry_readiness_dry_run(
    db: Session,
    *,
    order: Order,
    previous_status_id: int | None,
    new_status_id: int | None,
) -> OrderReadinessResult | None:
    """
    Soft-fail hook after panel status change. Feature-flagged; no lifecycle mutation.
    Skips production entry statuses (SINGLE_ELEMENT trigger owns that path).
    """
    if not picking_entry_readiness_dry_run_enabled():
        return None
    if new_status_id is None:
        return None
    if previous_status_id is not None and int(previous_status_id) == int(new_status_id):
        return None
    tid = int(order.tenant_id)
    wid = int(order.warehouse_id)
    # Guard: do not collide with production SINGLE_ELEMENT trigger on same status.
    prod = get_production_config_by_source_status(
        db, tid, wid, int(new_status_id), require_active=True
    )
    if prod is not None:
        logger.debug(
            "[picking_entry_readiness] skip dry-run — production source_status order_id=%s",
            getattr(order, "id", None),
        )
        return None
    if not is_picking_entry_source_status(
        db, tenant_id=tid, warehouse_id=wid, status_id=int(new_status_id)
    ):
        return None
    # Ensure items are loaded
    if not getattr(order, "items", None):
        order = (
            db.query(Order)
            .options(joinedload(Order.items))
            .filter(Order.id == int(order.id))
            .first()
            or order
        )
    return evaluate_order_picking_entry_readiness(db, order=order, dry_run=True)
