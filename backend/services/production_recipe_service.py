"""Production recipes — CRUD, activation, component calculations."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..models.inventory import Inventory
from ..models.product import Product
from ..models.product_composition import ProductComposition, ProductCompositionLine
from ..models.production import ProductionRecipe, ProductionRecipeLine
from ..schemas.production import (
    ProductionRecipeCreateBody,
    ProductionRecipeLineRead,
    ProductionRecipeLineWrite,
    ProductionRecipeRead,
    ProductionRecipeUpdateBody,
    RecipeCostEstimateRead,
    RecipeLineCostRead,
    RecipeUsageRead,
)
from .product_cost_service import get_product_current_cost


class ProductionRecipeError(Exception):
    def __init__(self, message: str, *, code: str = "recipe_error") -> None:
        self.message = message
        self.code = code
        super().__init__(message)


def _effective_line_qty(line: ProductionRecipeLine | ProductionRecipeLineWrite, *, yield_qty: float) -> float:
    base = float(line.quantity or 0)
    waste = float(getattr(line, "waste_percent", 0) or 0)
    yld = float(yield_qty or 1)
    if yld <= 1e-12:
        yld = 1.0
    return (base * (1.0 + waste / 100.0)) / yld


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


def _validate_no_self_reference(product_id: int, lines: list[ProductionRecipeLineWrite]) -> None:
    for ln in lines:
        if int(ln.component_product_id) == int(product_id):
            raise ProductionRecipeError("Receptura nie może zawierać produktu wynikowego jako składnika.", code="self_reference")


def _validate_no_recursive_reference(
    db: Session,
    *,
    product_id: int,
    lines: list[ProductionRecipeLineWrite],
) -> None:
    component_ids = {int(ln.component_product_id) for ln in lines}
    if not component_ids:
        return
    active_recipes = (
        db.query(ProductionRecipe)
        .filter(ProductionRecipe.is_active.is_(True), ProductionRecipe.product_id.in_(component_ids))
        .all()
    )
    for rec in active_recipes:
        if int(rec.product_id) == int(product_id):
            continue
        for rl in rec.lines or []:
            if int(rl.component_product_id) == int(product_id):
                raise ProductionRecipeError(
                    f"Wykryto cykliczną zależność receptur (produkt #{product_id}).",
                    code="recursive_reference",
                )


def _deactivate_siblings(db: Session, recipe: ProductionRecipe) -> None:
    (
        db.query(ProductionRecipe)
        .filter(
            ProductionRecipe.tenant_id == int(recipe.tenant_id),
            ProductionRecipe.product_id == int(recipe.product_id),
            ProductionRecipe.id != int(recipe.id),
            ProductionRecipe.is_active.is_(True),
        )
        .update({ProductionRecipe.is_active: False}, synchronize_session=False)
    )


def _deactivate_composition_siblings(db: Session, comp: ProductComposition) -> None:
    (
        db.query(ProductComposition)
        .filter(
            ProductComposition.tenant_id == int(comp.tenant_id),
            ProductComposition.product_id == int(comp.product_id),
            ProductComposition.composition_mode == str(comp.composition_mode),
            ProductComposition.id != int(comp.id),
            ProductComposition.is_active.is_(True),
        )
        .update({ProductComposition.is_active: False}, synchronize_session=False)
    )


def _sync_composition_from_recipe(db: Session, recipe: ProductionRecipe) -> None:
    """Keep manufacturing composition in sync with legacy recipe row."""
    comp = (
        db.query(ProductComposition)
        .filter(
            ProductComposition.tenant_id == int(recipe.tenant_id),
            ProductComposition.source_recipe_id == int(recipe.id),
        )
        .first()
    )
    if comp is None:
        comp = ProductComposition(
            tenant_id=int(recipe.tenant_id),
            product_id=int(recipe.product_id),
            composition_mode="manufacturing",
            name=str(recipe.name or ""),
            version=str(recipe.version or "1"),
            yield_quantity=float(recipe.yield_quantity or 1),
            notes=recipe.notes,
            is_active=bool(recipe.is_active),
            source_recipe_id=int(recipe.id),
        )
        db.add(comp)
        db.flush()
    else:
        comp.name = str(recipe.name or "")
        comp.version = str(recipe.version or "1")
        comp.yield_quantity = float(recipe.yield_quantity or 1)
        comp.notes = recipe.notes
        comp.is_active = bool(recipe.is_active)
        comp.updated_at = datetime.utcnow()
    comp.lines.clear()
    for idx, ln in enumerate(sorted(recipe.lines or [], key=lambda x: (x.sort_order, x.id))):
        comp.lines.append(
            ProductCompositionLine(
                component_product_id=int(ln.component_product_id),
                quantity=float(ln.quantity),
                waste_percent=float(ln.waste_percent or 0),
                sort_order=int(ln.sort_order if ln.sort_order else idx),
                notes=ln.notes,
            )
        )
    if comp.is_active:
        _deactivate_composition_siblings(db, comp)
    db.flush()


def _apply_lines(recipe: ProductionRecipe, lines: list[ProductionRecipeLineWrite]) -> None:
    recipe.lines.clear()
    for idx, ln in enumerate(lines):
        recipe.lines.append(
            ProductionRecipeLine(
                component_product_id=int(ln.component_product_id),
                quantity=float(ln.quantity),
                waste_percent=float(ln.waste_percent or 0),
                sort_order=int(ln.sort_order if ln.sort_order else idx),
                notes=(ln.notes or "").strip() or None,
            )
        )


def serialize_recipe(db: Session, recipe: ProductionRecipe, *, include_stock: bool = True) -> ProductionRecipeRead:
    p = db.query(Product).filter(Product.id == int(recipe.product_id)).first()
    lines_out: list[ProductionRecipeLineRead] = []
    pids = [int(ln.component_product_id) for ln in recipe.lines or []]
    stock_map = _stock_by_product(db, int(recipe.tenant_id), pids) if include_stock else {}
    prod_map = {}
    if pids:
        for pr in db.query(Product).filter(Product.id.in_(pids)).all():
            prod_map[int(pr.id)] = pr
    for ln in sorted(recipe.lines or [], key=lambda x: (x.sort_order, x.id)):
        cp = prod_map.get(int(ln.component_product_id))
        lines_out.append(
            ProductionRecipeLineRead(
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
    return ProductionRecipeRead(
        id=int(recipe.id),
        tenant_id=int(recipe.tenant_id),
        product_id=int(recipe.product_id),
        name=str(recipe.name or ""),
        version=str(recipe.version or "1"),
        is_active=bool(recipe.is_active),
        yield_quantity=float(recipe.yield_quantity or 1),
        notes=recipe.notes,
        product_name=(p.name if p else None),
        product_sku=((p.sku or p.symbol) if p else None),
        lines=lines_out,
        created_at=recipe.created_at,
        updated_at=recipe.updated_at,
    )


def create_recipe(db: Session, *, tenant_id: int, body: ProductionRecipeCreateBody) -> ProductionRecipeRead:
    _validate_no_self_reference(int(body.product_id), body.lines)
    _validate_no_recursive_reference(db, product_id=int(body.product_id), lines=body.lines)
    recipe = ProductionRecipe(
        tenant_id=int(tenant_id),
        product_id=int(body.product_id),
        name=body.name.strip(),
        version=(body.version or "1").strip(),
        yield_quantity=float(body.yield_quantity),
        notes=(body.notes or "").strip() or None,
        is_active=bool(body.is_active),
    )
    db.add(recipe)
    db.flush()
    _apply_lines(recipe, body.lines)
    if recipe.is_active:
        _deactivate_siblings(db, recipe)
    db.flush()
    _sync_composition_from_recipe(db, recipe)
    return serialize_recipe(db, recipe)


def update_recipe(
    db: Session,
    *,
    tenant_id: int,
    recipe_id: int,
    body: ProductionRecipeUpdateBody,
) -> ProductionRecipeRead:
    recipe = (
        db.query(ProductionRecipe)
        .options(joinedload(ProductionRecipe.lines))
        .filter(ProductionRecipe.id == int(recipe_id), ProductionRecipe.tenant_id == int(tenant_id))
        .first()
    )
    if recipe is None:
        raise ProductionRecipeError("Receptura nie istnieje.", code="not_found")
    if body.name is not None:
        recipe.name = body.name.strip()
    if body.version is not None:
        recipe.version = body.version.strip()
    if body.yield_quantity is not None:
        recipe.yield_quantity = float(body.yield_quantity)
    if body.notes is not None:
        recipe.notes = body.notes.strip() or None
    if body.lines is not None:
        _validate_no_self_reference(int(recipe.product_id), body.lines)
        _validate_no_recursive_reference(db, product_id=int(recipe.product_id), lines=body.lines)
        _apply_lines(recipe, body.lines)
    if body.is_active is not None:
        recipe.is_active = bool(body.is_active)
        if recipe.is_active:
            _deactivate_siblings(db, recipe)
    recipe.updated_at = datetime.utcnow()
    db.flush()
    _sync_composition_from_recipe(db, recipe)
    return serialize_recipe(db, recipe)


def set_recipe_active(db: Session, *, tenant_id: int, recipe_id: int, active: bool) -> ProductionRecipeRead:
    return update_recipe(
        db,
        tenant_id=tenant_id,
        recipe_id=recipe_id,
        body=ProductionRecipeUpdateBody(is_active=active),
    )


def clone_recipe_version(db: Session, *, tenant_id: int, recipe_id: int, new_version: str) -> ProductionRecipeRead:
    src = (
        db.query(ProductionRecipe)
        .options(joinedload(ProductionRecipe.lines))
        .filter(ProductionRecipe.id == int(recipe_id), ProductionRecipe.tenant_id == int(tenant_id))
        .first()
    )
    if src is None:
        raise ProductionRecipeError("Receptura nie istnieje.", code="not_found")
    lines = [
        ProductionRecipeLineWrite(
            component_product_id=int(ln.component_product_id),
            quantity=float(ln.quantity),
            waste_percent=float(ln.waste_percent or 0),
            sort_order=int(ln.sort_order or 0),
            notes=ln.notes,
        )
        for ln in sorted(src.lines or [], key=lambda x: (x.sort_order, x.id))
    ]
    return create_recipe(
        db,
        tenant_id=tenant_id,
        body=ProductionRecipeCreateBody(
            product_id=int(src.product_id),
            name=str(src.name),
            version=new_version.strip(),
            yield_quantity=float(src.yield_quantity or 1),
            notes=src.notes,
            is_active=False,
            lines=lines,
        ),
    )


def list_recipes_for_product(db: Session, *, tenant_id: int, product_id: int) -> list[ProductionRecipeRead]:
    rows = (
        db.query(ProductionRecipe)
        .options(joinedload(ProductionRecipe.lines))
        .filter(ProductionRecipe.tenant_id == int(tenant_id), ProductionRecipe.product_id == int(product_id))
        .order_by(ProductionRecipe.is_active.desc(), ProductionRecipe.updated_at.desc())
        .all()
    )
    return [serialize_recipe(db, r) for r in rows]


def get_recipe(db: Session, *, tenant_id: int, recipe_id: int) -> ProductionRecipeRead | None:
    recipe = (
        db.query(ProductionRecipe)
        .options(joinedload(ProductionRecipe.lines))
        .filter(ProductionRecipe.id == int(recipe_id), ProductionRecipe.tenant_id == int(tenant_id))
        .first()
    )
    if recipe is None:
        return None
    return serialize_recipe(db, recipe)


def list_recipe_usages_for_component(db: Session, *, tenant_id: int, product_id: int) -> list[RecipeUsageRead]:
    rows = (
        db.query(ProductionRecipeLine, ProductionRecipe)
        .join(ProductionRecipe, ProductionRecipe.id == ProductionRecipeLine.recipe_id)
        .filter(
            ProductionRecipe.tenant_id == int(tenant_id),
            ProductionRecipeLine.component_product_id == int(product_id),
        )
        .all()
    )
    out: list[RecipeUsageRead] = []
    finished_ids = {int(rec.product_id) for _, rec in rows}
    names: dict[int, str] = {}
    if finished_ids:
        for p in db.query(Product).filter(Product.id.in_(finished_ids)).all():
            names[int(p.id)] = str(p.name or "")
    for ln, rec in rows:
        out.append(
            RecipeUsageRead(
                recipe_id=int(rec.id),
                recipe_name=str(rec.name or ""),
                finished_product_id=int(rec.product_id),
                finished_product_name=names.get(int(rec.product_id), f"#{rec.product_id}"),
                quantity=float(ln.quantity),
            )
        )
    return out


def estimate_recipe_cost(db: Session, *, tenant_id: int, recipe_id: int) -> RecipeCostEstimateRead:
    recipe = (
        db.query(ProductionRecipe)
        .options(joinedload(ProductionRecipe.lines))
        .filter(ProductionRecipe.id == int(recipe_id), ProductionRecipe.tenant_id == int(tenant_id))
        .first()
    )
    if recipe is None:
        raise ProductionRecipeError("Receptura nie istnieje.", code="not_found")
    yld = float(recipe.yield_quantity or 1)
    if yld <= 1e-12:
        yld = 1.0
    lines_out: list[RecipeLineCostRead] = []
    total = 0.0
    prod_map: dict[int, Product] = {}
    pids = [int(ln.component_product_id) for ln in recipe.lines or []]
    if pids:
        for p in db.query(Product).filter(Product.id.in_(pids)).all():
            prod_map[int(p.id)] = p
    for ln in sorted(recipe.lines or [], key=lambda x: (x.sort_order, x.id)):
        pid = int(ln.component_product_id)
        per_yield = _effective_line_qty(ln, yield_qty=yld)
        cost_data = get_product_current_cost(db, int(tenant_id), pid)
        unit_net = float(cost_data.get("purchase_net") or 0)
        line_cost = unit_net * per_yield
        total += line_cost
        cp = prod_map.get(pid)
        lines_out.append(
            RecipeLineCostRead(
                component_product_id=pid,
                product_name=str(cp.name if cp else f"Produkt #{pid}"),
                quantity=float(ln.quantity),
                waste_percent=float(ln.waste_percent or 0),
                unit_cost_net=round(unit_net, 4),
                line_cost_net=round(line_cost, 4),
            )
        )
    return RecipeCostEstimateRead(
        recipe_id=int(recipe.id),
        yield_quantity=yld,
        lines=lines_out,
        total_cost_net=round(total, 4),
        unit_cost_net=round(total / yld, 4) if yld > 0 else 0.0,
    )


def calculate_required_components(
    recipe: ProductionRecipe,
    *,
    planned_quantity: float,
) -> list[dict[str, Any]]:
    yld = float(recipe.yield_quantity or 1)
    planned = float(planned_quantity or 0)
    out: list[dict[str, Any]] = []
    for ln in sorted(recipe.lines or [], key=lambda x: (x.sort_order, x.id)):
        per_unit = _effective_line_qty(ln, yield_qty=yld)
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
