"""Resolve scanned EAN to tenant product + default received quantity (unit / carton / extra barcode)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..models.product import Product
from ..models.product_barcode import ProductBarcode
from ..models.inventory_serial import InventorySerial
from ..schemas.wms_receiving import ReceivingScanResolveOut
from .gs1_parse import parse_gs1_scan, scan_looks_like_gs1
from .product_receiving_requirements import validate_required_product_data


def _normalize_ean(raw: str) -> str:
    return "".join(str(raw or "").split()).strip()


def _enrich_product_scan(out: ReceivingScanResolveOut, product: Product) -> ReceivingScanResolveOut:
    v = validate_required_product_data(product)
    out.requires_data_completion = bool(v.show_completion_modal)
    out.receiving_data_complete = bool(v.complete)
    out.missing_data_labels = list(v.badge_labels)
    return out


def _qty_from_carton_units(units) -> int:
    try:
        u = float(units)
    except (TypeError, ValueError):
        return 1
    if not u or u < 1:
        return 1
    return max(1, int(round(u)))


def resolve_receiving_scan(db: Session, tenant_id: int, ean_raw: str) -> ReceivingScanResolveOut:
    key = _normalize_ean(ean_raw)
    if not key:
        return ReceivingScanResolveOut(found=False)

    if scan_looks_like_gs1(key):
        gs1 = parse_gs1_scan(key)
        if gs1.gtin or gs1.serial_number:
            products = db.query(Product).filter(Product.tenant_id == tenant_id).all()
            for p in products:
                pe = _normalize_ean(p.ean)
                if gs1.gtin and pe and (pe == gs1.gtin or pe.endswith(gs1.gtin) or gs1.gtin.endswith(pe)):
                    return _enrich_product_scan(
                        ReceivingScanResolveOut(
                            found=True,
                            product_id=p.id,
                            default_quantity=1,
                            match_kind="gs1",
                            product_name=p.name,
                            product_ean=(p.ean or "").strip() or None,
                            image_url=p.image_url,
                            track_batch=bool(getattr(p, "track_batch", False)),
                            track_expiry=bool(getattr(p, "track_expiry", False)),
                            track_serial=bool(getattr(p, "track_serial", False)),
                            parsed_serial=gs1.serial_number,
                            parsed_batch=gs1.batch_number,
                            parsed_expiry=gs1.expiry_date,
                            is_gs1=True,
                        ),
                        p,
                    )

    sn_hit = (
        db.query(InventorySerial, Product)
        .join(Product, Product.id == InventorySerial.product_id)
        .filter(
            InventorySerial.tenant_id == int(tenant_id),
            InventorySerial.serial_number == key,
        )
        .first()
    )
    if sn_hit:
        ser, p = sn_hit
        return _enrich_product_scan(
            ReceivingScanResolveOut(
                found=True,
                product_id=p.id,
                default_quantity=1,
                match_kind="serial",
                product_name=p.name,
                product_ean=(p.ean or "").strip() or None,
                image_url=p.image_url,
                track_batch=bool(getattr(p, "track_batch", False)),
                track_expiry=bool(getattr(p, "track_expiry", False)),
                track_serial=True,
                parsed_serial=(ser.serial_number or "").strip() or None,
            ),
            p,
        )

    row = (
        db.query(ProductBarcode, Product)
        .join(Product, ProductBarcode.product_id == Product.id)
        .filter(Product.tenant_id == tenant_id, ProductBarcode.ean == key)
        .first()
    )
    if row:
        pb, p = row
        mult = pb.multiplier if pb.multiplier and pb.multiplier >= 1 else 1
        return _enrich_product_scan(
            ReceivingScanResolveOut(
                found=True,
                product_id=p.id,
                default_quantity=int(mult),
                match_kind="product_barcode",
                product_name=p.name,
                product_ean=(p.ean or "").strip() or None,
                image_url=p.image_url,
                track_batch=bool(getattr(p, "track_batch", False)),
                track_expiry=bool(getattr(p, "track_expiry", False)),
                track_serial=bool(getattr(p, "track_serial", False)),
            ),
            p,
        )

    products = db.query(Product).filter(Product.tenant_id == tenant_id).all()
    for p in products:
        if p.bulk_ean and _normalize_ean(p.bulk_ean) == key:
            return _enrich_product_scan(
                ReceivingScanResolveOut(
                    found=True,
                    product_id=p.id,
                    default_quantity=_qty_from_carton_units(p.units_per_carton),
                    match_kind="bulk_ean",
                    product_name=p.name,
                    product_ean=(p.ean or "").strip() or None,
                    image_url=p.image_url,
                    track_batch=bool(getattr(p, "track_batch", False)),
                    track_expiry=bool(getattr(p, "track_expiry", False)),
                    track_serial=bool(getattr(p, "track_serial", False)),
                ),
                p,
            )
    for p in products:
        if _normalize_ean(p.ean) == key:
            return _enrich_product_scan(
                ReceivingScanResolveOut(
                    found=True,
                    product_id=p.id,
                    default_quantity=1,
                    match_kind="product_ean",
                    product_name=p.name,
                    product_ean=(p.ean or "").strip() or None,
                    image_url=p.image_url,
                    track_batch=bool(getattr(p, "track_batch", False)),
                    track_expiry=bool(getattr(p, "track_expiry", False)),
                    track_serial=bool(getattr(p, "track_serial", False)),
                ),
                p,
            )

    return ReceivingScanResolveOut(found=False)
