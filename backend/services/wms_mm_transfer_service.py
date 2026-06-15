"""WMS internal transfer (MM): MOVE_OUT + MOVE_IN stock_operations and inventory deltas (no blind overwrites)."""

from __future__ import annotations

import math
from datetime import datetime
from typing import List, Optional, Tuple

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..models.app_user import AppUser
from ..models.inventory import Inventory
from ..models.location import Location
from ..models.product import Product
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.stock_operation import StockOperation, STOCK_OP_MOVE_IN, STOCK_OP_MOVE_OUT
from ..schemas.wms_mm_transfer import (
    WmsMmCreateTransferBody,
    WmsMmLocationInventoryRow,
    WmsMmResolveLocationOut,
)
from .inventory_lot_keys import NO_EXPIRY_SENTINEL, normalize_batch_number
from .stock_disposition import normalize_stock_disposition
from .stock_document_service import build_stock_document_read
from .tenant_default_warehouse import list_tenant_warehouse_ids
from .warehouse_product_operation_log_service import record_warehouse_product_operation
from .wms_mm_internal_placeholder import get_or_create_mm_placeholder_fks


def _normalize_location_uuid(value: object) -> Optional[str]:
    if not isinstance(value, str):
        return None
    v = value.strip()
    if not v or v.lower() == "null":
        return None
    return v


def _assert_warehouse_for_tenant(db: Session, tenant_id: int, warehouse_id: int) -> None:
    allowed = set(list_tenant_warehouse_ids(db, tenant_id))
    if int(warehouse_id) not in allowed:
        raise ValueError("Magazyn nie jest przypisany do tenanta")


def resolve_mm_location_scan(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    code: str,
) -> WmsMmResolveLocationOut:
    raw = (code or "").strip()
    if not raw:
        return WmsMmResolveLocationOut(found=False)
    up = raw.upper()
    if up.startswith("LOC-") or up.startswith("LOC_"):
        raw = raw[4:].strip()
    if not raw:
        return WmsMmResolveLocationOut(found=False)
    _assert_warehouse_for_tenant(db, tenant_id, warehouse_id)
    raw_lower = raw.lower()
    loc = (
        db.query(Location)
        .filter(
            Location.warehouse_id == int(warehouse_id),
            or_(
                func.lower(Location.name) == raw_lower,
                Location.location_uuid == raw,
            ),
        )
        .first()
    )
    if not loc:
        return WmsMmResolveLocationOut(found=False)
    ln = (loc.name or "").strip()
    return WmsMmResolveLocationOut(found=True, location_id=int(loc.id), location_name=ln or f"#{loc.id}")


def list_mm_location_inventory(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    location_id: int,
) -> List[WmsMmLocationInventoryRow]:
    _assert_warehouse_for_tenant(db, tenant_id, warehouse_id)
    loc = (
        db.query(Location)
        .filter(Location.id == int(location_id), Location.warehouse_id == int(warehouse_id))
        .first()
    )
    if not loc:
        raise ValueError("Lokalizacja nie należy do tego magazynu")

    sums = (
        db.query(Inventory.product_id, func.sum(Inventory.quantity).label("qty"))
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.location_id == int(location_id),
        )
        .group_by(Inventory.product_id)
        .having(func.sum(Inventory.quantity) > 1e-9)
        .all()
    )
    if not sums:
        return []
    pids = [int(r[0]) for r in sums]
    prod_by_id = {p.id: p for p in db.query(Product).filter(Product.id.in_(pids)).all()}
    out: List[WmsMmLocationInventoryRow] = []
    for pid, qty in sums:
        p = prod_by_id.get(int(pid))
        upc = float(p.units_per_carton) if p and p.units_per_carton is not None else None
        if upc is not None and (not math.isfinite(upc) or upc < 1):
            upc = None
        out.append(
            WmsMmLocationInventoryRow(
                product_id=int(pid),
                product_name=(p.name or "").strip() if p else "",
                product_ean=(p.ean or "").strip() if p and p.ean else None,
                product_sku=(p.sku or "").strip() if p and p.sku else None,
                product_image_url=(p.image_url or "").strip() if p and p.image_url else None,
                quantity_total=float(qty or 0),
                track_batch=bool(p.track_batch) if p else False,
                track_expiry=bool(p.track_expiry) if p else False,
                units_per_carton=upc,
            )
        )
    out.sort(key=lambda r: (r.product_name.lower(), r.product_id))
    return out


def _allocate_fifo_from_source(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    from_location_id: int,
    product_id: int,
    qty: float,
) -> List[Tuple[Inventory, float]]:
    rows = (
        db.query(Inventory)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.location_id == int(from_location_id),
            Inventory.product_id == int(product_id),
            Inventory.quantity > 1e-9,
            Inventory.carrier_id.is_(None),
        )
        .order_by(Inventory.expiry_date.asc(), Inventory.id.asc())
        .all()
    )
    total = sum(float(r.quantity or 0) for r in rows)
    if total + 1e-9 < qty:
        raise ValueError("Brak wystarczającej ilości w lokalizacji źródłowej")
    remaining = qty
    alloc: List[Tuple[Inventory, float]] = []
    for inv in rows:
        if remaining <= 1e-9:
            break
        avail = float(inv.quantity or 0)
        if avail <= 1e-9:
            continue
        take = min(avail, remaining)
        alloc.append((inv, take))
        remaining -= take
    return alloc


def create_wms_mm_transfer(
    db: Session,
    tenant_id: int,
    body: WmsMmCreateTransferBody,
    *,
    performed_by: AppUser,
    movement_type: str = "MANUAL_MM",
    replenishment_task_id: int | None = None,
):
    wh_id = int(body.warehouse_id)
    from_id = int(body.from_location_id)
    to_id = int(body.to_location_id)
    pid = int(body.product_id)
    qty = float(body.quantity)

    if from_id == to_id:
        raise ValueError("Lokalizacja docelowa musi być inna niż źródłowa")
    if not math.isfinite(qty) or qty <= 1e-9:
        raise ValueError("Nieprawidłowa ilość")

    _assert_warehouse_for_tenant(db, int(tenant_id), wh_id)
    loc_from = db.query(Location).filter(Location.id == from_id, Location.warehouse_id == wh_id).first()
    loc_to = db.query(Location).filter(Location.id == to_id, Location.warehouse_id == wh_id).first()
    if not loc_from or not loc_to:
        raise ValueError("Lokalizacja nie należy do wskazanego magazynu")

    prod = db.query(Product).filter(Product.id == pid).first()
    if not prod:
        raise ValueError("Produkt nie istnieje")

    allocations = _allocate_fifo_from_source(db, tenant_id, wh_id, from_id, pid, qty)
    sid, did = get_or_create_mm_placeholder_fks(db, tenant_id, wh_id)
    now = datetime.utcnow()

    doc = StockDocument(
        tenant_id=int(tenant_id),
        document_type="MM",
        supplier_id=sid,
        delivery_id=did,
        warehouse_id=wh_id,
        source_warehouse_id=wh_id,
        destination_warehouse_id=wh_id,
        location_id=None,
        mm_from_location_id=from_id,
        mm_to_location_id=to_id,
        status="zakonczone",
        receiving_status="DONE",
        putaway_status="DONE",
        relocation_status="DONE",
        created_at=now,
        updated_at=now,
    )
    db.add(doc)
    db.flush()

    loc_uuid_to = _normalize_location_uuid(getattr(loc_to, "location_uuid", None))

    for inv, take in allocations:
        bn = normalize_batch_number(getattr(inv, "batch_number", None))
        ed_store = getattr(inv, "expiry_date", None) or NO_EXPIRY_SENTINEL
        exp_op = None if ed_store >= NO_EXPIRY_SENTINEL else ed_store
        bn_op = bn if bn else None
        sd_op = normalize_stock_disposition(getattr(inv, "stock_disposition", None))

        line = StockDocumentItem(
            document_id=int(doc.id),
            delivery_item_id=None,
            product_id=pid,
            ordered_quantity=take,
            received_quantity=take,
            quantity_putaway=take,
            quantity=take,
            purchase_price_net=None,
            vat_rate=23.0,
            batch_number=bn,
            expiry_date=ed_store,
            stock_disposition=sd_op,
        )
        db.add(line)
        db.flush()

        inv.quantity = float(inv.quantity or 0) - take
        if float(inv.quantity or 0) <= 1e-9:
            db.delete(inv)

        inv_to = (
            db.query(Inventory)
            .filter(
                Inventory.tenant_id == int(tenant_id),
                Inventory.product_id == pid,
                Inventory.warehouse_id == wh_id,
                Inventory.location_id == to_id,
                Inventory.batch_number == bn,
                Inventory.expiry_date == ed_store,
                Inventory.stock_disposition == sd_op,
                Inventory.carrier_id.is_(None),
            )
            .first()
        )
        if inv_to:
            inv_to.quantity = float(inv_to.quantity or 0) + take
            inv_to.location_uuid = loc_uuid_to
        else:
            db.add(
                Inventory(
                    tenant_id=int(tenant_id),
                    product_id=pid,
                    warehouse_id=wh_id,
                    location_id=to_id,
                    location_uuid=loc_uuid_to,
                    quantity=take,
                    batch_number=bn,
                    expiry_date=ed_store,
                    stock_disposition=sd_op,
                )
            )

        lid_from = int(from_id)
        lid_to = int(to_id)
        db.add(
            StockOperation(
                document_id=int(doc.id),
                document_line_id=int(line.id),
                product_id=pid,
                location_id=lid_from,
                qty=take,
                type=STOCK_OP_MOVE_OUT,
                batch=bn_op,
                expiry_date=exp_op,
                stock_disposition=sd_op,
            )
        )
        db.add(
            StockOperation(
                document_id=int(doc.id),
                document_line_id=int(line.id),
                product_id=pid,
                location_id=lid_to,
                qty=take,
                type=STOCK_OP_MOVE_IN,
                batch=bn_op,
                expiry_date=exp_op,
                stock_disposition=sd_op,
            )
        )

    doc.updated_at = datetime.utcnow()
    ref_doc = f"MM-{int(doc.id)}"
    record_warehouse_product_operation(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=wh_id,
        product_id=pid,
        movement_type=str(movement_type),
        source_location_id=from_id,
        target_location_id=to_id,
        quantity=qty,
        performed_by=performed_by,
        reference_document=ref_doc,
        stock_document_id=int(doc.id),
        replenishment_task_id=replenishment_task_id,
        packaging_type=str(getattr(body, "packaging_type", None) or "UNIT"),
        packaging_quantity=getattr(body, "packaging_quantity", None),
        wms_mode=getattr(body, "wms_mode", None),
    )
    db.commit()
    db.refresh(doc)
    return build_stock_document_read(db, doc)
