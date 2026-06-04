"""Inventory serial registry — one row per physical unit."""

from __future__ import annotations

from datetime import date
from typing import Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from ..models.inventory_serial import SERIAL_STATUS_ON_HAND, InventorySerial
from ..models.product import Product
from .inventory_lot_keys import NO_EXPIRY_SENTINEL, normalize_batch_number, storage_expiry_date


def normalize_serial_number(raw: str) -> str:
    return (raw or "").strip()


def serial_exists(db: Session, tenant_id: int, product_id: int, serial_number: str) -> bool:
    sn = normalize_serial_number(serial_number)
    if not sn:
        return False
    hit = (
        db.query(InventorySerial.id)
        .filter(
            InventorySerial.tenant_id == int(tenant_id),
            InventorySerial.product_id == int(product_id),
            InventorySerial.serial_number == sn,
        )
        .first()
    )
    return hit is not None


def register_serial_on_hand(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
    serial_number: str,
    batch_number: str,
    expiry_date: date,
    warehouse_id: Optional[int],
    location_id: Optional[int],
    carrier_id: Optional[int],
    stock_disposition: str,
    source_document_id: Optional[int],
    document_line_id: Optional[int],
    stock_operation_id: Optional[int] = None,
) -> InventorySerial:
    sn = normalize_serial_number(serial_number)
    if not sn:
        raise ValueError("Numer seryjny wymagany")
    if serial_exists(db, tenant_id, product_id, sn):
        raise ValueError("Numer seryjny już istnieje w magazynie.")
    row = InventorySerial(
        tenant_id=int(tenant_id),
        product_id=int(product_id),
        serial_number=sn,
        batch_number=normalize_batch_number(batch_number),
        expiry_date=expiry_date,
        status=SERIAL_STATUS_ON_HAND,
        stock_disposition=(stock_disposition or "SALEABLE").strip().upper() or "SALEABLE",
        warehouse_id=int(warehouse_id) if warehouse_id else None,
        location_id=int(location_id) if location_id else None,
        carrier_id=int(carrier_id) if carrier_id else None,
        source_document_id=int(source_document_id) if source_document_id else None,
        document_line_id=int(document_line_id) if document_line_id else None,
        stock_operation_id=int(stock_operation_id) if stock_operation_id else None,
    )
    db.add(row)
    db.flush()
    return row


def list_serials_for_document_lines(
    db: Session, line_ids: List[int]
) -> Dict[int, List[InventorySerial]]:
    if not line_ids:
        return {}
    rows = (
        db.query(InventorySerial)
        .filter(InventorySerial.document_line_id.in_([int(x) for x in line_ids]))
        .order_by(InventorySerial.serial_number.asc())
        .all()
    )
    out: Dict[int, List[InventorySerial]] = {}
    for r in rows:
        lid = int(r.document_line_id) if r.document_line_id is not None else 0
        if lid <= 0:
            continue
        out.setdefault(lid, []).append(r)
    return out


def serial_range_label(serials: List[InventorySerial]) -> Optional[str]:
    if not serials:
        return None
    nums = sorted({(s.serial_number or "").strip() for s in serials if (s.serial_number or "").strip()})
    if not nums:
        return None
    if len(nums) == 1:
        return nums[0]
    return f"{nums[0]} → {nums[-1]}"


def _serial_group_key(
    *,
    location_id: Optional[int],
    carrier_id: Optional[int],
    batch_number: str,
    expiry_date: date,
    stock_disposition: str,
) -> tuple:
    return (
        int(location_id) if location_id is not None else 0,
        int(carrier_id) if carrier_id is not None else 0,
        normalize_batch_number(batch_number),
        expiry_date,
        (stock_disposition or "SALEABLE").strip().upper() or "SALEABLE",
    )


def inventory_serials_table_exists(db: Session) -> bool:
    """True when ``inventory_serials`` exists (schema upgrade may not have run yet)."""
    try:
        bind = db.get_bind()
        if bind is None:
            return False
        from ..db.schema_introspection import has_table

        return has_table(bind, "inventory_serials")
    except Exception:
        return False


def list_on_hand_serial_groups_for_products(
    db: Session, product_ids: List[int]
) -> Dict[int, List[dict]]:
    """Group ON_HAND serials per product for product-card / inventory enrichment."""
    if not product_ids:
        return {}
    if not inventory_serials_table_exists(db):
        return {}
    rows = (
        db.query(InventorySerial)
        .filter(
            InventorySerial.product_id.in_([int(x) for x in product_ids]),
            InventorySerial.status == SERIAL_STATUS_ON_HAND,
        )
        .order_by(
            InventorySerial.product_id.asc(),
            InventorySerial.location_id.asc(),
            InventorySerial.serial_number.asc(),
        )
        .all()
    )
    grouped: Dict[int, Dict[tuple, List[InventorySerial]]] = {}
    for r in rows:
        pid = int(r.product_id)
        k = _serial_group_key(
            location_id=r.location_id,
            carrier_id=r.carrier_id,
            batch_number=r.batch_number or "",
            expiry_date=r.expiry_date or NO_EXPIRY_SENTINEL,
            stock_disposition=r.stock_disposition or "SALEABLE",
        )
        grouped.setdefault(pid, {}).setdefault(k, []).append(r)
    out: Dict[int, List[dict]] = {}
    for pid, buckets in grouped.items():
        items: List[dict] = []
        for _k, serials in buckets.items():
            nums = sorted({(s.serial_number or "").strip() for s in serials if (s.serial_number or "").strip()})
            if not nums:
                continue
            s0 = serials[0]
            ed = s0.expiry_date
            expiry_out: Optional[str]
            if isinstance(ed, date) and ed >= NO_EXPIRY_SENTINEL:
                expiry_out = None
            elif isinstance(ed, date):
                expiry_out = ed.isoformat()
            else:
                expiry_out = None
            items.append(
                {
                    "location_id": int(s0.location_id) if s0.location_id is not None else None,
                    "warehouse_id": int(s0.warehouse_id) if s0.warehouse_id is not None else None,
                    "warehouse_carrier_id": int(s0.carrier_id) if s0.carrier_id is not None else None,
                    "batch": normalize_batch_number(s0.batch_number) or None,
                    "expiry": expiry_out,
                    "stock_disposition": (s0.stock_disposition or "SALEABLE").strip().upper() or "SALEABLE",
                    "serial_numbers": nums,
                    "inventory_serial_ids": [int(s.id) for s in serials],
                    "serial_range_label": serial_range_label(serials),
                    "quantity": float(len(nums)),
                }
            )
        out[pid] = items
    return out


def lot_keys_from_product(
    product: Product,
    *,
    batch_number: Optional[str],
    expiry_date: Optional[date],
) -> tuple[str, date]:
    tb = bool(getattr(product, "track_batch", False))
    te = bool(getattr(product, "track_expiry", False))
    bn = "" if not tb else normalize_batch_number(batch_number)
    if tb and not bn:
        raise ValueError("Numer partii wymagany")
    if not te:
        ed = NO_EXPIRY_SENTINEL
    else:
        if expiry_date is None:
            raise ValueError("Data ważności wymagana")
        ed = storage_expiry_date(True, expiry_date)
        if ed >= NO_EXPIRY_SENTINEL:
            raise ValueError("Nieprawidłowa data ważności")
    return bn, ed
