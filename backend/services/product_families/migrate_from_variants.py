"""Idempotent Variant → Product Family migration (SQL; works after Variant ORM removal).

Runs before drop_catalog_product_variants_schema. Safe to re-run via migration key.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from ...database import SessionLocal
from ...models.product import Product
from ...models.product_family import (
    FamilyAttribute,
    FamilyAttributeValue,
    ProductAttributeValue,
    ProductFamily,
)
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


def _migrate_tenant_from_sql(db: Session, engine: Engine, tenant_id: int) -> dict[str, Any]:
    """Read legacy variant_* tables via SQL; write Product Family ORM rows."""
    insp = inspect(engine)
    if "variant_groups" not in insp.get_table_names():
        return {
            "tenant_id": tenant_id,
            "skipped": True,
            "reason": "no_variant_groups_table",
            "groups": 0,
            "families_created": 0,
            "families_reused": 0,
            "products_linked": 0,
            "attribute_values_created": 0,
            "bases_set": 0,
        }

    groups = db.execute(
        text(
            "SELECT id, name, is_active FROM variant_groups WHERE tenant_id = :tid ORDER BY id"
        ),
        {"tid": tenant_id},
    ).mappings().all()

    families_created = 0
    families_reused = 0
    products_linked = 0
    pav_created = 0
    bases_set = 0

    for group in groups:
        gid = int(group["id"])
        gname = group["name"]
        family = (
            db.query(ProductFamily)
            .filter(ProductFamily.tenant_id == tenant_id, ProductFamily.name == gname)
            .first()
        )
        if family is None:
            family = ProductFamily(
                tenant_id=tenant_id,
                name=gname,
                is_active=bool(group["is_active"]),
            )
            db.add(family)
            db.flush()
            families_created += 1
        else:
            families_reused += 1

        axes = db.execute(
            text(
                "SELECT id, name, sort_order, display_type, show_in_filters, sort_alpha "
                "FROM variant_axes WHERE group_id = :gid AND tenant_id = :tid ORDER BY sort_order, id"
            ),
            {"gid": gid, "tid": tenant_id},
        ).mappings().all()

        value_id_map: dict[int, int] = {}
        existing_attrs = {a.name.strip().casefold(): a for a in (family.attributes or [])}

        for ax in axes:
            key = (ax["name"] or "").strip().casefold()
            attr = existing_attrs.get(key)
            if attr is None:
                attr = FamilyAttribute(
                    tenant_id=tenant_id,
                    family_id=int(family.id),
                    name=ax["name"],
                    sort_order=int(ax["sort_order"] or 0),
                    display_type=ax["display_type"] or "text",
                    show_in_filters=bool(ax["show_in_filters"]),
                    sort_alpha=bool(ax["sort_alpha"]),
                )
                db.add(attr)
                db.flush()
                existing_attrs[key] = attr
                if family.attributes is not None:
                    family.attributes.append(attr)

            vals = db.execute(
                text(
                    "SELECT id, name, sort_order, color_hex, image_url "
                    "FROM variant_values WHERE axis_id = :aid AND tenant_id = :tid ORDER BY sort_order, id"
                ),
                {"aid": int(ax["id"]), "tid": tenant_id},
            ).mappings().all()
            existing_vals = {v.name.strip().casefold(): v for v in (attr.values or [])}
            for val in vals:
                vkey = (val["name"] or "").strip().casefold()
                fav = existing_vals.get(vkey)
                if fav is None:
                    fav = FamilyAttributeValue(
                        tenant_id=tenant_id,
                        attribute_id=int(attr.id),
                        name=val["name"],
                        sort_order=int(val["sort_order"] or 0),
                        color_hex=val["color_hex"],
                        image_url=val["image_url"],
                    )
                    db.add(fav)
                    db.flush()
                    existing_vals[vkey] = fav
                    if attr.values is not None:
                        attr.values.append(fav)
                value_id_map[int(val["id"])] = int(fav.id)

        parents = (
            db.query(Product)
            .filter(
                Product.tenant_id == tenant_id,
                Product.deleted_at.is_(None),
            )
            .all()
        )
        # Parents linked via legacy column if still present on SQLite row
        parent_ids: set[int] = set()
        for p in parents:
            raw = db.execute(
                text("SELECT variant_group_id, variant_parent_id FROM products WHERE id = :id"),
                {"id": int(p.id)},
            ).mappings().first()
            if not raw:
                continue
            if raw.get("variant_group_id") is not None and int(raw["variant_group_id"]) == gid:
                parent_ids.add(int(p.id))
                if p.product_family_id is None:
                    p.product_family_id = int(family.id)
                    products_linked += 1
                if family.base_product_id is None and raw.get("variant_parent_id") is None:
                    family.base_product_id = int(p.id)
                    bases_set += 1

        for p in parents:
            raw = db.execute(
                text("SELECT variant_parent_id FROM products WHERE id = :id"),
                {"id": int(p.id)},
            ).mappings().first()
            if not raw or raw.get("variant_parent_id") is None:
                continue
            if int(raw["variant_parent_id"]) not in parent_ids:
                continue
            if p.product_family_id is None:
                p.product_family_id = int(family.id)
                products_linked += 1
            sels = db.execute(
                text(
                    "SELECT variant_value_id FROM product_variant_selections "
                    "WHERE product_id = :pid AND tenant_id = :tid"
                ),
                {"pid": int(p.id), "tid": tenant_id},
            ).mappings().all()
            for sel in sels:
                fav_id = value_id_map.get(int(sel["variant_value_id"]))
                if fav_id is None:
                    continue
                fav = db.query(FamilyAttributeValue).filter(FamilyAttributeValue.id == fav_id).first()
                if fav is None:
                    continue
                exists = (
                    db.query(ProductAttributeValue.id)
                    .filter(
                        ProductAttributeValue.product_id == int(p.id),
                        ProductAttributeValue.attribute_id == int(fav.attribute_id),
                    )
                    .first()
                )
                if exists:
                    continue
                db.add(
                    ProductAttributeValue(
                        tenant_id=tenant_id,
                        product_id=int(p.id),
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


def migrate_variants_to_families_for_tenant(db: Session, tenant_id: int) -> dict[str, Any]:
    engine = db.get_bind()
    return _migrate_tenant_from_sql(db, engine, tenant_id)


def ensure_variant_to_family_migration(engine: Engine) -> None:
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
        tenant_ids = [int(t.id) for t in db.query(Tenant.id).order_by(Tenant.id.asc()).all()]
        results = [_migrate_tenant_from_sql(db, engine, tid) for tid in tenant_ids]
        summary = {
            "tenants": len(tenant_ids),
            "results": results,
            "families_created": sum(r.get("families_created", 0) for r in results),
            "products_linked": sum(r.get("products_linked", 0) for r in results),
            "attribute_values_created": sum(r.get("attribute_values_created", 0) for r in results),
        }
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
