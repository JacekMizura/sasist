"""Draft PZ: move received quantity to storage bins (inventory) and track putaway per line × location."""

from __future__ import annotations

import math
from datetime import datetime
from typing import List, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.stock_operation import STOCK_OP_MOVE_IN, STOCK_OP_MOVE_OUT, STOCK_OP_PUTAWAY, StockOperation

from ..models.app_user import AppUser
from ..models.inventory import Inventory
from ..models.location import Location
from ..models.product import Product
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.stock_item_location import StockItemLocation
from ..models.warehouse_carrier import WarehouseCarrier
from ..schemas.stock_document import StockDocumentRead
from ..schemas.wms_receiving import WmsReceivingPzListRow
from ..schemas.wms_putaway import (
    WmsPutawayCarrierBulkBody,
    WmsPutawayCarrierBulkOut,
    WmsPutawayInventorySnapshotRow,
    WmsPutawayLocationSuggestionRow,
    WmsPutawayLocationSuggestionsOut,
    WmsPutawayPatchBody,
    WmsPutawayPatchLocationRow,
    WmsPutawayPatchOut,
    WmsPutawaySuggestLocationOut,
)
from .inventory_carrier_ops import (
    upsert_dock_inventory_for_carrier_receipt,
    upsert_dock_inventory_for_loose_receipt,
)
from .inventory_lot_keys import NO_EXPIRY_SENTINEL, dock_lot_keys_for_pz_line, normalize_batch_number
from .stock_disposition import normalize_stock_disposition, stock_disposition_for_document_line
from .location_badge import batch_location_storage_types, wms_location_badge_kind
from .warehouse_product_operation_log_service import record_warehouse_product_operation
from .wms_carrier_service import _sync_carrier_items_from_inventory, log_carrier_operation
from .wms_mm_transfer_service import _allocate_fifo_from_source
from .stock_document_service import (
    MAX_RECEIVED_QUANTITY,
    build_stock_document_read,
    doc_allows_wms_putaway,
    ensure_pz_document_warehouse_resolved,
    is_stock_document_item_wm_material,
    maybe_auto_assign_single_warehouse_on_pz,
    recompute_putaway_status_for_document,
    recalculate_wms_document_completion,
    wms_putaway_queue_statuses,
    _putaway_allocations_by_line_id,
)
from .document_creator_service import batch_load_app_users
from .wms_receiving_service import build_wms_pz_list_row


def _stamp_putaway_line_last_audit(
    row: StockDocumentItem,
    loc: Location,
    *,
    performed_by: AppUser,
    quantity_increment: float,
) -> None:
    """Persist who/when/qty for last putaway (survives relogin and other users)."""
    row.putaway_updated_at = datetime.utcnow()
    ln = (loc.name or "").strip()
    row.putaway_last_location_name = ln or None
    row.putaway_last_location_type = wms_location_badge_kind(loc)
    row.putaway_last_admin_id = int(performed_by.id)
    row.putaway_last_quantity = float(quantity_increment)
from .purchase_order_warehouse_sync_service import sync_purchase_order_status_for_stock_document_id
from .slotting import recalculate_location_occupancy, suggest_putaway_locations as slotting_suggest_putaway_locations, validate_putaway_assignment
from .slotting.capacity_service import calculate_location_capacity, location_volume_capacity_dm3
from .slotting.slotting_models import STRATEGY_CONSOLIDATE_SKU


def _sync_po_from_pz(db: Session, tenant_id: int, doc_id: int) -> None:
    sync_purchase_order_status_for_stock_document_id(db, tenant_id, doc_id)


def _load_draft_mm_docs_with_lines(
    db: Session, tenant_id: int, *, extra_filters: tuple = ()
) -> tuple[List[StockDocument], dict[int, list[StockDocumentItem]]]:
    q = db.query(StockDocument).filter(
        StockDocument.tenant_id == tenant_id,
        StockDocument.document_type == "MM",
        StockDocument.status == "draft",
    )
    for f in extra_filters:
        q = q.filter(f)
    docs = q.order_by(StockDocument.created_at.desc()).all()
    if not docs:
        return [], {}
    dids = [d.id for d in docs]
    items = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id.in_(dids))
        .order_by(StockDocumentItem.id)
        .all()
    )
    by_doc: dict[int, list[StockDocumentItem]] = {}
    for it in items:
        by_doc.setdefault(it.document_id, []).append(it)
    return docs, by_doc


def _load_putaway_pz_docs_with_lines(
    db: Session, tenant_id: int, *, extra_filters: tuple = ()
) -> tuple[List[StockDocument], dict[int, list[StockDocumentItem]]]:
    """
    WMS putaway queue for PZ (live during receiving):
    - receiving started (IN_PROGRESS or DONE), not waiting for „Zakończ przyjęcie”,
    - at least one line with received_quantity > 0 (filtered when building list rows),
    - relocation not finalized (OPEN),
    - putaway not fully closed on document (NOT_STARTED / IN_PROGRESS / DONE until relocation ends).
    Includes office-accepted posted PZ, draft PZ from WMS receiving, and Z-PZ (OPEN/CLOSED).
    """
    q = db.query(StockDocument).filter(
        StockDocument.tenant_id == tenant_id,
        StockDocument.document_type.in_(("PZ", "Z_PZ", "PZ_RT", "RETURN_RECEIPT")),
        StockDocument.receiving_status.in_(("IN_PROGRESS", "DONE")),
        StockDocument.putaway_status.in_(("NOT_STARTED", "IN_PROGRESS", "DONE")),
        StockDocument.relocation_status != "DONE",
        StockDocument.status.in_(wms_putaway_queue_statuses()),
    )
    for f in extra_filters:
        q = q.filter(f)
    docs = q.order_by(StockDocument.updated_at.desc(), StockDocument.id.desc()).all()
    if not docs:
        return [], {}
    dids = [d.id for d in docs]
    items = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id.in_(dids))
        .order_by(StockDocumentItem.id)
        .all()
    )
    by_doc: dict[int, list[StockDocumentItem]] = {}
    for it in items:
        by_doc.setdefault(it.document_id, []).append(it)
    return docs, by_doc


def _doc_allows_putaway(doc: StockDocument) -> bool:
    return doc_allows_wms_putaway(doc)


def _normalize_location_uuid(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    v = value.strip()
    if not v or v.lower() == "null":
        return None
    return v


def _sum_putaway_operations(db: Session, item_id: int) -> float:
    v = (
        db.query(func.coalesce(func.sum(StockOperation.qty), 0.0))
        .filter(
            StockOperation.document_line_id == item_id,
            StockOperation.type == STOCK_OP_PUTAWAY,
        )
        .scalar()
    )
    return float(v or 0)


def _effective_putaway_quantity(db: Session, row: StockDocumentItem) -> float:
    """Prefer SUM(PUTAWAY operations); fallback to quantity_putaway column (legacy)."""
    sum_ops = _sum_putaway_operations(db, row.id)
    col_put = float(getattr(row, "quantity_putaway", 0) or 0)
    return sum_ops if sum_ops > 1e-9 else col_put


def _document_line_putaway_remaining(db: Session, row: StockDocumentItem) -> float:
    """Remaining qty to put away — document line is SSOT for PZ / Z-PZ / PZ_RT."""
    rec = float(row.received_quantity or 0)
    if rec <= 1e-9:
        return 0.0
    return max(0.0, rec - _effective_putaway_quantity(db, row))


_PUTAWAY_QTY_EPS = 1e-5


def sync_dock_inventory_from_document_line(
    db: Session,
    *,
    tenant_id: int,
    doc: StockDocument,
    line: StockDocumentItem,
    quantity: float,
    from_carrier_id: int | None = None,
) -> None:
    """
    Materialize receiving-dock inventory from document line truth.
    Used when receipt posted received_quantity without dock Inventory (Z-PZ finalize, complaint receipt).
    """
    dock_id = getattr(doc, "location_id", None)
    wh_id = int(getattr(doc, "warehouse_id", 0) or 0)
    if dock_id is None or wh_id <= 0 or getattr(line, "product_id", None) is None:
        return
    if quantity <= _PUTAWAY_QTY_EPS:
        return
    bn, ed_store = dock_lot_keys_for_pz_line(line)
    sd = stock_disposition_for_document_line(line)
    if from_carrier_id is not None:
        upsert_dock_inventory_for_carrier_receipt(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=wh_id,
            location_id=int(dock_id),
            product_id=int(line.product_id),
            carrier_id=int(from_carrier_id),
            add_qty=float(quantity),
            batch_number=bn,
            expiry_date=ed_store,
            stock_disposition=sd,
        )
    else:
        upsert_dock_inventory_for_loose_receipt(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=wh_id,
            location_id=int(dock_id),
            product_id=int(line.product_id),
            add_qty=float(quantity),
            batch_number=bn,
            expiry_date=ed_store,
            stock_disposition=sd,
        )


def _sum_dock_inventory(
    db: Session,
    *,
    tenant_id: int,
    row: StockDocumentItem,
    doc: StockDocument,
    dock_id: int,
    bn: str,
    ed_store,
    sd: str,
    from_carrier_id: int | None,
) -> float:
    src_q = db.query(Inventory).filter(
        Inventory.tenant_id == tenant_id,
        Inventory.product_id == row.product_id,
        Inventory.warehouse_id == doc.warehouse_id,
        Inventory.location_id == int(dock_id),
        Inventory.batch_number == bn,
        Inventory.expiry_date == ed_store,
        Inventory.stock_disposition == sd,
        Inventory.quantity > 1e-9,
    )
    if from_carrier_id is not None:
        src_q = src_q.filter(Inventory.carrier_id == int(from_carrier_id))
    else:
        src_q = src_q.filter(Inventory.carrier_id.is_(None))
    return sum(float(x.quantity or 0) for x in src_q.all())


def _ensure_dock_inventory_for_putaway(
    db: Session,
    *,
    tenant_id: int,
    row: StockDocumentItem,
    doc: StockDocument,
    dock_id: int,
    quantity: float,
    from_carrier_id: int | None,
    bn: str,
    ed_store,
    sd: str,
) -> None:
    """
    Align dock inventory with the PZ line (source of truth for putaway availability).
    Backfills the receiving dock when stock was posted on the line but not on inventory.
    """
    line_remaining = _document_line_putaway_remaining(db, row)
    if quantity > line_remaining + _PUTAWAY_QTY_EPS:
        raise ValueError("Przekroczono pozostałą ilość do rozlokowania na tej pozycji PZ")
    avail = _sum_dock_inventory(
        db,
        tenant_id=tenant_id,
        row=row,
        doc=doc,
        dock_id=dock_id,
        bn=bn,
        ed_store=ed_store,
        sd=sd,
        from_carrier_id=from_carrier_id,
    )
    if avail + _PUTAWAY_QTY_EPS >= quantity:
        return
    shortfall = quantity - avail
    if shortfall > line_remaining + _PUTAWAY_QTY_EPS:
        shortfall = line_remaining
    if shortfall <= _PUTAWAY_QTY_EPS:
        return
    sync_dock_inventory_from_document_line(
        db,
        tenant_id=int(tenant_id),
        doc=doc,
        line=row,
        quantity=float(shortfall),
        from_carrier_id=from_carrier_id,
    )
    db.flush()


def _transfer_from_dock_to_location(
    db: Session,
    *,
    tenant_id: int,
    row: StockDocumentItem,
    doc: StockDocument,
    dock_id: int,
    target_location_id: int,
    loc_uuid: str | None,
    quantity: float,
    from_carrier_id: int | None,
    to_carrier_id: int | None,
    bn: str | None,
    ed_store,
    sd: str,
) -> None:
    """Pobór z lokacji przyjęcia PZ → zapis w lokacji docelowej (opcjonalnie zmiana nośnika)."""
    remaining = float(quantity)
    src_q = db.query(Inventory).filter(
        Inventory.tenant_id == tenant_id,
        Inventory.product_id == row.product_id,
        Inventory.warehouse_id == doc.warehouse_id,
        Inventory.location_id == int(dock_id),
        Inventory.batch_number == bn,
        Inventory.expiry_date == ed_store,
        Inventory.stock_disposition == sd,
        Inventory.quantity > 1e-9,
    )
    if from_carrier_id is not None:
        src_q = src_q.filter(Inventory.carrier_id == int(from_carrier_id))
    else:
        src_q = src_q.filter(Inventory.carrier_id.is_(None))
    src_rows = src_q.order_by(Inventory.expiry_date.asc(), Inventory.id.asc()).all()
    tot = sum(float(x.quantity or 0) for x in src_rows)
    if tot + _PUTAWAY_QTY_EPS < remaining:
        line_remaining = _document_line_putaway_remaining(db, row)
        if line_remaining + _PUTAWAY_QTY_EPS < remaining:
            raise ValueError("Przekroczono pozostałą ilość do rozlokowania na tej pozycji PZ")
        # Document line still has qty to put away — materialize dock stock from line truth, then retry.
        _ensure_dock_inventory_for_putaway(
            db,
            tenant_id=tenant_id,
            row=row,
            doc=doc,
            dock_id=int(dock_id),
            quantity=float(remaining),
            from_carrier_id=from_carrier_id,
            bn=bn,
            ed_store=ed_store,
            sd=sd,
        )
        src_rows = src_q.order_by(Inventory.expiry_date.asc(), Inventory.id.asc()).all()
        tot = sum(float(x.quantity or 0) for x in src_rows)
    if tot + _PUTAWAY_QTY_EPS < remaining:
        hint_parts: list[str] = []
        if (bn or "").strip():
            hint_parts.append(f"partia {(bn or '').strip()}")
        if ed_store is not None and ed_store < NO_EXPIRY_SENTINEL:
            hint_parts.append(f"ważność {ed_store.isoformat()}")
        hint = f" ({', '.join(hint_parts)})" if hint_parts else ""
        if from_carrier_id is not None:
            raise ValueError(f"Brak wystarczającej ilości na nośniku w lokacji przyjęcia{hint}")
        raise ValueError(f"Brak wystarczającej ilości w lokacji przyjęcia{hint}")
    for inv in src_rows:
        if remaining <= 1e-9:
            break
        avail = float(inv.quantity or 0)
        if avail <= 1e-9:
            continue
        take = min(avail, remaining)
        inv.quantity = float(inv.quantity or 0) - take
        if float(inv.quantity or 0) <= 1e-9:
            db.delete(inv)
        else:
            db.add(inv)
        dest_q = db.query(Inventory).filter(
            Inventory.tenant_id == tenant_id,
            Inventory.product_id == row.product_id,
            Inventory.warehouse_id == doc.warehouse_id,
            Inventory.location_id == int(target_location_id),
            Inventory.batch_number == bn,
            Inventory.expiry_date == ed_store,
            Inventory.stock_disposition == sd,
        )
        if to_carrier_id is not None:
            dest_q = dest_q.filter(Inventory.carrier_id == int(to_carrier_id))
        else:
            dest_q = dest_q.filter(Inventory.carrier_id.is_(None))
        inv_to = dest_q.first()
        if inv_to:
            inv_to.quantity = float(inv_to.quantity or 0) + take
            inv_to.location_uuid = loc_uuid
            db.add(inv_to)
        else:
            db.add(
                Inventory(
                    tenant_id=tenant_id,
                    product_id=row.product_id,
                    warehouse_id=doc.warehouse_id,
                    location_id=int(target_location_id),
                    carrier_id=int(to_carrier_id) if to_carrier_id is not None else None,
                    location_uuid=loc_uuid,
                    quantity=take,
                    batch_number=bn,
                    expiry_date=ed_store,
                    stock_disposition=sd,
                )
            )
        remaining -= take


def _putaway_locations_for_response(
    db: Session, item_id: int, warehouse_id: int | None
) -> Tuple[float, List[WmsPutawayPatchLocationRow]]:
    agg = (
        db.query(StockOperation.location_id, func.sum(StockOperation.qty).label("sqty"))
        .filter(
            StockOperation.document_line_id == item_id,
            StockOperation.type == STOCK_OP_PUTAWAY,
            StockOperation.location_id.isnot(None),
        )
        .group_by(StockOperation.location_id)
        .order_by(StockOperation.location_id)
        .all()
    )
    lid_list = [int(r[0]) for r in agg if r[0] is not None]
    loc_by_id: dict[int, Location] = {}
    if lid_list:
        for loc in db.query(Location).filter(Location.id.in_(lid_list)).all():
            loc_by_id[int(loc.id)] = loc
    st_by_lid = batch_location_storage_types(db, warehouse_id, list(loc_by_id.values()))
    out: List[WmsPutawayPatchLocationRow] = []
    total = 0.0
    for lid_raw, sqty in agg:
        if lid_raw is None:
            continue
        q = float(sqty or 0)
        if q <= 1e-9:
            continue
        lid = int(lid_raw)
        loc = loc_by_id.get(lid)
        code = (loc.name or "").strip() or f"#{lid}" if loc else f"#{lid}"
        zn = (getattr(loc, "rack_name", None) or "").strip() or None if loc else None
        ct = (getattr(loc, "type", None) or "").strip().lower() or None if loc else None
        total += q
        out.append(
            WmsPutawayPatchLocationRow(
                location_id=lid,
                code=code,
                quantity=q,
                location_type=wms_location_badge_kind(loc) if loc else "PICK",
                storage_type=st_by_lid.get(lid, "unknown"),
                zone=zn,
                capacity_type=ct,
            )
        )
    return total, out


def migrate_sil_to_stock_operations(db: Session) -> None:
    """One-time: copy legacy stock_item_locations into append-only PUTAWAY operations."""
    op_n = db.query(StockOperation).limit(1).first()
    if op_n is not None:
        return
    sil_rows = db.query(StockItemLocation).all()
    if not sil_rows:
        return
    for sil in sil_rows:
        item = db.get(StockDocumentItem, sil.stock_document_item_id)
        if not item:
            continue
        if item.product_id is None:
            continue
        bn = (getattr(item, "batch_number", None) or "").strip() or None
        ed = getattr(item, "expiry_date", None)
        sd = stock_disposition_for_document_line(item)
        db.add(
            StockOperation(
                document_id=item.document_id,
                document_line_id=item.id,
                product_id=item.product_id,
                location_id=sil.location_id,
                qty=float(sil.quantity or 0),
                type=STOCK_OP_PUTAWAY,
                batch=bn,
                expiry_date=ed,
                stock_disposition=sd,
            )
        )
    db.flush()
    line_ids = {sil.stock_document_item_id for sil in sil_rows}
    for lid in line_ids:
        sdi = db.get(StockDocumentItem, lid)
        if sdi:
            sdi.quantity_putaway = _sum_putaway_operations(db, int(lid))
    db.commit()


def backfill_stock_item_locations_if_needed(db: Session) -> None:
    """
    For draft PZ lines with quantity_putaway > 0 and no PUTAWAY operations yet,
    seed operations from inventory inference (scaled to quantity_putaway), or from PZ receiving location.
    Syncs quantity_putaway to SUM(operations) after insert.
    """
    items = (
        db.query(StockDocumentItem)
        .join(StockDocument, StockDocument.id == StockDocumentItem.document_id)
        .filter(
            StockDocument.status == "draft",
            StockDocument.document_type.in_(("PZ", "Z_PZ", "PZ_RT", "RETURN_RECEIPT")),
            StockDocumentItem.quantity_putaway > 1e-6,
        )
        .all()
    )
    changed = False
    for row in items:
        has_any = (
            db.query(StockOperation.id)
            .filter(
                StockOperation.document_line_id == row.id,
                StockOperation.type == STOCK_OP_PUTAWAY,
            )
            .first()
        )
        if has_any:
            continue
        doc = db.get(StockDocument, row.document_id)
        if not doc or doc.warehouse_id is None:
            continue
        if row.product_id is None:
            continue
        prod_by_id = {p.id: p for p in db.query(Product).filter(Product.id == row.product_id).all()}
        alloc_by_id = _putaway_allocations_by_line_id(
            db, doc.tenant_id, doc.warehouse_id, [row], prod_by_id
        )
        allocs = alloc_by_id.get(row.id, [])
        target = float(row.quantity_putaway or 0)
        inserted = False
        sum_alloc = sum(float(a.quantity) for a in allocs)
        bn = (getattr(row, "batch_number", None) or "").strip() or None
        ed = getattr(row, "expiry_date", None)
        sd_line = stock_disposition_for_document_line(row)
        if sum_alloc > 1e-9:
            scale = target / sum_alloc
            for a in allocs:
                q = float(a.quantity) * scale
                if q <= 1e-9:
                    continue
                db.add(
                    StockOperation(
                        document_id=doc.id,
                        document_line_id=row.id,
                        product_id=row.product_id,
                        location_id=a.location_id,
                        qty=q,
                        type=STOCK_OP_PUTAWAY,
                        batch=bn,
                        expiry_date=ed,
                        stock_disposition=sd_line,
                    )
                )
                inserted = True
        if not inserted and target > 1e-9 and doc.location_id is not None:
            db.add(
                StockOperation(
                    document_id=doc.id,
                    document_line_id=row.id,
                    product_id=row.product_id,
                    location_id=doc.location_id,
                    qty=target,
                    type=STOCK_OP_PUTAWAY,
                    batch=bn,
                    expiry_date=ed,
                    stock_disposition=sd_line,
                )
            )
            inserted = True
        if inserted:
            changed = True
            db.flush()
            row.quantity_putaway = _sum_putaway_operations(db, row.id)
    if changed:
        db.commit()


def list_wms_putaway_pz_documents(db: Session, tenant_id: int) -> List[WmsReceivingPzListRow]:
    """PZ ready for putaway: any received qty (live) + relocation OPEN. MM drafts use /wms/mm/relocation."""
    from .complaints.complaint_physical_receipt import document_has_putaway_eligible_received_lines

    pz_docs, pz_by = _load_putaway_pz_docs_with_lines(db, tenant_id)
    merged: List[tuple[StockDocument, List[StockDocumentItem]]] = []
    for d in pz_docs:
        lines = pz_by.get(d.id) or []
        if document_has_putaway_eligible_received_lines(db, lines):
            merged.append((d, lines))
    merged.sort(
        key=lambda t: getattr(t[0], "updated_at", None) or datetime.min,
        reverse=True,
    )
    creator_ids = {
        int(d.created_by_user_id)
        for d, _lines in merged
        if getattr(d, "created_by_user_id", None) is not None
    }
    users_by_id = batch_load_app_users(db, creator_ids)
    return [
        build_wms_pz_list_row(db, d, lines, users_by_id=users_by_id)
        for d, lines in merged
    ]


def suggest_putaway_location(db: Session, tenant_id: int, item_id: int) -> WmsPutawaySuggestLocationOut:
    row = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).first()
    if not row:
        raise ValueError("Pozycja PZ nie znaleziona")
    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == row.document_id, StockDocument.tenant_id == tenant_id)
        .first()
    )
    if not doc:
        raise ValueError("Dokument nie znaleziony")
    if not _doc_allows_putaway(doc):
        raise ValueError(
            "Rozlokowanie dostępne dla PZ (draft/posted), Z-PZ (open/closed) oraz MM (draft)"
        )
    if str(getattr(doc, "relocation_status", "") or "").strip().upper() == "DONE":
        raise ValueError("Rozlokowanie zakończone dla tej PZ")
    if float(row.received_quantity or 0) <= 1e-9:
        return WmsPutawaySuggestLocationOut(source="none")
    if is_stock_document_item_wm_material(row):
        return WmsPutawaySuggestLocationOut(source="none")
    from .complaints.complaint_physical_receipt import stock_document_item_requires_putaway

    if not stock_document_item_requires_putaway(row, db=db):
        return WmsPutawaySuggestLocationOut(source="none")

    mm_skip_source: set[int] = set()
    if str(doc.document_type or "") == "MM":
        mm_src = getattr(row, "mm_line_from_location_id", None)
        if mm_src is None:
            return WmsPutawaySuggestLocationOut(source="none")
        mm_skip_source.add(int(mm_src))
    else:
        if maybe_auto_assign_single_warehouse_on_pz(db, doc):
            _sync_po_from_pz(db, tenant_id, doc.id)
            db.commit()
            db.refresh(doc)
    wh_id = doc.warehouse_id
    if wh_id is None:
        return WmsPutawaySuggestLocationOut(source="none")

    bn, ed_store = dock_lot_keys_for_pz_line(row)

    def _loc_name(lid: int) -> str:
        loc = db.query(Location).filter(Location.id == lid).first()
        return (loc.name or "").strip() if loc else ""

    def _first_inventory_loc(rows: List[tuple], skip: set[int]) -> int | None:
        rows = sorted(rows, key=lambda r: -float(r[1] or 0))
        for lid_raw, sqty in rows:
            if float(sqty or 0) <= 1e-9:
                continue
            lid = int(lid_raw)
            if lid in skip:
                continue
            return lid
        return None

    # 1) Same product + lot: location with highest qty
    g1 = (
        db.query(Inventory.location_id, func.coalesce(func.sum(Inventory.quantity), 0))
        .filter(
            Inventory.tenant_id == tenant_id,
            Inventory.warehouse_id == wh_id,
            Inventory.product_id == row.product_id,
            Inventory.batch_number == bn,
            Inventory.expiry_date == ed_store,
        )
        .group_by(Inventory.location_id)
        .all()
    )
    lid = _first_inventory_loc(g1, mm_skip_source)
    if lid is not None:
        return WmsPutawaySuggestLocationOut(
            location_id=lid,
            location_name=_loc_name(lid) or f"#{lid}",
            source="existing_stock_lot",
        )

    # 2) Same product, any lot
    g2 = (
        db.query(Inventory.location_id, func.coalesce(func.sum(Inventory.quantity), 0))
        .filter(
            Inventory.tenant_id == tenant_id,
            Inventory.warehouse_id == wh_id,
            Inventory.product_id == row.product_id,
        )
        .group_by(Inventory.location_id)
        .all()
    )
    lid = _first_inventory_loc(g2, mm_skip_source)
    if lid is not None:
        return WmsPutawaySuggestLocationOut(
            location_id=lid,
            location_name=_loc_name(lid) or f"#{lid}",
            source="existing_stock",
        )

    # 3) First active warehouse location (prefer not the receiving dock)
    dock_id = doc.location_id
    locs = (
        db.query(Location)
        .filter(Location.warehouse_id == wh_id, Location.is_active.is_(True))
        .order_by(Location.id)
        .all()
    )
    for loc in locs:
        if dock_id is not None and loc.id == dock_id:
            continue
        if loc.id in mm_skip_source:
            continue
        return WmsPutawaySuggestLocationOut(
            location_id=loc.id,
            location_name=(loc.name or "").strip() or f"#{loc.id}",
            source="first_location",
        )
    if locs:
        for loc in locs:
            if loc.id in mm_skip_source:
                continue
            return WmsPutawaySuggestLocationOut(
                location_id=loc.id,
                location_name=(loc.name or "").strip() or f"#{loc.id}",
                source="first_location",
            )
    return WmsPutawaySuggestLocationOut(source="none")


def _location_is_overflow_storage(loc: Location) -> bool:
    t = (getattr(loc, "type", None) or "pick").strip().lower()
    return t in ("reserve", "floor")


def _suggestion_row_from_location(
    loc: Location,
    *,
    current_quantity: float,
    priority_score: float,
    storage_type: str,
    max_fit_quantity: float | None = None,
    remaining_capacity_percent: float | None = None,
    same_sku_present: bool = False,
    reason_tags: list[str] | None = None,
    capacity_fits: bool = True,
    capacity_warnings: list[str] | None = None,
) -> WmsPutawayLocationSuggestionRow:
    code = (loc.name or "").strip() or f"#{loc.id}"
    zone = (getattr(loc, "rack_name", None) or "").strip() or None
    total_vol = location_volume_capacity_dm3(loc)
    occ_vol = float(getattr(loc, "occupied_volume_dm3", 0) or 0)
    free_cap = max(0.0, total_vol - occ_vol) if total_vol > 0 else None
    return WmsPutawayLocationSuggestionRow(
        location_id=int(loc.id),
        code=code,
        current_quantity=float(current_quantity),
        free_capacity=free_cap,
        warehouse_zone=zone,
        priority_score=float(priority_score),
        location_type=wms_location_badge_kind(loc),
        storage_type=storage_type,
        max_fit_quantity=max_fit_quantity,
        remaining_capacity_percent=remaining_capacity_percent,
        same_sku_present=same_sku_present,
        reason_tags=list(reason_tags or []),
        capacity_fits=capacity_fits,
        capacity_warnings=list(capacity_warnings or []),
    )


def _putaway_remaining_quantity(db: Session, row: StockDocumentItem) -> float:
    rec = float(row.received_quantity or 0)
    if rec <= 1e-9:
        return 0.0
    put_eff = _effective_putaway_quantity(db, row)
    return max(0.0, rec - put_eff)


def _capacity_warnings_for_fit(fit) -> list[str]:
    warnings: list[str] = []
    if fit.failure_reason:
        warnings.append(fit.failure_reason)
    if fit.limiting_factor == "orientation":
        warnings.append("Orientation incompatible")
    if fit.limiting_factor == "stacking":
        warnings.append("Stacking restrictions apply")
    return warnings


def suggest_putaway_locations(db: Session, tenant_id: int, item_id: int) -> WmsPutawayLocationSuggestionsOut:
    """Warehouse-oriented location lists for putaway step 2 (no client-side ranking)."""
    row = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).first()
    if not row:
        raise ValueError("Pozycja PZ nie znaleziona")
    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == row.document_id, StockDocument.tenant_id == tenant_id)
        .first()
    )
    if not doc:
        raise ValueError("Dokument nie znaleziony")
    if not _doc_allows_putaway(doc):
        raise ValueError(
            "Rozlokowanie dostępne dla PZ (draft/posted), Z-PZ (open/closed) oraz MM (draft)"
        )
    if str(getattr(doc, "relocation_status", "") or "").strip().upper() == "DONE":
        raise ValueError("Rozlokowanie zakończone dla tej PZ")
    if float(row.received_quantity or 0) <= 1e-9 or row.product_id is None:
        return WmsPutawayLocationSuggestionsOut()
    if is_stock_document_item_wm_material(row):
        return WmsPutawayLocationSuggestionsOut()
    from .complaints.complaint_physical_receipt import stock_document_item_requires_putaway

    if not stock_document_item_requires_putaway(row, db=db):
        return WmsPutawayLocationSuggestionsOut()

    mm_skip_source: set[int] = set()
    if str(doc.document_type or "") == "MM":
        mm_src = getattr(row, "mm_line_from_location_id", None)
        if mm_src is None:
            return WmsPutawayLocationSuggestionsOut()
        mm_skip_source.add(int(mm_src))
    else:
        if maybe_auto_assign_single_warehouse_on_pz(db, doc):
            _sync_po_from_pz(db, tenant_id, doc.id)
            db.commit()
            db.refresh(doc)

    wh_id = doc.warehouse_id
    if wh_id is None:
        return WmsPutawayLocationSuggestionsOut()

    product_id = int(row.product_id)
    dock_id = doc.location_id
    remaining_qty = _putaway_remaining_quantity(db, row) or float(row.received_quantity or 0)

    slotting_by_lid: dict[int, object] = {}
    try:
        slotting_rows = slotting_suggest_putaway_locations(
            db,
            tenant_id=tenant_id,
            warehouse_id=int(wh_id),
            product_id=product_id,
            quantity=max(1.0, remaining_qty),
            strategy=STRATEGY_CONSOLIDATE_SKU,
            limit=30,
            exclude_location_ids=mm_skip_source,
        )
        slotting_by_lid = {int(s.location_id): s for s in slotting_rows}
    except Exception:
        import logging

        logging.getLogger(__name__).exception("slotting suggest_putaway failed item_id=%s", item_id)

    product = db.query(Product).filter(Product.id == product_id, Product.tenant_id == tenant_id).first()

    inv_by_loc = (
        db.query(Inventory.location_id, func.coalesce(func.sum(Inventory.quantity), 0.0))
        .filter(
            Inventory.tenant_id == tenant_id,
            Inventory.warehouse_id == wh_id,
            Inventory.product_id == product_id,
        )
        .group_by(Inventory.location_id)
        .all()
    )
    qty_by_lid: dict[int, float] = {}
    for lid_raw, sqty in inv_by_loc:
        if lid_raw is None:
            continue
        q = float(sqty or 0)
        if q <= 1e-9:
            continue
        qty_by_lid[int(lid_raw)] = q

    loc_ids_needed = set(qty_by_lid.keys())
    active_locs = (
        db.query(Location)
        .filter(Location.warehouse_id == wh_id, Location.is_active.is_(True))
        .order_by(Location.id.asc())
        .all()
    )
    for loc in active_locs:
        loc_ids_needed.add(int(loc.id))

    loc_by_id: dict[int, Location] = {}
    if loc_ids_needed:
        for loc in db.query(Location).filter(Location.id.in_(list(loc_ids_needed))).all():
            loc_by_id[int(loc.id)] = loc

    st_by_lid = batch_location_storage_types(db, wh_id, list(loc_by_id.values()))

    existing_stock: list[WmsPutawayLocationSuggestionRow] = []
    for lid, qty in sorted(qty_by_lid.items(), key=lambda t: -t[1]):
        if lid in mm_skip_source:
            continue
        loc = loc_by_id.get(lid)
        if not loc:
            continue
        slot = slotting_by_lid.get(lid)
        fit = None
        if product is not None:
            fit = calculate_location_capacity(loc, product, remaining_qty)
        existing_stock.append(
            _suggestion_row_from_location(
                loc,
                current_quantity=qty,
                priority_score=float(slot.score) if slot else qty,
                storage_type=st_by_lid.get(lid, "unknown"),
                max_fit_quantity=float(slot.max_fit_quantity) if slot else (fit.max_units if fit else None),
                remaining_capacity_percent=float(slot.remaining_capacity_percent) if slot else None,
                same_sku_present=True,
                reason_tags=list(slot.reason_tags) if slot else (["same_sku_present"] if qty > 0 else []),
                capacity_fits=bool(fit.fits) if fit else True,
                capacity_warnings=_capacity_warnings_for_fit(fit) if fit and not fit.fits else [],
            )
        )

    primary_candidates: list[WmsPutawayLocationSuggestionRow] = []
    overflow_candidates: list[WmsPutawayLocationSuggestionRow] = []

    if slotting_by_lid:
        for slot in sorted(slotting_by_lid.values(), key=lambda s: (-s.score, s.location_code)):
            loc = loc_by_id.get(int(slot.location_id))
            if loc is None:
                continue
            if dock_id is not None and int(loc.id) == int(dock_id):
                continue
            fit = slot.capacity_result
            sug = _suggestion_row_from_location(
                loc,
                current_quantity=float(qty_by_lid.get(int(loc.id), 0)),
                priority_score=float(slot.score),
                storage_type=st_by_lid.get(int(loc.id), "unknown"),
                max_fit_quantity=float(slot.max_fit_quantity),
                remaining_capacity_percent=float(slot.remaining_capacity_percent),
                same_sku_present=bool(slot.same_sku_present),
                reason_tags=list(slot.reason_tags),
                capacity_fits=bool(fit.fits) if fit else True,
                capacity_warnings=_capacity_warnings_for_fit(fit) if fit and not fit.fits else [],
            )
            if _location_is_overflow_storage(loc):
                overflow_candidates.append(sug)
            else:
                primary_candidates.append(sug)
    else:
        stocked_lids = set(qty_by_lid.keys())
        for loc in active_locs:
            lid = int(loc.id)
            if lid in mm_skip_source:
                continue
            if dock_id is not None and lid == int(dock_id):
                continue
            if lid in stocked_lids:
                continue
            ps = getattr(loc, "pick_sequence", None)
            seq_score = float(ps) if ps is not None else 1_000_000.0
            priority = max(0.0, 10_000.0 - seq_score)
            st = st_by_lid.get(lid, "unknown")
            sug = _suggestion_row_from_location(
                loc,
                current_quantity=0.0,
                priority_score=priority,
                storage_type=st,
            )
            if _location_is_overflow_storage(loc):
                overflow_candidates.append(sug)
            else:
                primary_candidates.append(sug)

    primary_candidates.sort(key=lambda r: (-r.priority_score, r.code))
    overflow_candidates.sort(key=lambda r: (-r.priority_score, r.code))

    return WmsPutawayLocationSuggestionsOut(
        suggested_primary_locations=primary_candidates[:8],
        suggested_overflow_locations=overflow_candidates[:8],
        existing_stock_locations=existing_stock[:12],
    )


def _patch_wms_putaway_mm_line(
    db: Session,
    tenant_id: int,
    row: StockDocumentItem,
    doc: StockDocument,
    body: WmsPutawayPatchBody,
    performed_by: AppUser,
) -> WmsPutawayPatchOut:
    from_id = getattr(row, "mm_line_from_location_id", None)
    if from_id is None:
        raise ValueError("Brak lokalizacji źródłowej na linii MM")
    from_id = int(from_id)
    wh_id = int(doc.warehouse_id or 0)

    rec = float(row.received_quantity or 0)
    if rec <= 1e-9:
        raise ValueError("Brak ilości do rozlokowania na tej linii")
    q = float(body.quantity)
    if not math.isfinite(q) or q <= 0:
        raise ValueError("Nieprawidłowa ilość")
    if q > MAX_RECEIVED_QUANTITY:
        raise ValueError("Ilość przekracza dopuszczalny limit")

    sum_ops = _sum_putaway_operations(db, row.id)
    col_put = float(getattr(row, "quantity_putaway", 0) or 0)
    baseline = sum_ops if sum_ops > 1e-9 else col_put
    if baseline + q > rec + 1e-5:
        raise ValueError("Suma rozlokowania przekroczyłaby zadeklarowaną ilość na linii")

    loc = (
        db.query(Location)
        .filter(Location.id == body.location_id, Location.warehouse_id == doc.warehouse_id)
        .first()
    )
    if not loc:
        raise ValueError("Lokalizacja nie należy do magazynu tej PZ")
    if int(loc.id) == from_id:
        raise ValueError("Lokalizacja docelowa musi być inna niż źródłowa")

    cap_check = validate_putaway_assignment(
        db,
        tenant_id=tenant_id,
        location_id=int(body.location_id),
        product_id=int(row.product_id),
        quantity=float(q),
    )
    if not cap_check["fits"]:
        msg = cap_check["warnings"][0] if cap_check["warnings"] else "Przekroczono pojemność lokalizacji"
        raise ValueError(msg)

    allocations = _allocate_fifo_from_source(db, tenant_id, wh_id, from_id, int(row.product_id), q)
    loc_uuid_to = _normalize_location_uuid(getattr(loc, "location_uuid", None))

    for inv, take in allocations:
        bn = normalize_batch_number(getattr(inv, "batch_number", None))
        ed_store = getattr(inv, "expiry_date", None) or NO_EXPIRY_SENTINEL
        exp_op = None if ed_store >= NO_EXPIRY_SENTINEL else ed_store
        bn_op = bn if bn else None
        lid_from = from_id
        lid_to = int(body.location_id)
        sd_op = normalize_stock_disposition(getattr(inv, "stock_disposition", None))

        inv.quantity = float(inv.quantity or 0) - take
        if float(inv.quantity or 0) <= 1e-9:
            db.delete(inv)

        inv_to = (
            db.query(Inventory)
            .filter(
                Inventory.tenant_id == tenant_id,
                Inventory.product_id == row.product_id,
                Inventory.warehouse_id == wh_id,
                Inventory.location_id == lid_to,
                Inventory.batch_number == bn,
                Inventory.expiry_date == ed_store,
                Inventory.stock_disposition == sd_op,
            )
            .first()
        )
        if inv_to:
            inv_to.quantity = float(inv_to.quantity or 0) + take
            inv_to.location_uuid = loc_uuid_to
        else:
            db.add(
                Inventory(
                    tenant_id=tenant_id,
                    product_id=row.product_id,
                    warehouse_id=wh_id,
                    location_id=lid_to,
                    location_uuid=loc_uuid_to,
                    quantity=take,
                    batch_number=bn,
                    expiry_date=ed_store,
                    stock_disposition=sd_op,
                )
            )

        db.add(
            StockOperation(
                document_id=doc.id,
                document_line_id=row.id,
                product_id=row.product_id,
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
                document_id=doc.id,
                document_line_id=row.id,
                product_id=row.product_id,
                location_id=lid_to,
                qty=take,
                type=STOCK_OP_MOVE_IN,
                batch=bn_op,
                expiry_date=exp_op,
                stock_disposition=sd_op,
            )
        )
        db.add(
            StockOperation(
                document_id=doc.id,
                document_line_id=row.id,
                product_id=row.product_id,
                location_id=lid_to,
                qty=take,
                type=STOCK_OP_PUTAWAY,
                batch=bn_op,
                expiry_date=exp_op,
                stock_disposition=sd_op,
            )
        )

    db.flush()
    total_put = _sum_putaway_operations(db, row.id)
    row.quantity_putaway = total_put
    _stamp_putaway_line_last_audit(row, loc, performed_by=performed_by, quantity_increment=q)
    doc.updated_at = datetime.utcnow()
    all_rows = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == doc.id)
        .order_by(StockDocumentItem.id)
        .all()
    )
    recompute_putaway_status_for_document(doc, all_rows, db)
    _sync_po_from_pz(db, tenant_id, doc.id)
    wh_mm = int(doc.warehouse_id or 0)
    if wh_mm <= 0:
        raise ValueError("Brak warehouse_id na dokumencie MM")
    doc_type_mm = (getattr(doc, "document_type", None) or "MM").strip().upper()
    record_warehouse_product_operation(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=wh_mm,
        product_id=int(row.product_id),
        movement_type="PUTAWAY",
        source_location_id=from_id,
        target_location_id=int(body.location_id),
        quantity=q,
        performed_by=performed_by,
        reference_document=f"{doc_type_mm}-{int(doc.id)}",
        stock_document_id=int(doc.id),
        packaging_type="UNIT",
        packaging_quantity=float(q),
    )
    try:
        recalculate_location_occupancy(db, int(body.location_id), commit=False)
    except Exception:
        import logging

        logging.getLogger(__name__).exception("occupancy recalc failed location_id=%s", body.location_id)
    db.commit()
    db.refresh(doc)
    db.refresh(row)

    doc_read: StockDocumentRead = build_stock_document_read(db, doc)
    _, loc_rows = _putaway_locations_for_response(db, row.id, doc.warehouse_id)

    return WmsPutawayPatchOut(
        item_id=row.id,
        total_putaway_quantity=total_put,
        locations=loc_rows,
        document=doc_read,
        inventory_snapshot=None,
    )


def patch_wms_putaway_item(
    db: Session,
    tenant_id: int,
    item_id: int,
    body: WmsPutawayPatchBody,
    *,
    performed_by: AppUser,
) -> WmsPutawayPatchOut:
    row = db.query(StockDocumentItem).filter(StockDocumentItem.id == item_id).first()
    if not row:
        raise ValueError("Pozycja PZ nie znaleziona")
    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == row.document_id, StockDocument.tenant_id == tenant_id)
        .first()
    )
    if not doc:
        raise ValueError("Dokument nie znaleziony")
    if not _doc_allows_putaway(doc):
        raise ValueError(
            "Rozlokowanie dostępne dla PZ (draft/posted), Z-PZ (open/closed) oraz MM (draft)"
        )
    if str(getattr(doc, "relocation_status", "") or "").strip().upper() == "DONE":
        raise ValueError("Rozlokowanie zakończone — edycja zablokowana")
    ensure_pz_document_warehouse_resolved(db, doc)

    if str(doc.document_type or "") == "MM":
        return _patch_wms_putaway_mm_line(db, tenant_id, row, doc, body, performed_by)

    if is_stock_document_item_wm_material(row):
        raise ValueError(
            "Rozlokowanie WMS dotyczy produktów w lokalizacjach. Kartony i materiały pakowe są księgowane "
            "na stanie materiałów magazynowych przy zatwierdzeniu przyjęcia dostawy."
        )
    from .complaints.complaint_physical_receipt import stock_document_item_requires_putaway

    if not stock_document_item_requires_putaway(row, db=db):
        raise ValueError(
            "Ta linia reklamacji nie wymaga rozlokowania magazynowego (przekazanie do serwisu / direct-service)."
        )

    rec = float(row.received_quantity or 0)
    if rec <= 1e-9:
        raise ValueError("Brak przyjętej ilości na tej linii")
    q = float(body.quantity)
    if not math.isfinite(q) or q <= 0:
        raise ValueError("Nieprawidłowa ilość")
    if q > MAX_RECEIVED_QUANTITY:
        raise ValueError("Ilość przekracza dopuszczalny limit")

    sum_ops = _sum_putaway_operations(db, row.id)
    col_put = float(getattr(row, "quantity_putaway", 0) or 0)
    baseline = sum_ops if sum_ops > 1e-9 else col_put
    if baseline + q > rec + 1e-5:
        raise ValueError("Suma rozlokowania przekroczyłaby przyjętą ilość")

    loc = (
        db.query(Location)
        .filter(Location.id == body.location_id, Location.warehouse_id == doc.warehouse_id)
        .first()
    )
    if not loc:
        raise ValueError("Lokalizacja nie należy do magazynu tej PZ")

    from ..services.inventory_count.inventory_movement_guard_service import (
        MOVEMENT_PUTAWAY,
        assert_location_movement_allowed,
    )

    assert_location_movement_allowed(
        db,
        location_id=int(body.location_id),
        movement_kind=MOVEMENT_PUTAWAY,
        tenant_id=tenant_id,
    )

    cap_check = validate_putaway_assignment(
        db,
        tenant_id=tenant_id,
        location_id=int(body.location_id),
        product_id=int(row.product_id),
        quantity=float(q),
    )
    if not cap_check["fits"]:
        msg = cap_check["warnings"][0] if cap_check["warnings"] else "Przekroczono pojemność lokalizacji"
        raise ValueError(msg)

    bn, ed_store = dock_lot_keys_for_pz_line(row)
    loc_uuid = _normalize_location_uuid(getattr(loc, "location_uuid", None))
    sd = stock_disposition_for_document_line(row)

    carrier_pk = getattr(body, "warehouse_carrier_id", None)
    dock_id = getattr(doc, "location_id", None)
    line_carrier_id = getattr(row, "warehouse_carrier_id", None)
    detach_from_carrier = False

    if carrier_pk and dock_id is None:
        raise ValueError("Brak lokacji przyjęcia na PZ — nie można rozlokować z nośnika")

    if carrier_pk:
        from_carrier_id: int | None = int(carrier_pk)
        to_carrier_id: int | None = int(carrier_pk)
    elif line_carrier_id is not None and dock_id is not None:
        from_carrier_id = int(line_carrier_id)
        to_carrier_id = None
        detach_from_carrier = True
    else:
        from_carrier_id = None
        to_carrier_id = None

    if dock_id is not None:
        _ensure_dock_inventory_for_putaway(
            db,
            tenant_id=int(tenant_id),
            row=row,
            doc=doc,
            dock_id=int(dock_id),
            quantity=float(q),
            from_carrier_id=from_carrier_id,
            bn=bn,
            ed_store=ed_store,
            sd=sd,
        )
        _transfer_from_dock_to_location(
            db,
            tenant_id=int(tenant_id),
            row=row,
            doc=doc,
            dock_id=int(dock_id),
            target_location_id=int(body.location_id),
            loc_uuid=loc_uuid,
            quantity=float(q),
            from_carrier_id=from_carrier_id,
            to_carrier_id=to_carrier_id,
            bn=bn,
            ed_store=ed_store,
            sd=sd,
        )
    else:
        inv = (
            db.query(Inventory)
            .filter(
                Inventory.tenant_id == tenant_id,
                Inventory.product_id == row.product_id,
                Inventory.warehouse_id == doc.warehouse_id,
                Inventory.location_id == body.location_id,
                Inventory.batch_number == bn,
                Inventory.expiry_date == ed_store,
                Inventory.stock_disposition == sd,
                Inventory.carrier_id == (int(to_carrier_id) if to_carrier_id else None),
            )
            .first()
        )
        if inv:
            inv.quantity = float(inv.quantity or 0) + q
            inv.location_uuid = loc_uuid
            db.add(inv)
        else:
            db.add(
                Inventory(
                    tenant_id=tenant_id,
                    product_id=row.product_id,
                    warehouse_id=doc.warehouse_id,
                    location_id=body.location_id,
                    carrier_id=int(to_carrier_id) if to_carrier_id is not None else None,
                    location_uuid=loc_uuid,
                    quantity=q,
                    batch_number=bn,
                    expiry_date=ed_store,
                    stock_disposition=sd,
                )
            )

    moved_carrier_id = carrier_pk or (line_carrier_id if detach_from_carrier else None)
    if moved_carrier_id and dock_id is not None:
        wc = (
            db.query(WarehouseCarrier)
            .filter(WarehouseCarrier.id == int(moved_carrier_id), WarehouseCarrier.tenant_id == int(tenant_id))
            .first()
        )
        if wc and to_carrier_id is not None:
            wc.current_location_id = int(body.location_id)
            wc.updated_at = datetime.utcnow()
            db.add(wc)
        log_carrier_operation(
            db,
            tenant_id=int(tenant_id),
            carrier_id=int(moved_carrier_id),
            operation_type="PUTAWAY_MOVE",
            user=performed_by,
            metadata={
                "to_location_id": int(body.location_id),
                "qty": float(q),
                "detach": detach_from_carrier,
            },
        )

    if detach_from_carrier and line_carrier_id is not None:
        row.warehouse_carrier_id = None
        _sync_carrier_items_from_inventory(db, int(tenant_id), int(line_carrier_id))

    exp_op = None if ed_store == NO_EXPIRY_SENTINEL else ed_store
    bn_op = bn if bn else None

    db.add(
        StockOperation(
            document_id=doc.id,
            document_line_id=row.id,
            product_id=row.product_id,
            location_id=body.location_id,
            qty=q,
            type=STOCK_OP_PUTAWAY,
            batch=bn_op,
            expiry_date=exp_op,
            stock_disposition=sd,
        )
    )
    wh_pz = int(doc.warehouse_id or 0)
    if wh_pz <= 0:
        raise ValueError("Brak warehouse_id na dokumencie PZ")
    doc_type_pz = (getattr(doc, "document_type", None) or "PZ").strip().upper()
    record_warehouse_product_operation(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=wh_pz,
        product_id=int(row.product_id),
        movement_type="PUTAWAY",
        source_location_id=getattr(doc, "location_id", None),
        target_location_id=int(body.location_id),
        quantity=float(q),
        performed_by=performed_by,
        reference_document=f"{doc_type_pz}-{int(doc.id)}",
        stock_document_id=int(doc.id),
        packaging_type="UNIT",
        packaging_quantity=float(q),
    )

    db.flush()
    total_put = _sum_putaway_operations(db, row.id)
    row.quantity_putaway = total_put
    _stamp_putaway_line_last_audit(row, loc, performed_by=performed_by, quantity_increment=q)
    doc.updated_at = datetime.utcnow()
    all_rows = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == doc.id)
        .order_by(StockDocumentItem.id)
        .all()
    )
    recompute_putaway_status_for_document(doc, all_rows, db)
    recalculate_wms_document_completion(db, tenant_id, int(doc.id))
    _sync_po_from_pz(db, tenant_id, doc.id)
    try:
        from .wms_waiting_supply_promotion import (
            receipt_from_putaway,
            run_promotion_after_inbound,
        )

        wh_pz = int(doc.warehouse_id or 0)
        if wh_pz > 0:
            rec = receipt_from_putaway(
                db,
                tenant_id=int(tenant_id),
                doc=doc,
                line=row,
                qty=float(q),
                to_carrier_id=int(to_carrier_id) if to_carrier_id else None,
                line_carrier_id=int(line_carrier_id) if line_carrier_id else None,
            )
            if rec:
                run_promotion_after_inbound(
                    db,
                    tenant_id=int(tenant_id),
                    warehouse_id=wh_pz,
                    receipts=[rec],
                    source_event_id=f"putaway:{int(doc.id)}:line:{int(row.id)}:qty:{float(q):.6f}",
                )
    except Exception:
        import logging

        logging.getLogger(__name__).exception(
            "waiting_supply promote after putaway pz=%s item=%s", doc.id, row.id
        )
    try:
        recalculate_location_occupancy(db, int(body.location_id), commit=False)
    except Exception:
        import logging

        logging.getLogger(__name__).exception("occupancy recalc failed location_id=%s", body.location_id)
    db.commit()
    db.refresh(doc)
    db.refresh(row)

    inv_after_q = (
        db.query(Inventory)
        .filter(
            Inventory.tenant_id == tenant_id,
            Inventory.product_id == row.product_id,
            Inventory.warehouse_id == doc.warehouse_id,
            Inventory.location_id == body.location_id,
            Inventory.batch_number == bn,
            Inventory.expiry_date == ed_store,
            Inventory.stock_disposition == sd,
        )
    )
    if to_carrier_id is not None:
        inv_after_q = inv_after_q.filter(Inventory.carrier_id == int(to_carrier_id))
    else:
        inv_after_q = inv_after_q.filter(Inventory.carrier_id.is_(None))
    inv_after = inv_after_q.first()
    snap: WmsPutawayInventorySnapshotRow | None = None
    if inv_after:
        lu = _normalize_location_uuid(getattr(loc, "location_uuid", None)) or _normalize_location_uuid(
            getattr(inv_after, "location_uuid", None)
        )
        ed = getattr(inv_after, "expiry_date", None) or NO_EXPIRY_SENTINEL
        exp_out = None if ed >= NO_EXPIRY_SENTINEL else ed
        bn_out = normalize_batch_number(getattr(inv_after, "batch_number", None)) or None
        snap = WmsPutawayInventorySnapshotRow(
            product_id=int(inv_after.product_id),
            location_id=int(inv_after.location_id),
            location_uuid=lu,
            quantity=float(inv_after.quantity or 0),
            batch=bn_out,
            expiration_date=exp_out,
            stock_disposition=normalize_stock_disposition(getattr(inv_after, "stock_disposition", None)),
        )

    doc_read: StockDocumentRead = build_stock_document_read(db, doc)
    _, loc_rows = _putaway_locations_for_response(db, row.id, doc.warehouse_id)

    return WmsPutawayPatchOut(
        item_id=row.id,
        total_putaway_quantity=total_put,
        locations=loc_rows,
        document=doc_read,
        inventory_snapshot=snap,
    )


def patch_wms_putaway_carrier_bulk(
    db: Session,
    tenant_id: int,
    body: WmsPutawayCarrierBulkBody,
    *,
    performed_by: AppUser,
) -> WmsPutawayCarrierBulkOut:
    """Rozlokuj wszystkie pozostałe linie PZ przypisane do nośnika jednym skanem lokalizacji."""
    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == int(body.document_id), StockDocument.tenant_id == tenant_id)
        .first()
    )
    if not doc:
        raise ValueError("Dokument nie znaleziony")
    if not _doc_allows_putaway(doc):
        raise ValueError("Rozlokowanie niedostępne dla tego dokumentu")
    if str(getattr(doc, "relocation_status", "") or "").strip().upper() == "DONE":
        raise ValueError("Rozlokowanie zakończone — edycja zablokowana")

    rows = (
        db.query(StockDocumentItem)
        .filter(
            StockDocumentItem.document_id == int(body.document_id),
            StockDocumentItem.warehouse_carrier_id == int(body.warehouse_carrier_id),
        )
        .order_by(StockDocumentItem.id)
        .all()
    )
    if not rows:
        raise ValueError("Brak linii przypisanych do tego nośnika na tej PZ")

    lines_done = 0
    total_qty = 0.0
    last_doc_read: StockDocumentRead | None = None
    for row in rows:
        rec = float(row.received_quantity or 0)
        if rec <= 1e-9:
            continue
        put_eff = _effective_putaway_quantity(db, row)
        rem = rec - put_eff
        if rem <= 1e-9:
            continue
        out = patch_wms_putaway_item(
            db,
            tenant_id,
            int(row.id),
            WmsPutawayPatchBody(
                location_id=int(body.location_id),
                quantity=float(rem),
                warehouse_carrier_id=int(body.warehouse_carrier_id),
            ),
            performed_by=performed_by,
        )
        lines_done += 1
        total_qty += float(rem)
        last_doc_read = out.document

    if lines_done < 1:
        raise ValueError("Brak ilości do rozlokowania na tym nośniku")

    wc = (
        db.query(WarehouseCarrier)
        .filter(
            WarehouseCarrier.id == int(body.warehouse_carrier_id),
            WarehouseCarrier.tenant_id == int(tenant_id),
        )
        .first()
    )
    if wc:
        wc.current_location_id = int(body.location_id)
        wc.updated_at = datetime.utcnow()
        db.add(wc)
        db.commit()
        db.refresh(wc)

    if last_doc_read is None:
        last_doc_read = build_stock_document_read(db, doc)

    return WmsPutawayCarrierBulkOut(
        lines_putaway=lines_done,
        total_quantity=total_qty,
        document=last_doc_read,
    )


def finalize_wms_relocation_pz(db: Session, tenant_id: int, document_id: int) -> StockDocumentRead:
    """
    Zamknięcie procesu rozlokowania w WMS: ustawia relocation_status=DONE; opcjonalnie status=zakonczone.
    Nie modyfikuje inventory ani stock_operations.
    """
    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == document_id, StockDocument.tenant_id == tenant_id)
        .first()
    )
    if not doc:
        raise ValueError("Dokument nie znaleziony")
    if str(doc.document_type or "").strip().upper() not in ("PZ", "Z_PZ", "PZ_RT", "RETURN_RECEIPT", "MM"):
        raise ValueError("Tylko dokument PZ / PZ_RT / RETURN_RECEIPT lub MM")
    if str(getattr(doc, "relocation_status", "") or "").strip().upper() == "DONE":
        raise ValueError("Rozlokowanie już zakończone")
    if not _doc_allows_putaway(doc):
        raise ValueError("Nie można zakończyć rozlokowania dla tego statusu dokumentu")

    rows: List[StockDocumentItem] = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == document_id)
        .order_by(StockDocumentItem.id)
        .all()
    )
    if not rows:
        raise ValueError("Brak pozycji na dokumencie")

    eps = 1e-5
    candidates = [x for x in rows if float(x.received_quantity or 0) > eps]
    if not candidates:
        raise ValueError("Brak przyjętych ilości — nie można zakończyć rozlokowania")

    for row in rows:
        rec = float(row.received_quantity or 0)
        put_eff = _effective_putaway_quantity(db, row)
        if put_eff > rec + eps:
            raise ValueError(
                "Rozlokowana ilość przekracza przyjętą na co najmniej jednej pozycji — popraw dane przed zakończeniem"
            )

    if not any(_effective_putaway_quantity(db, x) > eps for x in candidates):
        raise ValueError("Nie zapisano żadnego rozlokowania — brak przeniesionej ilości")

    recalculate_wms_document_completion(db, tenant_id, document_id)
    doc.relocation_status = "DONE"
    doc.updated_at = datetime.utcnow()
    rs = str(getattr(doc, "receiving_status", "") or "").strip().upper()
    st = str(getattr(doc, "status", "") or "").strip().upper()
    if rs == "DONE" and st in ("DRAFT", "CLOSED"):
        doc.status = "zakonczone"

    _sync_po_from_pz(db, tenant_id, document_id)
    db.commit()
    db.refresh(doc)
    return build_stock_document_read(db, doc)
