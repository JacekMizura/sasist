"""Product Family generator — preview + create selected combinations (modes A/B)."""

from __future__ import annotations

import itertools
from typing import Any, Literal, Optional

from sqlalchemy.orm import Session

from ...models.product import Product
from ...models.product_family import FamilyAttribute, FamilyAttributeValue, ProductAttributeValue
from .service import (
    ProductFamilyError,
    _combination_count,
    _ordered_values,
    get_family,
    list_family_members,
    serialize_family,
)

GenerateMode = Literal["empty", "copy_base"]


def value_key_for_ids(value_ids: list[int]) -> str:
    return "|".join(str(i) for i in sorted(int(x) for x in value_ids))


def _existing_combination_keys(db: Session, tenant_id: int, family_id: int) -> set[str]:
    product_ids = [
        int(pid)
        for (pid,) in db.query(Product.id)
        .filter(
            Product.tenant_id == tenant_id,
            Product.product_family_id == family_id,
            Product.deleted_at.is_(None),
        )
        .all()
    ]
    if not product_ids:
        return set()

    rows = (
        db.query(ProductAttributeValue.product_id, ProductAttributeValue.value_id)
        .filter(
            ProductAttributeValue.tenant_id == tenant_id,
            ProductAttributeValue.product_id.in_(product_ids),
        )
        .all()
    )
    by_product: dict[int, list[int]] = {}
    for pid, vid in rows:
        by_product.setdefault(int(pid), []).append(int(vid))
    return {value_key_for_ids(vids) for vids in by_product.values() if vids}


def _all_combinations(attrs: list[FamilyAttribute]) -> list[tuple[FamilyAttributeValue, ...]]:
    value_lists = [_ordered_values(a) for a in attrs]
    if not attrs or any(not vl for vl in value_lists):
        return []
    return list(itertools.product(*value_lists))


def preview_family_generate(db: Session, tenant_id: int, family_id: int) -> dict[str, Any]:
    family = get_family(db, tenant_id, family_id)
    attrs = sorted(list(family.attributes or []), key=lambda a: (int(a.sort_order or 0), int(a.id or 0)))
    combos = _all_combinations(attrs)
    existing = _existing_combination_keys(db, tenant_id, family_id)

    items: list[dict[str, Any]] = []
    missing_count = 0
    for combo in combos:
        ids = [int(v.id) for v in combo]
        key = value_key_for_ids(ids)
        exists = key in existing
        if not exists:
            missing_count += 1
        label_parts = [v.name for v in combo]
        items.append(
            {
                "value_key": key,
                "value_ids": ids,
                "label": " / ".join(label_parts),
                "exists": exists,
            }
        )

    base = None
    if family.base_product_id:
        base_row = (
            db.query(Product)
            .filter(
                Product.id == int(family.base_product_id),
                Product.tenant_id == tenant_id,
                Product.deleted_at.is_(None),
            )
            .first()
        )
        if base_row:
            base = {"id": int(base_row.id), "name": base_row.name or f"Produkt #{base_row.id}"}

    return {
        "family_id": int(family.id),
        "family_name": family.name,
        "attribute_count": len(attrs),
        "combination_count": _combination_count(attrs),
        "existing_count": len(existing),
        "missing_count": missing_count,
        "new_sku_count": missing_count,
        "has_base_product": base is not None,
        "base_product": base,
        "default_mode": "copy_base" if base is not None else "empty",
        "combinations": items,
    }


def _copy_fields_from_base(base: Product) -> dict[str, Any]:
    """Copy source fields for mode B — one-shot; no live inheritance afterwards."""
    return {
        "manufacturer": getattr(base, "manufacturer", None),
        "manufacturer_id": getattr(base, "manufacturer_id", None),
        "primary_category_id": getattr(base, "primary_category_id", None),
        "default_supplier_id": getattr(base, "default_supplier_id", None),
        "sale_price": base.sale_price,
        "purchase_price": base.purchase_price,
        "image_url": base.image_url,
        "length": base.length,
        "width": base.width,
        "height": base.height,
        "weight": base.weight,
        "volume": base.volume,
        "unit": getattr(base, "unit", None),
        "label_template_id": getattr(base, "label_template_id", None),
        "extra_cost_packaging_net": float(getattr(base, "extra_cost_packaging_net", 0) or 0),
        "extra_cost_commission_percent": float(getattr(base, "extra_cost_commission_percent", 0) or 0),
        "extra_cost_other_net": float(getattr(base, "extra_cost_other_net", 0) or 0),
        "track_batch": bool(getattr(base, "track_batch", False)),
        "track_expiry": bool(getattr(base, "track_expiry", False)),
        "track_serial": bool(getattr(base, "track_serial", False)),
        "fragile": getattr(base, "fragile", None),
        "stack_compressible": getattr(base, "stack_compressible", None),
    }


def generate_family_products(
    db: Session,
    tenant_id: int,
    family_id: int,
    *,
    mode: GenerateMode = "copy_base",
    value_keys: Optional[list[str]] = None,
    only_missing: bool = True,
) -> dict[str, Any]:
    """
    Create full Product rows for selected combinations.
    Never creates all combinations unless they are explicitly listed in value_keys
    (or value_keys is omitted and caller intentionally passes generate_all=True via API with confirm).
    """
    family = get_family(db, tenant_id, family_id)
    attrs = sorted(list(family.attributes or []), key=lambda a: (int(a.sort_order or 0), int(a.id or 0)))
    if not attrs:
        raise ProductFamilyError("Rodzina nie ma żadnych cech.", code="no_attributes")
    if any(not _ordered_values(a) for a in attrs):
        raise ProductFamilyError("Każda cecha musi mieć co najmniej jedną wartość.", code="empty_attribute")

    if not value_keys:
        raise ProductFamilyError(
            "Wybierz kombinacje do utworzenia — nie tworzysz produktów automatycznie.",
            code="selection_required",
        )

    selected = {str(k) for k in value_keys}
    existing = _existing_combination_keys(db, tenant_id, family_id)
    combos = _all_combinations(attrs)
    by_key = {value_key_for_ids([int(v.id) for v in c]): c for c in combos}

    unknown = selected - set(by_key.keys())
    if unknown:
        raise ProductFamilyError("Nieprawidłowa kombinacja wartości.", code="invalid_combination")

    mode_norm: GenerateMode = "copy_base" if mode == "copy_base" else "empty"
    base: Optional[Product] = None
    if mode_norm == "copy_base":
        if not family.base_product_id:
            raise ProductFamilyError(
                "Tryb kopiowania wymaga produktu bazowego na rodzinie.",
                code="base_product_required",
            )
        base = (
            db.query(Product)
            .filter(
                Product.id == int(family.base_product_id),
                Product.tenant_id == tenant_id,
                Product.deleted_at.is_(None),
            )
            .first()
        )
        if base is None:
            raise ProductFamilyError("Nie znaleziono produktu bazowego.", code="base_product_not_found")

    family_name = (family.name or "").strip() or f"Rodzina #{family.id}"
    copy_kwargs = _copy_fields_from_base(base) if base is not None else {}
    created: list[Product] = []

    for key in selected:
        if only_missing and key in existing:
            continue
        if key in existing:
            continue
        combo = by_key[key]
        label = " / ".join(v.name for v in combo)
        name = f"{family_name} / {label}"
        if mode_norm == "copy_base" and base is not None:
            base_name = (base.name or "").strip()
            if base_name:
                name = f"{base_name} / {label}"
            product = Product(tenant_id=tenant_id, name=name, product_family_id=int(family.id), **copy_kwargs)
        else:
            product = Product(tenant_id=tenant_id, name=name, product_family_id=int(family.id))

        db.add(product)
        db.flush()
        for attr, val in zip(attrs, combo):
            db.add(
                ProductAttributeValue(
                    tenant_id=tenant_id,
                    product_id=int(product.id),
                    attribute_id=int(attr.id),
                    value_id=int(val.id),
                )
            )
        created.append(product)
        existing.add(key)

    db.flush()
    members = list_family_members(db, tenant_id, family)
    created_ids = {int(p.id) for p in created}
    return {
        "created_count": len(created),
        "mode": mode_norm,
        "products": [m for m in members if int(m["id"]) in created_ids],
        "family": serialize_family(db, get_family(db, tenant_id, family_id), include_members=True),
    }
