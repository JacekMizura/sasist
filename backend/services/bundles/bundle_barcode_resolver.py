"""P4.17 — Bundle barcode resolution (EAN, SKU, internal code, product EAN)."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Literal, Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ...models.bundle import Bundle
from ..bundle_operational_mode import ON_DEMAND_ASSEMBLY, STOCK_PRODUCTION, normalize_bundle_operational_mode
from ..location_stock_service import resolve_product_id

BundleBarcodeMatchKind = Literal[
    "product_ean",
    "bundle_ean",
    "bundle_sku",
    "bundle_internal_code",
]


@dataclass(frozen=True)
class BundleBarcodeMatch:
    match_kind: BundleBarcodeMatchKind
    barcode: str
    bundle_id: Optional[int] = None
    bundle_name: Optional[str] = None
    bundle_fulfillment_mode: Optional[str] = None
    product_id: Optional[int] = None
    linked_product_id: Optional[int] = None
    is_stock_logistic_sku: bool = False


def _normalize_barcode(raw: str) -> str:
    return "".join(str(raw or "").split()).strip()


def _bundle_internal_code(bundle: Bundle) -> str:
    meta_raw = getattr(bundle, "metadata_json", None)
    if meta_raw:
        try:
            meta = json.loads(meta_raw) if isinstance(meta_raw, str) else meta_raw
        except (json.JSONDecodeError, TypeError):
            meta = {}
        if isinstance(meta, dict):
            for key in ("internal_code", "bundle_code", "logistic_code"):
                val = meta.get(key)
                if val is not None and str(val).strip():
                    return str(val).strip()
    return f"BUNDLE-{int(bundle.id)}"


def _bundle_by_id_from_internal(db: Session, tenant_id: int, code: str) -> Optional[Bundle]:
    m = re.match(r"^(?:BUNDLE|BND)[\-_]?(?P<id>\d+)$", code, re.I)
    if not m:
        return None
    bid = int(m.group("id"))
    return (
        db.query(Bundle)
        .filter(
            Bundle.id == bid,
            Bundle.tenant_id == int(tenant_id),
            Bundle.deleted_at.is_(None),
        )
        .first()
    )


def _match_bundle_row(db: Session, tenant_id: int, needle: str) -> Optional[Bundle]:
    low = needle.lower()
    row = (
        db.query(Bundle)
        .filter(
            Bundle.tenant_id == int(tenant_id),
            Bundle.deleted_at.is_(None),
            Bundle.active.is_(True),
            or_(
                func.lower(func.trim(func.coalesce(Bundle.ean, ""))) == low,
                func.lower(func.trim(func.coalesce(Bundle.sku, ""))) == low,
            ),
        )
        .first()
    )
    if row is not None:
        return row
    for b in (
        db.query(Bundle)
        .filter(Bundle.tenant_id == int(tenant_id), Bundle.deleted_at.is_(None), Bundle.active.is_(True))
        .all()
    ):
        if _bundle_internal_code(b).lower() == low:
            return b
    return _bundle_by_id_from_internal(db, tenant_id, needle)


def _bundle_match_dto(b: Bundle, *, kind: BundleBarcodeMatchKind, barcode: str) -> BundleBarcodeMatch:
    mode = normalize_bundle_operational_mode(getattr(b, "bundle_fulfillment_mode", None) or ON_DEMAND_ASSEMBLY)
    linked = int(b.linked_product_id) if getattr(b, "linked_product_id", None) else None
    return BundleBarcodeMatch(
        match_kind=kind,
        barcode=barcode,
        bundle_id=int(b.id),
        bundle_name=str(b.name or ""),
        bundle_fulfillment_mode=mode,
        product_id=linked if mode == STOCK_PRODUCTION and linked else None,
        linked_product_id=linked,
        is_stock_logistic_sku=mode == STOCK_PRODUCTION,
    )


def resolve_bundle_barcode(db: Session, *, tenant_id: int, barcode: str) -> Optional[BundleBarcodeMatch]:
    """
    Resolve scanned code to product or bundle context.

    Priority: product EAN → bundle EAN → bundle SKU → internal code (BUNDLE-{id} / metadata).
    """
    key = _normalize_barcode(barcode)
    if not key:
        return None

    pid = resolve_product_id(db, tenant_id=int(tenant_id), ean=key)
    if pid is not None:
        stock_bundle = (
            db.query(Bundle)
            .filter(
                Bundle.tenant_id == int(tenant_id),
                Bundle.linked_product_id == int(pid),
                Bundle.deleted_at.is_(None),
                Bundle.active.is_(True),
                Bundle.bundle_fulfillment_mode == STOCK_PRODUCTION,
            )
            .first()
        )
        if stock_bundle is not None:
            return BundleBarcodeMatch(
                match_kind="product_ean",
                barcode=key,
                bundle_id=int(stock_bundle.id),
                bundle_name=str(stock_bundle.name or ""),
                bundle_fulfillment_mode=STOCK_PRODUCTION,
                product_id=int(pid),
                linked_product_id=int(pid),
                is_stock_logistic_sku=True,
            )
        return BundleBarcodeMatch(
            match_kind="product_ean",
            barcode=key,
            product_id=int(pid),
        )

    b = _match_bundle_row(db, int(tenant_id), key)
    if b is None:
        return None

    kind: BundleBarcodeMatchKind = "bundle_ean"
    ean = (b.ean or "").strip().lower()
    sku = (b.sku or "").strip().lower()
    if ean == key.lower():
        kind = "bundle_ean"
    elif sku == key.lower():
        kind = "bundle_sku"
    else:
        kind = "bundle_internal_code"
    return _bundle_match_dto(b, kind=kind, barcode=key)


def bundle_internal_code(bundle: Bundle) -> str:
    return _bundle_internal_code(bundle)
