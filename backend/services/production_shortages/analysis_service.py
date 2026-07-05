"""Detailed material shortage analysis — locations, ETA, substitute proposals, limiting component."""

from __future__ import annotations

import math
from datetime import date, datetime
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...models.product import Product
from ...models.product_composition import ProductComposition
from ...models.purchase_order import PurchaseOrder, PurchaseOrderItem
from ..composition_engine_service import effective_line_qty
from ..purchasing_order_service import PO_CANCELLED, PO_CLOSED
from ..reservations.availability_service import warehouse_net_available
from .ai_recommendation_context import build_recommendation_context
from .block_message_service import build_production_block_message, material_status_description
from .constants import STATUS_BLOCKED, STATUS_OK, STATUS_PARTIAL, MaterialProductionStatus
from .inventory_detail_service import component_stock_breakdown, inventory_lot_hints
from .recipe_variant_service import variant_codes_for_product
from .substitute_service import list_substitutes_for_product

OPEN_PO_STATUSES = ("Draft", "Sent", "Confirmed", "PartiallyReceived")


def _product_meta(p: Product | None, pid: int) -> dict[str, Any]:
    if p is None:
        return {"product_name": f"Produkt #{pid}", "product_sku": None, "product_image_url": None}
    return {
        "product_name": str(p.name or f"Produkt #{pid}"),
        "product_sku": p.sku or p.symbol,
        "product_image_url": getattr(p, "image_url", None),
    }


def expected_availability_date(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
) -> str | None:
    row = (
        db.query(func.min(PurchaseOrder.expected_date))
        .join(PurchaseOrderItem, PurchaseOrderItem.purchase_order_id == PurchaseOrder.id)
        .filter(
            PurchaseOrder.tenant_id == int(tenant_id),
            PurchaseOrder.status.in_(OPEN_PO_STATUSES),
            PurchaseOrderItem.product_id == int(product_id),
            PurchaseOrderItem.qty > PurchaseOrderItem.received_qty,
        )
        .filter(
            (PurchaseOrder.warehouse_id == int(warehouse_id)) | (PurchaseOrder.warehouse_id.is_(None))
        )
        .scalar()
    )
    if row is None:
        return None
    if isinstance(row, datetime):
        return row.date().isoformat()
    if isinstance(row, date):
        return row.isoformat()
    return str(row)[:10]


def _substitute_proposals(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    missing_qty: float,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for sub in list_substitutes_for_product(db, tenant_id=tenant_id, product_id=product_id, active_only=True):
        sp = sub.substitute_product
        avail = warehouse_net_available(
            db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=int(sub.substitute_product_id)
        )
        ratio = float(sub.conversion_ratio or 1.0)
        if ratio <= 1e-9:
            continue
        effective = avail / ratio
        meta = _product_meta(sp, int(sub.substitute_product_id))
        can_cover = effective >= missing_qty - 1e-6
        out.append(
            {
                "substitute_product_id": int(sub.substitute_product_id),
                "substitute_product_name": meta["product_name"],
                "substitute_product_sku": meta["product_sku"],
                "substitute_product_image_url": meta["product_image_url"],
                "priority": int(sub.priority),
                "conversion_ratio": round(ratio, 6),
                "available_qty": round(avail, 4),
                "effective_qty": round(effective, 4),
                "can_cover_shortage": can_cover,
                "propose_use_substitute": can_cover,
                "technological_note": sub.notes,
                "requires_user_acceptance": True,
            }
        )
    return out


def analyze_component_requirements(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    component_totals: dict[int, float],
    exclude_batch_id: int | None = None,
    exclude_order_id: int | None = None,
) -> list[dict[str, Any]]:
    if not component_totals:
        return []
    pids = list(component_totals.keys())
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(pids)).all()}
    rows: list[dict[str, Any]] = []
    for pid, required in sorted(component_totals.items(), key=lambda x: x[0]):
        pid = int(pid)
        req = float(required)
        stock = component_stock_breakdown(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            product_id=pid,
            exclude_batch_id=exclude_batch_id,
            exclude_order_id=exclude_order_id,
        )
        avail = float(stock["available_qty"])
        missing = max(0.0, req - avail)
        p = products.get(pid)
        meta = _product_meta(p, pid)
        lots = inventory_lot_hints(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            product_id=pid,
            exclude_batch_id=exclude_batch_id,
            exclude_order_id=exclude_order_id,
        )
        rows.append(
            {
                "component_product_id": pid,
                **meta,
                "required_qty": round(req, 4),
                "on_hand_qty": stock["on_hand_qty"],
                "reserved_qty": stock["reserved_qty"],
                "available_qty": round(avail, 4),
                "missing_qty": round(missing, 4),
                "locations": lots,
                "expected_availability_date": expected_availability_date(
                    db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=pid
                ),
                "substitute_proposals": _substitute_proposals(
                    db,
                    tenant_id=tenant_id,
                    warehouse_id=warehouse_id,
                    product_id=pid,
                    missing_qty=missing,
                )
                if missing > 1e-6
                else [],
            }
        )
    return rows


def compute_partial_production(
    *,
    planned_quantity: float,
    per_unit: dict[int, float],
    components: list[dict[str, Any]],
) -> dict[str, Any]:
    planned = max(0.0, float(planned_quantity))
    if planned <= 1e-9 or not per_unit:
        return {
            "material_status": STATUS_OK,
            "producible_now_qty": 0.0,
            "waiting_qty": 0.0,
            "has_shortages": False,
            "limiting_component": None,
        }

    limits: list[tuple[float, dict[str, Any]]] = []
    has_any_shortage = False
    for comp in components:
        pid = int(comp["component_product_id"])
        per = per_unit.get(pid, 0.0)
        if per <= 1e-9:
            continue
        avail = float(comp["available_qty"])
        limit = avail / per
        limits.append((limit, comp))
        if float(comp["missing_qty"]) > 1e-6:
            has_any_shortage = True

    if not limits:
        return {
            "material_status": STATUS_OK,
            "producible_now_qty": planned,
            "waiting_qty": 0.0,
            "has_shortages": False,
            "limiting_component": None,
        }

    min_limit, limiting_comp = min(limits, key=lambda x: x[0])
    max_full = float(math.floor(min_limit))
    if max_full >= planned - 1e-6:
        status: MaterialProductionStatus = STATUS_OK
        producible = planned
        waiting = 0.0
        limiting = None
    elif max_full > 0:
        status = STATUS_PARTIAL
        producible = float(max_full)
        waiting = max(0.0, planned - producible)
        limiting = _limiting_component_dict(limiting_comp, producible)
    else:
        status = STATUS_BLOCKED
        producible = 0.0
        waiting = planned
        limiting = _limiting_component_dict(limiting_comp, 0.0)

    return {
        "material_status": status,
        "producible_now_qty": round(producible, 4),
        "waiting_qty": round(waiting, 4),
        "has_shortages": has_any_shortage or status != STATUS_OK,
        "limiting_component": limiting,
    }


def _limiting_component_dict(comp: dict[str, Any], max_producible: float) -> dict[str, Any]:
    return {
        "component_product_id": int(comp["component_product_id"]),
        "product_name": comp.get("product_name"),
        "product_sku": comp.get("product_sku"),
        "product_image_url": comp.get("product_image_url"),
        "required_qty": comp.get("required_qty"),
        "available_qty": comp.get("available_qty"),
        "missing_qty": comp.get("missing_qty"),
        "max_producible_qty": round(max_producible, 4),
        "substitute_proposals": comp.get("substitute_proposals") or [],
    }


def analyze_composition_quantity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    composition: ProductComposition,
    planned_quantity: float,
    exclude_batch_id: int | None = None,
    exclude_order_id: int | None = None,
    include_bom_explosion: bool = False,
    include_ai_context: bool = False,
) -> dict[str, Any]:
    yld = float(composition.yield_quantity or 1) or 1.0
    totals: dict[int, float] = {}
    per_unit: dict[int, float] = {}
    for ln in composition.lines or []:
        per = effective_line_qty(ln, yield_qty=yld)
        if per <= 1e-9:
            continue
        pid = int(ln.component_product_id)
        per_unit[pid] = per
        totals[pid] = totals.get(pid, 0.0) + per * float(planned_quantity)

    components = analyze_component_requirements(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        component_totals=totals,
        exclude_batch_id=exclude_batch_id,
        exclude_order_id=exclude_order_id,
    )
    partial = compute_partial_production(
        planned_quantity=float(planned_quantity),
        per_unit=per_unit,
        components=components,
    )
    shortages = [c for c in components if float(c.get("missing_qty") or 0) > 1e-6]
    block = build_production_block_message(
        material_status=str(partial["material_status"]),
        planned_quantity=float(planned_quantity),
        producible_now_qty=float(partial["producible_now_qty"]),
        waiting_qty=float(partial["waiting_qty"]),
        limiting_component=partial.get("limiting_component"),
        components_with_shortage=shortages,
    )

    result: dict[str, Any] = {
        "composition_id": int(composition.id),
        "product_id": int(composition.product_id),
        "planned_quantity": float(planned_quantity),
        "components": components,
        "material_status_description": material_status_description(str(partial["material_status"])),
        "block_message": block,
        "can_start_production": bool(block.get("can_start")),
        **partial,
    }

    if include_bom_explosion:
        from .bom_explosion_service import (
            attach_shortage_impact_to_tree,
            bom_node_to_dict,
            explode_composition_bom,
            flatten_bom_demand,
        )

        tree = explode_composition_bom(
            db, tenant_id=tenant_id, composition=composition, planned_quantity=float(planned_quantity)
        )
        flat = flatten_bom_demand(tree)
        exploded_components = analyze_component_requirements(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            component_totals=flat,
            exclude_batch_id=exclude_batch_id,
            exclude_order_id=exclude_order_id,
        )
        analysis_map = {int(c["component_product_id"]): c for c in exploded_components}
        attach_shortage_impact_to_tree(tree, component_analysis=analysis_map)
        result["bom_explosion"] = bom_node_to_dict(tree)
        result["exploded_component_totals"] = {str(k): round(v, 4) for k, v in flat.items()}

    if include_ai_context:
        variants = variant_codes_for_product(db, tenant_id=tenant_id, product_id=int(composition.product_id))
        result["ai_recommendation_context"] = build_recommendation_context(
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            analysis=result,
            composition_id=int(composition.id),
            product_id=int(composition.product_id),
            recipe_variant_codes=variants,
        ).to_dict()

    return result


def material_status_for_max_producible(*, planned: float, max_producible: float) -> MaterialProductionStatus:
    if max_producible <= 1e-6:
        return STATUS_BLOCKED
    if max_producible >= planned - 1e-6:
        return STATUS_OK
    return STATUS_PARTIAL


def can_start_with_material_status(material_status: str) -> bool:
    """Partial production allowed — block only when zero producible."""
    return str(material_status) != STATUS_BLOCKED
