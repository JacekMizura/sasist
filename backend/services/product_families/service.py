"""Product Family CRUD — optional grouping + family attributes (no generator here)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ...models.product import Product
from ...models.product_family import (
    FamilyAttribute,
    FamilyAttributeValue,
    ProductAttributeValue,
    ProductFamily,
)


class ProductFamilyError(Exception):
    def __init__(self, message: str, *, code: str = "family_error"):
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


def _ordered_values(attr: FamilyAttribute) -> list[FamilyAttributeValue]:
    vals = list(attr.values or [])
    if attr.sort_alpha:
        return sorted(vals, key=lambda x: ((x.name or "").casefold(), int(x.sort_order or 0), int(x.id or 0)))
    return sorted(vals, key=lambda x: (int(x.sort_order or 0), int(x.id or 0)))


def _combination_count(attrs: list[FamilyAttribute]) -> int:
    if not attrs:
        return 0
    n = 1
    for attr in attrs:
        vals = _ordered_values(attr)
        if not vals:
            return 0
        n *= len(vals)
    return n


def _product_count(db: Session, tenant_id: int, family_id: int) -> int:
    return int(
        db.query(func.count(Product.id))
        .filter(
            Product.tenant_id == tenant_id,
            Product.product_family_id == family_id,
            Product.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )


def _resolve_base_product(
    db: Session,
    tenant_id: int,
    base_product_id: Optional[int],
) -> Optional[Product]:
    if base_product_id is None:
        return None
    row = (
        db.query(Product)
        .filter(
            Product.id == int(base_product_id),
            Product.tenant_id == tenant_id,
            Product.deleted_at.is_(None),
        )
        .first()
    )
    if row is None:
        raise ProductFamilyError("Nie znaleziono produktu bazowego.", code="base_product_not_found")
    return row


def serialize_family(
    db: Session,
    family: ProductFamily,
    *,
    include_members: bool = False,
    product_count: Optional[int] = None,
) -> dict[str, Any]:
    attrs_out: list[dict[str, Any]] = []
    value_count = 0
    attrs = sorted(list(family.attributes or []), key=lambda a: (int(a.sort_order or 0), int(a.id or 0)))
    for attr in attrs:
        vals = _ordered_values(attr)
        value_count += len(vals)
        attrs_out.append(
            {
                "id": int(attr.id),
                "name": attr.name,
                "sort_order": int(attr.sort_order or 0),
                "display_type": attr.display_type or "text",
                "show_in_filters": bool(attr.show_in_filters),
                "sort_alpha": bool(attr.sort_alpha),
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

    base_name: Optional[str] = None
    if family.base_product_id:
        base = (
            db.query(Product.name)
            .filter(Product.id == int(family.base_product_id), Product.tenant_id == int(family.tenant_id))
            .scalar()
        )
        base_name = str(base) if base else None

    count = product_count if product_count is not None else _product_count(db, int(family.tenant_id), int(family.id))

    out: dict[str, Any] = {
        "id": int(family.id),
        "tenant_id": int(family.tenant_id),
        "name": family.name,
        "is_active": bool(family.is_active),
        "base_product_id": int(family.base_product_id) if family.base_product_id else None,
        "base_product_name": base_name,
        "attributes": attrs_out,
        "attribute_count": len(attrs_out),
        "value_count": value_count,
        "product_count": int(count),
        "combination_count": _combination_count(attrs),
        "members": [],
    }

    if include_members:
        out["members"] = list_family_members(db, int(family.tenant_id), family)

    return out


def list_family_members(db: Session, tenant_id: int, family: ProductFamily) -> list[dict[str, Any]]:
    products = (
        db.query(Product)
        .filter(
            Product.tenant_id == tenant_id,
            Product.product_family_id == int(family.id),
            Product.deleted_at.is_(None),
        )
        .order_by(Product.name.asc(), Product.id.asc())
        .all()
    )
    if not products:
        return []

    pids = [int(p.id) for p in products]
    pav_rows = (
        db.query(ProductAttributeValue)
        .filter(
            ProductAttributeValue.tenant_id == tenant_id,
            ProductAttributeValue.product_id.in_(pids),
        )
        .all()
    )
    # Load value names
    value_ids = {int(r.value_id) for r in pav_rows}
    value_names: dict[int, str] = {}
    if value_ids:
        for vid, vname in (
            db.query(FamilyAttributeValue.id, FamilyAttributeValue.name)
            .filter(FamilyAttributeValue.id.in_(list(value_ids)))
            .all()
        ):
            value_names[int(vid)] = str(vname or "")

    attr_order = {
        int(a.id): int(a.sort_order or 0)
        for a in (family.attributes or [])
    }
    by_product: dict[int, list[tuple[int, str]]] = {}
    for row in pav_rows:
        by_product.setdefault(int(row.product_id), []).append(
            (attr_order.get(int(row.attribute_id), 0), value_names.get(int(row.value_id), ""))
        )

    base_id = int(family.base_product_id) if family.base_product_id else None
    out: list[dict[str, Any]] = []
    for p in products:
        parts = sorted(by_product.get(int(p.id), []), key=lambda t: t[0])
        summary = " / ".join(name for _, name in parts if name)
        out.append(
            {
                "id": int(p.id),
                "name": p.name or "",
                "sku": p.sku,
                "catalog_number": p.catalog_number,
                "ean": p.ean,
                "image_url": p.image_url,
                "is_base": base_id is not None and int(p.id) == base_id,
                "attribute_summary": summary,
            }
        )
    return out


def list_families(db: Session, tenant_id: int, *, include_inactive: bool = True) -> list[dict[str, Any]]:
    q = (
        db.query(ProductFamily)
        .options(joinedload(ProductFamily.attributes).joinedload(FamilyAttribute.values))
        .filter(ProductFamily.tenant_id == tenant_id)
    )
    if not include_inactive:
        q = q.filter(ProductFamily.is_active.is_(True))
    rows = q.order_by(ProductFamily.name.asc(), ProductFamily.id.asc()).all()

    counts: dict[int, int] = {}
    if rows:
        ids = [int(r.id) for r in rows]
        for fid, cnt in (
            db.query(Product.product_family_id, func.count(Product.id))
            .filter(
                Product.tenant_id == tenant_id,
                Product.product_family_id.in_(ids),
                Product.deleted_at.is_(None),
            )
            .group_by(Product.product_family_id)
            .all()
        ):
            if fid is not None:
                counts[int(fid)] = int(cnt)

    out: list[dict[str, Any]] = []
    for family in rows:
        ser = serialize_family(db, family, product_count=counts.get(int(family.id), 0))
        out.append(
            {
                "id": ser["id"],
                "tenant_id": ser["tenant_id"],
                "name": ser["name"],
                "is_active": ser["is_active"],
                "base_product_id": ser["base_product_id"],
                "attribute_count": ser["attribute_count"],
                "value_count": ser["value_count"],
                "product_count": ser["product_count"],
                "combination_count": ser["combination_count"],
            }
        )
    return out


def get_family(db: Session, tenant_id: int, family_id: int) -> ProductFamily:
    row = (
        db.query(ProductFamily)
        .options(joinedload(ProductFamily.attributes).joinedload(FamilyAttribute.values))
        .filter(ProductFamily.id == family_id, ProductFamily.tenant_id == tenant_id)
        .first()
    )
    if row is None:
        raise ProductFamilyError("Nie znaleziono rodziny produktów.", code="family_not_found")
    return row


def _replace_attributes(db: Session, tenant_id: int, family: ProductFamily, attrs_payload: list[dict]) -> None:
    existing_attrs = {int(a.id): a for a in (family.attributes or [])}
    keep_attr_ids: set[int] = set()

    for idx, raw in enumerate(attrs_payload):
        name = str(raw.get("name") or "").strip()
        if not name:
            raise ProductFamilyError("Nazwa atrybutu rodziny jest wymagana.", code="attribute_name_required")
        attr_id = raw.get("id")
        attr: Optional[FamilyAttribute] = None
        if attr_id is not None and int(attr_id) in existing_attrs:
            attr = existing_attrs[int(attr_id)]
            keep_attr_ids.add(int(attr_id))
        else:
            attr = FamilyAttribute(tenant_id=tenant_id, family_id=int(family.id))
            db.add(attr)
            family.attributes.append(attr)

        attr.name = name
        attr.sort_order = int(raw.get("sort_order") if raw.get("sort_order") is not None else idx)
        attr.display_type = _normalize_display_type(raw.get("display_type"))
        attr.show_in_filters = bool(raw.get("show_in_filters", False))
        attr.sort_alpha = bool(raw.get("sort_alpha", False))
        db.flush()

        existing_vals = {int(v.id): v for v in (attr.values or [])}
        keep_val_ids: set[int] = set()
        values_raw = raw.get("values") or []
        for vidx, v_raw in enumerate(values_raw):
            vname = str(v_raw.get("name") or "").strip()
            if not vname:
                raise ProductFamilyError("Nazwa wartości atrybutu jest wymagana.", code="value_name_required")
            vid = v_raw.get("id")
            val: Optional[FamilyAttributeValue] = None
            if vid is not None and int(vid) in existing_vals:
                val = existing_vals[int(vid)]
                keep_val_ids.add(int(vid))
            else:
                val = FamilyAttributeValue(tenant_id=tenant_id, attribute_id=int(attr.id))
                db.add(val)
                attr.values.append(val)
            val.name = vname
            val.sort_order = int(v_raw.get("sort_order") if v_raw.get("sort_order") is not None else vidx)
            color = v_raw.get("color_hex")
            val.color_hex = (str(color).strip() or None) if color is not None else None
            img = v_raw.get("image_url")
            val.image_url = (str(img).strip() or None) if img is not None else None

        for vid, val in existing_vals.items():
            if vid not in keep_val_ids:
                db.delete(val)

    for aid, attr in existing_attrs.items():
        if aid not in keep_attr_ids:
            db.delete(attr)


def create_family(
    db: Session,
    tenant_id: int,
    *,
    name: str,
    is_active: bool = True,
    base_product_id: Optional[int] = None,
    attributes: Optional[list[dict]] = None,
) -> ProductFamily:
    cleaned = (name or "").strip()
    if not cleaned:
        raise ProductFamilyError("Nazwa rodziny produktów jest wymagana.", code="name_required")
    base = _resolve_base_product(db, tenant_id, base_product_id)
    family = ProductFamily(
        tenant_id=tenant_id,
        name=cleaned,
        is_active=bool(is_active),
        base_product_id=int(base.id) if base else None,
    )
    db.add(family)
    db.flush()
    if attributes:
        _replace_attributes(db, tenant_id, family, attributes)
    if base is not None and getattr(base, "product_family_id", None) is None:
        base.product_family_id = int(family.id)
    db.flush()
    return get_family(db, tenant_id, int(family.id))


def update_family(
    db: Session,
    tenant_id: int,
    family_id: int,
    *,
    name: str,
    is_active: bool = True,
    base_product_id: Optional[int] = None,
    attributes: Optional[list[dict]] = None,
) -> ProductFamily:
    family = get_family(db, tenant_id, family_id)
    cleaned = (name or "").strip()
    if not cleaned:
        raise ProductFamilyError("Nazwa rodziny produktów jest wymagana.", code="name_required")
    base = _resolve_base_product(db, tenant_id, base_product_id)
    if base is not None and base.product_family_id not in (None, int(family.id)):
        raise ProductFamilyError(
            "Produkt bazowy należy do innej rodziny.",
            code="base_product_other_family",
        )
    family.name = cleaned
    family.is_active = bool(is_active)
    family.base_product_id = int(base.id) if base else None
    family.updated_at = _now()
    _replace_attributes(db, tenant_id, family, attributes or [])
    if base is not None and base.product_family_id is None:
        base.product_family_id = int(family.id)
    db.flush()
    return get_family(db, tenant_id, family_id)


def delete_family(db: Session, tenant_id: int, family_id: int) -> None:
    family = get_family(db, tenant_id, family_id)
    products = (
        db.query(Product)
        .filter(Product.tenant_id == tenant_id, Product.product_family_id == family_id)
        .all()
    )
    for p in products:
        p.product_family_id = None
    db.query(ProductAttributeValue).filter(
        ProductAttributeValue.tenant_id == tenant_id,
        ProductAttributeValue.product_id.in_([int(p.id) for p in products] or [-1]),
    ).delete(synchronize_session=False)
    db.delete(family)
    db.flush()


def attach_product_to_family(
    db: Session,
    tenant_id: int,
    product_id: int,
    product_family_id: Optional[int],
) -> dict[str, Any]:
    product = (
        db.query(Product)
        .filter(Product.id == product_id, Product.tenant_id == tenant_id, Product.deleted_at.is_(None))
        .first()
    )
    if product is None:
        raise ProductFamilyError("Nie znaleziono produktu.", code="product_not_found")

    if product_family_id is None:
        old_family_id = int(product.product_family_id) if product.product_family_id else None
        product.product_family_id = None
        db.query(ProductAttributeValue).filter(
            ProductAttributeValue.tenant_id == tenant_id,
            ProductAttributeValue.product_id == product_id,
        ).delete(synchronize_session=False)
        if old_family_id:
            fam = (
                db.query(ProductFamily)
                .filter(ProductFamily.id == old_family_id, ProductFamily.tenant_id == tenant_id)
                .first()
            )
            if fam and fam.base_product_id and int(fam.base_product_id) == product_id:
                fam.base_product_id = None
        db.flush()
        return get_product_family_state(db, tenant_id, product_id)

    family = get_family(db, tenant_id, int(product_family_id))
    product.product_family_id = int(family.id)
    db.flush()
    return get_product_family_state(db, tenant_id, product_id)


def get_product_family_state(db: Session, tenant_id: int, product_id: int) -> dict[str, Any]:
    product = (
        db.query(Product)
        .filter(Product.id == product_id, Product.tenant_id == tenant_id, Product.deleted_at.is_(None))
        .first()
    )
    if product is None:
        raise ProductFamilyError("Nie znaleziono produktu.", code="product_not_found")

    family_payload = None
    count = 0
    if product.product_family_id:
        family = get_family(db, tenant_id, int(product.product_family_id))
        family_payload = serialize_family(db, family, include_members=False)
        count = int(family_payload["product_count"])

    return {
        "product_id": int(product.id),
        "product_family_id": int(product.product_family_id) if product.product_family_id else None,
        "family": family_payload,
        "family_product_count": count,
    }
