"""
Phase 2 active picking-entry gate: full-order readiness + FG reserve + MO missing demand.

Mode: FEATURE_PICKING_ENTRY_READINESS_MODE=off|dry_run|active
Legacy: FEATURE_PICKING_ENTRY_READINESS_DRY_RUN=1 → dry_run when MODE unset.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from ..models.order import Order
from ..models.order_item import OrderItem, order_item_is_replaced_line
from ..models.picking_config import PickingConfig
from ..models.product import Product
from .activity_log.domain_activity import record_domain_activity
from .activity_log.domain_event_codes import (
    PICKING_ENTRY_GATE_BLOCKED,
    PICKING_ENTRY_GATE_READY,
    PICKING_ENTRY_MO_DEMAND,
)
from .bundle_order_item_ops import order_item_skip_bundle_commercial_header_for_ops
from .picking_entry_readiness_service import (
    LINE_INVALID_MANUFACTURING_CONFIG,
    LINE_MANUFACTURING_MISSING,
    LINE_MANUFACTURING_PARTIAL,
    LINE_NO_BOM,
    LINE_READY,
    LINE_REGULAR_SHORTAGE,
    ORDER_BLOCKED_CONFIG,
    ORDER_BLOCKED_MANUFACTURING,
    ORDER_BLOCKED_MIXED,
    ORDER_BLOCKED_REGULAR_SHORTAGE,
    ORDER_READY_FOR_PICKING,
    OrderItemReadinessResult,
    OrderReadinessResult,
    aggregate_order_readiness_code,
    evaluate_order_picking_entry_readiness,
    is_picking_entry_source_status,
)
from .production_config_query import get_production_config_by_source_status, list_production_configs
from .production_manufacturing_composition import get_active_manufacturing_composition
from .production_order_trigger.trigger_service import (
    AGGREGABLE_MO_STATUSES,
    RESULT_AGGREGATED,
    RESULT_CREATED,
    RESULT_IDEMPOTENT,
    RESULT_REACTIVATED,
    _advisory_lock,
    _aggregation_lock_key,
    _attach_or_reactivate_source,
    _create_orders_mo,
    _find_active_source_for_item,
    _find_aggregable_mo,
    _find_reconcilable_demand_source_for_item,
    _qty_label,
    _rescale_snapshots,
    _withdraw_production,
    historical_fulfilled_production_qty,
)
from .sales_order_fg_reservation_service import (
    SalesOrderReservationError,
    release_sales_order_reservations_for_order,
    reserve_sales_order_fg,
    reserved_qty_for_order_product,
    sync_sales_order_reservation_to_line_qty,
)
from .wms_picking_atp import pickable_available_qty

logger = logging.getLogger(__name__)

META_RETURN_PICKING_STATUS_ID = "return_picking_status_id"
META_RETURN_PICKING_CONFIG_ID = "return_picking_config_id"
META_RETURN_WAREHOUSE_ID = "return_picking_warehouse_id"
META_READINESS_SNAPSHOT = "picking_entry_readiness"
META_LAST_BLOCKER_FINGERPRINT = "picking_entry_blocker_fingerprint"

MODE_OFF = "off"
MODE_DRY_RUN = "dry_run"
MODE_ACTIVE = "active"


def picking_entry_readiness_mode() -> str:
    raw = (os.getenv("FEATURE_PICKING_ENTRY_READINESS_MODE") or "").strip().lower()
    if raw in (MODE_OFF, MODE_DRY_RUN, MODE_ACTIVE):
        return raw
    # Backward-compatible Phase 1 flag
    legacy = (os.getenv("FEATURE_PICKING_ENTRY_READINESS_DRY_RUN") or "").strip().lower()
    if legacy in ("1", "true", "yes", "on"):
        return MODE_DRY_RUN
    return MODE_OFF


def resolve_gate_production_config(
    db: Session, *, tenant_id: int, warehouse_id: int
) -> PickingConfig | None:
    """Active production config usable by multi-element picking-entry gate."""
    rows = list_production_configs(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, include_inactive=False
    )
    usable = [
        r
        for r in rows
        if getattr(r, "status_awaiting_production_id", None)
        and getattr(r, "finished_goods_buffer_location_id", None)
        and getattr(r, "status_after_production_id", None)
    ]
    if not usable:
        return None
    usable.sort(key=lambda r: int(r.id))
    return usable[0]


def _order_meta(order: Order) -> dict[str, Any]:
    raw = getattr(order, "import_metadata_json", None)
    if not raw or not str(raw).strip():
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_order_meta(db: Session, order: Order, meta: dict[str, Any]) -> None:
    order.import_metadata_json = json.dumps(meta, ensure_ascii=False, separators=(",", ":"))
    db.add(order)


def _picked_qty(oi: OrderItem) -> float:
    for attr in ("quantity_picked", "wms_quantity_picked", "picked_qty"):
        v = getattr(oi, attr, None)
        if v is not None:
            try:
                return max(0.0, float(v))
            except (TypeError, ValueError):
                pass
    return 0.0


def _product_labels(db: Session, product_id: int) -> tuple[str, str | None]:
    pr = db.query(Product).filter(Product.id == int(product_id)).first()
    if pr is None:
        return f"Produkt #{product_id}", None
    name = (pr.name or "").strip() or f"Produkt #{product_id}"
    sku = (getattr(pr, "sku", None) or getattr(pr, "symbol", None) or None)
    if sku is not None:
        sku = str(sku).strip() or None
    return name, sku


@dataclass
class LineGatePlan:
    order_item: OrderItem
    readiness: OrderItemReadinessResult
    to_reserve: float = 0.0
    production_demand: float = 0.0
    mo_id: int | None = None
    mo_number: str | None = None
    production_action: str | None = None


@dataclass
class GateRunResult:
    mode: str
    readiness: OrderReadinessResult
    lines: list[LineGatePlan] = field(default_factory=list)
    status_changed_to: int | None = None
    side_effects: list[str] = field(default_factory=list)
    noop: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "noop": self.noop,
            "status_changed_to": self.status_changed_to,
            "side_effects": list(self.side_effects),
            "readiness": self.readiness.to_dict(),
            "lines": [
                {
                    **ln.readiness.to_dict(),
                    "to_reserve": ln.to_reserve,
                    "production_demand": ln.production_demand,
                    "mo_id": ln.mo_id,
                    "mo_number": ln.mo_number,
                    "production_action": ln.production_action,
                }
                for ln in self.lines
            ],
        }


def _reclassify_with_config(
    db: Session,
    *,
    readiness: OrderReadinessResult,
    production_config: PickingConfig | None,
) -> OrderReadinessResult:
    """Upgrade manufacturing shortfalls to INVALID when production config unusable."""
    if production_config is not None:
        return readiness
    changed = False
    new_lines: list[OrderItemReadinessResult] = []
    for ln in readiness.lines:
        if ln.code in (LINE_MANUFACTURING_PARTIAL, LINE_MANUFACTURING_MISSING) and ln.has_active_bom:
            changed = True
            new_lines.append(
                OrderItemReadinessResult(
                    order_item_id=ln.order_item_id,
                    product_id=ln.product_id,
                    code=LINE_INVALID_MANUFACTURING_CONFIG,
                    required=ln.required,
                    available=ln.available,
                    would_allocate=ln.would_allocate,
                    production_required=ln.production_required,
                    missing=ln.missing,
                    has_active_bom=True,
                    detail="missing_usable_production_config_or_awaiting_status",
                )
            )
        else:
            new_lines.append(ln)
    if not changed:
        return readiness
    readiness.lines = new_lines
    readiness.code = aggregate_order_readiness_code(new_lines)
    return readiness


def _compute_line_plan(
    db: Session,
    *,
    order: Order,
    oi: OrderItem,
    base: OrderItemReadinessResult,
) -> LineGatePlan:
    tid = int(order.tenant_id)
    wid = int(order.warehouse_id)
    oid = int(order.id)
    pid = int(oi.product_id)
    required = float(oi.quantity or 0)
    picked = _picked_qty(oi)
    need = max(0.0, required - picked)
    own_res = reserved_qty_for_order_product(
        db, tenant_id=tid, order_id=oid, product_id=pid
    )
    atp_incl_own = pickable_available_qty(
        db, tenant_id=tid, warehouse_id=wid, product_id=pid, exclude_order_id=oid
    )
    free_atp = max(0.0, atp_incl_own - own_res)
    target_from_stock = min(need, own_res + free_atp)
    to_reserve = max(0.0, round(target_from_stock - own_res, 6))

    active = _find_active_source_for_item(db, tenant_id=tid, order_item_id=int(oi.id))
    active_out = 0.0
    if active is not None:
        active_out = max(
            0.0, float(active.requested_quantity or 0) - float(active.fulfilled_quantity or 0)
        )
    hist = historical_fulfilled_production_qty(db, tenant_id=tid, order_item_id=int(oi.id))
    # hist already delivered FG — treat as covered for demand calc when not also in active_out
    covered = target_from_stock + active_out + max(0.0, hist - (float(active.fulfilled_quantity or 0) if active else 0.0))
    # Simpler: need - stock_cover - active_outstanding
    production_demand = 0.0
    if base.code in (
        LINE_MANUFACTURING_PARTIAL,
        LINE_MANUFACTURING_MISSING,
        LINE_INVALID_MANUFACTURING_CONFIG,
    ) or (base.has_active_bom and need > target_from_stock + 1e-9):
        production_demand = max(0.0, round(need - target_from_stock - active_out, 6))

    # Regular shortage: no production demand
    if base.code in (LINE_REGULAR_SHORTAGE, LINE_NO_BOM):
        production_demand = 0.0

    if base.code == LINE_INVALID_MANUFACTURING_CONFIG:
        production_demand = 0.0
        # Still allow reserving existing FG cover
        pass

    return LineGatePlan(
        order_item=oi,
        readiness=base,
        to_reserve=to_reserve,
        production_demand=production_demand,
    )


def ensure_missing_production_demand(
    db: Session,
    *,
    order: Order,
    item: OrderItem,
    missing_qty: float,
    production_config: PickingConfig,
    operator_user_id: int | None = None,
) -> dict[str, Any]:
    """Create/attach ORDERS MO SourceItem for missing FG only (not full line qty)."""
    need = float(missing_qty or 0)
    if need <= 1e-9:
        return {"result": RESULT_IDEMPOTENT, "requested_quantity": 0.0}

    tid = int(order.tenant_id)
    wid = int(order.warehouse_id)
    active = _find_active_source_for_item(db, tenant_id=tid, order_item_id=int(item.id))
    if active is not None:
        current_out = max(
            0.0, float(active.requested_quantity or 0) - float(active.fulfilled_quantity or 0)
        )
        from ..models.production import ProductionOrder

        mo = (
            db.query(ProductionOrder)
            .filter(ProductionOrder.id == int(active.production_order_id))
            .first()
        )
        if current_out + 1e-9 >= need:
            return {
                "result": RESULT_IDEMPOTENT,
                "production_order_id": int(active.production_order_id),
                "production_order_number": str(mo.number) if mo else None,
                "source_item_id": int(active.id),
                "requested_quantity": current_out,
            }
        # Increase demand on draft/planned only
        mo = (
            db.query(ProductionOrder)
            .filter(ProductionOrder.id == int(active.production_order_id))
            .with_for_update()
            .first()
        )
        if mo is not None and str(mo.status or "") in AGGREGABLE_MO_STATUSES:
            delta = need - current_out
            active.requested_quantity = float(active.fulfilled_quantity or 0) + need
            active.updated_at = datetime.utcnow()
            mo.planned_quantity = float(mo.planned_quantity or 0) + delta
            mo.updated_at = datetime.utcnow()
            _rescale_snapshots(mo, float(mo.planned_quantity))
            db.add(active)
            db.add(mo)
            db.flush()
            from .production_order_trigger.material_validation_service import (
                apply_material_validation_to_orders_mo,
            )

            apply_material_validation_to_orders_mo(
                db, mo=mo, picking_config=production_config, operator_user_id=operator_user_id
            )
            return {
                "result": RESULT_AGGREGATED,
                "production_order_id": int(mo.id),
                "production_order_number": str(mo.number),
                "source_item_id": int(active.id),
                "requested_quantity": need,
                "delta": delta,
            }
        return {
            "result": RESULT_IDEMPOTENT,
            "production_order_id": int(active.production_order_id),
            "source_item_id": int(active.id),
            "requested_quantity": current_out,
            "note": "mo_not_aggregable_no_increase",
        }

    composition = get_active_manufacturing_composition(
        db, tenant_id=tid, product_id=int(item.product_id)
    )
    if composition is None:
        return {"result": "NO_BOM", "product_id": int(item.product_id)}

    _advisory_lock(
        db,
        key=_aggregation_lock_key(
            tenant_id=tid,
            warehouse_id=wid,
            product_id=int(item.product_id),
            composition_id=int(composition.id),
            picking_config_id=int(production_config.id),
        ),
    )

    created_new_mo = False
    mo = _find_aggregable_mo(
        db,
        tenant_id=tid,
        warehouse_id=wid,
        product_id=int(item.product_id),
        composition_id=int(composition.id),
        picking_config_id=int(production_config.id),
        for_update=True,
    )
    if mo is None:
        try:
            nested = db.begin_nested()
            try:
                mo = _create_orders_mo(
                    db,
                    tenant_id=tid,
                    warehouse_id=wid,
                    composition=composition,
                    planned_quantity=need,
                    picking_config=production_config,
                )
                nested.commit()
                created_new_mo = True
            except IntegrityError:
                nested.rollback()
                mo = _find_aggregable_mo(
                    db,
                    tenant_id=tid,
                    warehouse_id=wid,
                    product_id=int(item.product_id),
                    composition_id=int(composition.id),
                    picking_config_id=int(production_config.id),
                    for_update=True,
                )
                if mo is None:
                    raise
        except IntegrityError:
            mo = _find_aggregable_mo(
                db,
                tenant_id=tid,
                warehouse_id=wid,
                product_id=int(item.product_id),
                composition_id=int(composition.id),
                picking_config_id=int(production_config.id),
                for_update=True,
            )
            if mo is None:
                return {"result": "ERROR", "reason": "mo_create_race"}

    assert mo is not None
    try:
        source, action = _attach_or_reactivate_source(
            db,
            tenant_id=tid,
            mo=mo,
            order=order,
            item=item,
            requested_quantity=need,
        )
    except IntegrityError:
        active2 = _find_active_source_for_item(db, tenant_id=tid, order_item_id=int(item.id))
        if active2 is not None:
            return {
                "result": RESULT_IDEMPOTENT,
                "production_order_id": int(active2.production_order_id),
                "source_item_id": int(active2.id),
            }
        raise

    if action == "active":
        return {
            "result": RESULT_IDEMPOTENT,
            "production_order_id": int(mo.id),
            "production_order_number": str(mo.number),
            "source_item_id": int(source.id),
            "requested_quantity": float(source.requested_quantity or 0),
        }

    if not created_new_mo and action in ("created", "reactivated"):
        mo.planned_quantity = float(mo.planned_quantity or 0) + float(need)
        mo.updated_at = datetime.utcnow()
        _rescale_snapshots(mo, float(mo.planned_quantity))
        db.add(mo)
        db.flush()

    from .production_order_trigger.material_validation_service import (
        apply_material_validation_to_orders_mo,
    )

    apply_material_validation_to_orders_mo(
        db, mo=mo, picking_config=production_config, operator_user_id=operator_user_id
    )

    if created_new_mo:
        result_code = RESULT_CREATED
    elif action == "reactivated":
        result_code = RESULT_REACTIVATED
    else:
        result_code = RESULT_AGGREGATED

    return {
        "result": result_code,
        "production_order_id": int(mo.id),
        "production_order_number": str(mo.number),
        "source_item_id": int(source.id),
        "requested_quantity": need,
    }


def _blocker_fingerprint(readiness: OrderReadinessResult, plans: list[LineGatePlan]) -> str:
    parts = [readiness.code]
    for ln in plans:
        parts.append(
            f"{ln.readiness.product_id}:{ln.readiness.code}:{ln.readiness.required}:"
            f"{ln.readiness.available}:{ln.production_demand}"
        )
    return "|".join(parts)


def _emit_gate_activity(
    db: Session,
    *,
    order: Order,
    readiness: OrderReadinessResult,
    plans: list[LineGatePlan],
    fingerprint: str,
    had_prior_blocker: bool,
) -> None:
    tid = int(order.tenant_id)
    wid = int(order.warehouse_id)
    oid = int(order.id)

    if readiness.code == ORDER_READY_FOR_PICKING:
        if not had_prior_blocker:
            return
        record_domain_activity(
            db,
            tenant_id=tid,
            warehouse_id=wid,
            order_id=oid,
            event_type=PICKING_ENTRY_GATE_READY,
            description="Zamówienie gotowe do zbierania — wszystkie pozycje pokryte stanem.",
            severity="INFO",
            category="system",
            correlation_id=f"peg-ready-{oid}-{fingerprint[:40]}",
            metadata={"readiness": readiness.to_dict()},
            actor_user_id=None,
        )
        return

    if readiness.code == ORDER_BLOCKED_REGULAR_SHORTAGE:
        # Regular-only: store issues, soft log (not red manufacturing block)
        lines_meta = []
        for ln in plans:
            if ln.readiness.code not in (LINE_REGULAR_SHORTAGE, LINE_NO_BOM):
                continue
            pname, sku = _product_labels(db, ln.readiness.product_id)
            lines_meta.append(
                {
                    "product_id": ln.readiness.product_id,
                    "product_name": pname,
                    "sku": sku,
                    "required_qty": ln.readiness.required,
                    "available": ln.readiness.available,
                    "missing": ln.readiness.missing,
                    "code": ln.readiness.code,
                }
            )
        record_domain_activity(
            db,
            tenant_id=tid,
            warehouse_id=wid,
            order_id=oid,
            event_type=PICKING_ENTRY_GATE_BLOCKED,
            description="Wykryto brak zwykłego produktu przy wejściu do zbierania.",
            severity="INFO",
            category="system",
            correlation_id=f"peg-block-{oid}-{fingerprint[:40]}",
            metadata={"order_code": readiness.code, "lines": lines_meta},
            actor_user_id=None,
        )
        return

    # Manufacturing / mixed / config — one red event
    lines_meta = []
    for ln in plans:
        if ln.readiness.code == LINE_READY:
            continue
        pname, sku = _product_labels(db, ln.readiness.product_id)
        entry: dict[str, Any] = {
            "product_id": ln.readiness.product_id,
            "product_name": pname,
            "sku": sku,
            "required_qty": ln.readiness.required,
            "available": ln.readiness.available,
            "code": ln.readiness.code,
        }
        if ln.readiness.code in (
            LINE_MANUFACTURING_PARTIAL,
            LINE_MANUFACTURING_MISSING,
            LINE_INVALID_MANUFACTURING_CONFIG,
        ):
            entry["allocated_existing_fg"] = ln.readiness.would_allocate
            entry["production_required_qty"] = ln.production_demand or ln.readiness.production_required
            if ln.mo_id:
                entry["mo_id"] = ln.mo_id
                entry["mo_number"] = ln.mo_number
        if ln.readiness.code in (LINE_REGULAR_SHORTAGE, LINE_NO_BOM):
            entry["missing"] = ln.readiness.missing
        lines_meta.append(entry)

    desc = "Nie można rozpocząć zbierania — brak gotowego produktu."
    if readiness.code == ORDER_BLOCKED_CONFIG:
        desc = "Nie można rozpocząć zbierania — niepoprawna konfiguracja produkcji."
    elif readiness.code == ORDER_BLOCKED_MIXED:
        desc = "Nie można rozpocząć zbierania — brak gotowego produktu (oraz braki zwykłych pozycji)."

    record_domain_activity(
        db,
        tenant_id=tid,
        warehouse_id=wid,
        order_id=oid,
        event_type=PICKING_ENTRY_GATE_BLOCKED,
        description=desc,
        severity="ERROR",
        category="system",
        correlation_id=f"peg-block-{oid}-{fingerprint[:40]}",
        metadata={"order_code": readiness.code, "lines": lines_meta},
        actor_user_id=None,
    )

    for ln in plans:
        if ln.mo_id and ln.production_action in (RESULT_CREATED, RESULT_AGGREGATED, RESULT_REACTIVATED):
            pname, sku = _product_labels(db, ln.readiness.product_id)
            record_domain_activity(
                db,
                tenant_id=tid,
                warehouse_id=wid,
                order_id=oid,
                production_order_id=ln.mo_id,
                event_type=PICKING_ENTRY_MO_DEMAND,
                description=(
                    f"Utworzono zapotrzebowanie produkcyjne — {ln.mo_number}, "
                    f"{_qty_label(ln.production_demand)} szt."
                ),
                severity="INFO",
                category="system",
                correlation_id=f"peg-mo-{oid}-{ln.mo_id}-{_qty_label(ln.production_demand)}",
                metadata={
                    "mo_id": ln.mo_id,
                    "mo_number": ln.mo_number,
                    "requested_quantity": ln.production_demand,
                    "product_id": ln.readiness.product_id,
                    "product_name": pname,
                    "sku": sku,
                    "action": ln.production_action,
                },
                actor_user_id=None,
                production_label=ln.mo_number,
            )


def run_picking_entry_gate(
    db: Session,
    *,
    order: Order,
    previous_status_id: int | None,
    new_status_id: int | None,
    operator_user_id: int | None = None,
    force_mode: str | None = None,
) -> GateRunResult | None:
    mode = (force_mode or picking_entry_readiness_mode()).strip().lower()
    if mode == MODE_OFF:
        return None
    if new_status_id is None:
        return None
    if previous_status_id is not None and int(previous_status_id) == int(new_status_id):
        return None

    tid = int(order.tenant_id)
    wid = int(order.warehouse_id)

    # Guard: production SINGLE_ELEMENT entry owns that status
    if get_production_config_by_source_status(
        db, tid, wid, int(new_status_id), require_active=True
    ) is not None:
        return None
    if not is_picking_entry_source_status(
        db, tenant_id=tid, warehouse_id=wid, status_id=int(new_status_id)
    ):
        return None

    if not getattr(order, "items", None):
        order = (
            db.query(Order)
            .options(joinedload(Order.items).joinedload(OrderItem.product))
            .filter(Order.id == int(order.id))
            .first()
            or order
        )

    dry = mode != MODE_ACTIVE
    readiness = evaluate_order_picking_entry_readiness(db, order=order, dry_run=dry)
    prod_cfg = resolve_gate_production_config(db, tenant_id=tid, warehouse_id=wid)
    readiness = _reclassify_with_config(db, readiness=readiness, production_config=prod_cfg)

    # Build plans keyed by order_item
    by_oi = {int(ln.order_item_id): ln for ln in readiness.lines}
    plans: list[LineGatePlan] = []
    for oi in order.items or []:
        if order_item_is_replaced_line(oi):
            continue
        if order_item_skip_bundle_commercial_header_for_ops(oi):
            continue
        base = by_oi.get(int(oi.id))
        if base is None:
            continue
        plans.append(_compute_line_plan(db, order=order, oi=oi, base=base))

    result = GateRunResult(mode=mode, readiness=readiness, lines=plans)

    if mode == MODE_DRY_RUN:
        result.side_effects.append("dry_run_no_mutations")
        logger.info("[picking_entry_gate] dry_run %s", result.to_dict())
        return result

    # --- ACTIVE ---
    meta = _order_meta(order)
    prior_fp = str(meta.get(META_LAST_BLOCKER_FINGERPRINT) or "")
    had_prior_blocker = bool(prior_fp) and not prior_fp.startswith(ORDER_READY_FOR_PICKING)

    # BLOCKED_CONFIG: no MO, log, stay or leave on picking with error
    if readiness.code == ORDER_BLOCKED_CONFIG:
        fp = _blocker_fingerprint(readiness, plans)
        if fp != prior_fp:
            _emit_gate_activity(
                db,
                order=order,
                readiness=readiness,
                plans=plans,
                fingerprint=fp,
                had_prior_blocker=had_prior_blocker,
            )
            meta[META_LAST_BLOCKER_FINGERPRINT] = fp
            meta[META_READINESS_SNAPSHOT] = readiness.to_dict()
            _save_order_meta(db, order, meta)
        else:
            result.noop = True
        result.side_effects.append("blocked_config_no_mo")
        return result

    # Reserve FG for lines that need stock cover
    for plan in plans:
        if plan.to_reserve <= 1e-9:
            continue
        try:
            reserve_sales_order_fg(
                db,
                tenant_id=tid,
                warehouse_id=wid,
                order_id=int(order.id),
                product_id=int(plan.readiness.product_id),
                quantity=plan.to_reserve,
            )
            result.side_effects.append(
                f"reserved:{plan.readiness.product_id}:{plan.to_reserve}"
            )
        except SalesOrderReservationError as exc:
            logger.warning(
                "picking_entry_gate reserve failed order_id=%s product_id=%s: %s",
                order.id,
                plan.readiness.product_id,
                exc,
            )
            result.side_effects.append(f"reserve_failed:{plan.readiness.product_id}")

    # Production demand for manufacturing lines (even with REGULAR shortage = MIXED)
    if prod_cfg is not None:
        for plan in plans:
            if plan.production_demand <= 1e-9:
                continue
            if plan.readiness.code == LINE_INVALID_MANUFACTURING_CONFIG:
                continue
            if not plan.readiness.has_active_bom:
                continue
            out = ensure_missing_production_demand(
                db,
                order=order,
                item=plan.order_item,
                missing_qty=plan.production_demand,
                production_config=prod_cfg,
                operator_user_id=operator_user_id,
            )
            plan.mo_id = out.get("production_order_id")
            plan.mo_number = out.get("production_order_number")
            plan.production_action = str(out.get("result") or "")
            result.side_effects.append(
                f"mo:{plan.readiness.product_id}:{plan.production_action}:{plan.production_demand}"
            )

    # Status decision
    move_to_awaiting = readiness.code in (
        ORDER_BLOCKED_MANUFACTURING,
        ORDER_BLOCKED_MIXED,
    ) and prod_cfg is not None and getattr(prod_cfg, "status_awaiting_production_id", None)

    if move_to_awaiting:
        awaiting_id = int(prod_cfg.status_awaiting_production_id)
        meta[META_RETURN_PICKING_STATUS_ID] = int(new_status_id)
        meta[META_RETURN_PICKING_CONFIG_ID] = None
        # resolve picking config id for this source status
        pc_row = (
            db.query(PickingConfig)
            .filter(
                PickingConfig.tenant_id == tid,
                PickingConfig.warehouse_id == wid,
                PickingConfig.source_status_id == int(new_status_id),
                PickingConfig.is_production_mode.is_(False),
            )
            .first()
        )
        if pc_row is not None:
            meta[META_RETURN_PICKING_CONFIG_ID] = int(pc_row.id)
        meta[META_RETURN_WAREHOUSE_ID] = wid
        meta[META_READINESS_SNAPSHOT] = readiness.to_dict()

        try:
            from .order_shipping_fk_service import sanitize_order_orphan_shipping_method_id

            sanitize_order_orphan_shipping_method_id(db, order)
        except Exception:
            logger.exception("sanitize shipping on awaiting move order_id=%s", order.id)

        order.order_ui_status_id = awaiting_id
        try:
            db.expire(order, ["order_ui_status"])
        except Exception:
            pass
        db.add(order)
        result.status_changed_to = awaiting_id
        result.side_effects.append(f"status_awaiting:{awaiting_id}")

    fp = _blocker_fingerprint(readiness, plans)
    if readiness.code == ORDER_READY_FOR_PICKING:
        meta[META_LAST_BLOCKER_FINGERPRINT] = fp
        meta.pop(META_READINESS_SNAPSHOT, None)
        _emit_gate_activity(
            db,
            order=order,
            readiness=readiness,
            plans=plans,
            fingerprint=fp,
            had_prior_blocker=had_prior_blocker,
        )
    elif fp != prior_fp:
        meta[META_LAST_BLOCKER_FINGERPRINT] = fp
        meta[META_READINESS_SNAPSHOT] = readiness.to_dict()
        _emit_gate_activity(
            db,
            order=order,
            readiness=readiness,
            plans=plans,
            fingerprint=fp,
            had_prior_blocker=had_prior_blocker,
        )
    else:
        result.noop = True

    _save_order_meta(db, order, meta)
    logger.info("[picking_entry_gate] active %s", result.to_dict())
    return result


def maybe_run_picking_entry_gate(
    db: Session,
    *,
    order: Order,
    previous_status_id: int | None,
    new_status_id: int | None,
    operator_user_id: int | None = None,
) -> GateRunResult | None:
    """Hook entry — soft-fail wrapper lives in order_panel_ui_status_service."""
    return run_picking_entry_gate(
        db,
        order=order,
        previous_status_id=previous_status_id,
        new_status_id=new_status_id,
        operator_user_id=operator_user_id,
    )


def cleanup_picking_entry_on_order_cancel(
    db: Session,
    *,
    order: Order,
    operator_user_id: int | None = None,
) -> dict[str, Any]:
    """Release SALES_ORDER FG holds + withdraw draft/planned production sources."""
    released = release_sales_order_reservations_for_order(
        db,
        tenant_id=int(order.tenant_id),
        order_id=int(order.id),
        reason="order_cancelled",
        performed_by_user_id=operator_user_id,
    )
    withdrawn: dict[str, Any] = {"result": "SKIPPED"}
    # Withdraw against any production config that owns sources for this order
    prod_cfgs = list_production_configs(
        db,
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        include_inactive=True,
    )
    for pc in prod_cfgs:
        try:
            withdrawn = _withdraw_production(
                db, order=order, previous_pc=pc, operator_user_id=operator_user_id
            )
            if withdrawn.get("result") not in ("SKIPPED", None):
                break
        except Exception:
            logger.exception("withdraw on cancel failed order_id=%s pc=%s", order.id, pc.id)
    return {"released_reservations": released, "withdrawn": withdrawn}


def reduce_missing_production_demand(
    db: Session,
    *,
    order: Order,
    order_item: OrderItem,
    desired_outstanding: float,
    operator_user_id: int | None = None,
) -> dict[str, Any]:
    """
    Shrink draft/planned SourceItem + MO planned_quantity down to ``desired_outstanding``.

    Finds reconcilable demand (open / reserved / partial / **shortage**).
    Started MO (collecting / in_progress / …) → no change (``mo_started_blocked``).
    When outstanding drops to 0 → cancel source; empty MO → cancel MO.

    ``planned_quantity`` decreases only when the source was counted in planned
    (ACTIVE statuses). Shortage rows are excluded from material planned totals, so
    shrinking them updates ``requested_quantity`` without double-subtracting planned.
    """
    from ..models.production import (
        PRODUCTION_ORDER_SOURCE_ITEM_ACTIVE_STATUSES,
        PRODUCTION_ORDER_SOURCE_ITEM_CANCELLED,
        PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE,
        ProductionOrder,
    )
    from .production_order_service import cancel_production_order
    from .production_order_trigger.material_validation_service import (
        refresh_orders_mo_material_reservations,
    )

    tid = int(order.tenant_id)
    active = _find_reconcilable_demand_source_for_item(
        db, tenant_id=tid, order_item_id=int(order_item.id)
    )
    if active is None:
        return {"result": "NO_SOURCE", "reduced": 0.0}

    mo = (
        db.query(ProductionOrder)
        .filter(ProductionOrder.id == int(active.production_order_id))
        .with_for_update()
        .first()
    )
    if mo is None:
        return {"result": "NO_MO", "reduced": 0.0}

    status = str(mo.status or "")
    if status not in AGGREGABLE_MO_STATUSES:
        # Started MO: never shrink planned / materials / RW.
        # Full external cover → detach source from further order fulfillment only.
        target_out = max(0.0, float(desired_outstanding or 0))
        if target_out <= 1e-9:
            from ..models.production import PRODUCTION_ORDER_SOURCE_ITEM_CANCELLED

            before_out = max(
                0.0,
                float(active.requested_quantity or 0) - float(active.fulfilled_quantity or 0),
            )
            active.status = PRODUCTION_ORDER_SOURCE_ITEM_CANCELLED
            active.updated_at = datetime.utcnow()
            db.add(active)
            db.flush()
            return {
                "result": "SOURCE_DETACHED_STARTED_MO",
                "reduced": 0.0,
                "outstanding": 0.0,
                "production_order_id": int(mo.id),
                "mo_number": str(mo.number),
                "cancelled_source": True,
                "cancelled_mo": False,
                "mo_planned_unchanged": True,
                "mo_status": status,
                "was_outstanding": before_out,
                "source_detached": True,
            }
        return {
            "result": "MO_STARTED_BLOCKED",
            "reduced": 0.0,
            "mo_status": status,
            "production_order_id": int(mo.id),
            "mo_number": str(mo.number),
        }

    source_status_before = str(active.status or "")
    counted_in_planned = source_status_before in PRODUCTION_ORDER_SOURCE_ITEM_ACTIVE_STATUSES

    fulfilled = float(active.fulfilled_quantity or 0)
    current_out = max(0.0, float(active.requested_quantity or 0) - fulfilled)
    target_out = max(0.0, float(desired_outstanding or 0))
    if current_out <= target_out + 1e-9:
        return {
            "result": RESULT_IDEMPOTENT,
            "reduced": 0.0,
            "production_order_id": int(mo.id),
            "mo_number": str(mo.number),
            "outstanding": current_out,
        }

    delta = round(current_out - target_out, 6)
    new_req = fulfilled + target_out
    active.requested_quantity = new_req
    active.updated_at = datetime.utcnow()
    # Keep shortage as shortage after partial shrink (components may still be missing).
    # Do not auto-promote to reserved — material validation owns that.
    if (
        target_out > 1e-9
        and source_status_before == PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE
    ):
        active.status = PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE

    if counted_in_planned:
        mo.planned_quantity = max(0.0, float(mo.planned_quantity or 0) - delta)
        mo.updated_at = datetime.utcnow()

    cancelled_source = False
    cancelled_mo = False
    if target_out <= 1e-9:
        active.status = PRODUCTION_ORDER_SOURCE_ITEM_CANCELLED
        cancelled_source = True

    db.add(active)
    if counted_in_planned and mo.planned_quantity <= 1e-9:
        mo.planned_quantity = 0.0
        _rescale_snapshots(mo, 0.0)
        db.add(mo)
        db.flush()
        from ..models.production import (
            PRODUCTION_ORDER_SOURCE_ITEM_RECONCILABLE_DEMAND_STATUSES,
            ProductionOrderSourceItem,
        )

        siblings = (
            db.query(ProductionOrderSourceItem)
            .filter(
                ProductionOrderSourceItem.production_order_id == int(mo.id),
                ProductionOrderSourceItem.status.in_(
                    tuple(PRODUCTION_ORDER_SOURCE_ITEM_RECONCILABLE_DEMAND_STATUSES)
                ),
            )
            .all()
        )
        still_out = sum(
            max(
                0.0,
                float(s.requested_quantity or 0) - float(s.fulfilled_quantity or 0),
            )
            for s in siblings
        )
        if still_out <= 1e-9:
            try:
                cancel_production_order(db, tenant_id=tid, order_id=int(mo.id))
                cancelled_mo = True
            except Exception:
                mo.status = "cancelled"
                db.add(mo)
                db.flush()
                cancelled_mo = True
                try:
                    refresh_orders_mo_material_reservations(
                        db, mo=mo, created_by_user_id=operator_user_id
                    )
                except Exception:
                    logger.exception("refresh after empty MO cancel mo_id=%s", mo.id)
        else:
            # ACTIVE planned empty but shortage (etc.) demand remains — keep MO.
            try:
                refresh_orders_mo_material_reservations(
                    db, mo=mo, created_by_user_id=operator_user_id
                )
            except Exception:
                logger.exception("refresh after planned-empty with shortage mo_id=%s", mo.id)
    elif counted_in_planned:
        _rescale_snapshots(mo, float(mo.planned_quantity))
        db.add(mo)
        db.flush()
        try:
            refresh_orders_mo_material_reservations(
                db, mo=mo, created_by_user_id=operator_user_id
            )
        except Exception:
            logger.exception("refresh after demand reduce mo_id=%s", mo.id)
    else:
        # Shortage (not in planned): update qty; cancel MO if no outstanding demand left.
        db.flush()
        if cancelled_source:
            from ..models.production import (
                PRODUCTION_ORDER_SOURCE_ITEM_RECONCILABLE_DEMAND_STATUSES,
                ProductionOrderSourceItem,
            )

            siblings = (
                db.query(ProductionOrderSourceItem)
                .filter(
                    ProductionOrderSourceItem.production_order_id == int(mo.id),
                    ProductionOrderSourceItem.status.in_(
                        tuple(PRODUCTION_ORDER_SOURCE_ITEM_RECONCILABLE_DEMAND_STATUSES)
                    ),
                )
                .all()
            )
            still_out = sum(
                max(
                    0.0,
                    float(s.requested_quantity or 0) - float(s.fulfilled_quantity or 0),
                )
                for s in siblings
            )
            if still_out <= 1e-9 and float(mo.planned_quantity or 0) <= 1e-9:
                try:
                    cancel_production_order(db, tenant_id=tid, order_id=int(mo.id))
                    cancelled_mo = True
                except Exception:
                    mo.status = "cancelled"
                    db.add(mo)
                    db.flush()
                    cancelled_mo = True
        try:
            refresh_orders_mo_material_reservations(
                db, mo=mo, created_by_user_id=operator_user_id
            )
        except Exception:
            logger.exception("refresh after shortage demand reduce mo_id=%s", mo.id)

    return {
        "result": "REDUCED" if not cancelled_source else "CANCELLED_SOURCE",
        "reduced": delta,
        "outstanding": target_out,
        "production_order_id": int(mo.id),
        "mo_number": str(mo.number),
        "cancelled_source": cancelled_source,
        "cancelled_mo": cancelled_mo,
        "product_id": int(order_item.product_id),
        "source_status": str(active.status or ""),
        "planned_adjusted": bool(counted_in_planned),
    }


def sync_picking_entry_on_qty_decrease(
    db: Session,
    *,
    order: Order,
    order_item: OrderItem,
    new_qty: float,
    operator_user_id: int | None = None,
) -> dict[str, Any]:
    """Partial release reservation + reduce draft/planned source requested."""
    tid = int(order.tenant_id)
    pid = int(order_item.product_id)
    released = sync_sales_order_reservation_to_line_qty(
        db,
        tenant_id=tid,
        order_id=int(order.id),
        product_id=pid,
        target_qty=float(new_qty),
        performed_by_user_id=operator_user_id,
    )
    own_res = reserved_qty_for_order_product(
        db, tenant_id=tid, order_id=int(order.id), product_id=pid
    )
    src = _find_reconcilable_demand_source_for_item(
        db, tenant_id=tid, order_item_id=int(order_item.id)
    )
    fulfilled = float(src.fulfilled_quantity or 0) if src is not None else 0.0
    desired_outstanding = max(0.0, float(new_qty) - own_res - fulfilled)
    reduced_out = reduce_missing_production_demand(
        db,
        order=order,
        order_item=order_item,
        desired_outstanding=desired_outstanding,
        operator_user_id=operator_user_id,
    )
    return {
        "reservation_released": released,
        "production_reduced": float(reduced_out.get("reduced") or 0),
        "demand": reduced_out,
    }
