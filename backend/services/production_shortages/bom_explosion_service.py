"""Multi-level BOM explosion — architecture for nested compositions (§10)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session, joinedload

from ...models.product import Product
from ...models.product_composition import ProductComposition
from ..composition_engine_service import effective_line_qty, list_compositions_for_product


@dataclass
class BomExplosionNode:
    product_id: int
    product_name: str
    product_sku: str | None
    level: int
    quantity_per_root: float
    composition_id: int | None = None
    is_manufactured: bool = False
    children: list["BomExplosionNode"] = field(default_factory=list)
    shortage_impact: dict[str, Any] | None = None


def _active_manufacturing_composition(
    db: Session, *, tenant_id: int, product_id: int
) -> ProductComposition | None:
    rows = list_compositions_for_product(
        db, tenant_id=int(tenant_id), product_id=int(product_id), composition_mode="manufacturing", active_only=True
    )
    return rows[0] if rows else None


def explode_composition_bom(
    db: Session,
    *,
    tenant_id: int,
    composition: ProductComposition,
    planned_quantity: float = 1.0,
    max_depth: int = 8,
    _visited: set[int] | None = None,
    _level: int = 0,
) -> BomExplosionNode:
    """Recursive BOM tree — sub-assemblies with active manufacturing recipes are expanded."""
    _visited = _visited or set()
    root_pid = int(composition.product_id)
    product = db.query(Product).filter(Product.id == root_pid).first()
    root_name = str(getattr(product, "name", None) or f"Produkt #{root_pid}")
    root_sku = getattr(product, "sku", None) or getattr(product, "symbol", None)

    root = BomExplosionNode(
        product_id=root_pid,
        product_name=root_name,
        product_sku=root_sku,
        level=_level,
        quantity_per_root=float(planned_quantity),
        composition_id=int(composition.id),
        is_manufactured=True,
    )

    if int(composition.id) in _visited or _level >= max_depth:
        return root
    _visited.add(int(composition.id))

    yld = float(composition.yield_quantity or 1) or 1.0
    comp = (
        db.query(ProductComposition)
        .options(joinedload(ProductComposition.lines))
        .filter(ProductComposition.id == int(composition.id))
        .first()
    )
    if comp is None:
        return root

    for ln in comp.lines or []:
        per = effective_line_qty(ln, yield_qty=yld)
        if per <= 1e-9:
            continue
        child_pid = int(ln.component_product_id)
        qty = per * float(planned_quantity)
        child_product = db.query(Product).filter(Product.id == child_pid).first()
        child_name = str(getattr(child_product, "name", None) or f"Produkt #{child_pid}")
        child_sku = getattr(child_product, "sku", None) or getattr(child_product, "symbol", None)

        sub_comp = _active_manufacturing_composition(db, tenant_id=tenant_id, product_id=child_pid)
        if sub_comp is not None and int(sub_comp.id) not in _visited:
            child_node = explode_composition_bom(
                db,
                tenant_id=tenant_id,
                composition=sub_comp,
                planned_quantity=qty,
                max_depth=max_depth,
                _visited=_visited,
                _level=_level + 1,
            )
            root.children.append(child_node)
        else:
            root.children.append(
                BomExplosionNode(
                    product_id=child_pid,
                    product_name=child_name,
                    product_sku=child_sku,
                    level=_level + 1,
                    quantity_per_root=round(qty, 6),
                    composition_id=int(sub_comp.id) if sub_comp else None,
                    is_manufactured=sub_comp is not None,
                )
            )
    return root


def flatten_bom_demand(node: BomExplosionNode) -> dict[int, float]:
    """Roll up leaf + manufactured node demands to raw material totals."""
    totals: dict[int, float] = {}

    def walk(n: BomExplosionNode) -> None:
        if n.children:
            for ch in n.children:
                walk(ch)
        else:
            totals[n.product_id] = totals.get(n.product_id, 0.0) + float(n.quantity_per_root)

    walk(node)
    return totals


def bom_node_to_dict(node: BomExplosionNode) -> dict[str, Any]:
    return {
        "product_id": node.product_id,
        "product_name": node.product_name,
        "product_sku": node.product_sku,
        "level": node.level,
        "quantity_per_root": node.quantity_per_root,
        "composition_id": node.composition_id,
        "is_manufactured": node.is_manufactured,
        "shortage_impact": node.shortage_impact,
        "children": [bom_node_to_dict(c) for c in node.children],
    }


def attach_shortage_impact_to_tree(
    node: BomExplosionNode,
    *,
    component_analysis: dict[int, dict[str, Any]],
) -> None:
    """Annotate nodes with shortage data from flat component analysis."""
    det = component_analysis.get(node.product_id)
    if det:
        missing = float(det.get("missing_qty") or 0)
        avail = float(det.get("available_qty") or 0)
        req = float(det.get("required_qty") or node.quantity_per_root)
        if missing <= 1e-6:
            status = "OK"
        elif avail <= 1e-6:
            status = "BLOCKED"
        else:
            status = "PARTIAL"
        node.shortage_impact = {
            "material_status": status,
            "required_qty": round(req, 4),
            "on_hand_qty": det.get("on_hand_qty"),
            "reserved_qty": det.get("reserved_qty"),
            "available_qty": det.get("available_qty"),
            "missing_qty": det.get("missing_qty"),
            "locations": det.get("locations") or [],
            "substitute_proposals": det.get("substitute_proposals") or [],
            "expected_availability_date": det.get("expected_availability_date"),
            **{k: det[k] for k in ("product_image_url", "product_sku", "product_name") if k in det},
        }
    if not node.children:
        return
    for ch in node.children:
        attach_shortage_impact_to_tree(ch, component_analysis=component_analysis)


def build_enriched_bom_tree(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    composition: ProductComposition,
    planned_quantity: float = 1.0,
) -> dict[str, Any]:
    """Exploded BOM with per-node availability for visualization."""
    from ...models.product import Product
    from .analysis_service import analyze_component_requirements

    tree = explode_composition_bom(
        db, tenant_id=tenant_id, composition=composition, planned_quantity=float(planned_quantity)
    )
    flat = flatten_bom_demand(tree)
    if flat:
        components = analyze_component_requirements(
            db, tenant_id=tenant_id, warehouse_id=warehouse_id, component_totals=flat
        )
        analysis_map = {int(c["component_product_id"]): c for c in components}
    else:
        analysis_map = {}

    pids = _collect_node_product_ids(tree)
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(pids)).all()} if pids else {}

    def enrich_node(n: BomExplosionNode) -> None:
        p = products.get(n.product_id)
        if p:
            n.product_sku = getattr(p, "sku", None) or getattr(p, "symbol", None)
            if not hasattr(n, "product_image_url"):
                pass
        attach_shortage_impact_to_tree(n, component_analysis=analysis_map)
        for ch in n.children:
            enrich_node(ch)

    enrich_node(tree)

    def to_dict(n: BomExplosionNode) -> dict[str, Any]:
        p = products.get(n.product_id)
        unit = getattr(p, "unit", None) or "szt."
        impact = n.shortage_impact or {}
        return {
            "product_id": n.product_id,
            "product_name": n.product_name,
            "product_sku": n.product_sku,
            "product_image_url": getattr(p, "image_url", None) if p else None,
            "unit": unit,
            "level": n.level,
            "quantity_per_root": n.quantity_per_root,
            "composition_id": n.composition_id,
            "is_manufactured": n.is_manufactured,
            "material_status": impact.get("material_status", "OK"),
            "required_qty": impact.get("required_qty", n.quantity_per_root),
            "on_hand_qty": impact.get("on_hand_qty"),
            "reserved_qty": impact.get("reserved_qty"),
            "available_qty": impact.get("available_qty"),
            "missing_qty": impact.get("missing_qty"),
            "locations": impact.get("locations") or [],
            "substitute_proposals": impact.get("substitute_proposals") or [],
            "expected_availability_date": impact.get("expected_availability_date"),
            "children": [to_dict(c) for c in n.children],
        }

    return {
        "composition_id": int(composition.id),
        "product_id": int(composition.product_id),
        "planned_quantity": float(planned_quantity),
        "tree": to_dict(tree),
    }


def _collect_node_product_ids(node: BomExplosionNode) -> list[int]:
    ids = [node.product_id]
    for ch in node.children:
        ids.extend(_collect_node_product_ids(ch))
    return list(set(ids))
