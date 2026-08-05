"""
Convert assortment entities: product ↔ bundle.

Creates the target entity with shared commercial fields, archives the source
(soft-delete). Composition lines are not invented — converted bundles start
empty so the operator can define components on the bundle card.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session, joinedload

from ..models.bundle import Bundle
from ..models.product import Product


class AssortmentConvertError(Exception):
    def __init__(self, message: str, *, code: str = "convert_error"):
        super().__init__(message)
        self.message = message
        self.code = code


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _cm_to_mm(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    if not (n > 0):
        return None
    return n * 10.0


def _mm_to_cm(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    if not (n > 0):
        return None
    return n / 10.0


def _merge_meta(raw: Optional[str], patch: dict) -> str:
    data: dict = {}
    if raw and str(raw).strip():
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                data = parsed
        except Exception:
            data = {}
    data.update(patch)
    return json.dumps(data, ensure_ascii=False)


def convert_product_to_bundle(db: Session, tenant_id: int, product_id: int) -> Bundle:
    product = (
        db.query(Product)
        .filter(Product.id == product_id, Product.tenant_id == tenant_id, Product.deleted_at.is_(None))
        .first()
    )
    if product is None:
        raise AssortmentConvertError("Nie znaleziono produktu.", code="product_not_found")

    name = (product.name or "").strip() or f"Produkt #{product.id}"
    sku = (getattr(product, "sku", None) or product.symbol or "").strip() or None
    ean = (product.ean or "").strip() or None
    sale = float(product.sale_price) if product.sale_price is not None else None
    packaging = float(getattr(product, "extra_cost_packaging_net", 0) or 0)
    image = (product.image_url or "").strip() or None

    # Free unique EAN on product before transferring to bundle.
    if ean:
        product.ean = None

    bundle = Bundle(
        tenant_id=tenant_id,
        name=name,
        sku=sku,
        ean=ean,
        sale_price=sale,
        extra_cost_packaging_net=packaging,
        production_cost_net=0,
        active=True,
        image_url=image,
        length_mm=_cm_to_mm(product.length),
        width_mm=_cm_to_mm(product.width),
        height_mm=_cm_to_mm(product.height),
        weight_kg=float(product.weight) if product.weight is not None else None,
        metadata_json=_merge_meta(
            getattr(product, "metadata_json", None),
            {
                "converted_from_product_id": int(product.id),
                "converted_at": _now().isoformat(timespec="seconds"),
            },
        ),
        fulfillment_mode="assembly",
        stock_mode="virtual",
        bundle_fulfillment_mode="ON_DEMAND_ASSEMBLY",
    )
    db.add(bundle)
    db.flush()

    product.deleted_at = _now()
    product.metadata_json = _merge_meta(
        getattr(product, "metadata_json", None),
        {
            "converted_to_bundle_id": int(bundle.id),
            "converted_at": _now().isoformat(timespec="seconds"),
        },
    )
    db.flush()
    return bundle


def convert_bundle_to_product(db: Session, tenant_id: int, bundle_id: int) -> Product:
    bundle = (
        db.query(Bundle)
        .options(joinedload(Bundle.items))
        .filter(Bundle.id == bundle_id, Bundle.tenant_id == tenant_id)
        .first()
    )
    if bundle is None or getattr(bundle, "deleted_at", None) is not None:
        raise AssortmentConvertError("Nie znaleziono zestawu.", code="bundle_not_found")

    # Prefer existing linked product when present and still active.
    linked_id = getattr(bundle, "linked_product_id", None)
    if linked_id is not None:
        linked = (
            db.query(Product)
            .filter(Product.id == int(linked_id), Product.tenant_id == tenant_id)
            .first()
        )
        if linked is not None:
            if linked.deleted_at is not None:
                linked.deleted_at = None
            # Archive bundle; keep linked product as the commercial entity.
            if bundle.ean:
                # Ensure EAN lives on product if missing
                if not (linked.ean or "").strip():
                    linked.ean = bundle.ean
                bundle.ean = None
            bundle.deleted_at = _now()
            bundle.metadata_json = _merge_meta(
                getattr(bundle, "metadata_json", None),
                {
                    "converted_to_product_id": int(linked.id),
                    "converted_at": _now().isoformat(timespec="seconds"),
                },
            )
            linked.metadata_json = _merge_meta(
                getattr(linked, "metadata_json", None),
                {
                    "converted_from_bundle_id": int(bundle.id),
                    "converted_at": _now().isoformat(timespec="seconds"),
                },
            )
            db.flush()
            return linked

    name = (bundle.name or "").strip() or f"Zestaw #{bundle.id}"
    sku = (bundle.sku or "").strip() or None
    ean = (bundle.ean or "").strip() or None
    if ean:
        bundle.ean = None

    product = Product(
        tenant_id=tenant_id,
        name=name,
        sku=sku,
        symbol=sku,
        ean=ean,
        sale_price=bundle.sale_price,
        extra_cost_packaging_net=float(getattr(bundle, "extra_cost_packaging_net", 0) or 0),
        image_url=(bundle.image_url or "").strip() or None,
        length=_mm_to_cm(getattr(bundle, "length_mm", None)),
        width=_mm_to_cm(getattr(bundle, "width_mm", None)),
        height=_mm_to_cm(getattr(bundle, "height_mm", None)),
        weight=float(bundle.weight_kg) if getattr(bundle, "weight_kg", None) is not None else None,
        metadata_json=_merge_meta(
            getattr(bundle, "metadata_json", None),
            {
                "converted_from_bundle_id": int(bundle.id),
                "converted_at": _now().isoformat(timespec="seconds"),
            },
        ),
    )
    db.add(product)
    db.flush()

    # Drop components — they belong to archived bundle only.
    for it in list(bundle.items or []):
        db.delete(it)

    bundle.deleted_at = _now()
    bundle.linked_product_id = None
    bundle.metadata_json = _merge_meta(
        getattr(bundle, "metadata_json", None),
        {
            "converted_to_product_id": int(product.id),
            "converted_at": _now().isoformat(timespec="seconds"),
        },
    )
    db.flush()
    return product
