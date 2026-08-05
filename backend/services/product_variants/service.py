"""Catalog variant group + product SKU generation services."""

from __future__ import annotations

import itertools
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ...models.inventory import Inventory
from ...models.product import Product
from ...models.product_variant import ProductVariantSelection, VariantAxis, VariantGroup, VariantValue


class ProductVariantError(Exception):
    def __init__(self, message: str, *, code: str = "variant_error"):
        super().__init__(message)
        self.message = message
        self.code = code


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _normalize_display_type(raw: Optional[str]) -> str:
    v = (raw or "text").strip().lower()
    if v in ("text", "color", "image"):
        return v
    return "text"


def _ordered_values(axis: VariantAxis) -> list[VariantValue]:
    vals = list(axis.values or [])
    if axis.sort_alpha:
        return sorted(vals, key=lambda x: ((x.name or "").casefold(), int(x.sort_order or 0), int(x.id or 0)))
    return sorted(vals, key=lambda x: (int(x.sort_order or 0), int(x.id or 0)))


def _combination_count(axes: list[VariantAxis]) -> int:
    if not axes:
        return 0
    n = 1
    for ax in axes:
        vals = _ordered_values(ax)
        if not vals:
            return 0
        n *= len(vals)
    return n


def value_key_for_ids(value_ids: list[int]) -> str:
    return "|".join(str(i) for i in sorted(int(x) for x in value_ids))


def serialize_group(group: VariantGroup, *, product_count: int = 0) -> dict[str, Any]:
    axes_out: list[dict[str, Any]] = []
    value_count = 0
    axes = sorted(list(group.axes or []), key=lambda a: (int(a.sort_order or 0), int(a.id or 0)))
    for ax in axes:
        vals = _ordered_values(ax)
        value_count += len(vals)
        axes_out.append(
            {
                "id": int(ax.id),
                "name": ax.name,
                "sort_order": int(ax.sort_order or 0),
                "display_type": ax.display_type or "text",
                "show_in_filters": bool(ax.show_in_filters),
                "sort_alpha": bool(ax.sort_alpha),
                "values": [
                    {
                        "id": int(v.id),
                        "name": v.name,
                        "sort_order": int(v.sort_order or 0),
                        "color_hex": v.color_hex,
                        "image_url": v.image_url,
                    }
                    for v in vals
                ],
            }
        )
    return {
        "id": int(group.id),
        "tenant_id": int(group.tenant_id),
        "name": group.name,
        "is_active": bool(group.is_active),
        "axes": axes_out,
        "axis_count": len(axes_out),
        "value_count": value_count,
        "product_count": int(product_count),
    }


def list_groups(db: Session, tenant_id: int, *, include_inactive: bool = True) -> list[dict[str, Any]]:
    q = db.query(VariantGroup).options(
        joinedload(VariantGroup.axes).joinedload(VariantAxis.values)
    ).filter(VariantGroup.tenant_id == tenant_id)
    if not include_inactive:
        q = q.filter(VariantGroup.is_active.is_(True))
    rows = q.order_by(VariantGroup.name.asc(), VariantGroup.id.asc()).all()

    counts: dict[int, int] = {}
    if rows:
        ids = [int(r.id) for r in rows]
        for gid, cnt in (
            db.query(Product.variant_group_id, func.count(Product.id))
            .filter(
                Product.tenant_id == tenant_id,
                Product.variant_group_id.in_(ids),
                Product.deleted_at.is_(None),
                Product.variant_parent_id.is_(None),
            )
            .group_by(Product.variant_group_id)
            .all()
        ):
            if gid is not None:
                counts[int(gid)] = int(cnt)

    out: list[dict[str, Any]] = []
    for g in rows:
        ser = serialize_group(g, product_count=counts.get(int(g.id), 0))
        axes = sorted(list(g.axes or []), key=lambda a: (int(a.sort_order or 0), int(a.id or 0)))
        out.append(
            {
                "id": ser["id"],
                "tenant_id": ser["tenant_id"],
                "name": ser["name"],
                "is_active": ser["is_active"],
                "axis_count": ser["axis_count"],
                "value_count": ser["value_count"],
                "product_count": ser["product_count"],
                "combination_count": _combination_count(axes),
            }
        )
    return out


def get_group(db: Session, tenant_id: int, group_id: int) -> VariantGroup:
    row = (
        db.query(VariantGroup)
        .options(joinedload(VariantGroup.axes).joinedload(VariantAxis.values))
        .filter(VariantGroup.id == group_id, VariantGroup.tenant_id == tenant_id)
        .first()
    )
    if row is None:
        raise ProductVariantError("Nie znaleziono grupy wariantów.", code="group_not_found")
    return row


def _replace_axes(db: Session, tenant_id: int, group: VariantGroup, axes_payload: list[dict]) -> None:
    existing_axes = {int(a.id): a for a in (group.axes or [])}
    keep_axis_ids: set[int] = set()

    for idx, ax_raw in enumerate(axes_payload):
        name = str(ax_raw.get("name") or "").strip()
        if not name:
            raise ProductVariantError("Nazwa osi wariantu jest wymagana.", code="axis_name_required")
        axis_id = ax_raw.get("id")
        axis: Optional[VariantAxis] = None
        if axis_id is not None and int(axis_id) in existing_axes:
            axis = existing_axes[int(axis_id)]
            keep_axis_ids.add(int(axis_id))
        else:
            axis = VariantAxis(tenant_id=tenant_id, group_id=int(group.id))
            db.add(axis)
            group.axes.append(axis)

        axis.name = name
        axis.sort_order = int(ax_raw.get("sort_order") if ax_raw.get("sort_order") is not None else idx)
        axis.display_type = _normalize_display_type(ax_raw.get("display_type"))
        axis.show_in_filters = bool(ax_raw.get("show_in_filters", False))
        axis.sort_alpha = bool(ax_raw.get("sort_alpha", False))
        db.flush()

        existing_vals = {int(v.id): v for v in (axis.values or [])}
        keep_val_ids: set[int] = set()
        values_raw = ax_raw.get("values") or []
        for vidx, v_raw in enumerate(values_raw):
            vname = str(v_raw.get("name") or "").strip()
            if not vname:
                raise ProductVariantError("Nazwa wartości jest wymagana.", code="value_name_required")
            vid = v_raw.get("id")
            val: Optional[VariantValue] = None
            if vid is not None and int(vid) in existing_vals:
                val = existing_vals[int(vid)]
                keep_val_ids.add(int(vid))
            else:
                val = VariantValue(tenant_id=tenant_id, axis_id=int(axis.id))
                db.add(val)
                axis.values.append(val)
            val.name = vname
            val.sort_order = int(v_raw.get("sort_order") if v_raw.get("sort_order") is not None else vidx)
            color = v_raw.get("color_hex")
            val.color_hex = (str(color).strip() or None) if color is not None else None
            img = v_raw.get("image_url")
            val.image_url = (str(img).strip() or None) if img is not None else None

        for vid, val in existing_vals.items():
            if vid not in keep_val_ids:
                db.delete(val)

    for aid, axis in existing_axes.items():
        if aid not in keep_axis_ids:
            db.delete(axis)


def create_group(
    db: Session,
    tenant_id: int,
    *,
    name: str,
    is_active: bool = True,
    axes: Optional[list[dict]] = None,
) -> VariantGroup:
    cleaned = (name or "").strip()
    if not cleaned:
        raise ProductVariantError("Nazwa grupy wariantów jest wymagana.", code="name_required")
    group = VariantGroup(tenant_id=tenant_id, name=cleaned, is_active=bool(is_active))
    db.add(group)
    db.flush()
    if axes:
        _replace_axes(db, tenant_id, group, axes)
    db.flush()
    return get_group(db, tenant_id, int(group.id))


def update_group(
    db: Session,
    tenant_id: int,
    group_id: int,
    *,
    name: str,
    is_active: bool = True,
    axes: Optional[list[dict]] = None,
) -> VariantGroup:
    group = get_group(db, tenant_id, group_id)
    cleaned = (name or "").strip()
    if not cleaned:
        raise ProductVariantError("Nazwa grupy wariantów jest wymagana.", code="name_required")
    group.name = cleaned
    group.is_active = bool(is_active)
    group.updated_at = _now()
    _replace_axes(db, tenant_id, group, axes or [])
    db.flush()
    return get_group(db, tenant_id, group_id)


def delete_group(db: Session, tenant_id: int, group_id: int) -> None:
    group = get_group(db, tenant_id, group_id)
    linked = (
        db.query(func.count(Product.id))
        .filter(
            Product.tenant_id == tenant_id,
            Product.variant_group_id == group_id,
            Product.deleted_at.is_(None),
        )
        .scalar()
    )
    if int(linked or 0) > 0:
        raise ProductVariantError(
            "Nie można usunąć grupy — jest przypisana do produktów. Najpierw odłącz warianty.",
            code="group_in_use",
        )
    db.delete(group)
    db.flush()


def _stock_map(db: Session, tenant_id: int, product_ids: list[int]) -> dict[int, float]:
    if not product_ids:
        return {}
    rows = (
        db.query(Inventory.product_id, func.coalesce(func.sum(Inventory.quantity), 0))
        .filter(Inventory.tenant_id == tenant_id, Inventory.product_id.in_(product_ids))
        .group_by(Inventory.product_id)
        .all()
    )
    return {int(pid): float(qty or 0) for pid, qty in rows}


def _load_parent(db: Session, tenant_id: int, product_id: int) -> Product:
    product = (
        db.query(Product)
        .filter(Product.id == product_id, Product.tenant_id == tenant_id, Product.deleted_at.is_(None))
        .first()
    )
    if product is None:
        raise ProductVariantError("Nie znaleziono produktu.", code="product_not_found")
    return product


def _serialize_sku(
    product: Product,
    *,
    stock: float,
    value_rows: list[tuple[VariantAxis, VariantValue]],
) -> dict[str, Any]:
    values = [
        {
            "axis_id": int(ax.id),
            "axis_name": ax.name,
            "value_id": int(val.id),
            "value_name": val.name,
        }
        for ax, val in sorted(value_rows, key=lambda t: (int(t[0].sort_order or 0), int(t[0].id or 0)))
    ]
    return {
        "id": int(product.id),
        "name": product.name or "",
        "sku": getattr(product, "sku", None) or product.symbol,
        "ean": product.ean,
        "sale_price": float(product.sale_price) if product.sale_price is not None else None,
        "image_url": product.image_url,
        "stock_quantity": float(stock),
        "values": values,
        "value_key": value_key_for_ids([int(v["value_id"]) for v in values]),
    }


def get_product_variants_state(db: Session, tenant_id: int, product_id: int) -> dict[str, Any]:
    product = _load_parent(db, tenant_id, product_id)

    parent_id = getattr(product, "variant_parent_id", None)
    if parent_id is not None:
        parent = (
            db.query(Product)
            .filter(Product.id == int(parent_id), Product.tenant_id == tenant_id)
            .first()
        )
        return {
            "product_id": int(product.id),
            "is_variant_child": True,
            "parent_product_id": int(parent_id),
            "parent_product_name": (parent.name if parent else None) or f"Produkt #{parent_id}",
            "variant_group_id": getattr(parent, "variant_group_id", None) if parent else None,
            "group": None,
            "skus": [],
            "possible_combinations": 0,
            "missing_combinations": 0,
        }

    group_id = getattr(product, "variant_group_id", None)
    group_ser = None
    axes: list[VariantAxis] = []
    if group_id is not None:
        group = get_group(db, tenant_id, int(group_id))
        group_ser = serialize_group(group)
        axes = sorted(list(group.axes or []), key=lambda a: (int(a.sort_order or 0), int(a.id or 0)))

    children = (
        db.query(Product)
        .filter(
            Product.tenant_id == tenant_id,
            Product.variant_parent_id == int(product.id),
            Product.deleted_at.is_(None),
        )
        .order_by(Product.id.asc())
        .all()
    )
    child_ids = [int(c.id) for c in children]
    stocks = _stock_map(db, tenant_id, child_ids)

    selections = (
        db.query(ProductVariantSelection, VariantValue, VariantAxis)
        .join(VariantValue, VariantValue.id == ProductVariantSelection.variant_value_id)
        .join(VariantAxis, VariantAxis.id == VariantValue.axis_id)
        .filter(ProductVariantSelection.product_id.in_(child_ids))
        .all()
        if child_ids
        else []
    )
    by_product: dict[int, list[tuple[VariantAxis, VariantValue]]] = {cid: [] for cid in child_ids}
    for sel, val, ax in selections:
        by_product.setdefault(int(sel.product_id), []).append((ax, val))

    skus = [
        _serialize_sku(c, stock=stocks.get(int(c.id), 0.0), value_rows=by_product.get(int(c.id), []))
        for c in children
    ]

    existing_keys = {s["value_key"] for s in skus if s["value_key"]}
    possible = _combination_count(axes)
    missing = 0
    if axes and all(_ordered_values(a) for a in axes):
        value_lists = [[int(v.id) for v in _ordered_values(a)] for a in axes]
        for combo in itertools.product(*value_lists):
            key = value_key_for_ids(list(combo))
            if key not in existing_keys:
                missing += 1

    return {
        "product_id": int(product.id),
        "is_variant_child": False,
        "parent_product_id": None,
        "parent_product_name": None,
        "variant_group_id": int(group_id) if group_id is not None else None,
        "group": group_ser,
        "skus": skus,
        "possible_combinations": possible,
        "missing_combinations": missing,
    }


def attach_variant_group(
    db: Session,
    tenant_id: int,
    product_id: int,
    variant_group_id: Optional[int],
) -> dict[str, Any]:
    product = _load_parent(db, tenant_id, product_id)
    if getattr(product, "variant_parent_id", None) is not None:
        raise ProductVariantError(
            "To jest SKU wariantu — zarządzaj wariantami na produkcie nadrzędnym.",
            code="is_variant_child",
        )
    if variant_group_id is None:
        product.variant_group_id = None
    else:
        get_group(db, tenant_id, int(variant_group_id))
        product.variant_group_id = int(variant_group_id)
    db.flush()
    return get_product_variants_state(db, tenant_id, product_id)


def generate_variant_skus(
    db: Session,
    tenant_id: int,
    product_id: int,
    *,
    only_missing: bool = True,
) -> dict[str, Any]:
    product = _load_parent(db, tenant_id, product_id)
    if getattr(product, "variant_parent_id", None) is not None:
        raise ProductVariantError(
            "To jest SKU wariantu — generuj na produkcie nadrzędnym.",
            code="is_variant_child",
        )
    group_id = getattr(product, "variant_group_id", None)
    if group_id is None:
        raise ProductVariantError("Najpierw przypisz grupę wariantów.", code="group_required")

    group = get_group(db, tenant_id, int(group_id))
    axes = sorted(list(group.axes or []), key=lambda a: (int(a.sort_order or 0), int(a.id or 0)))
    if not axes:
        raise ProductVariantError("Grupa nie ma żadnych osi (np. Kolor, Rozmiar).", code="no_axes")
    value_lists = [_ordered_values(a) for a in axes]
    if any(not vl for vl in value_lists):
        raise ProductVariantError("Każda oś musi mieć co najmniej jedną wartość.", code="empty_axis")

    state = get_product_variants_state(db, tenant_id, product_id)
    existing_keys = {s["value_key"] for s in state["skus"] if s["value_key"]}

    created: list[Product] = []
    parent_name = (product.name or "").strip() or f"Produkt #{product.id}"
    base_price = product.sale_price
    image = product.image_url

    for combo in itertools.product(*value_lists):
        ids = [int(v.id) for v in combo]
        key = value_key_for_ids(ids)
        if only_missing and key in existing_keys:
            continue
        if key in existing_keys:
            continue

        label_parts = [v.name for v in combo]
        child_name = f"{parent_name} / {' / '.join(label_parts)}"
        child = Product(
            tenant_id=tenant_id,
            name=child_name,
            sale_price=base_price,
            image_url=image,
            variant_parent_id=int(product.id),
            manufacturer_id=getattr(product, "manufacturer_id", None),
            primary_category_id=getattr(product, "primary_category_id", None),
            length=product.length,
            width=product.width,
            height=product.height,
            weight=product.weight,
            extra_cost_packaging_net=float(getattr(product, "extra_cost_packaging_net", 0) or 0),
        )
        db.add(child)
        db.flush()
        for val in combo:
            db.add(
                ProductVariantSelection(
                    tenant_id=tenant_id,
                    product_id=int(child.id),
                    variant_value_id=int(val.id),
                )
            )
        created.append(child)
        existing_keys.add(key)

    db.flush()
    new_state = get_product_variants_state(db, tenant_id, product_id)
    created_ids = {int(c.id) for c in created}
    return {
        "created_count": len(created),
        "skus": [s for s in new_state["skus"] if int(s["id"]) in created_ids],
    }


def patch_variant_sku(
    db: Session,
    tenant_id: int,
    parent_product_id: int,
    child_id: int,
    *,
    name: Optional[str] = None,
    sku: Optional[str] = None,
    ean: Optional[str] = None,
    sale_price: Optional[float] = None,
) -> dict[str, Any]:
    parent = _load_parent(db, tenant_id, parent_product_id)
    child = (
        db.query(Product)
        .filter(
            Product.id == child_id,
            Product.tenant_id == tenant_id,
            Product.variant_parent_id == int(parent.id),
            Product.deleted_at.is_(None),
        )
        .first()
    )
    if child is None:
        raise ProductVariantError("Nie znaleziono SKU wariantu.", code="sku_not_found")

    if name is not None:
        cleaned = name.strip()
        if not cleaned:
            raise ProductVariantError("Nazwa nie może być pusta.", code="name_required")
        child.name = cleaned
    if sku is not None:
        child.sku = sku.strip() or None
        child.symbol = child.sku
    if ean is not None:
        cleaned_ean = ean.strip() or None
        if cleaned_ean:
            conflict = (
                db.query(Product.id)
                .filter(
                    Product.tenant_id == tenant_id,
                    Product.ean == cleaned_ean,
                    Product.id != int(child.id),
                    Product.deleted_at.is_(None),
                )
                .first()
            )
            if conflict:
                raise ProductVariantError("Ten EAN jest już używany przez inny produkt.", code="ean_conflict")
        child.ean = cleaned_ean
    if sale_price is not None:
        child.sale_price = sale_price

    db.flush()
    state = get_product_variants_state(db, tenant_id, parent_product_id)
    for s in state["skus"]:
        if int(s["id"]) == int(child.id):
            return s
    raise ProductVariantError("Nie znaleziono SKU wariantu.", code="sku_not_found")


def delete_variant_sku(db: Session, tenant_id: int, parent_product_id: int, child_id: int) -> None:
    parent = _load_parent(db, tenant_id, parent_product_id)
    child = (
        db.query(Product)
        .filter(
            Product.id == child_id,
            Product.tenant_id == tenant_id,
            Product.variant_parent_id == int(parent.id),
            Product.deleted_at.is_(None),
        )
        .first()
    )
    if child is None:
        raise ProductVariantError("Nie znaleziono SKU wariantu.", code="sku_not_found")
    child.deleted_at = _now()
    db.flush()
