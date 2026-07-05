"""Shared product composition engine — bundle + manufacturing modes."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..models.inventory import Inventory
from ..models.product import Product
from ..models.product_composition import COMPOSITION_MODES, ProductComposition, ProductCompositionLine
from ..schemas.composition import (
    AggregatedComponentDemandRead,
    CompositionLineRead,
    CompositionLineWrite,
    CompositionMode,
    CompositionUsageRead,
    ProductCompositionCreateBody,
    ProductCompositionRead,
    ProductCompositionUpdateBody,
)
from .product_cost_service import get_product_current_cost

class CompositionError(Exception):
    def __init__(self, message: str, *, code: str = "composition_error") -> None:
        self.message = message
        self.code = code
        super().__init__(message)


def effective_line_qty(line: ProductCompositionLine | CompositionLineWrite, *, yield_qty: float) -> float:
    base = float(line.quantity or 0)
    waste = float(getattr(line, "waste_percent", 0) or 0)
    yld = float(yield_qty or 1)
    if yld <= 1e-12:
        yld = 1.0
    return (base * (1.0 + waste / 100.0)) / yld


def calculate_required_components(
    composition: ProductComposition,
    *,
    planned_quantity: float,
) -> list[dict[str, Any]]:
    yld = float(composition.yield_quantity or 1)
    planned = float(planned_quantity or 0)
    out: list[dict[str, Any]] = []
    for ln in sorted(composition.lines or [], key=lambda x: (x.sort_order, x.id)):
        per_unit = effective_line_qty(ln, yield_qty=yld)
        total = per_unit * planned
        out.append(
            {
                "component_product_id": int(ln.component_product_id),
                "quantity_per_unit": per_unit,
                "waste_percent": float(ln.waste_percent or 0),
                "total_required": total,
            }
        )
    return out


def aggregate_component_demand(
    demands: list[list[dict[str, Any]]],
) -> dict[int, float]:
    """Sum component requirements across multiple composition calculations."""
    totals: dict[int, float] = {}
    for block in demands:
        for req in block:
            pid = int(req["component_product_id"])
            totals[pid] = totals.get(pid, 0.0) + float(req["total_required"])
    return totals


def _stock_by_product(db: Session, tenant_id: int, product_ids: list[int]) -> dict[int, float]:
    if not product_ids:
        return {}
    rows = (
        db.query(Inventory.product_id, func.sum(Inventory.quantity))
        .filter(Inventory.tenant_id == int(tenant_id), Inventory.product_id.in_(product_ids))
        .group_by(Inventory.product_id)
        .all()
    )
    return {int(pid): float(q or 0) for pid, q in rows}


def _validate_mode(mode: str) -> CompositionMode:
    m = str(mode or "").strip().lower()
    if m not in COMPOSITION_MODES:
        raise CompositionError(f"Nieznany tryb kompozycji: {mode}", code="invalid_mode")
    return m  # type: ignore[return-value]


def _validate_no_self_reference(product_id: int, lines: list[CompositionLineWrite]) -> None:
    for ln in lines:
        if int(ln.component_product_id) == int(product_id):
            raise CompositionError(
                "Kompozycja nie może zawierać produktu wynikowego jako składnika.",
                code="self_reference",
            )


def _validate_no_recursive_reference(
    db: Session,
    *,
    product_id: int,
    mode: str,
    lines: list[CompositionLineWrite],
) -> None:
    component_ids = {int(ln.component_product_id) for ln in lines}
    if not component_ids:
        return
    active = (
        db.query(ProductComposition)
        .filter(
            ProductComposition.is_active.is_(True),
            ProductComposition.composition_mode == str(mode),
            ProductComposition.product_id.in_(component_ids),
        )
        .all()
    )
    for comp in active:
        if int(comp.product_id) == int(product_id):
            continue
        for rl in comp.lines or []:
            if int(rl.component_product_id) == int(product_id):
                raise CompositionError(
                    f"Wykryto cykliczną zależność kompozycji (produkt #{product_id}).",
                    code="recursive_reference",
                )


def _deactivate_siblings(db: Session, composition: ProductComposition) -> None:
    (
        db.query(ProductComposition)
        .filter(
            ProductComposition.tenant_id == int(composition.tenant_id),
            ProductComposition.product_id == int(composition.product_id),
            ProductComposition.composition_mode == str(composition.composition_mode),
            ProductComposition.id != int(composition.id),
            ProductComposition.is_active.is_(True),
        )
        .update({ProductComposition.is_active: False}, synchronize_session=False)
    )


def _apply_lines(composition: ProductComposition, lines: list[CompositionLineWrite]) -> None:
    composition.lines.clear()
    for idx, ln in enumerate(lines):
        composition.lines.append(
            ProductCompositionLine(
                component_product_id=int(ln.component_product_id),
                quantity=float(ln.quantity),
                waste_percent=float(ln.waste_percent or 0),
                sort_order=int(ln.sort_order if ln.sort_order else idx),
                notes=(ln.notes or "").strip() or None,
            )
        )


def serialize_composition(
    db: Session,
    composition: ProductComposition,
    *,
    include_stock: bool = True,
) -> ProductCompositionRead:
    p = db.query(Product).filter(Product.id == int(composition.product_id)).first()
    lines_out: list[CompositionLineRead] = []
    pids = [int(ln.component_product_id) for ln in composition.lines or []]
    stock_map = _stock_by_product(db, int(composition.tenant_id), pids) if include_stock else {}
    prod_map: dict[int, Product] = {}
    if pids:
        for pr in db.query(Product).filter(Product.id.in_(pids)).all():
            prod_map[int(pr.id)] = pr
    for ln in sorted(composition.lines or [], key=lambda x: (x.sort_order, x.id)):
        cp = prod_map.get(int(ln.component_product_id))
        lines_out.append(
            CompositionLineRead(
                id=int(ln.id),
                component_product_id=int(ln.component_product_id),
                quantity=float(ln.quantity),
                waste_percent=float(ln.waste_percent or 0),
                sort_order=int(ln.sort_order or 0),
                notes=ln.notes,
                product_name=(cp.name if cp else None),
                product_sku=((cp.sku or cp.symbol) if cp else None),
                product_stock=stock_map.get(int(ln.component_product_id)),
            )
        )
    return ProductCompositionRead(
        id=int(composition.id),
        tenant_id=int(composition.tenant_id),
        product_id=int(composition.product_id),
        composition_mode=str(composition.composition_mode),  # type: ignore[arg-type]
        name=str(composition.name or ""),
        version=str(composition.version or "1"),
        is_active=bool(composition.is_active),
        yield_quantity=float(composition.yield_quantity or 1),
        notes=composition.notes,
        product_name=(p.name if p else None),
        product_sku=((p.sku or p.symbol) if p else None),
        lines=lines_out,
        created_at=composition.created_at,
        updated_at=composition.updated_at,
    )


def create_composition(db: Session, *, tenant_id: int, body: ProductCompositionCreateBody) -> ProductCompositionRead:
    mode = _validate_mode(body.composition_mode)
    _validate_no_self_reference(int(body.product_id), body.lines)
    _validate_no_recursive_reference(db, product_id=int(body.product_id), mode=mode, lines=body.lines)
    comp = ProductComposition(
        tenant_id=int(tenant_id),
        product_id=int(body.product_id),
        composition_mode=mode,
        name=body.name.strip(),
        version=(body.version or "1").strip(),
        yield_quantity=float(body.yield_quantity),
        notes=(body.notes or "").strip() or None,
        is_active=bool(body.is_active),
    )
    db.add(comp)
    db.flush()
    _apply_lines(comp, body.lines)
    if comp.is_active:
        _deactivate_siblings(db, comp)
    db.flush()
    return serialize_composition(db, comp)


def update_composition(
    db: Session,
    *,
    tenant_id: int,
    composition_id: int,
    body: ProductCompositionUpdateBody,
) -> ProductCompositionRead:
    comp = (
        db.query(ProductComposition)
        .options(joinedload(ProductComposition.lines))
        .filter(ProductComposition.id == int(composition_id), ProductComposition.tenant_id == int(tenant_id))
        .first()
    )
    if comp is None:
        raise CompositionError("Kompozycja nie istnieje.", code="not_found")
    if body.name is not None:
        comp.name = body.name.strip()
    if body.version is not None:
        comp.version = body.version.strip()
    if body.yield_quantity is not None:
        comp.yield_quantity = float(body.yield_quantity)
    if body.notes is not None:
        comp.notes = body.notes.strip() or None
    if body.lines is not None:
        _validate_no_self_reference(int(comp.product_id), body.lines)
        _validate_no_recursive_reference(
            db,
            product_id=int(comp.product_id),
            mode=str(comp.composition_mode),
            lines=body.lines,
        )
        _apply_lines(comp, body.lines)
    if body.is_active is not None:
        comp.is_active = bool(body.is_active)
        if comp.is_active:
            _deactivate_siblings(db, comp)
    comp.updated_at = datetime.utcnow()
    db.flush()
    if comp.is_active and str(comp.composition_mode) == "manufacturing":
        from ..production_shortages.recipe_variant_service import on_composition_activation

        on_composition_activation(db, tenant_id=int(tenant_id), composition=comp)
    return serialize_composition(db, comp)


def set_composition_active(
    db: Session,
    *,
    tenant_id: int,
    composition_id: int,
    active: bool,
) -> ProductCompositionRead:
    return update_composition(
        db,
        tenant_id=tenant_id,
        composition_id=composition_id,
        body=ProductCompositionUpdateBody(is_active=active),
    )


def clone_composition_version(
    db: Session,
    *,
    tenant_id: int,
    composition_id: int,
    new_version: str,
) -> ProductCompositionRead:
    src = (
        db.query(ProductComposition)
        .options(joinedload(ProductComposition.lines))
        .filter(ProductComposition.id == int(composition_id), ProductComposition.tenant_id == int(tenant_id))
        .first()
    )
    if src is None:
        raise CompositionError("Kompozycja nie istnieje.", code="not_found")
    lines = [
        CompositionLineWrite(
            component_product_id=int(ln.component_product_id),
            quantity=float(ln.quantity),
            waste_percent=float(ln.waste_percent or 0),
            sort_order=int(ln.sort_order or 0),
            notes=ln.notes,
        )
        for ln in sorted(src.lines or [], key=lambda x: (x.sort_order, x.id))
    ]
    return create_composition(
        db,
        tenant_id=tenant_id,
        body=ProductCompositionCreateBody(
            product_id=int(src.product_id),
            composition_mode=str(src.composition_mode),  # type: ignore[arg-type]
            name=str(src.name),
            version=new_version.strip(),
            yield_quantity=float(src.yield_quantity or 1),
            notes=src.notes,
            is_active=False,
            lines=lines,
        ),
    )


def list_compositions_for_product(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
    mode: str | None = None,
) -> list[ProductCompositionRead]:
    q = (
        db.query(ProductComposition)
        .options(joinedload(ProductComposition.lines))
        .filter(ProductComposition.tenant_id == int(tenant_id), ProductComposition.product_id == int(product_id))
    )
    if mode:
        q = q.filter(ProductComposition.composition_mode == _validate_mode(mode))
    rows = q.order_by(ProductComposition.is_active.desc(), ProductComposition.updated_at.desc()).all()
    return [serialize_composition(db, r) for r in rows]


def get_composition(db: Session, *, tenant_id: int, composition_id: int) -> ProductCompositionRead | None:
    comp = (
        db.query(ProductComposition)
        .options(joinedload(ProductComposition.lines))
        .filter(ProductComposition.id == int(composition_id), ProductComposition.tenant_id == int(tenant_id))
        .first()
    )
    if comp is None:
        return None
    return serialize_composition(db, comp)


def resolve_composition_entity(
    db: Session,
    *,
    tenant_id: int,
    composition_id: int | None = None,
    recipe_id: int | None = None,
) -> ProductComposition | None:
    if composition_id is not None:
        return (
            db.query(ProductComposition)
            .options(joinedload(ProductComposition.lines))
            .filter(ProductComposition.id == int(composition_id), ProductComposition.tenant_id == int(tenant_id))
            .first()
        )
    if recipe_id is not None:
        return (
            db.query(ProductComposition)
            .options(joinedload(ProductComposition.lines))
            .filter(
                ProductComposition.tenant_id == int(tenant_id),
                ProductComposition.source_recipe_id == int(recipe_id),
            )
            .first()
        )
    return None


def list_usages_for_component(db: Session, *, tenant_id: int, product_id: int) -> list[CompositionUsageRead]:
    rows = (
        db.query(ProductCompositionLine, ProductComposition)
        .join(ProductComposition, ProductComposition.id == ProductCompositionLine.composition_id)
        .filter(
            ProductComposition.tenant_id == int(tenant_id),
            ProductCompositionLine.component_product_id == int(product_id),
        )
        .all()
    )
    parent_ids = {int(comp.product_id) for _, comp in rows}
    names: dict[int, str] = {}
    if parent_ids:
        for p in db.query(Product).filter(Product.id.in_(parent_ids)).all():
            names[int(p.id)] = str(p.name or "")
    out: list[CompositionUsageRead] = []
    for ln, comp in rows:
        out.append(
            CompositionUsageRead(
                composition_id=int(comp.id),
                composition_name=str(comp.name or ""),
                composition_mode=str(comp.composition_mode),  # type: ignore[arg-type]
                parent_product_id=int(comp.product_id),
                parent_product_name=names.get(int(comp.product_id), f"#{comp.product_id}"),
                quantity=float(ln.quantity),
            )
        )
    return out


def estimate_composition_cost(db: Session, *, tenant_id: int, composition_id: int) -> dict:
    comp = (
        db.query(ProductComposition)
        .options(joinedload(ProductComposition.lines))
        .filter(ProductComposition.id == int(composition_id), ProductComposition.tenant_id == int(tenant_id))
        .first()
    )
    if comp is None:
        raise CompositionError("Kompozycja nie istnieje.", code="not_found")
    yld = float(comp.yield_quantity or 1) or 1.0
    lines_out = []
    total = 0.0
    prod_map = {p.id: p for p in db.query(Product).filter(Product.id.in_([int(l.component_product_id) for l in comp.lines or []])).all()}
    for ln in sorted(comp.lines or [], key=lambda x: (x.sort_order, x.id)):
        pid = int(ln.component_product_id)
        per_yield = effective_line_qty(ln, yield_qty=yld)
        unit_net = float(get_product_current_cost(db, int(tenant_id), pid).get("purchase_net") or 0)
        line_cost = unit_net * per_yield
        total += line_cost
        cp = prod_map.get(pid)
        lines_out.append(
            {
                "component_product_id": pid,
                "product_name": str(cp.name if cp else f"Produkt #{pid}"),
                "quantity": float(ln.quantity),
                "waste_percent": float(ln.waste_percent or 0),
                "unit_cost_net": round(unit_net, 4),
                "line_cost_net": round(line_cost, 4),
            }
        )
    return {
        "composition_id": int(comp.id),
        "yield_quantity": yld,
        "lines": lines_out,
        "total_cost_net": round(total, 4),
        "unit_cost_net": round(total / yld, 4),
    }


def aggregated_demand_with_availability(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    component_totals: dict[int, float],
    exclude_batch_id: int | None = None,
    exclude_order_id: int | None = None,
) -> list[AggregatedComponentDemandRead]:
    if not component_totals:
        return []
    from ..reservations.availability_service import warehouse_net_available

    pids = list(component_totals.keys())
    names = {p.id: p for p in db.query(Product).filter(Product.id.in_(pids)).all()}
    avail_map: dict[int, float] = {}
    for pid in pids:
        avail_map[int(pid)] = warehouse_net_available(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            product_id=int(pid),
            exclude_batch_id=exclude_batch_id,
            exclude_order_id=exclude_order_id,
        )
    out: list[AggregatedComponentDemandRead] = []
    for pid, req in sorted(component_totals.items(), key=lambda x: x[0]):
        p = names.get(int(pid))
        avail = avail_map.get(int(pid), 0.0)
        out.append(
            AggregatedComponentDemandRead(
                component_product_id=int(pid),
                product_name=str(p.name if p else f"Produkt #{pid}"),
                product_sku=((p.sku or p.symbol) if p else None),
                required=round(float(req), 4),
                available=round(avail, 4),
                missing=round(max(0.0, float(req) - avail), 4),
            )
        )
    return out
