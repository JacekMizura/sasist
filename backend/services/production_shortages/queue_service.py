"""Aggregated production shortages queue — blocked batches and MOs."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session, joinedload

from ...models.product import Product
from ...models.product_composition import ProductionBatch, ProductionBatchLine, ProductComposition
from ...models.production import ProductionOrder
from ..production_batch_service import _aggregate_batch_components
from .analysis_service import analyze_component_requirements

ACTIVE_SHORTAGE_STATUSES = ("draft", "planned", "collecting")


def _priority_rank(label: str) -> int:
    return {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}.get(str(label or "").upper(), 9)


def count_jobs_with_material_shortages(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> int:
    """Count distinct open BAT/MO that generate a real material shortage.

    SSOT: same queue as Materiały → Braki (``build_production_shortages_queue``).
    """
    queue = build_production_shortages_queue(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    jobs: set[tuple[str, int]] = set()
    for row in queue:
        for src in row.get("demand_sources") or []:
            kind = str(src.get("kind") or "")
            sid = src.get("id")
            if kind in ("batch", "order") and sid is not None:
                jobs.add((kind, int(sid)))
        for bid in row.get("blocked_batch_ids") or []:
            jobs.add(("batch", int(bid)))
        for oid in row.get("blocked_order_ids") or []:
            jobs.add(("order", int(oid)))
    return len(jobs)


def _empty_slot(component_product_id: int) -> dict[str, Any]:
    return {
        "component_product_id": int(component_product_id),
        "required_qty_sum": 0.0,
        "blocked_batch_ids": set(),
        "blocked_order_ids": set(),
        "finished_products": [],
        "demand_sources": [],
    }


def _append_finished_product(slot: dict[str, Any], fp: dict[str, Any]) -> None:
    key = (fp.get("kind"), fp.get("batch_id") or fp.get("order_id"), fp.get("product_id"))
    existing = {
        (x.get("kind"), x.get("batch_id") or x.get("order_id"), x.get("product_id"))
        for x in slot["finished_products"]
    }
    if key not in existing:
        slot["finished_products"].append(fp)


def build_production_shortages_queue(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> list[dict[str, Any]]:
    """Aggregate open BAT/MO component demand; emit only true shortages (missing > 0).

    ``required_qty`` is the **sum** of demand across all active draft/planned/collecting
    batches and manufacturing orders for the component — not ``max()``.
    ``missing_qty = max(0, required_qty - available_qty)``.
    """
    agg: dict[int, dict[str, Any]] = {}

    batches = (
        db.query(ProductionBatch)
        .options(
            joinedload(ProductionBatch.lines).joinedload(ProductionBatchLine.product),
            joinedload(ProductionBatch.lines)
            .joinedload(ProductionBatchLine.composition)
            .joinedload(ProductComposition.lines),
        )
        .filter(
            ProductionBatch.tenant_id == int(tenant_id),
            ProductionBatch.warehouse_id == int(warehouse_id),
            ProductionBatch.status.in_(ACTIVE_SHORTAGE_STATUSES),
        )
        .all()
    )
    for batch in batches:
        totals = _aggregate_batch_components(batch)
        if not totals:
            continue
        batch_number = str(getattr(batch, "number", None) or f"BAT/{batch.id}")
        batch_status = str(batch.status or "")
        for pid, qty in totals.items():
            req = float(qty or 0)
            if req <= 1e-9:
                continue
            slot = agg.setdefault(int(pid), _empty_slot(int(pid)))
            slot["blocked_batch_ids"].add(int(batch.id))
            slot["required_qty_sum"] = float(slot["required_qty_sum"]) + req
            fg_names: list[str] = []
            for ln in batch.lines or []:
                if not ln.product:
                    continue
                name = str(getattr(ln.product, "name", None) or "")
                fg_names.append(name)
                _append_finished_product(
                    slot,
                    {
                        "product_id": int(ln.product_id),
                        "product_name": name,
                        "product_sku": getattr(ln.product, "sku", None),
                        "product_image_url": getattr(ln.product, "image_url", None),
                        "batch_id": int(batch.id),
                        "batch_number": batch_number,
                        "kind": "batch",
                    },
                )
            slot["demand_sources"].append(
                {
                    "kind": "batch",
                    "id": int(batch.id),
                    "number": batch_number,
                    "status": batch_status,
                    "product_id": int(batch.lines[0].product_id) if batch.lines else None,
                    "product_name": ", ".join(n for n in fg_names if n) or batch_number,
                    "product_sku": getattr(batch.lines[0].product, "sku", None)
                    if batch.lines and batch.lines[0].product
                    else None,
                    "product_image_url": getattr(batch.lines[0].product, "image_url", None)
                    if batch.lines and batch.lines[0].product
                    else None,
                    "required_qty": round(req, 4),
                }
            )

    orders = (
        db.query(ProductionOrder)
        .options(joinedload(ProductionOrder.line_snapshots))
        .filter(
            ProductionOrder.tenant_id == int(tenant_id),
            ProductionOrder.warehouse_id == int(warehouse_id),
            ProductionOrder.status.in_(ACTIVE_SHORTAGE_STATUSES),
        )
        .all()
    )
    product_cache: dict[int, Product] = {}
    for order in orders:
        snaps = list(order.line_snapshots or [])
        if not snaps:
            continue
        order_number = str(getattr(order, "number", None) or f"MO/{order.id}")
        order_status = str(order.status or "")
        fp_name = str(getattr(order, "product_name_snapshot", None) or order_number)
        fp_sku = None
        fp_image = None
        if order.product_id:
            pid_fg = int(order.product_id)
            p = product_cache.get(pid_fg)
            if p is None:
                p = db.query(Product).filter(Product.id == pid_fg).first()
                if p is not None:
                    product_cache[pid_fg] = p
            if p is not None:
                fp_name = str(p.name or fp_name)
                fp_sku = p.sku or p.symbol
                fp_image = p.image_url
        for snap in snaps:
            pid = int(snap.component_product_id)
            req = float(getattr(snap, "total_required_quantity", None) or 0)
            if req <= 1e-9:
                continue
            slot = agg.setdefault(pid, _empty_slot(pid))
            slot["blocked_order_ids"].add(int(order.id))
            slot["required_qty_sum"] = float(slot["required_qty_sum"]) + req
            _append_finished_product(
                slot,
                {
                    "product_id": int(order.product_id) if order.product_id else None,
                    "product_name": fp_name,
                    "product_sku": fp_sku,
                    "product_image_url": fp_image,
                    "order_id": int(order.id),
                    "order_number": order_number,
                    "kind": "order",
                },
            )
            slot["demand_sources"].append(
                {
                    "kind": "order",
                    "id": int(order.id),
                    "number": order_number,
                    "status": order_status,
                    "product_id": int(order.product_id) if order.product_id else None,
                    "product_name": fp_name,
                    "product_sku": fp_sku,
                    "product_image_url": fp_image,
                    "required_qty": round(req, 4),
                }
            )

    if not agg:
        return []

    component_totals = {pid: float(v["required_qty_sum"]) for pid, v in agg.items() if float(v["required_qty_sum"]) > 1e-9}
    if not component_totals:
        return []

    details = analyze_component_requirements(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, component_totals=component_totals
    )
    detail_by_pid = {int(d["component_product_id"]): d for d in details}

    out: list[dict[str, Any]] = []
    for pid, slot in agg.items():
        det = detail_by_pid.get(pid, {})
        required = float(det.get("required_qty") if det.get("required_qty") is not None else slot["required_qty_sum"])
        available = float(det.get("available_qty") or 0.0)
        missing = max(0.0, required - available)
        if missing <= 1e-6:
            continue
        batch_count = len(slot["blocked_batch_ids"])
        order_count = len(slot["blocked_order_ids"])
        priority = "CRITICAL" if batch_count + order_count >= 3 else "HIGH"
        out.append(
            {
                "component_product_id": pid,
                "product_name": str(det.get("product_name") or f"Produkt #{pid}"),
                "product_sku": det.get("product_sku"),
                "product_image_url": det.get("product_image_url"),
                "required_qty": round(required, 4),
                "on_hand_qty": det.get("on_hand_qty"),
                "reserved_qty": det.get("reserved_qty"),
                "available_qty": round(available, 4),
                "missing_qty": round(missing, 4),
                "covered_qty": round(min(required, available), 4),
                "blocked_batches_count": batch_count,
                "blocked_orders_count": order_count,
                "blocked_batch_ids": sorted(slot["blocked_batch_ids"]),
                "blocked_order_ids": sorted(slot["blocked_order_ids"]),
                "finished_products": slot["finished_products"],
                "demand_sources": sorted(
                    slot["demand_sources"],
                    key=lambda s: (-float(s.get("required_qty") or 0), str(s.get("number") or "")),
                ),
                "priority": priority,
                "locations": det.get("locations") or [],
                "expected_availability_date": det.get("expected_availability_date"),
                "substitute_proposals": det.get("substitute_proposals") or [],
            }
        )
    out.sort(key=lambda r: (_priority_rank(str(r["priority"])), -float(r["missing_qty"])))
    return out
