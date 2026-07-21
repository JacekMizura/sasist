"""WMS warehouse carriers — CRUD, przesunięcia, logi."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Optional, Sequence, Tuple

from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models.app_user import AppUser
from ..models.inventory import Inventory
from ..models.location import Location
from ..models.product import Product
from ..models.warehouse import Warehouse
from ..models.inventory_serial import SERIAL_STATUS_ON_HAND, InventorySerial
from ..models.warehouse_carrier import (
    WarehouseCarrier,
    WarehouseCarrierGroup,
    WarehouseCarrierItem,
    WarehouseCarrierLog,
)
from .inventory_damage_trace_service import inventory_damage_trace_out
from .inventory_lot_keys import NO_EXPIRY_SENTINEL, expiry_for_api, normalize_batch_number
from ..schemas.wms_carriers import (
    WarehouseCarrierAddItemsBody,
    WarehouseCarrierBulkCreate,
    WarehouseCarrierBulkCreateResult,
    WarehouseCarrierCreate,
    WarehouseCarrierDetailRead,
    WarehouseCarrierGroupCreate,
    WarehouseCarrierGroupRead,
    WarehouseCarrierItemRead,
    WarehouseCarrierLogRead,
    WarehouseCarrierMoveBody,
    WarehouseCarrierPatch,
    WarehouseCarrierRead,
    WarehouseCarrierRemoveItemsBody,
    WarehouseCarrierScanOut,
)
from ..utils.carrier_barcode import generate_carrier_barcode
from .tenant_default_warehouse import list_tenant_warehouse_ids
from .wms_warehouse_ownership_service import sync_carrier_current_warehouse


_CARRIER_OP_LABELS: Dict[str, str] = {
    "CREATED": "Utworzenie nośnika",
    "PATCHED": "Edycja nośnika",
    "DELETED_SOFT": "Usunięcie nośnika",
    "MOVED": "Przesunięcie",
    "MOVED_EMPTY": "Przesunięcie (pusty)",
    "EMPTIED": "Opróżnienie",
    "ITEMS_ADDED": "Dodanie towaru",
    "ITEMS_REMOVED": "Usunięcie towaru",
    "BULK_CREATED": "Masowe utworzenie",
    "RECEIVING_ON_CARRIER": "Przyjęcie na nośnik",
    "PUTAWAY_MOVE": "Rozlokowanie",
}


def carrier_operation_label(operation_type: str) -> str:
    key = (operation_type or "").strip().upper()
    if not key:
        return "Operacja"
    return _CARRIER_OP_LABELS.get(key, key.replace("_", " ").title())


def _user_display_name(u: AppUser) -> str:
    parts = [getattr(u, "first_name", None) or "", getattr(u, "last_name", None) or ""]
    name = " ".join(p.strip() for p in parts if p and str(p).strip()).strip()
    if name:
        return name
    return (getattr(u, "login", None) or "").strip() or f"user#{u.id}"


def _log_carrier(
    db: Session,
    *,
    tenant_id: int,
    carrier_id: int,
    operation_type: str,
    user: AppUser,
    metadata: Optional[dict] = None,
) -> None:
    row = WarehouseCarrierLog(
        tenant_id=int(tenant_id),
        carrier_id=int(carrier_id),
        operation_type=str(operation_type)[:64],
        performed_by_user_id=int(user.id),
        performed_by_name=_user_display_name(user)[:256],
        metadata_json=json.dumps(metadata, separators=(",", ":")) if metadata else None,
        created_at=datetime.utcnow(),
    )
    db.add(row)


def log_carrier_operation(
    db: Session,
    *,
    tenant_id: int,
    carrier_id: int,
    operation_type: str,
    user: AppUser,
    metadata: Optional[dict] = None,
) -> None:
    _log_carrier(db, tenant_id=tenant_id, carrier_id=carrier_id, operation_type=operation_type, user=user, metadata=metadata)
    meta = metadata or {}
    pid = meta.get("product_id")
    qty = meta.get("quantity")
    wh_id = meta.get("warehouse_id")
    if pid is not None and qty is not None and wh_id is not None:
        try:
            from .warehouse_inventory_movement_service import record_carrier_relocation_movement

            record_carrier_relocation_movement(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(wh_id),
                product_id=int(pid),
                quantity=float(qty),
                performed_by=user,
                from_carrier_id=int(carrier_id),
                to_carrier_id=int(meta["to_carrier_id"]) if meta.get("to_carrier_id") is not None else None,
                to_location_id=int(meta["to_location_id"]) if meta.get("to_location_id") is not None else None,
                source_document_type=(meta.get("source_document_type") or None),
                source_document_id=int(meta["source_document_id"]) if meta.get("source_document_id") is not None else None,
                source_line_id=int(meta["source_line_id"]) if meta.get("source_line_id") is not None else None,
                lot_number=meta.get("lot_number"),
                expiry_date=meta.get("expiry_date"),
            )
        except Exception:
            import logging

            logging.getLogger(__name__).exception(
                "inventory movement for carrier op failed carrier_id=%s", carrier_id
            )


def _loc_code(db: Session, lid: Optional[int]) -> str:
    if lid is None:
        return ""
    loc = db.query(Location).filter(Location.id == int(lid)).first()
    return ((loc.name or "").strip() if loc else "") or f"#{lid}"


def _carrier_stats(db: Session, tenant_id: int, carrier_id: int) -> Tuple[int, float]:
    rows = (
        db.query(Inventory.product_id, func.coalesce(func.sum(Inventory.quantity), 0.0))
        .filter(Inventory.tenant_id == int(tenant_id), Inventory.carrier_id == int(carrier_id), Inventory.quantity > 1e-9)
        .group_by(Inventory.product_id)
        .all()
    )
    sku_count = len(rows)
    total = sum(float(q or 0) for _pid, q in rows)
    return int(sku_count), float(total)


def _sync_carrier_items_from_inventory(db: Session, tenant_id: int, carrier_id: int) -> None:
    """Utrzymuje manifest ``warehouse_carrier_items`` zgodnie z ``inventory`` (per partia / ważność)."""
    db.query(WarehouseCarrierItem).filter(WarehouseCarrierItem.carrier_id == int(carrier_id)).delete()
    sums = (
        db.query(
            func.min(Inventory.id).label("inv_id"),
            Inventory.product_id,
            Inventory.batch_number,
            Inventory.expiry_date,
            func.coalesce(func.sum(Inventory.quantity), 0.0).label("sqty"),
        )
        .filter(Inventory.tenant_id == int(tenant_id), Inventory.carrier_id == int(carrier_id), Inventory.quantity > 1e-9)
        .group_by(Inventory.product_id, Inventory.batch_number, Inventory.expiry_date)
        .all()
    )
    for row in sums:
        ed = getattr(row, "expiry_date", None)
        db.add(
            WarehouseCarrierItem(
                tenant_id=int(tenant_id),
                carrier_id=int(carrier_id),
                warehouse_stock_id=int(row.inv_id),
                product_id=int(row.product_id),
                batch_id=None,
                expiry_date=ed if ed is not None and ed < NO_EXPIRY_SENTINEL else None,
                quantity=float(row.sqty or 0),
                reserved_quantity=0.0,
                source_document_type=None,
                source_document_id=None,
                created_at=datetime.utcnow(),
            )
        )


def _product_media(p: Product) -> tuple[Optional[str], Optional[str]]:
    sku = (p.sku or "").strip() or None
    ean = (p.ean or "").strip() or None
    img = (getattr(p, "image_url", None) or "").strip() or None
    return sku, ean, img


def _carrier_items_from_inventory(db: Session, tenant_id: int, carrier_id: int) -> List[WarehouseCarrierItemRead]:
    """
    Pozycje nośnika z ``inventory`` + ``inventory_serials``.
    Klucz wiersza: product + batch + expiry + serial (bez scalania różnych partii).
    """
    tid = int(tenant_id)
    cid = int(carrier_id)
    items: List[WarehouseCarrierItemRead] = []
    synthetic_id = 0

    serial_rows = (
        db.query(InventorySerial, Product)
        .join(Product, Product.id == InventorySerial.product_id)
        .filter(
            InventorySerial.tenant_id == tid,
            InventorySerial.carrier_id == cid,
            InventorySerial.status == SERIAL_STATUS_ON_HAND,
        )
        .order_by(InventorySerial.product_id, InventorySerial.serial_number)
        .all()
    )
    serial_products: set[int] = set()
    for ser, p in serial_rows:
        serial_products.add(int(ser.product_id))
        synthetic_id += 1
        sku, ean, img = _product_media(p)
        bn = normalize_batch_number(getattr(ser, "batch_number", None))
        items.append(
            WarehouseCarrierItemRead(
                id=int(ser.id),
                product_id=int(ser.product_id),
                product_sku=sku,
                product_ean=ean,
                product_name=(p.name or "").strip() or None,
                product_image_url=img,
                batch_number=bn or None,
                expiry_date=expiry_for_api(getattr(ser, "expiry_date", None)),
                serial_number=(ser.serial_number or "").strip() or None,
                quantity=1.0,
                warehouse_stock_id=None,
            )
        )

    inv_rows = (
        db.query(Inventory, Product)
        .join(Product, Product.id == Inventory.product_id)
        .filter(Inventory.tenant_id == tid, Inventory.carrier_id == cid, Inventory.quantity > 1e-9)
        .order_by(Inventory.product_id, Inventory.batch_number, Inventory.expiry_date, Inventory.id)
        .all()
    )
    groups: dict[tuple[int, str, object, str, str | None], dict] = defaultdict(
        lambda: {"qty": 0.0, "inv_id": None, "p": None, "bn": "", "ed": NO_EXPIRY_SENTINEL, "trace": None}
    )
    for inv, p in inv_rows:
        pid = int(inv.product_id)
        if pid in serial_products and bool(getattr(p, "track_serial", False)):
            continue
        bn = normalize_batch_number(getattr(inv, "batch_number", None))
        ed = getattr(inv, "expiry_date", None) or NO_EXPIRY_SENTINEL
        sd = str(getattr(inv, "stock_disposition", None) or "SALEABLE").strip().upper()
        dmg = (getattr(inv, "damage_class", None) or "").strip().upper() or None
        key = (pid, bn, ed, sd, dmg)
        g = groups[key]
        g["qty"] += float(inv.quantity or 0)
        if g["inv_id"] is None:
            g["inv_id"] = int(inv.id)
            g["trace"] = inventory_damage_trace_out(db, inv)
        g["p"] = p
        g["bn"] = bn
        g["ed"] = ed

    for (pid, bn, ed, sd, dmg), g in sorted(groups.items(), key=lambda x: (x[0][0], x[0][1], str(x[0][2]), x[0][3], x[0][4] or "")):
        if g["qty"] <= 1e-9 or g["p"] is None:
            continue
        synthetic_id += 1
        p = g["p"]
        sku, ean, img = _product_media(p)
        row_id = int(g["inv_id"]) if g["inv_id"] is not None else synthetic_id
        trace = g.get("trace")
        items.append(
            WarehouseCarrierItemRead(
                id=row_id,
                product_id=pid,
                product_sku=sku,
                product_ean=ean,
                product_name=(p.name or "").strip() or None,
                product_image_url=img,
                batch_number=bn or None,
                expiry_date=expiry_for_api(ed if ed != NO_EXPIRY_SENTINEL else None),
                serial_number=None,
                quantity=float(g["qty"]),
                warehouse_stock_id=int(g["inv_id"]) if g["inv_id"] is not None else None,
                stock_disposition=trace.stock_disposition if trace else sd,
                disposition_badge=trace.disposition_badge if trace else None,
                damage_class=trace.damage_class if trace else dmg,
                damage_trace=trace,
            )
        )

    return items


def _update_mixed_flag(db: Session, tenant_id: int, carrier: WarehouseCarrier) -> None:
    sku_count, _ = _carrier_stats(db, tenant_id, int(carrier.id))
    carrier.is_mixed = bool(sku_count > 1)
    carrier.updated_at = datetime.utcnow()
    db.add(carrier)


def carrier_to_read(db: Session, c: WarehouseCarrier) -> WarehouseCarrierRead:
    sku_count, total_qty = _carrier_stats(db, int(c.tenant_id), int(c.id))
    gcode = None
    if c.carrier_group_id:
        g = db.query(WarehouseCarrierGroup).filter(WarehouseCarrierGroup.id == int(c.carrier_group_id)).first()
        gcode = (g.code or "").strip() if g else None
    wh_name: str | None = None
    if getattr(c, "current_warehouse_id", None):
        wh_row = db.query(Warehouse).filter(Warehouse.id == int(c.current_warehouse_id)).first()
        wh_name = (wh_row.name or "").strip() if wh_row else None
    return WarehouseCarrierRead(
        id=int(c.id),
        tenant_id=int(c.tenant_id),
        code=(c.code or "").strip(),
        barcode=(c.barcode or "").strip(),
        name=(c.name or "").strip() or None,
        carrier_group_id=int(c.carrier_group_id) if c.carrier_group_id else None,
        carrier_group_code=gcode,
        current_location_id=int(c.current_location_id) if c.current_location_id else None,
        current_location_code=_loc_code(db, c.current_location_id),
        current_warehouse_id=int(c.current_warehouse_id) if getattr(c, "current_warehouse_id", None) else None,
        current_warehouse_name=wh_name,
        status=str(c.status or "ACTIVE"),
        is_mixed=bool(getattr(c, "is_mixed", False)),
        weight=c.weight,
        width=c.width,
        height=c.height,
        depth=c.depth,
        notes=(c.notes or "").strip() or None,
        sku_count=sku_count,
        total_qty=total_qty,
        created_at=c.created_at,
        updated_at=c.updated_at,
        deleted_at=getattr(c, "deleted_at", None),
    )


def list_carrier_groups(db: Session, tenant_id: int) -> List[WarehouseCarrierGroupRead]:
    rows = db.query(WarehouseCarrierGroup).filter(WarehouseCarrierGroup.tenant_id == int(tenant_id)).order_by(WarehouseCarrierGroup.name).all()
    return [
        WarehouseCarrierGroupRead(
            id=int(r.id),
            tenant_id=int(r.tenant_id),
            name=(r.name or "").strip(),
            code=(r.code or "").strip(),
            color=r.color,
            default_weight=r.default_weight,
            default_width=r.default_width,
            default_height=r.default_height,
            default_depth=r.default_depth,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in rows
    ]


def create_carrier_group(db: Session, tenant_id: int, body: WarehouseCarrierGroupCreate, _user: AppUser) -> WarehouseCarrierGroupRead:
    row = WarehouseCarrierGroup(
        tenant_id=int(tenant_id),
        name=body.name.strip(),
        code=body.code.strip(),
        color=body.color,
        default_weight=body.default_weight,
        default_width=body.default_width,
        default_height=body.default_height,
        default_depth=body.default_depth,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.flush()
    db.commit()
    db.refresh(row)
    return WarehouseCarrierGroupRead(
        id=int(row.id),
        tenant_id=int(row.tenant_id),
        name=(row.name or "").strip(),
        code=(row.code or "").strip(),
        color=row.color,
        default_weight=row.default_weight,
        default_width=row.default_width,
        default_height=row.default_height,
        default_depth=row.default_depth,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def list_carriers(db: Session, tenant_id: int, *, include_deleted: bool = False) -> List[WarehouseCarrierRead]:
    q = db.query(WarehouseCarrier).filter(WarehouseCarrier.tenant_id == int(tenant_id))
    if not include_deleted:
        q = q.filter(WarehouseCarrier.deleted_at.is_(None))
    rows = q.order_by(WarehouseCarrier.updated_at.desc()).all()
    return [carrier_to_read(db, c) for c in rows]


def get_carrier(db: Session, tenant_id: int, carrier_id: int) -> WarehouseCarrierDetailRead:
    c = (
        db.query(WarehouseCarrier)
        .filter(WarehouseCarrier.id == int(carrier_id), WarehouseCarrier.tenant_id == int(tenant_id), WarehouseCarrier.deleted_at.is_(None))
        .first()
    )
    if not c:
        raise ValueError("Nie znaleziono nośnika")
    base = carrier_to_read(db, c).model_dump()
    items = _carrier_items_from_inventory(db, int(tenant_id), int(carrier_id))
    return WarehouseCarrierDetailRead(**base, items=items)


def find_carrier_by_scan_code(
    db: Session,
    tenant_id: int,
    barcode: str,
) -> Optional[WarehouseCarrier]:
    """
    Canonical WMS carrier scan resolver (SSOT).

    Matches ``barcode`` OR ``code`` (case-insensitive, trimmed).
    Used by ``/wms/carriers/scan`` and all operational flows that activate a carrier.
    """
    raw = (barcode or "").strip()
    if not raw:
        return None
    normalized = raw.upper()
    low = normalized.lower()
    return (
        db.query(WarehouseCarrier)
        .filter(
            WarehouseCarrier.tenant_id == int(tenant_id),
            WarehouseCarrier.deleted_at.is_(None),
            or_(
                func.lower(WarehouseCarrier.barcode) == low,
                func.lower(WarehouseCarrier.code) == low,
                WarehouseCarrier.barcode == raw,
                WarehouseCarrier.barcode == normalized,
            ),
        )
        .order_by(WarehouseCarrier.id.asc())
        .first()
    )


def scan_carrier_by_barcode(db: Session, tenant_id: int, barcode: str) -> WarehouseCarrierScanOut:
    c = find_carrier_by_scan_code(db, tenant_id, barcode)
    if not c:
        return WarehouseCarrierScanOut(found=False)
    return WarehouseCarrierScanOut(found=True, carrier=carrier_to_read(db, c))


def create_carrier(db: Session, tenant_id: int, body: WarehouseCarrierCreate, user: AppUser) -> WarehouseCarrierRead:
    bc = generate_carrier_barcode(db, int(tenant_id), prefix=body.barcode_prefix)
    code = (body.code or "").strip() or bc
    uid = int(user.id) if getattr(user, "id", None) is not None else None
    c = WarehouseCarrier(
        tenant_id=int(tenant_id),
        code=code[:64],
        barcode=bc[:96],
        name=(body.name or "").strip() or None,
        carrier_group_id=int(body.carrier_group_id) if body.carrier_group_id else None,
        current_location_id=int(body.current_location_id) if body.current_location_id else None,
        status=(body.status or "ACTIVE")[:24],
        is_mixed=False,
        weight=body.weight,
        width=body.width,
        height=body.height,
        depth=body.depth,
        notes=(body.notes or "").strip() or None,
        created_by_user_id=uid,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(c)
    db.flush()
    sync_carrier_current_warehouse(c, db)
    db.add(c)
    try:
        _log_carrier(
            db,
            tenant_id=int(tenant_id),
            carrier_id=int(c.id),
            operation_type="CREATED",
            user=user,
            metadata={"barcode": c.barcode},
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("Nie można utworzyć nośnika — konflikt zapisu (np. duplikat kodu kreskowego).") from exc
    db.refresh(c)
    return carrier_to_read(db, c)


def patch_carrier(db: Session, tenant_id: int, carrier_id: int, body: WarehouseCarrierPatch, user: AppUser) -> WarehouseCarrierRead:
    c = (
        db.query(WarehouseCarrier)
        .filter(WarehouseCarrier.id == int(carrier_id), WarehouseCarrier.tenant_id == int(tenant_id), WarehouseCarrier.deleted_at.is_(None))
        .first()
    )
    if not c:
        raise ValueError("Nie znaleziono nośnika")
    if body.name is not None:
        c.name = body.name.strip() or None
    if body.status is not None:
        c.status = body.status.strip()[:24]
    if body.current_location_id is not None:
        c.current_location_id = int(body.current_location_id)
        sync_carrier_current_warehouse(c, db, location_id=int(body.current_location_id))
    if body.carrier_group_id is not None:
        c.carrier_group_id = int(body.carrier_group_id)
    if body.weight is not None:
        c.weight = body.weight
    if body.width is not None:
        c.width = body.width
    if body.height is not None:
        c.height = body.height
    if body.depth is not None:
        c.depth = body.depth
    if body.notes is not None:
        c.notes = body.notes.strip() or None
    if body.is_mixed is not None:
        c.is_mixed = bool(body.is_mixed)
    c.updated_at = datetime.utcnow()
    db.add(c)
    _log_carrier(db, tenant_id=int(tenant_id), carrier_id=int(c.id), operation_type="PATCHED", user=user)
    db.commit()
    db.refresh(c)
    return carrier_to_read(db, c)


def soft_delete_carrier(db: Session, tenant_id: int, carrier_id: int, user: AppUser) -> None:
    c = (
        db.query(WarehouseCarrier)
        .filter(WarehouseCarrier.id == int(carrier_id), WarehouseCarrier.tenant_id == int(tenant_id), WarehouseCarrier.deleted_at.is_(None))
        .first()
    )
    if not c:
        raise ValueError("Nie znaleziono nośnika")
    _, tot = _carrier_stats(db, int(tenant_id), int(c.id))
    if tot > 1e-6:
        raise ValueError("Nie można usunąć nośnika ze stanem magazynowym — opróżnij lub przenieś towar")
    c.deleted_at = datetime.utcnow()
    c.updated_at = datetime.utcnow()
    db.add(c)
    _log_carrier(db, tenant_id=int(tenant_id), carrier_id=int(c.id), operation_type="DELETED_SOFT", user=user)
    db.commit()


def move_carrier(db: Session, tenant_id: int, carrier_id: int, body: WarehouseCarrierMoveBody, user: AppUser) -> WarehouseCarrierRead:
    c = (
        db.query(WarehouseCarrier)
        .filter(WarehouseCarrier.id == int(carrier_id), WarehouseCarrier.tenant_id == int(tenant_id), WarehouseCarrier.deleted_at.is_(None))
        .first()
    )
    if not c:
        raise ValueError("Nie znaleziono nośnika")
    loc = db.query(Location).filter(Location.id == int(body.to_location_id)).first()
    if not loc:
        raise ValueError("Lokalizacja docelowa nie istnieje")
    wh_ids = set(list_tenant_warehouse_ids(db, int(tenant_id)))
    if int(loc.warehouse_id) not in wh_ids:
        raise ValueError("Lokalizacja nie należy do magazynu tenanta")
    inv_rows = (
        db.query(Inventory)
        .filter(Inventory.tenant_id == int(tenant_id), Inventory.carrier_id == int(carrier_id), Inventory.quantity > 1e-9)
        .all()
    )
    if not inv_rows:
        c.current_location_id = int(body.to_location_id)
        sync_carrier_current_warehouse(c, db, location_id=int(body.to_location_id))
        c.updated_at = datetime.utcnow()
        db.add(c)
        _log_carrier(
            db,
            tenant_id=int(tenant_id),
            carrier_id=int(c.id),
            operation_type="MOVED_EMPTY",
            user=user,
            metadata={"to_location_id": int(body.to_location_id)},
        )
        db.commit()
        db.refresh(c)
        return carrier_to_read(db, c)
    wh_id = int(inv_rows[0].warehouse_id)
    if int(loc.warehouse_id) != wh_id:
        raise ValueError("Docelowy magazyn musi być ten sam co stan na nośniku")
    loc_uuid = (getattr(loc, "location_uuid", None) or "").strip() or None
    for inv in inv_rows:
        inv.location_id = int(body.to_location_id)
        if loc_uuid:
            inv.location_uuid = loc_uuid
        db.add(inv)
    c.current_location_id = int(body.to_location_id)
    sync_carrier_current_warehouse(c, db, location_id=int(body.to_location_id))
    c.updated_at = datetime.utcnow()
    db.add(c)
    _sync_carrier_items_from_inventory(db, int(tenant_id), int(c.id))
    _update_mixed_flag(db, int(tenant_id), c)
    _log_carrier(
        db,
        tenant_id=int(tenant_id),
        carrier_id=int(c.id),
        operation_type="MOVED",
        user=user,
        metadata={"to_location_id": int(body.to_location_id), "rows": len(inv_rows)},
    )
    db.commit()
    db.refresh(c)
    return carrier_to_read(db, c)


def empty_carrier(db: Session, tenant_id: int, carrier_id: int, user: AppUser) -> WarehouseCarrierRead:
    c = (
        db.query(WarehouseCarrier)
        .filter(WarehouseCarrier.id == int(carrier_id), WarehouseCarrier.tenant_id == int(tenant_id), WarehouseCarrier.deleted_at.is_(None))
        .first()
    )
    if not c:
        raise ValueError("Nie znaleziono nośnika")
    _, tot = _carrier_stats(db, int(tenant_id), int(c.id))
    if tot > 1e-6:
        raise ValueError("Nośnik nie jest pusty")
    db.query(WarehouseCarrierItem).filter(WarehouseCarrierItem.carrier_id == int(carrier_id)).delete()
    c.status = "EMPTY"
    c.updated_at = datetime.utcnow()
    db.add(c)
    _log_carrier(db, tenant_id=int(tenant_id), carrier_id=int(c.id), operation_type="EMPTIED", user=user)
    db.commit()
    db.refresh(c)
    return carrier_to_read(db, c)


def add_carrier_items(db: Session, tenant_id: int, carrier_id: int, body: WarehouseCarrierAddItemsBody, user: AppUser) -> WarehouseCarrierRead:
    """Rejestruje pozycje manifestu (bez przesuwania inventory — użyj receiving/putaway)."""
    c = (
        db.query(WarehouseCarrier)
        .filter(WarehouseCarrier.id == int(carrier_id), WarehouseCarrier.tenant_id == int(tenant_id), WarehouseCarrier.deleted_at.is_(None))
        .first()
    )
    if not c:
        raise ValueError("Nie znaleziono nośnika")
    for ln in body.lines:
        db.add(
            WarehouseCarrierItem(
                tenant_id=int(tenant_id),
                carrier_id=int(carrier_id),
                warehouse_stock_id=int(ln.warehouse_stock_id) if ln.warehouse_stock_id else None,
                product_id=int(ln.product_id),
                batch_id=None,
                expiry_date=None,
                quantity=float(ln.quantity),
                reserved_quantity=0.0,
                source_document_type="MANUAL",
                source_document_id=None,
                created_at=datetime.utcnow(),
            )
        )
    _update_mixed_flag(db, int(tenant_id), c)
    _log_carrier(db, tenant_id=int(tenant_id), carrier_id=int(c.id), operation_type="ITEMS_ADDED", user=user, metadata={"count": len(body.lines)})
    db.commit()
    db.refresh(c)
    return carrier_to_read(db, c)


def remove_carrier_items(db: Session, tenant_id: int, carrier_id: int, body: WarehouseCarrierRemoveItemsBody, user: AppUser) -> WarehouseCarrierRead:
    c = (
        db.query(WarehouseCarrier)
        .filter(WarehouseCarrier.id == int(carrier_id), WarehouseCarrier.tenant_id == int(tenant_id), WarehouseCarrier.deleted_at.is_(None))
        .first()
    )
    if not c:
        raise ValueError("Nie znaleziono nośnika")
    db.query(WarehouseCarrierItem).filter(
        WarehouseCarrierItem.carrier_id == int(carrier_id),
        WarehouseCarrierItem.id.in_([int(x) for x in body.item_ids]),
    ).delete(synchronize_session=False)
    _sync_carrier_items_from_inventory(db, int(tenant_id), int(c.id))
    _update_mixed_flag(db, int(tenant_id), c)
    _log_carrier(db, tenant_id=int(tenant_id), carrier_id=int(c.id), operation_type="ITEMS_REMOVED", user=user)
    db.commit()
    db.refresh(c)
    return carrier_to_read(db, c)


def list_carrier_logs(db: Session, tenant_id: int, carrier_id: int, limit: int = 100) -> List[WarehouseCarrierLogRead]:
    rows = (
        db.query(WarehouseCarrierLog)
        .filter(WarehouseCarrierLog.tenant_id == int(tenant_id), WarehouseCarrierLog.carrier_id == int(carrier_id))
        .order_by(WarehouseCarrierLog.created_at.desc())
        .limit(min(500, max(1, int(limit))))
        .all()
    )
    return [
        WarehouseCarrierLogRead(
            id=int(r.id),
            operation_type=str(r.operation_type or ""),
            operation_type_label=carrier_operation_label(str(r.operation_type or "")),
            performed_by_user_id=int(r.performed_by_user_id) if r.performed_by_user_id else None,
            performed_by_name=(r.performed_by_name or "").strip(),
            metadata_json=r.metadata_json,
            created_at=r.created_at,
        )
        for r in rows
    ]


def bulk_create_carriers(db: Session, tenant_id: int, body: WarehouseCarrierBulkCreate, user: AppUser) -> WarehouseCarrierBulkCreateResult:
    """Tworzy wiele nośników z rzędu; numeracja ``PREFIX-000001`` per tenant (``generate_carrier_barcode``)."""
    g = (
        db.query(WarehouseCarrierGroup)
        .filter(WarehouseCarrierGroup.id == int(body.group_id), WarehouseCarrierGroup.tenant_id == int(tenant_id))
        .first()
    )
    if not g:
        raise ValueError("Grupa nośników nie istnieje")
    loc_id = body.location_id
    if loc_id is not None:
        loc = db.query(Location).filter(Location.id == int(loc_id)).first()
        if not loc:
            raise ValueError("Lokalizacja nie istnieje")
        wh_ids = set(list_tenant_warehouse_ids(db, int(tenant_id)))
        if int(loc.warehouse_id) not in wh_ids:
            raise ValueError("Lokalizacja nie należy do magazynu tenanta")
    pfx = str(body.prefix).strip().upper()
    qty = int(body.quantity)
    init_status = (body.status or "ACTIVE").strip().upper()[:24] or "ACTIVE"
    batch_notes = (body.notes or "").strip() or None
    first_id = last_id = 0
    first_bc = last_bc = ""
    uid = int(user.id) if getattr(user, "id", None) is not None else None
    try:
        for i in range(qty):
            bc = generate_carrier_barcode(db, int(tenant_id), prefix=pfx)
            code = bc[:64]
            c = WarehouseCarrier(
                tenant_id=int(tenant_id),
                code=code,
                barcode=bc[:96],
                name=None,
                carrier_group_id=int(body.group_id),
                current_location_id=int(loc_id) if loc_id is not None else None,
                status=init_status,
                is_mixed=False,
                weight=None,
                width=None,
                height=None,
                depth=None,
                notes=batch_notes,
                created_by_user_id=uid,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            db.add(c)
            db.flush()
            if i == 0:
                first_id = int(c.id)
                first_bc = bc
            last_id = int(c.id)
            last_bc = bc
        _log_carrier(
            db,
            tenant_id=int(tenant_id),
            carrier_id=int(first_id),
            operation_type="BULK_CREATED",
            user=user,
            metadata={
                "created_count": qty,
                "first_barcode": first_bc,
                "last_barcode": last_bc,
                "carrier_group_id": int(body.group_id),
                "prefix": pfx,
            },
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("Nie można utworzyć partii nośników — konflikt zapisu (np. duplikat kodu).") from exc
    except Exception:
        db.rollback()
        raise
    return WarehouseCarrierBulkCreateResult(
        created_count=qty,
        first_barcode=first_bc,
        last_barcode=last_bc,
        first_id=first_id,
        last_id=last_id,
    )
