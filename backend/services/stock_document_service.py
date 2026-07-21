"""PZ (stock document): build reads, edit draft lines, accept → inventory + delivery updates."""

from __future__ import annotations

import logging
import math
from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Literal, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.inventory import Inventory
from ..models.inbound_delivery import DeliveryItem, InboundDelivery
from ..models.location import Location
from ..models.product import Product
from ..models.stock_item_location import StockItemLocation
from ..models.stock_operation import STOCK_OP_PUTAWAY, STOCK_OP_RECEIPT, StockOperation
from ..models.receiving_scan_log import ReceivingScanLog
from ..models.receiving_document_carrier import ReceivingDocumentCarrier
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.warehouse_carrier import WarehouseCarrier
from ..models.wms_order_return import WmsOrderReturn
from ..models.supplier import Supplier
from ..models.tenant_warehouse import TenantWarehouse
from .tenant_default_warehouse import (
    ERR_CHOOSE_WAREHOUSE_FOR_DOCUMENT,
)
from ..models.warehouse import Warehouse
from ..schemas.stock_document import (
    DocumentSeriesBriefRead,
    PatchStockDocumentItemsBody,
    PatchStockDocumentMetadataBody,
    PutawayAllocationRead,
    ReceivingPzCarrierRead,
    ReceivingScanLogRead,
    StockDocumentItemRead,
    StockDocumentRead,
)
from .document_creator_service import (
    app_user_full_name,
    batch_load_app_users,
    created_by_read_for_document,
    stamp_document_creator,
)
from .inventory_lot_keys import NO_EXPIRY_SENTINEL, normalize_batch_number
from .inventory_serial_service import list_serials_for_document_lines, serial_range_label
from .stock_disposition import stock_disposition_for_document_line
from .stock_operation_receipt_service import append_receipt_operation, backfill_receipt_gap_for_line
from .receipt_line_visuals import ReceiptLineVisuals, resolve_receipt_line_visuals
from .purchase_sales_block_projection import sales_block_line_projection
from .wm_catalog_stock_service import apply_wm_catalog_receive_delta, update_wm_catalog_last_purchase_metadata
from .location_badge import batch_location_storage_types, wms_location_badge_kind
from .purchase_order_warehouse_sync_service import sync_purchase_order_status_for_stock_document_id
from .product_cost_service import refresh_product_cost_from_pz

_logger = logging.getLogger(__name__)

MAX_RECEIVED_QUANTITY = 1e9

ReceiptLineTypeLit = Literal["product", "carton", "packaging_material"]


def _receipt_ops_weighted_unit_net_for_line(db: Session, document_line_id: int) -> Optional[float]:
    """Average unit net from RECEIPT stock ops on this PZ line (WMS can log ops before PZ is posted)."""
    ops = (
        db.query(StockOperation)
        .filter(
            StockOperation.document_line_id == int(document_line_id),
            StockOperation.type == STOCK_OP_RECEIPT,
        )
        .all()
    )
    num = 0.0
    den = 0.0
    for op in ops:
        q = float(op.qty or 0)
        if q <= 1e-12:
            continue
        p = getattr(op, "unit_price_net", None)
        if p is None:
            continue
        try:
            pf = float(p)
        except (TypeError, ValueError):
            continue
        if not math.isfinite(pf) or pf < 0:
            continue
        num += q * pf
        den += q
    if den <= 1e-12:
        return None
    return num / den


def _resolve_pz_line_unit_net_for_product_snapshot(
    db: Session,
    row: StockDocumentItem,
    di: Optional[DeliveryItem],
) -> Optional[float]:
    """
    Priority: line.purchase_price_net, weighted RECEIPT unit_price_net, delivery_items.purchase_price.
    (Matches how delivery history derives lines when PZ line unit is missing.)
    """
    raw = getattr(row, "purchase_price_net", None)
    if raw is not None:
        try:
            v = float(raw)
        except (TypeError, ValueError):
            v = None
        else:
            if math.isfinite(v) and v >= 0:
                return v
    w = _receipt_ops_weighted_unit_net_for_line(db, int(row.id))
    if w is not None:
        return w
    if di is not None and getattr(di, "purchase_price", None) is not None:
        try:
            v = float(di.purchase_price)
        except (TypeError, ValueError):
            return None
        if math.isfinite(v) and v >= 0:
            return v
    return None


def _apply_product_purchase_snapshot_from_posted_pz(
    db: Session,
    *,
    tenant_id: int,
    doc: StockDocument,
    items: List[StockDocumentItem],
    posted_at: datetime,
) -> None:
    """
    Update product purchase snapshot from actual PZ receipts (received_qty > 0).
    Business rules:
    - previous_purchase_price <- current purchase_price (when current exists),
    - purchase_price <- weighted net unit from received lines,
    - last_purchase_date <- posting datetime,
    - last_supplier_id <- supplier from document,
    - last_purchase_currency <- document currency.
    """
    product_ids: set[int] = set()
    for row in items:
        pid = getattr(row, "product_id", None)
        if pid is None:
            continue
        if is_stock_document_item_wm_material(row):
            continue
        rec = float(getattr(row, "received_quantity", 0) or 0)
        if rec <= 1e-9:
            continue
        product_ids.add(int(pid))

    if not product_ids:
        return
    for pid in product_ids:
        refresh_product_cost_from_pz(
            db,
            tenant_id=int(tenant_id),
            product_id=int(pid),
            source_doc_id=int(doc.id),
        )


def sync_product_purchase_prices_from_pz(
    db: Session,
    *,
    tenant_id: int,
    pz_id: int,
    posted_at: Optional[datetime] = None,
) -> None:
    """
    Load PZ + lines and apply purchase snapshot. Safe after WMS receiving is DONE (draft) or on posted PZ
    (idempotent re-run on accept is OK: weighted unit should match the same data).
    """
    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == int(pz_id), StockDocument.tenant_id == int(tenant_id))
        .first()
    )
    if not doc:
        return
    if is_stock_document_cancelled(doc):
        return
    if str(getattr(doc, "document_type", "") or "") != "PZ":
        return
    items: List[StockDocumentItem] = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == int(pz_id))
        .order_by(StockDocumentItem.id)
        .all()
    )
    if not items:
        return
    when = posted_at or doc.updated_at or datetime.utcnow()
    _apply_product_purchase_snapshot_from_posted_pz(
        db,
        tenant_id=tenant_id,
        doc=doc,
        items=items,
        posted_at=when,
    )


def compute_pz_line_financial_totals(rows: List[StockDocumentItem]) -> Tuple[float, float, float]:
    """
    Sum (net, vat, gross) from PZ lines.
    Valuation qty: received if > 0, otherwise ordered (draft estimate before receive).
    """
    net = vat = gross = 0.0
    for row in rows:
        rec = float(row.received_quantity or 0)
        ordq = float(row.ordered_quantity or 0)
        qty = rec if rec > 1e-9 else ordq
        pp = getattr(row, "purchase_price_net", None)
        if pp is None or qty <= 1e-12:
            continue
        try:
            unit_net = float(pp)
        except (TypeError, ValueError):
            continue
        if not math.isfinite(unit_net):
            continue
        ln_net = qty * unit_net
        vr = float(getattr(row, "vat_rate", None) or 23.0)
        if not math.isfinite(vr):
            vr = 23.0
        ln_vat = ln_net * (vr / 100.0)
        net += ln_net
        vat += ln_vat
        gross += ln_net + ln_vat
    return (round(net, 2), round(vat, 2), round(gross, 2))


def resolve_document_financial_totals(
    doc: StockDocument,
    rows: List[StockDocumentItem],
) -> Tuple[Optional[float], Optional[float], Optional[float]]:
    """Header totals — compute from lines for warehouse docs when stored values missing."""
    dt_u = str(getattr(doc, "document_type", "") or "").strip().upper()
    if dt_u in ("PZ", "WZ", "RW", "PW") and rows:
        net, vat, gross = compute_pz_line_financial_totals(rows)
        return float(net), float(gross), float(vat)
    tn = getattr(doc, "total_net", None)
    tg = getattr(doc, "total_gross", None)
    return (
        float(tn) if tn is not None else None,
        float(tg) if tg is not None else None,
        None,
    )


def persist_stock_document_financial_totals(doc: StockDocument, rows: List[StockDocumentItem]) -> None:
    """Persist net/gross on document header from line valuation."""
    net, gross, _vat = resolve_document_financial_totals(doc, rows)
    if net is not None:
        doc.total_net = net
    if gross is not None:
        doc.total_gross = gross
    doc.updated_at = datetime.utcnow()


def resolve_document_series_brief(
    db: Session,
    doc: StockDocument,
    *,
    series_by_id: dict[str, Any] | None = None,
) -> Optional[dict[str, Any]]:
    """Series for list/detail — assigned series or document type fallback."""
    from ..models.document_series import DocumentSeries

    series_id = str(getattr(doc, "document_series_id", None) or "").strip() or None
    row = None
    if series_id:
        if series_by_id and series_id in series_by_id:
            row = series_by_id[series_id]
        else:
            row = db.query(DocumentSeries).filter(DocumentSeries.id == series_id).first()
    if row is not None:
        code = (getattr(row, "code", None) or "").strip() or (getattr(row, "prefix", None) or "").strip()
        prefix = (getattr(row, "prefix", None) or "").strip() or code
        if not code:
            code = str(getattr(doc, "document_type", "") or "").strip().upper()
        return {
            "id": str(getattr(row, "id", "") or series_id or ""),
            "code": code,
            "name": (getattr(row, "name", None) or "").strip() or None,
            "prefix": prefix or None,
        }
    dt = str(getattr(doc, "document_type", "") or "").strip().upper()
    if dt:
        return {"id": None, "code": dt, "name": dt, "prefix": dt}
    return None


def is_stock_document_item_wm_material(row: StockDocumentItem) -> bool:
    """True when the PZ line posts to carton / packaging_material stock instead of product inventory."""
    if getattr(row, "product_id", None) is not None:
        return False
    k = (getattr(row, "wm_kind", None) or "").strip().lower()
    wid = (getattr(row, "wm_id", None) or "").strip()
    return bool(k and wid)


# Stored status for cancelled documents (legacy + new); UI maps to ANULOWANE.
_CANCELLED_STATUS_TOKENS = frozenset({"cancelled", "canceled", "anulowany", "anulowane"})


def ensure_pz_document_warehouse_resolved(db: Session, doc: StockDocument) -> int:
    """Require explicit warehouse_id on the document — no tenant default or auto-assign."""
    if doc.warehouse_id is not None:
        return int(doc.warehouse_id)
    raise ValueError(ERR_CHOOSE_WAREHOUSE_FOR_DOCUMENT)


def ensure_default_pz_receiving_location_if_missing(db: Session, doc: StockDocument) -> None:
    """
    Draft PZ with warehouse but NULL receiving location: provision system receiving
    location (DOCK-IN or STOCK per warehouse.requires_putaway) and assign doc.location_id.
    """
    if doc.location_id is not None:
        return
    if doc.warehouse_id is None:
        return

    from .warehouse_receiving_location_service import ensure_receiving_location_for_pz_document

    chosen = ensure_receiving_location_for_pz_document(db, doc)
    doc.location_id = int(chosen.id)
    doc.updated_at = datetime.utcnow()
    db.flush()


def is_wms_ghost_stock_document_item(row: StockDocumentItem, eps: float = 1e-9) -> bool:
    """Placeholder PZ line: no ordered qty, nothing received, no batch, no real expiry (sentinel only)."""
    if float(row.received_quantity or 0) > eps:
        return False
    if float(row.ordered_quantity or 0) > eps:
        return False
    if normalize_batch_number(getattr(row, "batch_number", None)):
        return False
    ed = getattr(row, "expiry_date", None)
    if ed is not None and ed < NO_EXPIRY_SENTINEL:
        return False
    return True


def _best_receiving_log_target_for_ghost(
    ghost: StockDocumentItem,
    survivors: List[StockDocumentItem],
) -> StockDocumentItem | None:
    """Pick a non-ghost line to own scan logs before the ghost row is deleted."""
    if not survivors:
        return None
    pid = ghost.product_id
    pool = [s for s in survivors if pid is None or s.product_id == pid]
    if not pool:
        pool = list(survivors)
    did = ghost.delivery_item_id
    if did is not None:
        same_delivery = [s for s in pool if s.delivery_item_id == did]
        if same_delivery:
            pool = same_delivery
    pool.sort(
        key=lambda s: (
            -float(s.received_quantity or 0),
            int(s.id),
        ),
    )
    return pool[0]


def purge_wms_ghost_stock_document_lines(db: Session, document_id: int) -> int:
    """Delete ghost lines from a PZ document. Returns number of rows removed."""
    rows = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == document_id)
        .order_by(StockDocumentItem.id)
        .all()
    )
    ghosts = [r for r in rows if is_wms_ghost_stock_document_item(r)]
    if not ghosts:
        return 0
    survivors = [r for r in rows if not is_wms_ghost_stock_document_item(r)]
    n = 0
    for ghost in ghosts:
        logs = (
            db.query(ReceivingScanLog)
            .filter(ReceivingScanLog.item_id == int(ghost.id))
            .all()
        )
        if logs:
            target = _best_receiving_log_target_for_ghost(ghost, survivors)
            if target is None:
                continue
            tid = int(target.id)
            for lg in logs:
                lg.item_id = tid
        db.delete(ghost)
        n += 1
    return n


def _normalize_location_uuid(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    v = value.strip()
    if not v or v.lower() == "null":
        return None
    return v


def _float_ge(a: float, b: float, eps: float = 1e-5) -> bool:
    return a + eps >= b


def compute_receiving_status_for_items(items: List[StockDocumentItem]) -> str:
    """Line-based progress: pending | in_progress | received (for is_fully_received / legacy)."""
    return compute_line_receiving_progress(items)


def compute_line_receiving_progress(items: List[StockDocumentItem]) -> str:
    """WMS: group by delivery_item_id (split lot lines share one delivery line)."""
    eps = 1e-5
    if not items:
        return "pending"
    groups: dict[int | str, list[StockDocumentItem]] = defaultdict(list)
    for i in items:
        if i.delivery_item_id is not None:
            key: int | str = int(i.delivery_item_id)
        else:
            key = f"row:{i.id}"
        groups[key].append(i)

    any_received = False
    all_fully_received = True
    for group in groups.values():
        ordered = max(float(x.ordered_quantity or 0) for x in group)
        received = sum(float(x.received_quantity or 0) for x in group)
        if received > eps:
            any_received = True
        if ordered > eps and received + eps < ordered:
            all_fully_received = False
    if not any_received:
        return "pending"
    if all_fully_received:
        return "received"
    return "in_progress"


def compute_is_fully_received_for_items(items: List[StockDocumentItem]) -> bool:
    return compute_line_receiving_progress(items) == "received"


def sum_putaway_operations_for_line(db: Session, item_id: int) -> float:
    v = (
        db.query(func.coalesce(func.sum(StockOperation.qty), 0.0))
        .filter(
            StockOperation.document_line_id == int(item_id),
            StockOperation.type == STOCK_OP_PUTAWAY,
        )
        .scalar()
    )
    return float(v or 0)


def effective_putaway_quantity_for_line(db: Session, row: StockDocumentItem) -> float:
    """Prefer SUM(PUTAWAY operations); fallback to quantity_putaway column."""
    sum_ops = sum_putaway_operations_for_line(db, int(row.id))
    col_put = float(getattr(row, "quantity_putaway", 0) or 0)
    return sum_ops if sum_ops > 1e-9 else col_put


def compute_is_fully_putaway_for_items(db: Session, items: List[StockDocumentItem]) -> bool:
    """Lines with received > 0 must have effective putaway >= received_quantity."""
    from .complaints.complaint_physical_receipt import filter_putaway_eligible_lines

    eps = 1e-5
    eligible = filter_putaway_eligible_lines(db, items)
    for row in eligible:
        rec = float(row.received_quantity or 0)
        if rec <= eps:
            continue
        if is_stock_document_item_wm_material(row):
            continue
        put = effective_putaway_quantity_for_line(db, row)
        if put + eps < rec:
            return False
    return True


def _doc_status_lower(doc: StockDocument) -> str:
    return str(getattr(doc, "status", "") or "").lower()


def _doc_type_upper(doc: StockDocument) -> str:
    return str(getattr(doc, "document_type", "") or "").strip().upper()


def is_z_pz_collective_open(doc: StockDocument) -> bool:
    """Collective Z-PZ still accepting RMZ lines — relocation must not auto-close."""
    return (
        _doc_type_upper(doc) == "Z_PZ"
        and bool(getattr(doc, "is_collective_return_receipt", False))
        and _doc_status_lower(doc) == "open"
    )


def doc_allows_wms_putaway(doc: StockDocument) -> bool:
    """Whether WMS putaway / relocation execution is allowed for this document."""
    dt = _doc_type_upper(doc)
    st = str(getattr(doc, "status", "") or "").strip().upper()
    if dt == "MM":
        return st == "DRAFT"
    if dt in ("Z_PZ", "PZ_RT", "RETURN_RECEIPT"):
        return st in ("DRAFT", "OPEN", "CLOSED", "POSTED", "ZAKONCZONE")
    if dt == "PZ":
        return st in ("DRAFT", "POSTED", "ZAKONCZONE")
    if dt == "PW" and str(getattr(doc, "creation_source", "") or "").upper() == "PRODUCTION":
        return st in ("DRAFT", "POSTED", "ZAKONCZONE", "COMPLETED")
    return False


def compute_can_wms_putaway(doc: StockDocument) -> bool:
    """SSOT: backend gate mirrored on StockDocumentRead.can_wms_putaway for UI."""
    rls = str(getattr(doc, "relocation_status", "") or "OPEN").strip().upper()
    if rls == "DONE":
        return False
    return doc_allows_wms_putaway(doc)


def doc_allows_putaway_status_recompute(doc: StockDocument) -> bool:
    """Same lifecycle gate as putaway execution — keeps putaway_status in sync for Z-PZ OPEN/CLOSED."""
    dt = _doc_type_upper(doc)
    if dt not in ("PZ", "Z_PZ", "PZ_RT", "RETURN_RECEIPT", "MM", "PW"):
        return False
    return doc_allows_wms_putaway(doc)


def wms_putaway_queue_statuses() -> tuple[str, ...]:
    """stock_documents.status values eligible for the WMS PZ putaway list."""
    return ("draft", "posted", "CLOSED", "OPEN", "zakonczone")


def is_stock_document_cancelled(doc: StockDocument) -> bool:
    return _doc_status_lower(doc) in _CANCELLED_STATUS_TOKENS


def is_stock_document_posted(doc: StockDocument) -> bool:
    return _doc_status_lower(doc) == "posted"


def is_warehouse_doc_nowe(doc: StockDocument, items: List[StockDocumentItem]) -> bool:
    """Business NOWE: draft, no receipts, WMS receiving/putaway not started beyond NEW / NOT_STARTED."""
    if _doc_status_lower(doc) != "draft" or is_stock_document_cancelled(doc):
        return False
    tr = sum(float(x.received_quantity or 0) for x in items)
    if tr > 1e-9:
        return False
    rs = str(getattr(doc, "receiving_status", "") or "").strip().upper()
    if rs in ("IN_PROGRESS", "DONE"):
        return False
    ps = str(getattr(doc, "putaway_status", "") or "").strip().upper()
    if ps not in ("NOT_STARTED", ""):
        return False
    return True


def compute_document_edit_mode(doc: StockDocument, items: List[StockDocumentItem]) -> str:
    if is_stock_document_cancelled(doc) or is_stock_document_posted(doc):
        return "none"
    if _doc_status_lower(doc) != "draft":
        return "none"
    if is_warehouse_doc_nowe(doc, items):
        return "full"
    return "metadata"


def compute_document_edit_mode_for_list_row(doc: StockDocument, total_received: float) -> str:
    """Same rules as compute_document_edit_mode without loading lines (uses summed received)."""
    if is_stock_document_cancelled(doc) or is_stock_document_posted(doc):
        return "none"
    if _doc_status_lower(doc) != "draft":
        return "none"
    tr = float(total_received or 0)
    if tr > 1e-9:
        return "metadata"
    rs = str(getattr(doc, "receiving_status", "") or "").strip().upper()
    if rs in ("IN_PROGRESS", "DONE"):
        return "metadata"
    ps = str(getattr(doc, "putaway_status", "") or "").strip().upper()
    if ps not in ("NOT_STARTED", ""):
        return "metadata"
    return "full"


def stock_document_blocking_activity_details(db: Session, document_id: int) -> Dict[str, Any]:
    """
    True warehouse activity blocks cancel: append-only stock_operations (movements),
    line-level received quantities, putaway rows (stock_item_locations).
    Generic stock_movements / stock_reservations tables are not linked to stock_documents in this schema.
    """
    eps = 1e-9
    has_stock_operations = (
        db.query(StockOperation.id).filter(StockOperation.document_id == document_id).first() is not None
    )
    lines = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == document_id)
        .all()
    )
    has_line_receipts = any(float(getattr(x, "received_quantity", 0) or 0) > eps for x in lines)
    item_ids = [x.id for x in lines]
    has_putaway_allocations = False
    if item_ids:
        has_putaway_allocations = (
            db.query(StockItemLocation.id)
            .filter(
                StockItemLocation.stock_document_item_id.in_(item_ids),
                StockItemLocation.quantity > eps,
            )
            .first()
            is not None
        )
    has_operations = bool(has_stock_operations or has_line_receipts or has_putaway_allocations)
    return {
        "has_operations": has_operations,
        "has_stock_operations": has_stock_operations,
        "has_line_receipts": has_line_receipts,
        "has_putaway_allocations": has_putaway_allocations,
    }


def compute_can_cancel_document(db: Session, doc: StockDocument) -> bool:
    if _doc_status_lower(doc) != "draft" or is_stock_document_cancelled(doc):
        return False
    return not stock_document_blocking_activity_details(db, doc.id)["has_operations"]


def recompute_putaway_status_for_document(
    doc: StockDocument,
    item_rows: List[StockDocumentItem],
    db: Session | None = None,
) -> None:
    """PZ / Z-PZ / MM: NOT_STARTED | IN_PROGRESS | DONE from lines (received > 0)."""
    if not doc_allows_putaway_status_recompute(doc):
        return
    from .complaints.complaint_physical_receipt import filter_putaway_eligible_lines

    eps = 1e-5
    rows_for_putaway = item_rows if db is None else filter_putaway_eligible_lines(db, item_rows)
    candidates = [
        r
        for r in rows_for_putaway
        if float(r.received_quantity or 0) > eps and not is_stock_document_item_wm_material(r)
    ]
    if not candidates:
        doc.putaway_status = "NOT_STARTED"
        return
    all_done = True
    any_put = False
    for r in candidates:
        rec = float(r.received_quantity or 0)
        if db is not None:
            put = effective_putaway_quantity_for_line(db, r)
        else:
            put = float(getattr(r, "quantity_putaway", 0) or 0)
        if put > eps:
            any_put = True
        if put + eps < rec:
            all_done = False
    if all_done:
        doc.putaway_status = "DONE"
    elif any_put:
        doc.putaway_status = "IN_PROGRESS"
    else:
        doc.putaway_status = "NOT_STARTED"


def recalculate_wms_document_completion(db: Session, tenant_id: int, document_id: int) -> bool:
    """
    Sync putaway totals from operations and auto-close WMS receiving / relocation when complete.
    Returns True when document fields were updated (caller should commit).
    """
    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == int(document_id), StockDocument.tenant_id == int(tenant_id))
        .first()
    )
    if not doc:
        return False
    dt = str(getattr(doc, "document_type", "") or "").strip().upper()
    if dt not in ("PZ", "Z_PZ", "PZ_RT", "RETURN_RECEIPT", "MM", "PW"):
        return False
    if is_stock_document_cancelled(doc):
        return False

    rows: List[StockDocumentItem] = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == int(document_id))
        .order_by(StockDocumentItem.id)
        .all()
    )
    if not rows:
        return False

    eps = 1e-5
    changed = False
    for row in rows:
        ops_sum = sum_putaway_operations_for_line(db, int(row.id))
        if ops_sum > 1e-9 and abs(ops_sum - float(row.quantity_putaway or 0)) > eps:
            row.quantity_putaway = ops_sum
            db.add(row)
            changed = True

    any_rec = any(float(r.received_quantity or 0) > eps for r in rows)
    full_recv = compute_is_fully_received_for_items(rows)
    full_put = compute_is_fully_putaway_for_items(db, rows)

    rs_before = str(getattr(doc, "receiving_status", "") or "").strip().upper()
    if any_rec and rs_before in ("", "NEW", "PENDING"):
        doc.receiving_status = "IN_PROGRESS"
        changed = True
    if full_recv and any_rec and rs_before != "DONE":
        doc.receiving_status = "DONE"
        changed = True

    ps_before = str(getattr(doc, "putaway_status", "") or "").strip().upper()
    recompute_putaway_status_for_document(doc, rows, db)
    if str(getattr(doc, "putaway_status", "") or "").strip().upper() != ps_before:
        changed = True

    rls_before = str(getattr(doc, "relocation_status", "") or "").strip().upper()
    if full_recv and full_put and rls_before != "DONE" and not is_z_pz_collective_open(doc):
        doc.relocation_status = "DONE"
        changed = True

    st_before = _doc_status_lower(doc)
    if full_recv and full_put and st_before in ("draft", "closed"):
        doc.status = "zakonczone"
        changed = True

    if changed:
        doc.updated_at = datetime.utcnow()
        db.add(doc)

    from .receiving_workflow_status_service import sync_warehouse_workflow_status

    if sync_warehouse_workflow_status(doc, rows, db, full_recv=full_recv, full_put=full_put):
        doc.updated_at = datetime.utcnow()
        db.add(doc)
        changed = True

    if changed and dt == "PW":
        from .production_execution.batch_putaway_completion import try_complete_production_execution_from_pw_document

        try_complete_production_execution_from_pw_document(db, doc)

    return changed


def bump_receiving_in_progress_if_new(doc: StockDocument) -> None:
    """First WMS receiving activity: NEW → IN_PROGRESS."""
    s = str(getattr(doc, "receiving_status", "") or "").strip().upper()
    if s in ("", "NEW", "PENDING"):
        doc.receiving_status = "IN_PROGRESS"


def _item_storage_lot_inventory_key(row: StockDocumentItem, p: Optional[Product]) -> tuple[int, str, object]:
    """Inventory row key (product, batch, expiry storage) for a PZ line."""
    if row.product_id is None:
        raise ValueError("internal: inventory lot key requested for a non-product PZ line")
    tb = bool(getattr(p, "track_batch", False)) if p else False
    te = bool(getattr(p, "track_expiry", False)) if p else False
    bn = "" if not tb else normalize_batch_number(getattr(row, "batch_number", None))
    if not te:
        ed_store = NO_EXPIRY_SENTINEL
    else:
        ed_raw = getattr(row, "expiry_date", None)
        ed_store = ed_raw if ed_raw is not None else NO_EXPIRY_SENTINEL
    return int(row.product_id), bn, ed_store


def _putaway_allocations_by_line_id(
    db: Session,
    tenant_id: int,
    warehouse_id: Optional[int],
    item_rows: List[StockDocumentItem],
    prod_by_id: Dict[int, Product],
) -> Dict[int, List[PutawayAllocationRead]]:
    """Aggregate inventory by storage location for each PZ line lot (draft putaway postings)."""
    empty: Dict[int, List[PutawayAllocationRead]] = {r.id: [] for r in item_rows}
    if warehouse_id is None or not item_rows:
        return empty

    pids = list({r.product_id for r in item_rows if r.product_id is not None})
    inv_rows = (
        db.query(Inventory)
        .filter(
            Inventory.tenant_id == tenant_id,
            Inventory.warehouse_id == warehouse_id,
            Inventory.product_id.in_(pids),
        )
        .all()
    )

    lot_loc_qty: dict[tuple[int, str, object], dict[int, float]] = defaultdict(lambda: defaultdict(float))
    for inv in inv_rows:
        bn = normalize_batch_number(getattr(inv, "batch_number", None))
        ed_inv = getattr(inv, "expiry_date", None)
        if ed_inv is None:
            ed_inv = NO_EXPIRY_SENTINEL
        key = (int(inv.product_id), bn, ed_inv)
        lid = int(inv.location_id)
        lot_loc_qty[key][lid] += float(inv.quantity or 0)

    raw: Dict[int, list[tuple[int, float]]] = {r.id: [] for r in item_rows}
    loc_ids: set[int] = set()
    for row in item_rows:
        if row.product_id is None:
            continue
        p = prod_by_id.get(row.product_id)
        ikey = _item_storage_lot_inventory_key(row, p)
        for lid, q in lot_loc_qty.get(ikey, {}).items():
            if q <= 1e-9:
                continue
            raw[row.id].append((lid, q))
            loc_ids.add(lid)

    loc_by_id: dict[int, Location] = {}
    if loc_ids:
        for loc in db.query(Location).filter(Location.id.in_(loc_ids)).all():
            loc_by_id[int(loc.id)] = loc

    st_by_lid = batch_location_storage_types(db, warehouse_id, list(loc_by_id.values()))

    out: Dict[int, List[PutawayAllocationRead]] = {}
    for row in item_rows:
        rows_sorted = sorted(raw[row.id], key=lambda x: (-x[1], x[0]))
        reads: List[PutawayAllocationRead] = []
        for lid, qty in rows_sorted:
            loc = loc_by_id.get(lid)
            code = (loc.name or "").strip() if loc else ""
            if not code:
                code = f"#{lid}"
            kind = wms_location_badge_kind(loc) if loc else "PICK"
            zn = (getattr(loc, "rack_name", None) or "").strip() or None if loc else None
            ct = (getattr(loc, "type", None) or "").strip().lower() or None if loc else None
            reads.append(
                PutawayAllocationRead(
                    location_id=lid,
                    location_code=code,
                    location_type=kind,
                    storage_type=st_by_lid.get(lid, "unknown"),
                    quantity=qty,
                    location_name=code,
                    zone=zn,
                    capacity_type=ct,
                )
            )
        out[row.id] = reads
    return out


def _putaway_allocations_from_operations(
    db: Session,
    item_ids: List[int],
    warehouse_id: Optional[int] = None,
) -> Dict[int, List[PutawayAllocationRead]]:
    """Putaway splits from append-only stock_operations (SUM qty per line × location, type=PUTAWAY)."""
    if not item_ids:
        return {}
    from ..models.stock_operation import STOCK_OP_PUTAWAY, StockOperation
    from sqlalchemy import func

    agg_rows = (
        db.query(
            StockOperation.document_line_id,
            StockOperation.location_id,
            func.sum(StockOperation.qty).label("sqty"),
        )
        .filter(
            StockOperation.document_line_id.in_(item_ids),
            StockOperation.type == STOCK_OP_PUTAWAY,
            StockOperation.location_id.isnot(None),
        )
        .group_by(StockOperation.document_line_id, StockOperation.location_id)
        .all()
    )
    if not agg_rows:
        return {i: [] for i in item_ids}

    loc_ids = {int(r[1]) for r in agg_rows if r[1] is not None}
    loc_by_id: dict[int, Location] = {}
    if loc_ids:
        for loc in db.query(Location).filter(Location.id.in_(loc_ids)).all():
            loc_by_id[int(loc.id)] = loc

    st_by_lid = batch_location_storage_types(db, warehouse_id, list(loc_by_id.values()))

    by_item: Dict[int, List[PutawayAllocationRead]] = defaultdict(list)
    for line_id, lid_raw, sqty in agg_rows:
        if lid_raw is None:
            continue
        q = float(sqty or 0)
        if q <= 1e-9:
            continue
        lid = int(lid_raw)
        loc = loc_by_id.get(lid)
        code = (loc.name or "").strip() or f"#{lid}"
        kind = wms_location_badge_kind(loc) if loc else "PICK"
        zn = (getattr(loc, "rack_name", None) or "").strip() or None if loc else None
        ct = (getattr(loc, "type", None) or "").strip().lower() or None if loc else None
        by_item[int(line_id)].append(
            PutawayAllocationRead(
                location_id=lid,
                location_code=code,
                location_type=kind,
                storage_type=st_by_lid.get(lid, "unknown"),
                quantity=q,
                location_name=code,
                zone=zn,
                capacity_type=ct,
            )
        )
    return {i: list(by_item.get(i, [])) for i in item_ids}


def _putaway_allocations_from_table(
    db: Session,
    item_ids: List[int],
    warehouse_id: Optional[int] = None,
) -> Dict[int, List[PutawayAllocationRead]]:
    """Legacy: stock_item_locations (per PZ line × location). Used only if no operations exist."""
    if not item_ids:
        return {}
    from ..models.stock_item_location import StockItemLocation

    rows = (
        db.query(StockItemLocation, Location)
        .join(Location, Location.id == StockItemLocation.location_id)
        .filter(StockItemLocation.stock_document_item_id.in_(item_ids))
        .order_by(StockItemLocation.stock_document_item_id, StockItemLocation.location_id)
        .all()
    )
    uniq_locs = {int(loc.id): loc for _, loc in rows}
    st_by_lid = batch_location_storage_types(db, warehouse_id, list(uniq_locs.values()))

    by_item: Dict[int, List[PutawayAllocationRead]] = defaultdict(list)
    for sil, loc in rows:
        q = float(sil.quantity or 0)
        if q <= 1e-9:
            continue
        code = (loc.name or "").strip() or f"#{loc.id}"
        lid = int(loc.id)
        kind = wms_location_badge_kind(loc) if loc else "PICK"
        zn = (getattr(loc, "rack_name", None) or "").strip() or None
        ct = (getattr(loc, "type", None) or "").strip().lower() or None
        by_item[int(sil.stock_document_item_id)].append(
            PutawayAllocationRead(
                location_id=lid,
                location_code=code,
                location_type=kind,
                storage_type=st_by_lid.get(lid, "unknown"),
                quantity=q,
                location_name=code,
                zone=zn,
                capacity_type=ct,
            )
        )
    return {i: list(by_item.get(i, [])) for i in item_ids}


def _product_sku(p: Product) -> Optional[str]:
    for attr in ("sku", "symbol"):
        v = getattr(p, attr, None)
        if v is not None:
            s = str(v).strip()
            if s:
                return s
    return None


def _receiving_scan_logs_to_reads(
    logs: List[ReceivingScanLog],
    admin_display_by_id: Optional[Dict[int, str]] = None,
) -> List[ReceivingScanLogRead]:
    names = admin_display_by_id or {}
    out: List[ReceivingScanLogRead] = []
    for lg in logs:
        aid = int(lg.admin_id)
        label = (names.get(aid) or "").strip() or f"Operator #{aid}"
        out.append(
            ReceivingScanLogRead(
                id=int(lg.id),
                admin_id=aid,
                admin_display_name=label,
                quantity_added=float(lg.quantity_added),
                packaging_type=str(lg.packaging_type or "quantity"),
                cartons_added=lg.cartons_added,
                loose_units_added=lg.loose_units_added,
                created_at=lg.created_at,
            )
        )
    return out


def _z_pz_return_decision_label(raw: Optional[str]) -> Optional[str]:
    u = (raw or "").strip().upper()
    if u == "ACCEPTED":
        return "A"
    if u == "DAMAGED_B":
        return "B"
    if u == "DAMAGED_C":
        return "C"
    return None


def _item_row_to_read(
    row: StockDocumentItem,
    p: Optional[Product],
    visuals: ReceiptLineVisuals,
    db: Session,
    *,
    wms_settings=None,
    putaway_allocations: Optional[List[PutawayAllocationRead]] = None,
    quantity_putaway_override: Optional[float] = None,
    mm_line_from_location_id: Optional[int] = None,
    mm_line_from_location_name: Optional[str] = None,
    receiving_scan_logs: Optional[List[ReceivingScanLogRead]] = None,
    putaway_last_operator_name: Optional[str] = None,
    line_warehouse_carrier_code: Optional[str] = None,
    line_warehouse_carrier_id: Optional[int] = None,
    wms_extra_item: bool = False,
    wms_line_status: Optional[str] = None,
    wms_line_source: Optional[str] = None,
    serial_numbers: Optional[List[str]] = None,
    serial_range_label: Optional[str] = None,
    source_rmz_id: Optional[int] = None,
    source_rmz_number: Optional[str] = None,
    return_decision: Optional[str] = None,
    return_decision_label: Optional[str] = None,
    sales_blocked_qty: float = 0.0,
    sales_block_effective_qty: float = 0.0,
    sales_block_reason_code: Optional[str] = None,
    sales_block_reason_label: Optional[str] = None,
    sales_block_note: Optional[str] = None,
    sales_blocked_at=None,
    sales_blocked_by_user_id: Optional[int] = None,
    line_commercial_available_qty: float = 0.0,
    line_remaining_qty: float = 0.0,
) -> StockDocumentItemRead:
    o = float(row.ordered_quantity or 0)
    r = float(row.received_quantity or 0)
    pp = float(row.purchase_price_net) if row.purchase_price_net is not None else None
    pname = (visuals.name or "").strip() or None
    img = (visuals.image_url or "").strip() or None
    sku = (visuals.sku or "").strip() or None
    ean = (visuals.ean or "").strip() or None
    line_unit = (visuals.unit or "").strip() or None
    tb = te = ts = False
    if p and row.product_id is not None:
        from .product_validation_policy import effective_trace_flags

        tb, te, ts = effective_trace_flags(p, wms_settings)
    rtype_lit: Optional[ReceiptLineTypeLit] = visuals.item_type  # type: ignore[assignment]
    bn = normalize_batch_number(getattr(row, "batch_number", None))
    ed_raw = getattr(row, "expiry_date", None)
    exp_api = None
    if ed_raw is not None and ed_raw < NO_EXPIRY_SENTINEL:
        exp_api = ed_raw
    put = (
        float(quantity_putaway_override)
        if quantity_putaway_override is not None
        else float(getattr(row, "quantity_putaway", 0) or 0)
    )
    pua = getattr(row, "putaway_updated_at", None)
    pln_raw = getattr(row, "putaway_last_location_name", None)
    pln = (str(pln_raw).strip() or None) if pln_raw is not None else None
    plt = getattr(row, "putaway_last_location_type", None)
    plt_s = (str(plt).strip() or None) if plt is not None else None
    pla_raw = getattr(row, "putaway_last_admin_id", None)
    pla_id = int(pla_raw) if pla_raw is not None and int(pla_raw) > 0 else None
    plq_raw = getattr(row, "putaway_last_quantity", None)
    plq = float(plq_raw) if plq_raw is not None and float(plq_raw) > 0 else None
    pl_op = (putaway_last_operator_name or "").strip() or None
    cc = int(getattr(row, "cartons_count", 0) or 0)
    lu = int(getattr(row, "loose_units_count", 0) or 0)
    scid = getattr(row, "suggested_warehouse_carrier_id", None)
    sugg_bc = None
    if scid:
        wc = (
            db.query(WarehouseCarrier)
            .filter(WarehouseCarrier.id == int(scid), WarehouseCarrier.deleted_at.is_(None))
            .first()
        )
        sugg_bc = (wc.barcode or "").strip() if wc else None
    return StockDocumentItemRead(
        id=row.id,
        product_id=row.product_id,
        receipt_line_type=rtype_lit,
        item_type=rtype_lit,
        item_id=visuals.item_id,
        line_unit=line_unit,
        product_name=pname,
        product_image_url=img,
        image_url=img,
        product_ean=ean,
        product_sku=sku,
        ordered_quantity=o,
        received_quantity=r,
        quantity=r,
        cartons_count=cc,
        loose_units_count=lu,
        purchase_price_net=pp,
        vat_rate=float(row.vat_rate),
        delivery_item_id=row.delivery_item_id,
        batch_number=bn,
        expiry_date=exp_api,
        track_batch=tb,
        track_expiry=te,
        track_serial=ts,
        quantity_putaway=put,
        putaway_updated_at=pua,
        putaway_last_location_name=pln,
        putaway_last_location_type=plt_s,
        putaway_last_admin_id=pla_id,
        putaway_last_operator_name=pl_op,
        putaway_last_quantity=plq,
        putaway_allocations=list(putaway_allocations or []),
        mm_line_from_location_id=mm_line_from_location_id,
        mm_line_from_location_name=mm_line_from_location_name,
        stock_disposition=stock_disposition_for_document_line(row),
        receiving_scan_logs=list(receiving_scan_logs or []),
        suggested_warehouse_carrier_id=int(scid) if scid is not None else None,
        suggested_warehouse_carrier_barcode=sugg_bc,
        warehouse_carrier_id=int(line_warehouse_carrier_id) if line_warehouse_carrier_id is not None else None,
        warehouse_carrier_code=(line_warehouse_carrier_code or "").strip() or None,
        wms_extra_item=bool(wms_extra_item),
        wms_line_status=wms_line_status,
        wms_line_source=wms_line_source,
        serial_numbers=list(serial_numbers or []),
        serial_range_label=serial_range_label,
        source_rmz_id=source_rmz_id,
        source_rmz_number=(source_rmz_number or "").strip() or None,
        return_decision=(return_decision or "").strip() or None,
        return_decision_label=return_decision_label,
        sales_blocked_qty=float(sales_blocked_qty or 0),
        sales_block_effective_qty=float(sales_block_effective_qty or 0),
        sales_block_reason_code=sales_block_reason_code,
        sales_block_reason_label=sales_block_reason_label,
        sales_block_note=sales_block_note,
        sales_blocked_at=sales_blocked_at,
        sales_blocked_by_user_id=sales_blocked_by_user_id,
        line_commercial_available_qty=float(line_commercial_available_qty or 0),
        line_remaining_qty=float(line_remaining_qty or 0),
    )


def _wms_extra_pz_line(row: StockDocumentItem, doc: StockDocument, eps: float = 1e-9) -> bool:
    if str(getattr(doc, "document_type", "") or "").strip().upper() != "PZ":
        return False
    if row.delivery_item_id is not None:
        return False
    if float(row.ordered_quantity or 0) > eps:
        return False
    return True


def warehouse_document_lines_for_order(
    db: Session,
    order_id: int,
    *,
    document_type: str = "WZ",
    document_view: str = "WAREHOUSE",
):
    """
    P4.14A — projekcje linii dokumentu magazynowego z BundleLineResolver (SSOT).

    Używać zamiast lokalnego filtrowania ``is_bundle_parent`` przy WZ/RW/MM/PZ.
    """
    from ..models.order import Order
    from .bundles.bundle_warehouse_document_service import document_lines_for_order

    order = db.query(Order).filter(Order.id == int(order_id)).first()
    if order is None:
        return []
    return document_lines_for_order(
        db,
        order,
        document_type=document_type,  # type: ignore[arg-type]
        document_view=document_view,  # type: ignore[arg-type]
    )


def build_stock_document_read(
    db: Session,
    doc: StockDocument,
    *,
    force_visible_item_ids: Optional[set[int]] = None,
) -> StockDocumentRead:
    dt_b = str(getattr(doc, "document_type", "") or "").strip().upper()
    if dt_b in ("PZ", "Z_PZ", "PZ_RT", "RETURN_RECEIPT", "MM") and _doc_status_lower(doc) in ("draft", "zakonczone"):
        if recalculate_wms_document_completion(db, int(doc.tenant_id), int(doc.id)):
            db.flush()
            db.refresh(doc)
    item_rows: List[StockDocumentItem] = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == doc.id)
        .order_by(StockDocumentItem.id)
        .all()
    )
    pids = {r.product_id for r in item_rows if r.product_id is not None}
    prod_by_id: Dict[int, Product] = {}
    if pids:
        prod_by_id = {p.id: p for p in db.query(Product).filter(Product.id.in_(pids)).all()}
    di_ids = [int(r.delivery_item_id) for r in item_rows if r.delivery_item_id is not None]
    di_by_id: Dict[int, DeliveryItem] = {}
    if di_ids:
        for di in db.query(DeliveryItem).filter(DeliveryItem.id.in_(di_ids)).all():
            di_by_id[int(di.id)] = di
    hide_ghosts = str(getattr(doc, "document_type", "") or "") == "PZ" and str(getattr(doc, "status", "") or "") == "draft"
    force_ids = {int(x) for x in (force_visible_item_ids or set())}
    visible_rows: List[StockDocumentItem] = []
    for row in item_rows:
        if hide_ghosts and is_wms_ghost_stock_document_item(row) and int(row.id) not in force_ids:
            continue
        visible_rows.append(row)

    visible_ids = {int(r.id) for r in visible_rows}
    logs_by_line: Dict[int, List[ReceivingScanLog]] = defaultdict(list)
    if visible_ids:
        for lg in (
            db.query(ReceivingScanLog)
            .filter(ReceivingScanLog.document_id == doc.id)
            .order_by(ReceivingScanLog.created_at.asc(), ReceivingScanLog.id.asc())
            .all()
        ):
            iid = int(lg.item_id)
            if iid in visible_ids:
                logs_by_line[iid].append(lg)

    audit_admin_ids: set[int] = set()
    for logs in logs_by_line.values():
        for lg in logs:
            audit_admin_ids.add(int(lg.admin_id))
    for row in visible_rows:
        pla = getattr(row, "putaway_last_admin_id", None)
        if pla is not None and int(pla) > 0:
            audit_admin_ids.add(int(pla))
    audit_users_by_id = batch_load_app_users(db, audit_admin_ids)
    audit_display_by_id = {uid: app_user_full_name(u) for uid, u in audit_users_by_id.items()}

    alloc_by_id = _putaway_allocations_by_line_id(db, doc.tenant_id, doc.warehouse_id, visible_rows, prod_by_id)
    item_id_list = [r.id for r in visible_rows]
    op_alloc_by_id = _putaway_allocations_from_operations(db, item_id_list, doc.warehouse_id)
    sil_alloc_by_id = _putaway_allocations_from_table(db, item_id_list, doc.warehouse_id)

    mm_lids = {
        int(getattr(r, "mm_line_from_location_id"))
        for r in visible_rows
        if getattr(r, "mm_line_from_location_id", None) is not None
    }
    mm_loc_name: dict[int, str] = {}
    if mm_lids:
        for loc in db.query(Location).filter(Location.id.in_(mm_lids)).all():
            mm_loc_name[int(loc.id)] = (loc.name or "").strip() or f"#{loc.id}"

    line_wc_ids = {
        int(getattr(r, "warehouse_carrier_id"))
        for r in visible_rows
        if getattr(r, "warehouse_carrier_id", None) is not None
    }
    line_wc_by_id: Dict[int, WarehouseCarrier] = {}
    if line_wc_ids:
        for wc in db.query(WarehouseCarrier).filter(WarehouseCarrier.id.in_(line_wc_ids)).all():
            if getattr(wc, "deleted_at", None) is None:
                line_wc_by_id[int(wc.id)] = wc

    rcv_rows = (
        db.query(ReceivingDocumentCarrier)
        .filter(ReceivingDocumentCarrier.document_id == doc.id)
        .order_by(ReceivingDocumentCarrier.id)
        .all()
    )
    rcv_wc_ids = list({int(r.warehouse_carrier_id) for r in rcv_rows})
    rcv_wc_by_id: Dict[int, WarehouseCarrier] = {}
    if rcv_wc_ids:
        for wc in db.query(WarehouseCarrier).filter(WarehouseCarrier.id.in_(rcv_wc_ids)).all():
            if getattr(wc, "deleted_at", None) is None:
                rcv_wc_by_id[int(wc.id)] = wc
    receiving_carriers_out: List[ReceivingPzCarrierRead] = []
    for link in rcv_rows:
        wc = rcv_wc_by_id.get(int(link.warehouse_carrier_id))
        if wc:
            receiving_carriers_out.append(
                ReceivingPzCarrierRead(
                    carrier_id=int(wc.id),
                    code=(wc.code or "").strip(),
                    barcode=(wc.barcode or "").strip(),
                )
            )

    serials_by_line = list_serials_for_document_lines(db, [int(r.id) for r in visible_rows])

    rmz_number_by_id: Dict[int, str] = {}
    if dt_b == "Z_PZ":
        rmz_ids = {
            int(getattr(r, "source_rmz_id"))
            for r in visible_rows
            if getattr(r, "source_rmz_id", None) is not None
        }
        if rmz_ids:
            for ret in db.query(WmsOrderReturn).filter(WmsOrderReturn.id.in_(rmz_ids)).all():
                num = (getattr(ret, "rmz_number", None) or "").strip()
                if num:
                    rmz_number_by_id[int(ret.id)] = num

    def _zpz_item_extras(row: StockDocumentItem) -> dict[str, Any]:
        if dt_b != "Z_PZ":
            return {}
        sid = getattr(row, "source_rmz_id", None)
        sid_i = int(sid) if sid is not None else None
        rd_raw = getattr(row, "return_decision", None)
        rd_s = (str(rd_raw).strip() if rd_raw is not None else "") or None
        return {
            "source_rmz_id": sid_i,
            "source_rmz_number": rmz_number_by_id.get(sid_i) if sid_i is not None else None,
            "return_decision": rd_s,
            "return_decision_label": _z_pz_return_decision_label(rd_s),
        }

    def _sales_block_item_extras(row: StockDocumentItem) -> dict[str, Any]:
        if dt_b != "PZ":
            return {}
        return sales_block_line_projection(
            db,
            tenant_id=int(doc.tenant_id),
            warehouse_id=getattr(doc, "warehouse_id", None),
            doc=doc,
            line=row,
        )

    item_reads: List[StockDocumentItemRead] = []
    from .product_validation_policy import load_wms_settings_for_product

    wms_settings = load_wms_settings_for_product(
        db,
        tenant_id=int(doc.tenant_id),
        warehouse_id=getattr(doc, "warehouse_id", None),
    )
    for row in visible_rows:
        p = prod_by_id.get(row.product_id) if row.product_id is not None else None
        di = di_by_id.get(int(row.delivery_item_id)) if row.delivery_item_id is not None else None
        visuals = resolve_receipt_line_visuals(db, doc.tenant_id, row, di, p)
        ta = op_alloc_by_id.get(row.id, [])
        if not ta:
            ta = sil_alloc_by_id.get(row.id, [])
        mm_lid = getattr(row, "mm_line_from_location_id", None)
        mm_lid_i = int(mm_lid) if mm_lid is not None else None
        mm_nm = mm_loc_name.get(mm_lid_i) if mm_lid_i is not None else None
        line_log_reads = _receiving_scan_logs_to_reads(
            logs_by_line.get(int(row.id), []),
            audit_display_by_id,
        )
        pla_raw = getattr(row, "putaway_last_admin_id", None)
        pla_id = int(pla_raw) if pla_raw is not None and int(pla_raw) > 0 else None
        putaway_op_name = audit_display_by_id.get(pla_id) if pla_id is not None else None
        wcid = getattr(row, "warehouse_carrier_id", None)
        lw_id = int(wcid) if wcid is not None else None
        lw_code = None
        if lw_id is not None and lw_id in line_wc_by_id:
            wco = line_wc_by_id[lw_id]
            lw_code = ((wco.code or "").strip() or (wco.barcode or "").strip() or None)
        wms_extra = _wms_extra_pz_line(row, doc)
        wms_status = "EXTRA_ITEM" if wms_extra else None
        wms_source = getattr(row, "wms_line_source", None) if wms_extra else None
        line_serials = serials_by_line.get(int(row.id), [])
        sn_list = [(s.serial_number or "").strip() for s in line_serials if (s.serial_number or "").strip()]
        sn_range = serial_range_label(line_serials)
        if ta:
            put_sum = sum(float(x.quantity) for x in ta)
            q_put = (
                visuals.putaway_quantity_read_override
                if visuals.putaway_quantity_read_override is not None
                else put_sum
            )
            item_reads.append(
                _item_row_to_read(
                    row,
                    p,
                    visuals,
                    db,
                    wms_settings=wms_settings,
                    putaway_allocations=ta,
                    quantity_putaway_override=q_put,
                    mm_line_from_location_id=mm_lid_i,
                    mm_line_from_location_name=mm_nm,
                    receiving_scan_logs=line_log_reads,
                    putaway_last_operator_name=putaway_op_name,
                    line_warehouse_carrier_code=lw_code,
                    line_warehouse_carrier_id=lw_id,
                    wms_extra_item=wms_extra,
                    wms_line_status=wms_status,
                    wms_line_source=str(wms_source).strip() if wms_source else None,
                    serial_numbers=sn_list,
                    serial_range_label=sn_range,
                    **_zpz_item_extras(row),
                    **_sales_block_item_extras(row),
                )
            )
        else:
            put = float(getattr(row, "quantity_putaway", 0) or 0)
            putaway_allocations = alloc_by_id.get(row.id, []) if put > 1e-9 else []
            item_reads.append(
                _item_row_to_read(
                    row,
                    p,
                    visuals,
                    db,
                    wms_settings=wms_settings,
                    putaway_allocations=putaway_allocations,
                    quantity_putaway_override=visuals.putaway_quantity_read_override,
                    mm_line_from_location_id=mm_lid_i,
                    mm_line_from_location_name=mm_nm,
                    receiving_scan_logs=line_log_reads,
                    putaway_last_operator_name=putaway_op_name,
                    line_warehouse_carrier_code=lw_code,
                    line_warehouse_carrier_id=lw_id,
                    wms_extra_item=wms_extra,
                    wms_line_status=wms_status,
                    wms_line_source=str(wms_source).strip() if wms_source else None,
                    serial_numbers=sn_list,
                    serial_range_label=sn_range,
                    **_zpz_item_extras(row),
                    **_sales_block_item_extras(row),
                )
            )

    sup = None
    if getattr(doc, "supplier_id", None) is not None:
        sup = db.query(Supplier).filter(Supplier.id == int(doc.supplier_id)).first()
    wh = (
        db.query(Warehouse).filter(Warehouse.id == doc.warehouse_id).first()
        if doc.warehouse_id is not None
        else None
    )
    loc_row = (
        db.query(Location).filter(Location.id == doc.location_id).first()
        if doc.location_id is not None
        else None
    )

    mm_from_id = getattr(doc, "mm_from_location_id", None)
    mm_to_id = getattr(doc, "mm_to_location_id", None)
    mm_from_loc = (
        db.query(Location).filter(Location.id == mm_from_id).first() if mm_from_id is not None else None
    )
    mm_to_loc = db.query(Location).filter(Location.id == mm_to_id).first() if mm_to_id is not None else None

    src_wh_id = getattr(doc, "source_warehouse_id", None)
    dst_wh_id = getattr(doc, "destination_warehouse_id", None)
    src_wh = db.query(Warehouse).filter(Warehouse.id == int(src_wh_id)).first() if src_wh_id is not None else None
    dst_wh = db.query(Warehouse).filter(Warehouse.id == int(dst_wh_id)).first() if dst_wh_id is not None else None

    from .receiving_workflow_status_service import (
        derive_warehouse_workflow_status,
        normalize_purchase_workflow_status,
        normalize_warehouse_workflow_status,
    )

    rs = str(getattr(doc, "receiving_status", None) or "NEW").strip() or "NEW"
    ps = str(getattr(doc, "putaway_status", None) or "NOT_STARTED").strip() or "NOT_STARTED"
    rls = str(getattr(doc, "relocation_status", None) or "OPEN").strip() or "OPEN"
    full_recv = compute_is_fully_received_for_items(item_rows)
    full_put = compute_is_fully_putaway_for_items(db, item_rows)

    wh_ws = normalize_warehouse_workflow_status(
        getattr(doc, "warehouse_workflow_status", None)
        or derive_warehouse_workflow_status(doc, item_rows, db, full_recv=full_recv, full_put=full_put)
    )
    pu_ws = normalize_purchase_workflow_status(getattr(doc, "purchase_workflow_status", None))

    em = compute_document_edit_mode(doc, item_rows)
    if em == "full":
        em_lit: Literal["full", "metadata", "none"] = "full"
    elif em == "metadata":
        em_lit = "metadata"
    else:
        em_lit = "none"
    cc = compute_can_cancel_document(db, doc)
    cur = str(getattr(doc, "currency", None) or "PLN").strip() or "PLN"
    tn: Optional[float] = float(getattr(doc, "total_net")) if getattr(doc, "total_net", None) is not None else None
    tg: Optional[float] = float(getattr(doc, "total_gross")) if getattr(doc, "total_gross", None) is not None else None
    tv: Optional[float] = None
    dt_fin = str(getattr(doc, "document_type", "") or "").strip().upper()
    if visible_rows:
        net, gross, vat = resolve_document_financial_totals(doc, visible_rows)
        tn, tg, tv = net, gross, vat

    order_number: Optional[str] = None
    customer_name: Optional[str] = None
    order_id_raw = getattr(doc, "order_id", None)
    if order_id_raw is not None:
        from ..models.order import Order
        from ..models.customer import Customer

        order_row = db.query(Order).filter(Order.id == int(order_id_raw)).first()
        if order_row is not None:
            order_number = str(order_row.number or "").strip() or None
            if order_row.customer_id is not None:
                cust = db.query(Customer).filter(Customer.id == int(order_row.customer_id)).first()
                if cust is not None:
                    customer_name = (cust.name or "").strip() or None

    series_prefix: Optional[str] = None
    series_brief = resolve_document_series_brief(db, doc)
    if series_brief is not None:
        series_prefix = (series_brief.get("prefix") or series_brief.get("code") or "").strip() or None

    doc_number = str(getattr(doc, "document_number", None) or "").strip() or None

    linked_sale: Optional[dict] = None
    sale_doc_id = str(getattr(doc, "source_sale_document_id", None) or "").strip() or None
    if sale_doc_id:
        from ..models.sale_document import SaleDocument

        sale_row = (
            db.query(SaleDocument)
            .filter(SaleDocument.id == sale_doc_id)
            .first()
        )
        if sale_row is not None:
            panel_type = str(sale_row.panel_document_type or "").strip().upper()
            subtype = str(sale_row.document_subtype or "").strip().upper()
            if not subtype:
                subtype = "INVOICE" if panel_type == "INVOICE" else "RECEIPT"
            linked_sale = {
                "id": str(sale_row.id),
                "document_number": str(sale_row.document_number or "").strip(),
                "document_subtype": subtype,
                "detail_path": f"/documents/sales/{sale_row.id}",
            }

    prod_order_id = getattr(doc, "production_order_id", None)
    prod_order_number: Optional[str] = None
    prod_order_path: Optional[str] = None
    if prod_order_id is not None:
        from ..models.production import ProductionOrder

        po = db.query(ProductionOrder).filter(ProductionOrder.id == int(prod_order_id)).first()
        if po is not None:
            prod_order_number = str(po.number or "").strip() or None
            prod_order_path = f"/production?order={int(po.id)}"

    prod_batch_id = getattr(doc, "production_batch_id", None)
    prod_batch_number: Optional[str] = None
    prod_batch_path: Optional[str] = None
    if prod_batch_id is not None:
        from ..models.product_composition import ProductionBatch

        bat = db.query(ProductionBatch).filter(ProductionBatch.id == int(prod_batch_id)).first()
        if bat is not None:
            prod_batch_number = str(bat.number or "").strip() or None
            prod_batch_path = f"/wms/production/batch/{int(bat.id)}"

    series_model: DocumentSeriesBriefRead | None = None
    if series_brief is not None:
        series_model = DocumentSeriesBriefRead(
            id=series_brief.get("id"),
            code=str(series_brief.get("code") or ""),
            name=series_brief.get("name"),
            prefix=series_brief.get("prefix"),
        )

    doc_status_u = str(getattr(doc, "status", "") or "").strip().upper()
    closed_at_val: Optional[datetime] = None
    if doc_status_u == "CLOSED":
        closed_at_val = getattr(doc, "updated_at", None) or doc.created_at

    return StockDocumentRead(
        id=doc.id,
        tenant_id=doc.tenant_id,
        document_type=doc.document_type,
        document_number=doc_number,
        document_series_prefix=series_prefix,
        series=series_model,
        order_id=int(doc.order_id) if getattr(doc, "order_id", None) else None,
        order_number=order_number,
        customer_name=customer_name,
        source_sale_document_id=sale_doc_id,
        linked_sale_document=linked_sale,
        production_order_id=int(prod_order_id) if prod_order_id is not None else None,
        production_order_number=prod_order_number,
        production_order_path=prod_order_path,
        production_batch_id=int(prod_batch_id) if prod_batch_id is not None else None,
        production_batch_number=prod_batch_number,
        production_batch_path=prod_batch_path,
        supplier_id=doc.supplier_id,
        supplier_name=(sup.name or "").strip() if sup else "",
        delivery_id=doc.delivery_id,
        creation_source=str(getattr(doc, "creation_source", None) or "PANEL").strip().upper() or "PANEL",
        warehouse_id=doc.warehouse_id,
        warehouse_name=(wh.name or "").strip() if wh else "",
        location_id=doc.location_id,
        location_name=(loc_row.name or "").strip() if loc_row else "",
        mm_from_location_id=int(mm_from_id) if mm_from_id is not None else None,
        mm_to_location_id=int(mm_to_id) if mm_to_id is not None else None,
        mm_from_location_name=(mm_from_loc.name or "").strip() if mm_from_loc else "",
        mm_to_location_name=(mm_to_loc.name or "").strip() if mm_to_loc else "",
        source_warehouse_id=int(src_wh_id) if src_wh_id is not None else None,
        destination_warehouse_id=int(dst_wh_id) if dst_wh_id is not None else None,
        source_warehouse_name=(src_wh.name or "").strip() if src_wh else "",
        destination_warehouse_name=(dst_wh.name or "").strip() if dst_wh else "",
        status=doc.status,
        receiving_status=rs,
        putaway_status=ps,
        relocation_status=rls,
        warehouse_workflow_status=wh_ws,
        purchase_workflow_status=pu_ws,
        is_fully_received=full_recv,
        is_fully_putaway=full_put,
        currency=cur,
        total_net=float(tn) if tn is not None else None,
        total_gross=float(tg) if tg is not None else None,
        total_vat=tv,
        edit_mode=em_lit,
        can_cancel=cc,
        can_wms_putaway=compute_can_wms_putaway(doc),
        created_at=doc.created_at,
        updated_at=getattr(doc, "updated_at", None) or doc.created_at,
        closed_at=closed_at_val,
        created_by=created_by_read_for_document(
            doc,
            batch_load_app_users(
                db,
                {int(doc.created_by_user_id)}
                if getattr(doc, "created_by_user_id", None) is not None
                else set(),
            ),
        ),
        items=item_reads,
        receiving_carriers=receiving_carriers_out,
    )


def get_stock_document_read(db: Session, tenant_id: int, document_id: int) -> Optional[StockDocumentRead]:
    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == document_id, StockDocument.tenant_id == tenant_id)
        .first()
    )
    if not doc:
        _logger.info(
            "[STOCK_DOCUMENT_READ] document_id=%s tenant_id=%s warehouse_id=%s document_type=%s (not found)",
            document_id,
            tenant_id,
            None,
            None,
        )
        return None
    _logger.info(
        "[STOCK_DOCUMENT_READ] document_id=%s tenant_id=%s warehouse_id=%s document_type=%s",
        document_id,
        tenant_id,
        getattr(doc, "warehouse_id", None),
        getattr(doc, "document_type", None),
    )
    needs_commit = False
    if recalculate_wms_document_completion(db, tenant_id, document_id):
        needs_commit = True
    if needs_commit:
        db.commit()
        db.refresh(doc)
    return build_stock_document_read(db, doc)


def apply_patch_lines_to_stock_document_items(
    rows: List[StockDocumentItem],
    body: PatchStockDocumentItemsBody,
) -> None:
    by_id = {r.id: r for r in rows}
    for line in body.items:
        row = by_id.get(line.id)
        if not row:
            raise ValueError(f"Unknown line id: {line.id}")
        q = float(line.received_quantity)
        if not math.isfinite(q) or q < 0:
            raise ValueError("received_quantity must be a non-negative finite number")
        if q > MAX_RECEIVED_QUANTITY:
            raise ValueError("received_quantity exceeds maximum allowed")
        row.received_quantity = q
        row.quantity = q
        if "suggested_warehouse_carrier_id" in line.model_fields_set:
            row.suggested_warehouse_carrier_id = line.suggested_warehouse_carrier_id


def patch_stock_document_items(
    db: Session,
    tenant_id: int,
    document_id: int,
    body: PatchStockDocumentItemsBody,
) -> StockDocumentRead:
    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == document_id, StockDocument.tenant_id == tenant_id)
        .first()
    )
    if not doc:
        raise ValueError("Document not found")
    if is_stock_document_cancelled(doc):
        raise ValueError("Anulowany dokument nie może być edytowany")
    if doc.status != "draft":
        raise ValueError("Only draft documents can be edited")
    if str(doc.document_type or "").strip().upper() in ("PZ", "Z_PZ", "PZ_RT", "RETURN_RECEIPT"):
        ensure_pz_document_warehouse_resolved(db, doc)

    rows: List[StockDocumentItem] = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == document_id)
        .order_by(StockDocumentItem.id)
        .all()
    )
    if not is_warehouse_doc_nowe(doc, rows):
        raise ValueError(
            "Edycja ilości na pozycjach jest możliwa tylko w stanie NOWE (brak przyjęć i aktywności WMS). "
            "W stanie W TRAKCIE możesz zmieniać wyłącznie metadane dokumentu (waluta, sumy)."
        )
    old_received = {r.id: float(r.received_quantity or 0) for r in rows}
    apply_patch_lines_to_stock_document_items(rows, body)
    for row in rows:
        new_r = float(row.received_quantity or 0)
        delta = new_r - old_received.get(row.id, 0.0)
        if delta > 1e-9:
            append_receipt_operation(db, doc, row, delta)
    if str(doc.document_type or "").strip().upper() in ("PZ", "Z_PZ", "PZ_RT", "RETURN_RECEIPT"):
        bump_receiving_in_progress_if_new(doc)
        recompute_putaway_status_for_document(doc, rows, db)
        recalculate_wms_document_completion(db, tenant_id, document_id)
    doc.updated_at = datetime.utcnow()

    if str(doc.document_type or "") == "PZ":
        sync_purchase_order_status_for_stock_document_id(db, tenant_id, document_id)
    db.commit()
    db.refresh(doc)
    return build_stock_document_read(db, doc)


def set_stock_document_receiving_target(
    db: Session,
    tenant_id: int,
    document_id: int,
    location_id: int,
    warehouse_id: Optional[int] = None,
) -> StockDocumentRead:
    """Draft only: where physical receipt will post (WMS before accept). Warehouse from tenant default if omitted."""
    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == document_id, StockDocument.tenant_id == tenant_id)
        .first()
    )
    if not doc:
        raise ValueError("Document not found")
    if is_stock_document_cancelled(doc):
        raise ValueError("Anulowany dokument nie może być edytowany")
    if doc.status != "draft":
        raise ValueError("Only draft documents can change receiving target")

    resolved_wh = warehouse_id if warehouse_id is not None else doc.warehouse_id
    if resolved_wh is None:
        raise ValueError(ERR_CHOOSE_WAREHOUSE_FOR_DOCUMENT)

    tw = (
        db.query(TenantWarehouse)
        .filter(TenantWarehouse.tenant_id == tenant_id, TenantWarehouse.warehouse_id == resolved_wh)
        .first()
    )
    if not tw:
        raise ValueError("Warehouse is not assigned to this tenant")

    loc = db.query(Location).filter(Location.id == location_id, Location.warehouse_id == resolved_wh).first()
    if not loc:
        raise ValueError("Location not found or does not belong to the selected warehouse")

    doc.warehouse_id = resolved_wh
    doc.location_id = location_id
    doc.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(doc)
    return build_stock_document_read(db, doc)


def accept_stock_document(db: Session, tenant_id: int, document_id: int) -> StockDocumentRead:
    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == document_id, StockDocument.tenant_id == tenant_id)
        .first()
    )
    if not doc:
        raise ValueError("Document not found")
    if is_stock_document_cancelled(doc):
        raise ValueError("Nie można zaksięgować anulowanego dokumentu")
    if _doc_status_lower(doc) not in ("draft", "zakonczone"):
        raise ValueError("Document is already posted")

    recalculate_wms_document_completion(db, tenant_id, document_id)
    db.flush()

    d: InboundDelivery | None = None
    if doc.delivery_id is not None:
        d = (
            db.query(InboundDelivery)
            .filter(InboundDelivery.id == doc.delivery_id, InboundDelivery.tenant_id == tenant_id)
            .first()
        )
        if not d:
            raise ValueError("Linked delivery not found")
        if d.status in ("cancelled",):
            raise ValueError("Cannot post PZ for a cancelled purchase order")

    ensure_pz_document_warehouse_resolved(db, doc)
    ensure_default_pz_receiving_location_if_missing(db, doc)

    if doc.location_id is None:
        raise ValueError(
            "Ustaw lokalizację przyjęcia (WMS → Przyjęcie lub PATCH receiving-target) — "
            "brak lokalizacji typu DOCK / floor w magazynie dokumentu."
        )

    loc = db.query(Location).filter(Location.id == doc.location_id).first()
    if not loc:
        raise ValueError("Location not found for this document")

    doc.warehouse_id = loc.warehouse_id
    tw = (
        db.query(TenantWarehouse)
        .filter(TenantWarehouse.tenant_id == tenant_id, TenantWarehouse.warehouse_id == doc.warehouse_id)
        .first()
    )
    if not tw:
        raise ValueError("Brak skonfigurowanego magazynu")
    db.flush()

    purge_wms_ghost_stock_document_lines(db, document_id)
    db.flush()

    items: List[StockDocumentItem] = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == document_id)
        .order_by(StockDocumentItem.id)
        .all()
    )
    if not items:
        raise ValueError("Document has no lines")

    for sdi in items:
        backfill_receipt_gap_for_line(db, doc, sdi, float(sdi.received_quantity or 0))
    db.flush()

    loc_uuid = _normalize_location_uuid(getattr(loc, "location_uuid", None))

    rec_by_delivery_item: Dict[int, float] = defaultdict(float)
    for sdi in items:
        rec = float(sdi.received_quantity or 0)
        if not math.isfinite(rec) or rec < 0:
            raise ValueError("Invalid received_quantity on document line")
        if rec > MAX_RECEIVED_QUANTITY:
            raise ValueError("received_quantity exceeds maximum allowed")
        if sdi.delivery_item_id is not None:
            rec_by_delivery_item[int(sdi.delivery_item_id)] += rec

    if d is not None:
        for di_id, rec_sum in rec_by_delivery_item.items():
            di = (
                db.query(DeliveryItem)
                .filter(DeliveryItem.id == di_id, DeliveryItem.delivery_id == d.id)
                .first()
            )
            if not di:
                raise ValueError("Delivery line not found")
            cur = float(di.quantity_received or 0)
            ordq = float(di.quantity_ordered)
            if cur + rec_sum > ordq + 1e-5:
                raise ValueError(
                    f"Przyjęcie przekroczyłoby ilość zamówioną dla pozycji dostawy #{di.id} "
                    f"(pozostało max {max(0.0, ordq - cur):g})"
                )

    now = datetime.utcnow()

    for sdi in items:
        rec = float(sdi.received_quantity or 0)
        sdi.quantity = rec

    if d is not None:
        for di_id, rec_sum in rec_by_delivery_item.items():
            di = (
                db.query(DeliveryItem)
                .filter(DeliveryItem.id == di_id, DeliveryItem.delivery_id == d.id)
                .first()
            )
            if di:
                di.quantity_received = float(di.quantity_received or 0) + rec_sum

    for sdi in items:
        rec = float(sdi.received_quantity or 0)
        if rec <= 0:
            continue

        put = effective_putaway_quantity_for_line(db, sdi)
        if put > rec + 1e-5:
            raise ValueError("quantity_putaway przekracza przyjętą ilość na linii PZ — popraw rozlokowanie przed zatwierdzeniem")
        to_dock = max(0.0, rec - put)
        if to_dock <= 1e-9:
            continue

        if sdi.product_id is None:
            if not is_stock_document_item_wm_material(sdi):
                raise ValueError(f"Linia PZ #{sdi.id} nie ma poprawnego produktu ani materiału magazynowego (wm_kind + wm_id).")
            vatp = float(getattr(sdi, "vat_rate", None) or 23.0)
            sid = int(doc.supplier_id) if doc.supplier_id is not None else None
            wmk = str(getattr(sdi, "wm_kind", "") or "")
            wmid = str(getattr(sdi, "wm_id", "") or "")
            if to_dock > 1e-9:
                apply_wm_catalog_receive_delta(
                    db,
                    tenant_id,
                    wmk,
                    wmid,
                    to_dock,
                    purchase_price_net=sdi.purchase_price_net,
                    vat_rate_pct=vatp,
                    supplier_id=sid,
                    purchase_at=now,
                )
            elif rec > 1e-9 and sdi.purchase_price_net is not None:
                update_wm_catalog_last_purchase_metadata(
                    db,
                    tenant_id,
                    wmk,
                    wmid,
                    purchase_price_net=float(sdi.purchase_price_net),
                    vat_rate_pct=vatp,
                    supplier_id=sid,
                    purchase_at=now,
                )
            continue

        prod = db.query(Product).filter(Product.id == sdi.product_id).first()
        tb = bool(getattr(prod, "track_batch", False)) if prod else False
        te = bool(getattr(prod, "track_expiry", False)) if prod else False
        bn = "" if not tb else normalize_batch_number(getattr(sdi, "batch_number", None))
        if tb and not bn:
            raise ValueError(f"Brak numeru partii dla produktu #{sdi.product_id} (wymagane przy zatwierdzeniu)")
        if not te:
            ed_store = NO_EXPIRY_SENTINEL
        else:
            ed_raw = getattr(sdi, "expiry_date", None)
            if ed_raw is None or ed_raw >= NO_EXPIRY_SENTINEL:
                raise ValueError(f"Brak daty ważności dla produktu #{sdi.product_id} (wymagane przy zatwierdzeniu)")
            ed_store = ed_raw

        sd_line = stock_disposition_for_document_line(sdi)
        inv = (
            db.query(Inventory)
            .filter(
                Inventory.tenant_id == tenant_id,
                Inventory.product_id == sdi.product_id,
                Inventory.warehouse_id == doc.warehouse_id,
                Inventory.location_id == doc.location_id,
                Inventory.batch_number == bn,
                Inventory.expiry_date == ed_store,
                Inventory.stock_disposition == sd_line,
            )
            .first()
        )
        if inv:
            inv.quantity = float(inv.quantity or 0) + to_dock
            if not _normalize_location_uuid(getattr(inv, "location_uuid", None)):
                inv.location_uuid = loc_uuid
        else:
            db.add(
                Inventory(
                    tenant_id=tenant_id,
                    product_id=sdi.product_id,
                    warehouse_id=doc.warehouse_id,
                    location_id=doc.location_id,
                    location_uuid=loc_uuid,
                    quantity=to_dock,
                    batch_number=bn,
                    expiry_date=ed_store,
                    stock_disposition=sd_line,
                )
            )

        if prod and rec > 1e-9 and doc.supplier_id is not None and getattr(prod, "default_supplier_id", None) is None:
            prod.default_supplier_id = int(doc.supplier_id)

    _apply_product_purchase_snapshot_from_posted_pz(
        db,
        tenant_id=tenant_id,
        doc=doc,
        items=items,
        posted_at=now,
    )

    fin_net, _fin_vat, fin_gross = compute_pz_line_financial_totals(items)
    doc.total_net = fin_net
    doc.total_gross = fin_gross

    doc.status = "posted"
    doc.receiving_status = "DONE"
    doc.relocation_status = "DONE"
    recompute_putaway_status_for_document(doc, items, db)
    doc.updated_at = now

    if d is not None:
        all_done = True
        for it in d.items:
            if not _float_ge(float(it.quantity_received or 0), float(it.quantity_ordered)):
                all_done = False
                break
        if all_done:
            d.status = "received"
            if d.received_at is None:
                d.received_at = now
        else:
            d.status = "in_transit"
        d.updated_at = now

    if doc.delivery_id is not None:
        sync_purchase_order_status_for_stock_document_id(db, tenant_id, doc.id)

    try:
        from .wms_waiting_supply_promotion import (
            receipts_from_pz_accept,
            run_promotion_after_inbound,
        )

        wh = int(doc.warehouse_id or 0)
        if wh > 0:
            recs = receipts_from_pz_accept(db, tenant_id=int(tenant_id), doc=doc, items=items)
            run_promotion_after_inbound(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=wh,
                receipts=recs,
                source_event_id=f"pz_accept:{int(doc.id)}",
            )
    except Exception:
        _logger.exception("waiting_supply promote after PZ accept doc_id=%s", doc.id)

    db.commit()
    db.refresh(doc)
    return build_stock_document_read(db, doc)


def patch_stock_document_metadata(
    db: Session,
    tenant_id: int,
    document_id: int,
    body: PatchStockDocumentMetadataBody,
) -> StockDocumentRead:
    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == document_id, StockDocument.tenant_id == tenant_id)
        .first()
    )
    if not doc:
        raise ValueError("Document not found")
    if is_stock_document_cancelled(doc):
        raise ValueError("Anulowany dokument nie może być edytowany")
    if is_stock_document_posted(doc):
        raise ValueError("Zaksięgowany dokument jest tylko do odczytu")
    if body.currency is not None:
        c = body.currency.strip().upper()[:8]
        if len(c) < 3:
            raise ValueError("Nieprawidłowy kod waluty")
        doc.currency = c
    if body.total_net is not None:
        doc.total_net = float(body.total_net)
    if body.total_gross is not None:
        doc.total_gross = float(body.total_gross)
    if body.purchase_workflow_status is not None:
        from .receiving_workflow_status_service import (
            PURCHASE_WORKFLOW_STATUSES,
            is_purchase_workflow_document,
            normalize_purchase_workflow_status,
        )

        if not is_purchase_workflow_document(doc):
            raise ValueError("Status zakupowy dotyczy tylko dokumentów PZ zakupowych")
        raw = str(body.purchase_workflow_status).strip().upper()
        if raw not in PURCHASE_WORKFLOW_STATUSES:
            raise ValueError("Nieprawidłowy purchase_workflow_status")
        doc.purchase_workflow_status = normalize_purchase_workflow_status(raw)
    doc.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(doc)
    return build_stock_document_read(db, doc)


def cancel_stock_document(db: Session, tenant_id: int, document_id: int) -> StockDocumentRead:
    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == document_id, StockDocument.tenant_id == tenant_id)
        .first()
    )
    if not doc:
        raise ValueError("Document not found")
    if is_stock_document_cancelled(doc):
        raise ValueError("Dokument jest już anulowany")
    if is_stock_document_posted(doc):
        raise ValueError("Nie można anulować zaksięgowanego dokumentu")
    details = stock_document_blocking_activity_details(db, document_id)
    _logger.info(
        "stock_document cancel check document_id=%s has_operations=%s",
        document_id,
        details["has_operations"],
    )
    if details["has_operations"]:
        raise ValueError("Nie można anulować dokumentu — zawiera operacje magazynowe")
    doc.status = "anulowany"
    doc.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(doc)
    return build_stock_document_read(db, doc)


def duplicate_stock_document(
    db: Session,
    tenant_id: int,
    document_id: int,
    *,
    created_by=None,
) -> StockDocumentRead:
    src = (
        db.query(StockDocument)
        .filter(StockDocument.id == document_id, StockDocument.tenant_id == tenant_id)
        .first()
    )
    if not src:
        raise ValueError("Document not found")
    lines = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == document_id)
        .order_by(StockDocumentItem.id)
        .all()
    )
    new_doc = StockDocument(
        tenant_id=src.tenant_id,
        document_type=src.document_type,
        supplier_id=src.supplier_id,
        delivery_id=src.delivery_id,
        warehouse_id=src.warehouse_id,
        location_id=src.location_id,
        status="draft",
        receiving_status="NEW",
        putaway_status="NOT_STARTED",
        relocation_status="OPEN",
        currency=str(getattr(src, "currency", None) or "PLN").strip() or "PLN",
        total_net=getattr(src, "total_net", None),
        total_gross=getattr(src, "total_gross", None),
        creation_source=getattr(src, "creation_source", None) or "PANEL",
    )
    stamp_document_creator(new_doc, created_by)
    db.add(new_doc)
    db.flush()
    for line in lines:
        ed = getattr(line, "expiry_date", None)
        db.add(
            StockDocumentItem(
                document_id=new_doc.id,
                delivery_item_id=line.delivery_item_id,
                product_id=line.product_id,
                wm_kind=getattr(line, "wm_kind", None),
                wm_id=getattr(line, "wm_id", None),
                ordered_quantity=float(line.ordered_quantity or 0),
                received_quantity=0.0,
                quantity_putaway=0.0,
                quantity=0.0,
                purchase_price_net=line.purchase_price_net,
                vat_rate=float(line.vat_rate or 23.0),
                batch_number=getattr(line, "batch_number", "") or "",
                expiry_date=ed if ed is not None else NO_EXPIRY_SENTINEL,
            )
        )
    new_doc.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(new_doc)
    return build_stock_document_read(db, new_doc)
