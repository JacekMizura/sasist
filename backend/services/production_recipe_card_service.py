"""Recipe card browser — warehouse-first production recipe views."""

from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..models.inventory import Inventory
from ..models.product import Product
from ..models.product_composition import ProductComposition, ProductionBatch
from datetime import datetime

from ..schemas.production_recipe_card import (
    ProductionBatchSummaryRead,
    ProductionDashboardRead,
    RecipeCardRead,
    RecipeComponentDetailRead,
    RecipeDetailRead,
)
from .composition_engine_service import effective_line_qty, estimate_composition_cost
from .product_cost_service import get_product_current_cost
from .location_priority_service import suggest_picking_locations
from .location_stock_service import build_location_stock
from .production_batch_service import build_batch_pick_plan, serialize_batch


def _warehouse_stock(db: Session, *, tenant_id: int, warehouse_id: int, product_id: int) -> float:
    row = (
        db.query(func.coalesce(func.sum(Inventory.quantity), 0.0))
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
            Inventory.quantity > 0,
        )
        .scalar()
    )
    return float(row or 0)


def _max_producible(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    composition: ProductComposition,
) -> float:
    yld = float(composition.yield_quantity or 1) or 1.0
    limits: list[float] = []
    for ln in composition.lines or []:
        per = effective_line_qty(ln, yield_qty=yld)
        if per <= 1e-9:
            continue
        avail = _warehouse_stock(db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=int(ln.component_product_id))
        limits.append(avail / per)
    if not limits:
        return 0.0
    return float(int(min(limits)))


def list_recipe_cards(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None = None,
) -> list[RecipeCardRead]:
    rows = (
        db.query(ProductComposition)
        .options(joinedload(ProductComposition.lines))
        .filter(
            ProductComposition.tenant_id == int(tenant_id),
            ProductComposition.composition_mode == "manufacturing",
        )
        .order_by(ProductComposition.is_active.desc(), ProductComposition.updated_at.desc())
        .all()
    )
    product_ids = {int(r.product_id) for r in rows}
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(product_ids)).all()} if product_ids else {}
    out: list[RecipeCardRead] = []
    wh_id = int(warehouse_id) if warehouse_id else None
    for comp in rows:
        p = products.get(int(comp.product_id))
        cost = estimate_composition_cost(db, tenant_id=tenant_id, composition_id=int(comp.id))
        max_prod = _max_producible(db, tenant_id=tenant_id, warehouse_id=wh_id, composition=comp) if wh_id else 0.0
        stock = _warehouse_stock(db, tenant_id=tenant_id, warehouse_id=wh_id, product_id=int(comp.product_id)) if wh_id else 0.0
        has_low = max_prod < 1.0 and bool(comp.lines)
        badge = "ACTIVE" if comp.is_active else "DRAFT"
        if has_low and comp.is_active:
            badge = "LOW_STOCK"
        out.append(
            RecipeCardRead(
                composition_id=int(comp.id),
                product_id=int(comp.product_id),
                product_name=str(p.name if p else f"Produkt #{comp.product_id}"),
                product_sku=((p.sku or p.symbol) if p else None),
                product_image_url=(p.image_url if p else None),
                recipe_name=str(comp.name or ""),
                version=str(comp.version or "1"),
                is_active=bool(comp.is_active),
                component_count=len(comp.lines or []),
                unit_cost_net=float(cost.get("unit_cost_net") or 0) or None,
                current_stock=stock,
                max_producible=max_prod,
                has_low_stock=has_low,
                status_badge=badge,
            )
        )
    return out


def get_recipe_detail(
    db: Session,
    *,
    tenant_id: int,
    composition_id: int,
    warehouse_id: int | None = None,
) -> RecipeDetailRead | None:
    comp = (
        db.query(ProductComposition)
        .options(joinedload(ProductComposition.lines))
        .filter(
            ProductComposition.id == int(composition_id),
            ProductComposition.tenant_id == int(tenant_id),
            ProductComposition.composition_mode == "manufacturing",
        )
        .first()
    )
    if comp is None:
        return None
    p = db.query(Product).filter(Product.id == int(comp.product_id)).first()
    wh_id = int(warehouse_id) if warehouse_id else None
    cost = estimate_composition_cost(db, tenant_id=tenant_id, composition_id=int(comp.id))
    yld = float(comp.yield_quantity or 1) or 1.0
    components: list[RecipeComponentDetailRead] = []
    shortage_labels: list[str] = []
    comp_ids = [int(ln.component_product_id) for ln in comp.lines or []]
    comp_products = {cp.id: cp for cp in db.query(Product).filter(Product.id.in_(comp_ids)).all()} if comp_ids else {}
    for ln in sorted(comp.lines or [], key=lambda x: (x.sort_order, x.id)):
        pid = int(ln.component_product_id)
        cp = comp_products.get(pid)
        per = effective_line_qty(ln, yield_qty=yld)
        avail = _warehouse_stock(db, tenant_id=tenant_id, warehouse_id=wh_id, product_id=pid) if wh_id else 0.0
        shortage = max(0.0, per - avail) if wh_id else 0.0
        unit_net = float(get_product_current_cost(db, int(tenant_id), pid).get("purchase_net") or 0)
        loc_names: list[str] = []
        if wh_id and avail > 0:
            snap = build_location_stock(db, tenant_id=int(tenant_id), warehouse_id=wh_id, product_id=pid, available_only=True)
            loc_rows = list(snap.get("locations") or [])
            suggested = suggest_picking_locations(loc_rows, quantity=per)
            loc_names = [str(s.get("code") or "") for s in suggested[:3] if s.get("code")]
        if shortage > 1e-6:
            shortage_labels.append(f"{cp.name if cp else pid}: brakuje {shortage:.2f}")
        components.append(
            RecipeComponentDetailRead(
                component_product_id=pid,
                product_name=str(cp.name if cp else f"Produkt #{pid}"),
                product_sku=((cp.sku or cp.symbol) if cp else None),
                product_image_url=(cp.image_url if cp else None),
                required_per_unit=round(per, 4),
                available=round(avail, 4),
                shortage=round(shortage, 4),
                unit_cost_net=round(unit_net, 4),
                line_cost_net=round(unit_net * per, 4),
                suggested_locations=loc_names,
            )
        )
    stock = _warehouse_stock(db, tenant_id=tenant_id, warehouse_id=wh_id, product_id=int(comp.product_id)) if wh_id else 0.0
    max_prod = _max_producible(db, tenant_id=tenant_id, warehouse_id=wh_id, composition=comp) if wh_id else 0.0
    sell = float(getattr(p, "price", None) or getattr(p, "sale_price", None) or 0) if p else 0.0
    unit_cost = float(cost.get("unit_cost_net") or 0)
    margin = round(sell - unit_cost, 4) if sell > 0 and unit_cost > 0 else None
    return RecipeDetailRead(
        composition_id=int(comp.id),
        product_id=int(comp.product_id),
        product_name=str(p.name if p else f"Produkt #{comp.product_id}"),
        product_sku=((p.sku or p.symbol) if p else None),
        product_image_url=(p.image_url if p else None),
        recipe_name=str(comp.name or ""),
        version=str(comp.version or "1"),
        is_active=bool(comp.is_active),
        yield_quantity=yld,
        current_stock=stock,
        unit_cost_net=unit_cost or None,
        margin_hint=margin,
        max_producible=max_prod,
        components=components,
        total_cost_net=float(cost.get("total_cost_net") or 0) or None,
        has_shortages=bool(shortage_labels),
        shortage_summary=shortage_labels,
    )


def _batch_summary(db: Session, batch: ProductionBatch) -> ProductionBatchSummaryRead:
    full = serialize_batch(db, batch)
    labels: list[str] = []
    for ln in batch.lines or []:
        name = None
        for fl in full.lines:
            if int(fl.id) == int(ln.id):
                name = fl.product_name
                break
        labels.append(f"{name or ln.product_id} ×{float(ln.planned_quantity or 0):g}")
    created = batch.created_at.isoformat() if batch.created_at else None
    return ProductionBatchSummaryRead(
        id=int(batch.id),
        number=str(batch.number or ""),
        status=str(batch.status or ""),
        products_count=int(full.products_count or 0),
        total_planned_units=float(full.total_planned_units or 0),
        progress_percent=float(full.progress_percent or 0),
        has_shortages=bool(full.has_shortages),
        operator_name=full.operator_name,
        created_at=created,
        product_labels=labels[:4],
    )


def get_production_dashboard(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None = None,
) -> ProductionDashboardRead:
    from sqlalchemy.orm import joinedload
    from ..models.product_composition import ProductionBatchLine

    q = (
        db.query(ProductionBatch)
        .options(joinedload(ProductionBatch.lines).joinedload(ProductionBatchLine.composition))
        .filter(ProductionBatch.tenant_id == int(tenant_id))
    )
    if warehouse_id:
        q = q.filter(ProductionBatch.warehouse_id == int(warehouse_id))
    batches = q.order_by(ProductionBatch.updated_at.desc()).all()
    today = datetime.utcnow().date()
    active_rows: list[ProductionBatchSummaryRead] = []
    waiting_rows: list[ProductionBatchSummaryRead] = []
    ready_rows: list[ProductionBatchSummaryRead] = []
    completed_rows: list[ProductionBatchSummaryRead] = []
    shortage_count = 0
    waiting_count = 0
    finished_today = 0

    for b in batches:
        status = str(b.status or "")
        if status in ("completed", "cancelled"):
            if status == "completed" and b.completed_at and b.completed_at.date() == today:
                finished_today += 1
                completed_rows.append(_batch_summary(db, b))
            continue
        summary = _batch_summary(db, b)
        if summary.has_shortages:
            shortage_count += 1
        if status in ("collecting", "in_progress", "putaway"):
            active_rows.append(summary)
        elif status in ("draft", "planned"):
            waiting_count += 1
            if summary.has_shortages:
                waiting_rows.append(summary)
            else:
                ready_rows.append(summary)

    recipe_count = (
        db.query(ProductComposition)
        .filter(
            ProductComposition.tenant_id == int(tenant_id),
            ProductComposition.composition_mode == "manufacturing",
        )
        .count()
    )
    return ProductionDashboardRead(
        active_batches=len(active_rows),
        waiting_batches=waiting_count,
        batches_with_shortages=shortage_count,
        finished_today=finished_today,
        collecting_batches=sum(1 for b in batches if str(b.status) == "collecting"),
        in_production_batches=sum(1 for b in batches if str(b.status) == "in_progress"),
        putaway_batches=sum(1 for b in batches if str(b.status) == "putaway"),
        recipe_count=int(recipe_count),
        active=active_rows[:12],
        waiting_materials=waiting_rows[:12],
        ready_to_produce=ready_rows[:12],
        recently_completed=completed_rows[:8],
    )
