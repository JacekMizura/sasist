"""Product category tree and assignment services (SSOT)."""

from __future__ import annotations

from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...models.product import Product
from ...models.product_category import ProductCategory, ProductCategoryLink
from .errors import (
    CategoryCycleError,
    CategoryHasChildrenError,
    CategoryInUseError,
    CategoryNotFoundError,
    CategoryValidationError,
)


def _strip(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    t = str(s).strip()
    return t or None


def get_category(db: Session, tenant_id: int, category_id: int) -> ProductCategory:
    row = (
        db.query(ProductCategory)
        .filter(ProductCategory.tenant_id == tenant_id, ProductCategory.id == category_id)
        .first()
    )
    if row is None:
        raise CategoryNotFoundError(category_id)
    return row


def list_categories_flat(db: Session, tenant_id: int, *, include_inactive: bool = True) -> List[ProductCategory]:
    q = db.query(ProductCategory).filter(ProductCategory.tenant_id == tenant_id)
    if not include_inactive:
        q = q.filter(ProductCategory.is_active.is_(True))
    return q.order_by(ProductCategory.sort_order.asc(), ProductCategory.name.asc(), ProductCategory.id.asc()).all()


def _would_create_cycle(db: Session, tenant_id: int, category_id: int, new_parent_id: Optional[int]) -> bool:
    if new_parent_id is None:
        return False
    if new_parent_id == category_id:
        return True
    # Walk up from new_parent; if we hit category_id, cycle.
    seen: Set[int] = set()
    cur: Optional[int] = new_parent_id
    while cur is not None:
        if cur == category_id:
            return True
        if cur in seen:
            return True
        seen.add(cur)
        parent = (
            db.query(ProductCategory.parent_id)
            .filter(ProductCategory.tenant_id == tenant_id, ProductCategory.id == cur)
            .scalar()
        )
        cur = int(parent) if parent is not None else None
    return False


def _next_sort_order(db: Session, tenant_id: int, parent_id: Optional[int]) -> int:
    q = db.query(func.coalesce(func.max(ProductCategory.sort_order), -1)).filter(
        ProductCategory.tenant_id == tenant_id
    )
    if parent_id is None:
        q = q.filter(ProductCategory.parent_id.is_(None))
    else:
        q = q.filter(ProductCategory.parent_id == parent_id)
    return int(q.scalar() or -1) + 1


def _norm_code(s: Optional[str]) -> Optional[str]:
    t = _strip(s)
    return t.upper() if t else None


def create_category(
    db: Session,
    tenant_id: int,
    *,
    name: str,
    parent_id: Optional[int] = None,
    description: Optional[str] = None,
    is_active: bool = True,
    sort_order: Optional[int] = None,
    sku_code: Optional[str] = None,
    catalog_code: Optional[str] = None,
    sku_template: Optional[str] = None,
    catalog_template: Optional[str] = None,
) -> ProductCategory:
    clean_name = _strip(name)
    if not clean_name:
        raise CategoryValidationError("Nazwa kategorii jest wymagana.")
    if parent_id is not None:
        get_category(db, tenant_id, parent_id)
    order = sort_order if sort_order is not None else _next_sort_order(db, tenant_id, parent_id)
    row = ProductCategory(
        tenant_id=tenant_id,
        parent_id=parent_id,
        name=clean_name,
        description=_strip(description),
        is_active=bool(is_active),
        sort_order=int(order),
        sku_code=_norm_code(sku_code),
        catalog_code=_norm_code(catalog_code),
        sku_template=_strip(sku_template),
        catalog_template=_strip(catalog_template),
    )
    db.add(row)
    db.flush()
    return row


def update_category(
    db: Session,
    tenant_id: int,
    category_id: int,
    *,
    name: Optional[str] = None,
    parent_id: Optional[int] = None,
    clear_parent: bool = False,
    description: Optional[str] = None,
    description_set: bool = False,
    is_active: Optional[bool] = None,
    sort_order: Optional[int] = None,
    parent_set: bool = False,
    sku_code: Optional[str] = None,
    sku_code_set: bool = False,
    catalog_code: Optional[str] = None,
    catalog_code_set: bool = False,
    sku_template: Optional[str] = None,
    sku_template_set: bool = False,
    catalog_template: Optional[str] = None,
    catalog_template_set: bool = False,
) -> ProductCategory:
    row = get_category(db, tenant_id, category_id)
    if name is not None:
        clean = _strip(name)
        if not clean:
            raise CategoryValidationError("Nazwa kategorii jest wymagana.")
        row.name = clean
    if description_set:
        row.description = _strip(description)
    if is_active is not None:
        row.is_active = bool(is_active)
    if sort_order is not None:
        row.sort_order = int(sort_order)
    if sku_code_set:
        row.sku_code = _norm_code(sku_code)
    if catalog_code_set:
        row.catalog_code = _norm_code(catalog_code)
    if sku_template_set:
        row.sku_template = _strip(sku_template)
    if catalog_template_set:
        row.catalog_template = _strip(catalog_template)

    if clear_parent:
        row.parent_id = None
    elif parent_set:
        if parent_id is not None:
            get_category(db, tenant_id, parent_id)
            if _would_create_cycle(db, tenant_id, category_id, parent_id):
                raise CategoryCycleError()
        row.parent_id = parent_id

    db.flush()
    return row


def move_category(
    db: Session,
    tenant_id: int,
    category_id: int,
    *,
    parent_id: Optional[int],
    sort_order: int,
    clear_parent: bool = False,
) -> ProductCategory:
    """Reorder / reparent — API surface for future drag-and-drop."""
    return update_category(
        db,
        tenant_id,
        category_id,
        parent_id=None if clear_parent else parent_id,
        clear_parent=clear_parent,
        parent_set=not clear_parent,
        sort_order=sort_order,
    )


def delete_category(db: Session, tenant_id: int, category_id: int) -> None:
    row = get_category(db, tenant_id, category_id)
    child_n = (
        db.query(func.count(ProductCategory.id))
        .filter(ProductCategory.tenant_id == tenant_id, ProductCategory.parent_id == category_id)
        .scalar()
    )
    if int(child_n or 0) > 0:
        raise CategoryHasChildrenError()

    primary_n = (
        db.query(func.count(Product.id))
        .filter(
            Product.tenant_id == tenant_id,
            Product.primary_category_id == category_id,
            Product.deleted_at.is_(None),
        )
        .scalar()
    )
    link_n = (
        db.query(func.count(ProductCategoryLink.id))
        .filter(ProductCategoryLink.tenant_id == tenant_id, ProductCategoryLink.category_id == category_id)
        .scalar()
    )
    if int(primary_n or 0) > 0 or int(link_n or 0) > 0:
        raise CategoryInUseError()

    db.delete(row)
    db.flush()


def product_counts_by_category(db: Session, tenant_id: int, category_ids: Sequence[int]) -> Dict[int, int]:
    """Distinct products assigned as primary or additional to each category."""
    if not category_ids:
        return {}
    ids = [int(x) for x in category_ids]
    counts: Dict[int, int] = {i: 0 for i in ids}

    primary_rows = (
        db.query(Product.primary_category_id, func.count(Product.id))
        .filter(
            Product.tenant_id == tenant_id,
            Product.deleted_at.is_(None),
            Product.primary_category_id.in_(ids),
        )
        .group_by(Product.primary_category_id)
        .all()
    )
    for cid, n in primary_rows:
        if cid is not None:
            counts[int(cid)] = counts.get(int(cid), 0) + int(n or 0)

    # Additional links — count products not already counted as primary for same category
    link_rows = (
        db.query(ProductCategoryLink.category_id, ProductCategoryLink.product_id)
        .join(Product, Product.id == ProductCategoryLink.product_id)
        .filter(
            ProductCategoryLink.tenant_id == tenant_id,
            ProductCategoryLink.category_id.in_(ids),
            Product.deleted_at.is_(None),
        )
        .all()
    )
    primary_pairs = set(
        (int(pid), int(cid))
        for pid, cid in (
            db.query(Product.id, Product.primary_category_id)
            .filter(
                Product.tenant_id == tenant_id,
                Product.deleted_at.is_(None),
                Product.primary_category_id.in_(ids),
            )
            .all()
            if ids
            else []
        )
        if cid is not None
    )
    extra: Dict[int, Set[int]] = {i: set() for i in ids}
    for cid, pid in link_rows:
        c, p = int(cid), int(pid)
        if (p, c) in primary_pairs:
            continue
        extra.setdefault(c, set()).add(p)
    for c, s in extra.items():
        counts[c] = counts.get(c, 0) + len(s)
    return counts


def build_path_maps(
    rows: Sequence[ProductCategory],
) -> Tuple[Dict[int, List[int]], Dict[int, List[str]]]:
    by_id = {int(r.id): r for r in rows}
    path_ids: Dict[int, List[int]] = {}
    path_names: Dict[int, List[str]] = {}

    def resolve(cid: int) -> Tuple[List[int], List[str]]:
        if cid in path_ids:
            return path_ids[cid], path_names[cid]
        row = by_id.get(cid)
        if row is None:
            return [], []
        if row.parent_id is None:
            ids, names = [cid], [row.name]
        else:
            pids, pnames = resolve(int(row.parent_id))
            ids, names = [*pids, cid], [*pnames, row.name]
        path_ids[cid] = ids
        path_names[cid] = names
        return ids, names

    for r in rows:
        resolve(int(r.id))
    return path_ids, path_names


def build_tree_nodes(
    db: Session,
    tenant_id: int,
    *,
    include_inactive: bool = True,
) -> List[dict]:
    rows = list_categories_flat(db, tenant_id, include_inactive=include_inactive)
    counts = product_counts_by_category(db, tenant_id, [int(r.id) for r in rows])
    path_ids, path_names = build_path_maps(rows)

    children_map: Dict[Optional[int], List[ProductCategory]] = {}
    for r in rows:
        children_map.setdefault(r.parent_id if r.parent_id is None else int(r.parent_id), []).append(r)

    def to_node(r: ProductCategory) -> dict:
        cid = int(r.id)
        kids = children_map.get(cid, [])
        return {
            "id": cid,
            "parent_id": int(r.parent_id) if r.parent_id is not None else None,
            "name": r.name,
            "description": r.description,
            "is_active": bool(r.is_active),
            "sort_order": int(r.sort_order or 0),
            "sku_code": getattr(r, "sku_code", None),
            "catalog_code": getattr(r, "catalog_code", None),
            "sku_template": getattr(r, "sku_template", None),
            "catalog_template": getattr(r, "catalog_template", None),
            "product_count": int(counts.get(cid, 0)),
            "path_ids": path_ids.get(cid, [cid]),
            "path_names": path_names.get(cid, [r.name]),
            "children": [to_node(c) for c in kids],
        }

    roots = children_map.get(None, [])
    return [to_node(r) for r in roots]


def serialize_category(
    db: Session,
    tenant_id: int,
    row: ProductCategory,
    *,
    all_rows: Optional[Sequence[ProductCategory]] = None,
    counts: Optional[Dict[int, int]] = None,
) -> dict:
    rows = list(all_rows) if all_rows is not None else list_categories_flat(db, tenant_id)
    path_ids, path_names = build_path_maps(rows)
    cid = int(row.id)
    if counts is None:
        counts = product_counts_by_category(db, tenant_id, [cid])
    child_count = sum(1 for r in rows if r.parent_id is not None and int(r.parent_id) == cid)
    return {
        "id": cid,
        "tenant_id": int(row.tenant_id),
        "parent_id": int(row.parent_id) if row.parent_id is not None else None,
        "name": row.name,
        "description": row.description,
        "is_active": bool(row.is_active),
        "sort_order": int(row.sort_order or 0),
        "sku_code": getattr(row, "sku_code", None),
        "catalog_code": getattr(row, "catalog_code", None),
        "sku_template": getattr(row, "sku_template", None),
        "catalog_template": getattr(row, "catalog_template", None),
        "product_count": int(counts.get(cid, 0)),
        "child_count": child_count,
        "path_ids": path_ids.get(cid, [cid]),
        "path_names": path_names.get(cid, [row.name]),
    }


def get_product_assignment(db: Session, tenant_id: int, product_id: int) -> dict:
    product = (
        db.query(Product)
        .filter(Product.tenant_id == tenant_id, Product.id == product_id, Product.deleted_at.is_(None))
        .first()
    )
    if product is None:
        raise CategoryValidationError(f"Nie znaleziono produktu #{product_id}.")

    all_rows = list_categories_flat(db, tenant_id)
    path_ids, path_names = build_path_maps(all_rows)
    by_id = {int(r.id): r for r in all_rows}

    primary_id = getattr(product, "primary_category_id", None)
    primary_id_i = int(primary_id) if primary_id is not None else None

    link_ids = [
        int(r.category_id)
        for r in (
            db.query(ProductCategoryLink)
            .filter(ProductCategoryLink.tenant_id == tenant_id, ProductCategoryLink.product_id == product_id)
            .all()
        )
    ]
    # Never duplicate primary in additional
    additional_ids = [i for i in link_ids if i != primary_id_i]
    counts = product_counts_by_category(db, tenant_id, additional_ids)

    additional = []
    for cid in additional_ids:
        row = by_id.get(cid)
        if row is None:
            continue
        additional.append(serialize_category(db, tenant_id, row, all_rows=all_rows, counts=counts))

    return {
        "product_id": int(product_id),
        "primary_category_id": primary_id_i,
        "primary_path_ids": path_ids.get(primary_id_i, []) if primary_id_i else [],
        "primary_path_names": path_names.get(primary_id_i, []) if primary_id_i else [],
        "additional_category_ids": additional_ids,
        "additional": additional,
    }


def set_product_assignment(
    db: Session,
    tenant_id: int,
    product_id: int,
    *,
    primary_category_id: Optional[int],
    additional_category_ids: Iterable[int],
) -> dict:
    product = (
        db.query(Product)
        .filter(Product.tenant_id == tenant_id, Product.id == product_id, Product.deleted_at.is_(None))
        .first()
    )
    if product is None:
        raise CategoryValidationError(f"Nie znaleziono produktu #{product_id}.")

    if primary_category_id is not None:
        get_category(db, tenant_id, primary_category_id)

    add_ids: List[int] = []
    seen: Set[int] = set()
    for raw in additional_category_ids:
        cid = int(raw)
        if primary_category_id is not None and cid == int(primary_category_id):
            continue
        if cid in seen:
            continue
        seen.add(cid)
        get_category(db, tenant_id, cid)
        add_ids.append(cid)

    product.primary_category_id = primary_category_id

    db.query(ProductCategoryLink).filter(
        ProductCategoryLink.tenant_id == tenant_id,
        ProductCategoryLink.product_id == product_id,
    ).delete(synchronize_session=False)

    for cid in add_ids:
        db.add(
            ProductCategoryLink(
                tenant_id=tenant_id,
                product_id=product_id,
                category_id=cid,
            )
        )
    db.flush()
    return get_product_assignment(db, tenant_id, product_id)
