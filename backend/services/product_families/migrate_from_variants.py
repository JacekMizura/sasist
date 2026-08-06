"""Idempotent migration: catalog VariantGroup → ProductFamily.

Maps axes→family attributes, values→attribute values, parent/child products →
family membership + product_attribute_values. Sets base_product_id from parent.
Does not delete Variant tables (Commit 7).
"""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, joinedload

from ...database import SessionLocal
from ...models.product import Product
from ...models.product_family import (
    FamilyAttribute,
    FamilyAttributeValue,
    ProductAttributeValue,
    ProductFamily,
)
from ...models.product_variant import ProductVariantSelection, VariantAxis, VariantGroup
from ...models.tenant import Tenant

logger = logging.getLogger(__name__)

MIGRATION_KEY = "variant_groups_to_product_families_v1"


def _ensure_migration_table(conn) -> None:
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS catalog_data_migrations (
                migration_key VARCHAR(128) NOT NULL PRIMARY KEY,
                applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                detail_json TEXT
            )
            """
        )
    )


def _is_applied(conn, key: str) -> bool:
    row = conn.execute(
        text("SELECT 1 FROM catalog_data_migrations WHERE migration_key = :k"),
        {"k": key},
    ).fetchone()
    return row is not None


def _mark_applied(conn, key: str, detail: str) -> None:
    conn.execute(
        text(
            """
            INSERT INTO catalog_data_migrations (migration_key, detail_json)
            VALUES (:k, :d)
            """
        ),
        {"k": key, "d": detail},
    )


def migrate_variants_to_families_for_tenant(db: Session, tenant_id: int) -> dict[str, Any]:
    """Migrate one tenant. Safe to re-run (skips already-linked products/families)."""
    groups = (
        db.query(VariantGroup)
        .options(joinedload(VariantGroup.axes).joinedload(VariantAxis.values))
        .filter(VariantGroup.tenant_id == tenant_id)
        .order_by(VariantGroup.id.asc())
        .all()
    )

    families_created = 0
    families_reused = 0
    products_linked = 0
    pav_created = 0
    bases_set = 0

    for group in groups:
        family = (
            db.query(ProductFamily)
            .options(joinedload(ProductFamily.attributes).joinedload(FamilyAttribute.values))
            .filter(ProductFamily.tenant_id == tenant_id, ProductFamily.name == group.name)
            .first()
        )
        if family is None:
            family = ProductFamily(
                tenant_id=tenant_id,
                name=group.name,
                is_active=bool(group.is_active),
            )
            db.add(family)
            db.flush()
            families_created += 1
        else:
            families_reused += 1

        axis_to_attr: dict[int, FamilyAttribute] = {}
        existing_attrs = {a.name.strip().casefold(): a for a in (family.attributes or [])}

        axes = sorted(list(group.axes or []), key=lambda a: (int(a.sort_order or 0), int(a.id or 0)))
        for ax in axes:
            key = (ax.name or "").strip().casefold()
            attr = existing_attrs.get(key)
            if attr is None:
                attr = FamilyAttribute(
                    tenant_id=tenant_id,
                    family_id=int(family.id),
                    name=ax.name,
                    sort_order=int(ax.sort_order or 0),
                    display_type=ax.display_type or "text",
                    show_in_filters=bool(ax.show_in_filters),
                    sort_alpha=bool(ax.sort_alpha),
                )
                db.add(attr)
                db.flush()
                existing_attrs[key] = attr
                family.attributes.append(attr)
            axis_to_attr[int(ax.id)] = attr

            existing_vals = {v.name.strip().casefold(): v for v in (attr.values or [])}
            for val in sorted(list(ax.values or []), key=lambda v: (int(v.sort_order or 0), int(v.id or 0))):
                vkey = (val.name or "").strip().casefold()
                if vkey in existing_vals:
                    continue
                fav = FamilyAttributeValue(
                    tenant_id=tenant_id,
                    attribute_id=int(attr.id),
                    name=val.name,
                    sort_order=int(val.sort_order or 0),
                    color_hex=val.color_hex,
                    image_url=val.image_url,
                )
                db.add(fav)
                attr.values.append(fav)
                existing_vals[vkey] = fav
            db.flush()

        value_id_map: dict[int, int] = {}
        for ax in axes:
            attr = axis_to_attr[int(ax.id)]
            by_name = {(v.name or "").strip().casefold(): int(v.id) for v in (attr.values or [])}
            for val in ax.values or []:
                mapped = by_name.get((val.name or "").strip().casefold())
                if mapped is not None:
                    value_id_map[int(val.id)] = mapped

        parents = (
            db.query(Product)
            .filter(
                Product.tenant_id == tenant_id,
                Product.variant_group_id == int(group.id),
                Product.deleted_at.is_(None),
            )
            .all()
        )
        parent_ids = {int(p.id) for p in parents}
        for parent in parents:
            if parent.product_family_id is None:
                parent.product_family_id = int(family.id)
                products_linked += 1
            if family.base_product_id is None and getattr(parent, "variant_parent_id", None) is None:
                family.base_product_id = int(parent.id)
                bases_set += 1

        children = (
            db.query(Product)
            .filter(
                Product.tenant_id == tenant_id,
                Product.variant_parent_id.in_(list(parent_ids) or [-1]),
                Product.deleted_at.is_(None),
            )
            .all()
            if parent_ids
            else []
        )
        for child in children:
            if child.product_family_id is None:
                child.product_family_id = int(family.id)
                products_linked += 1

            sels = (
                db.query(ProductVariantSelection)
                .filter(
                    ProductVariantSelection.tenant_id == tenant_id,
                    ProductVariantSelection.product_id == int(child.id),
                )
                .all()
            )
            for sel in sels:
                fav_id = value_id_map.get(int(sel.variant_value_id))
                if fav_id is None:
                    continue
                fav = db.query(FamilyAttributeValue).filter(FamilyAttributeValue.id == fav_id).first()
                if fav is None:
                    continue
                exists = (
                    db.query(ProductAttributeValue.id)
                    .filter(
                        ProductAttributeValue.product_id == int(child.id),
                        ProductAttributeValue.attribute_id == int(fav.attribute_id),
                    )
                    .first()
                )
                if exists:
                    continue
                db.add(
                    ProductAttributeValue(
                        tenant_id=tenant_id,
                        product_id=int(child.id),
                        attribute_id=int(fav.attribute_id),
                        value_id=int(fav.id),
                    )
                )
                pav_created += 1

        db.flush()

    return {
        "tenant_id": tenant_id,
        "groups": len(groups),
        "families_created": families_created,
        "families_reused": families_reused,
        "products_linked": products_linked,
        "attribute_values_created": pav_created,
        "bases_set": bases_set,
    }


def migrate_all_tenants_variants_to_families(db: Session) -> dict[str, Any]:
    tenant_ids = [int(t.id) for t in db.query(Tenant.id).order_by(Tenant.id.asc()).all()]
    results = [migrate_variants_to_families_for_tenant(db, tid) for tid in tenant_ids]
    return {
        "tenants": len(tenant_ids),
        "results": results,
        "families_created": sum(r["families_created"] for r in results),
        "products_linked": sum(r["products_linked"] for r in results),
        "attribute_values_created": sum(r["attribute_values_created"] for r in results),
    }


def ensure_variant_to_family_migration(engine: Engine) -> None:
    """One-shot at startup: migrate Variant → Family if not yet applied."""
    with engine.begin() as conn:
        _ensure_migration_table(conn)
        if _is_applied(conn, MIGRATION_KEY):
            logger.info("[product_families.migrate] skip already_applied key=%s", MIGRATION_KEY)
            return

    insp = inspect(engine)
    if "variant_groups" not in insp.get_table_names():
        with engine.begin() as conn:
            _ensure_migration_table(conn)
            if not _is_applied(conn, MIGRATION_KEY):
                _mark_applied(conn, MIGRATION_KEY, '{"skipped":"no_variant_groups_table"}')
        return

    db = SessionLocal()
    try:
        summary = migrate_all_tenants_variants_to_families(db)
        db.commit()
        with engine.begin() as conn:
            _ensure_migration_table(conn)
            if not _is_applied(conn, MIGRATION_KEY):
                _mark_applied(conn, MIGRATION_KEY, json.dumps(summary, default=str))
        logger.info("[product_families.migrate] applied key=%s summary=%s", MIGRATION_KEY, summary)
    except Exception:
        db.rollback()
        logger.exception("[product_families.migrate] failed")
        raise
    finally:
        db.close()
