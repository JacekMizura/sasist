"""RMZ → Z-PZ (PZ zwrotna): przyjęcie magazynowe przy finalizacji zwrotu.

- ACCEPTED / DAMAGED → linie Z-PZ + RECEIPT (kolejka rozlokowania jak PZ)
- REJECTED → brak ruchu magazynowego
- Seria Z-PZ: tryb zbiorczy (jeden dokument / dzień) lub osobny dokument / RMZ
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Sequence, Tuple

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models.document_series import DocumentSeries
from ..models.order_item import OrderItem
from ..models.product import Product
from ..models.return_module_config import ReturnProductDecision
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.stock_document_return_link import StockDocumentReturnLink
from ..models.wms_order_return import WmsOrderReturn
from ..models.wms_rmz_line import RMZLine
from ..services.stock_document_service import (
    ensure_default_pz_receiving_location_if_missing,
    ensure_pz_document_warehouse_resolved,
    recompute_putaway_status_for_document,
)
from ..services.stock_operation_receipt_service import append_receipt_operation
from ..utils.product_vat import product_vat_rate_percent
from .document_number_service import (
    DocumentSeriesOperationalError,
    assign_series_number_to_stock_document,
    require_warehouse_series,
)
from .returns.collective_z_pz_lock import (
    acquire_collective_z_pz_lock,
    dialect_supports_for_update,
)
from .returns.z_pz_constants import (
    DISPOSITION_OUTLET_B,
    DISPOSITION_SALEABLE,
    DISPOSITION_SERVICE_C,
    PZ_RT,
    RETURN_RECEIPT,
    RETURN_RECEIPT_DOCUMENT_TYPES,
    Z_PZ,
)

logger = logging.getLogger(__name__)

# Re-export for legacy imports
__all__ = [
    "Z_PZ",
    "PZ_RT",
    "RETURN_RECEIPT",
    "RETURN_RECEIPT_DOCUMENT_TYPES",
    "ensure_rmz_return_receipt_document",
    "ensure_rmz_return_receipt_after_refund",
    "parse_reject_reason_id_from_damage_type",
    "rejection_creates_stock_document",
]

_BUILTIN_REJECT_CREATES_STOCK: Dict[str, bool] = {
    "order_wrong_product": True,
    "order_missing_in_pack": True,
    "order_incomplete_set": True,
    "order_no_link": False,
    "time_past_deadline": False,
    "product_used": False,
    "product_damaged_by_customer": True,
    "policy_non_returnable": False,
    "policy_hygiene": False,
    "ops_cancelled": False,
    "ops_duplicate": False,
    "ops_other": False,
}


def _parse_damage_entries_json(raw: object) -> List[dict]:
    if raw is None:
        return []
    s = str(raw).strip()
    if not s or s.lower() in ("null", "none", "[]"):
        return []
    try:
        data = json.loads(s)
    except Exception:
        return []
    return [x for x in data if isinstance(x, dict)] if isinstance(data, list) else []


def _has_return_link(db: Session, *, stock_document_id: int, rmz_id: int) -> bool:
    hit = (
        db.query(StockDocumentReturnLink.id)
        .filter(
            StockDocumentReturnLink.stock_document_id == int(stock_document_id),
            StockDocumentReturnLink.rmz_id == int(rmz_id),
        )
        .first()
    )
    return hit is not None


def _ensure_return_link(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    stock_document_id: int,
    rmz_id: int,
) -> StockDocumentReturnLink:
    existing = (
        db.query(StockDocumentReturnLink)
        .filter(
            StockDocumentReturnLink.stock_document_id == int(stock_document_id),
            StockDocumentReturnLink.rmz_id == int(rmz_id),
        )
        .first()
    )
    if existing is not None:
        return existing
    row = StockDocumentReturnLink(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        stock_document_id=int(stock_document_id),
        rmz_id=int(rmz_id),
        created_at=datetime.utcnow(),
    )
    db.add(row)
    db.flush()
    return row


def stock_document_ids_for_rmz(db: Session, rmz_id: int) -> List[int]:
    """All Z-PZ documents linked to RMZ (via link table, legacy rmz_id, or line source_rmz_id)."""
    ids: set[int] = set()
    rmz = db.query(WmsOrderReturn).filter(WmsOrderReturn.id == int(rmz_id)).first()
    if rmz is not None and getattr(rmz, "warehouse_document_id", None):
        ids.add(int(rmz.warehouse_document_id))

    for row in (
        db.query(StockDocumentReturnLink.stock_document_id)
        .filter(StockDocumentReturnLink.rmz_id == int(rmz_id))
        .all()
    ):
        ids.add(int(row[0]))

    for row in (
        db.query(StockDocument.id)
        .filter(StockDocument.rmz_id == int(rmz_id))
        .all()
    ):
        ids.add(int(row[0]))

    for row in (
        db.query(StockDocumentItem.document_id)
        .filter(StockDocumentItem.source_rmz_id == int(rmz_id))
        .distinct()
        .all()
    ):
        ids.add(int(row[0]))

    return sorted(ids)


def parse_reject_reason_id_from_damage_type(damage_type: Optional[str], decision: Optional[str]) -> Optional[str]:
    dt = (damage_type or "").strip()
    if not dt:
        return None
    enc: Optional[str] = None
    reject_idx = dt.rfind("reject:")
    if reject_idx >= 0:
        enc = dt[reject_idx + len("reject:") :].strip()
    elif (decision or "").strip().upper() == "REJECTED":
        enc = dt
    if not enc:
        return None
    pipe_notatka = enc.find("|notatka:")
    if pipe_notatka >= 0:
        rid = enc[:pipe_notatka].strip()
        return rid or None
    parts = [p.strip() for p in enc.split(" | ") if str(p).strip()]
    if len(parts) >= 2 and parts[1].startswith("notatka:"):
        return parts[0] or None
    return enc.strip() or None


def rejection_creates_stock_document(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    reason_code: Optional[str],
) -> bool:
    code = (reason_code or "").strip()
    if not code:
        return False
    row = (
        db.query(ReturnProductDecision)
        .filter(
            ReturnProductDecision.tenant_id == int(tenant_id),
            ReturnProductDecision.warehouse_id == int(warehouse_id),
            ReturnProductDecision.category == "REJECTED",
            ReturnProductDecision.code == code,
            ReturnProductDecision.is_active.is_(True),
        )
        .first()
    )
    if row is not None:
        return bool(getattr(row, "creates_stock_document", False))
    return bool(_BUILTIN_REJECT_CREATES_STOCK.get(code, False))


def _order_item_pricing(db: Session, order_item_id: int) -> Tuple[Optional[float], float]:
    oi = db.query(OrderItem).filter(OrderItem.id == int(order_item_id)).first()
    price = None
    if oi is not None and oi.unit_price is not None:
        try:
            price = float(oi.unit_price)
        except (TypeError, ValueError):
            price = None
    vat = 23.0
    if oi is not None:
        p = db.query(Product).filter(Product.id == int(oi.product_id)).first()
        if p:
            vat = float(product_vat_rate_percent(getattr(p, "metadata_json", None)))
    return price, vat


def _planned_stock_counts_for_line(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    ln: RMZLine,
    *,
    include_rejected: bool = False,
) -> Tuple[int, List[Tuple[str, str]], int]:
    """accepted units, damaged (entry_key, B|C) pairs, rejected stock units (ignored for Z-PZ by default)."""
    aq = int(ln.accepted_qty or 0)
    rq_raw = int(ln.rejected_qty or 0)
    reason_id = parse_reject_reason_id_from_damage_type(
        (str(ln.damage_type).strip() if getattr(ln, "damage_type", None) else None) or None,
        ln.decision,
    )
    rej_stock_n = 0
    if include_rejected and rq_raw > 0 and rejection_creates_stock_document(db, tenant_id, warehouse_id, reason_id):
        rej_stock_n = rq_raw

    damaged_pairs: List[Tuple[str, str]] = []
    parsed = _parse_damage_entries_json(getattr(ln, "damage_entries_json", None))
    if parsed:
        for x in parsed:
            eid = str(x.get("id") or "").strip()
            cond = x.get("condition")
            if cond not in ("B", "C"):
                continue
            try:
                qty = max(1, int(x.get("qty") or 1))
            except (TypeError, ValueError):
                qty = 1
            for i in range(qty):
                suffix = f"{eid}__{i}" if qty > 1 else eid
                damaged_pairs.append((suffix, str(cond)))
    else:
        ib = int(ln.damaged_b_qty or 0)
        ic = int(ln.damaged_c_qty or 0)
        rid = int(ln.id or 0)
        for i in range(ib):
            damaged_pairs.append((f"legacy-b-{rid}-{i}", "B"))
        for i in range(ic):
            damaged_pairs.append((f"legacy-c-{rid}-{i}", "C"))

    return aq, damaged_pairs, rej_stock_n


def _any_planned_lines(db: Session, tenant_id: int, warehouse_id: int, lines: Sequence[RMZLine]) -> bool:
    for ln in lines:
        aq, dmg, _rj = _planned_stock_counts_for_line(db, tenant_id, warehouse_id, ln, include_rejected=False)
        if aq > 0 or dmg:
            return True
    return False


def _resolve_z_pz_series(db: Session, tenant_id: int, warehouse_id: int) -> DocumentSeries:
    for subtype in (Z_PZ, "PZ_RT", "ZW"):
        try:
            return require_warehouse_series(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                subtype=subtype,
            )
        except DocumentSeriesOperationalError:
            continue
    raise DocumentSeriesOperationalError(
        document_type=Z_PZ,
        message="Brak aktywnej serii dokumentów Z-PZ (Z_PZ)",
    )


def assign_return_receipt_document_number(
    db: Session,
    doc: StockDocument,
    *,
    series: Optional[DocumentSeries] = None,
) -> Optional[str]:
    from ..models.warehouse import Warehouse

    if str(getattr(doc, "document_number", None) or "").strip():
        return str(doc.document_number)

    tenant_id = int(doc.tenant_id)
    wh_id = int(doc.warehouse_id)
    wh = db.query(Warehouse).filter(Warehouse.id == wh_id).first()
    wh_code = str(getattr(wh, "code", None) or "").strip() or None

    if series is None:
        try:
            series = _resolve_z_pz_series(db, tenant_id, wh_id)
        except DocumentSeriesOperationalError:
            series = None

    if series is not None:
        number = assign_series_number_to_stock_document(db, doc, series, warehouse_code=wh_code)
        logger.info("[Z-PZ] assigned number doc_id=%s number=%s series=%s", doc.id, number, series.subtype)
        return number

    logger.warning("[Z-PZ] no document series tenant_id=%s warehouse_id=%s", tenant_id, wh_id)
    return None


def _rmz_lines_already_posted(db: Session, document_id: int, rmz_id: int) -> bool:
    hit = (
        db.query(StockDocumentItem.id)
        .filter(
            StockDocumentItem.document_id == int(document_id),
            StockDocumentItem.source_rmz_id == int(rmz_id),
        )
        .first()
    )
    return hit is not None


def _find_existing_document_for_rmz(db: Session, rmz: WmsOrderReturn) -> Optional[StockDocument]:
    tenant_id = int(rmz.tenant_id)
    wh_id = int(rmz.warehouse_id)
    rid = int(rmz.id)

    wh_doc_id = getattr(rmz, "warehouse_document_id", None)
    if wh_doc_id:
        doc = (
            db.query(StockDocument)
            .filter(
                StockDocument.id == int(wh_doc_id),
                StockDocument.tenant_id == tenant_id,
                StockDocument.document_type.in_(tuple(RETURN_RECEIPT_DOCUMENT_TYPES)),
            )
            .first()
        )
        if doc is not None:
            return doc

    doc = (
        db.query(StockDocument)
        .filter(
            StockDocument.tenant_id == tenant_id,
            StockDocument.rmz_id == rid,
            StockDocument.document_type.in_(tuple(RETURN_RECEIPT_DOCUMENT_TYPES)),
        )
        .first()
    )
    if doc is not None:
        return doc

    line_doc = (
        db.query(StockDocument)
        .join(StockDocumentReturnLink, StockDocumentReturnLink.stock_document_id == StockDocument.id)
        .filter(
            StockDocument.tenant_id == tenant_id,
            StockDocumentReturnLink.rmz_id == rid,
        )
        .order_by(StockDocument.id.desc())
        .first()
    )
    if line_doc is not None:
        return line_doc

    line_doc = (
        db.query(StockDocument)
        .join(StockDocumentItem, StockDocumentItem.document_id == StockDocument.id)
        .filter(
            StockDocument.tenant_id == tenant_id,
            StockDocument.warehouse_id == wh_id,
            StockDocument.document_type.in_(tuple(RETURN_RECEIPT_DOCUMENT_TYPES)),
            StockDocumentItem.source_rmz_id == rid,
        )
        .first()
    )
    return line_doc


def _find_collective_z_pz_for_today(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    series_id: str,
    business_date: Optional[date] = None,
    for_update: bool = False,
) -> Optional[StockDocument]:
    biz_day = business_date or datetime.utcnow().date()
    q = db.query(StockDocument).filter(
        StockDocument.tenant_id == int(tenant_id),
        StockDocument.warehouse_id == int(warehouse_id),
        StockDocument.document_type == Z_PZ,
        StockDocument.document_series_id == str(series_id),
        StockDocument.status == "draft",
        StockDocument.relocation_status == "OPEN",
        StockDocument.is_collective_return_receipt.is_(True),
        StockDocument.collective_business_date == biz_day,
    )
    if for_update and dialect_supports_for_update(db):
        q = q.with_for_update()
    return q.order_by(StockDocument.id.desc()).first()


def _find_or_create_collective_z_pz(
    db: Session,
    rmz: WmsOrderReturn,
    *,
    series: DocumentSeries,
) -> StockDocument:
    tenant_id = int(rmz.tenant_id)
    wh_id = int(rmz.warehouse_id)
    business_date = datetime.utcnow().date()
    acquire_collective_z_pz_lock(
        db,
        tenant_id=tenant_id,
        warehouse_id=wh_id,
        business_date=business_date,
    )
    existing = _find_collective_z_pz_for_today(
        db,
        tenant_id=tenant_id,
        warehouse_id=wh_id,
        series_id=str(series.id),
        business_date=business_date,
        for_update=True,
    )
    if existing is not None:
        return existing

    try:
        with db.begin_nested():
            return _create_z_pz_shell(
                db,
                rmz,
                series=series,
                collective=True,
                business_date=business_date,
            )
    except IntegrityError:
        hit = _find_collective_z_pz_for_today(
            db,
            tenant_id=tenant_id,
            warehouse_id=wh_id,
            series_id=str(series.id),
            business_date=business_date,
            for_update=True,
        )
        if hit is not None:
            return hit
        raise


def _create_z_pz_shell(
    db: Session,
    rmz: WmsOrderReturn,
    *,
    series: DocumentSeries,
    collective: bool,
    business_date: Optional[date] = None,
) -> StockDocument:
    now = datetime.utcnow()
    biz_day = business_date or now.date()
    doc = StockDocument(
        tenant_id=int(rmz.tenant_id),
        document_type=Z_PZ,
        document_series_id=str(series.id),
        supplier_id=None,
        delivery_id=None,
        rmz_id=None if collective else int(rmz.id),
        warehouse_id=int(rmz.warehouse_id),
        location_id=None,
        status="draft",
        receiving_status="DONE",
        putaway_status="NOT_STARTED",
        relocation_status="OPEN",
        is_collective_return_receipt=bool(collective),
        collective_business_date=biz_day if collective else None,
        created_at=now,
        updated_at=now,
    )
    db.add(doc)
    db.flush()
    ensure_pz_document_warehouse_resolved(db, doc)
    ensure_default_pz_receiving_location_if_missing(db, doc)
    assign_return_receipt_document_number(db, doc, series=series)
    logger.info(
        "[Z-PZ] created shell rmz_id=%s doc_id=%s collective=%s number=%s",
        rmz.id,
        doc.id,
        collective,
        getattr(doc, "document_number", None),
    )
    return doc


def _append_rmz_lines_to_document(
    db: Session,
    doc: StockDocument,
    rmz: WmsOrderReturn,
    lines: Sequence[RMZLine],
) -> List[StockDocumentItem]:
    tenant_id = int(rmz.tenant_id)
    wh_id = int(rmz.warehouse_id)
    item_rows: List[StockDocumentItem] = []

    def add_line(
        *,
        product_id: int,
        qty: float,
        disposition: str,
        return_decision: str,
        rmz_damage_entry_id: Optional[str],
        purchase_price_net: Optional[float],
        vat_rate: float,
    ) -> None:
        row = StockDocumentItem(
            document_id=doc.id,
            delivery_item_id=None,
            product_id=int(product_id),
            wm_kind=None,
            wm_id=None,
            ordered_quantity=float(qty),
            received_quantity=float(qty),
            quantity=float(qty),
            purchase_price_net=purchase_price_net,
            vat_rate=float(vat_rate),
            batch_number="",
            expiry_date=date(9999, 12, 31),
            return_disposition=disposition,
            stock_disposition=disposition,
            rmz_damage_entry_id=(rmz_damage_entry_id[:96] if rmz_damage_entry_id else None),
            source_rmz_id=int(rmz.id),
            return_decision=str(return_decision)[:24],
        )
        db.add(row)
        db.flush()
        append_receipt_operation(db, doc, row, float(qty))
        item_rows.append(row)

    for ln in lines:
        pid = int(ln.product_id)
        p = db.query(Product).filter(Product.id == pid, Product.tenant_id == tenant_id).first()
        if not p:
            raise ValueError(f"Z-PZ: produkt {pid} nie znaleziony dla tenant_id={tenant_id}")
        unit_price, vat = _order_item_pricing(db, int(ln.order_item_id))

        aq, damaged_pairs, _rej = _planned_stock_counts_for_line(
            db, tenant_id, wh_id, ln, include_rejected=False
        )
        if aq > 0:
            add_line(
                product_id=pid,
                qty=float(aq),
                disposition=DISPOSITION_SALEABLE,
                return_decision="ACCEPTED",
                rmz_damage_entry_id=None,
                purchase_price_net=unit_price,
                vat_rate=vat,
            )

        for entry_key, cond in damaged_pairs:
            disp = DISPOSITION_OUTLET_B if cond == "B" else DISPOSITION_SERVICE_C
            add_line(
                product_id=pid,
                qty=1.0,
                disposition=disp,
                return_decision="DAMAGED_B" if cond == "B" else "DAMAGED_C",
                rmz_damage_entry_id=entry_key,
                purchase_price_net=unit_price,
                vat_rate=vat,
            )

    return item_rows


def _link_rmz_to_document(
    db: Session,
    rmz: WmsOrderReturn,
    doc: StockDocument,
    *,
    collective: bool,
) -> None:
    rmz.warehouse_document_id = int(doc.id)
    rmz.warehouse_document_type = Z_PZ
    _ensure_return_link(
        db,
        tenant_id=int(rmz.tenant_id),
        warehouse_id=int(rmz.warehouse_id),
        stock_document_id=int(doc.id),
        rmz_id=int(rmz.id),
    )
    if not collective and doc.rmz_id is None:
        doc.rmz_id = int(rmz.id)


def _patch_damage_entries_with_stock_links(db: Session, lines: Sequence[RMZLine], document_id: int) -> None:
    sdi_rows = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == int(document_id))
        .order_by(StockDocumentItem.id.asc())
        .all()
    )
    for ln in lines:
        raw_list = _parse_damage_entries_json(getattr(ln, "damage_entries_json", None))
        if not raw_list:
            continue
        changed = False
        by_eid = {str(x.get("id") or "").strip(): x for x in raw_list if str(x.get("id") or "").strip()}
        for sdi in sdi_rows:
            if int(sdi.product_id or 0) != int(ln.product_id):
                continue
            if int(getattr(sdi, "source_rmz_id", 0) or 0) not in (0, int(ln.rmz_id or 0)):
                continue
            key = (getattr(sdi, "rmz_damage_entry_id", None) or "").strip()
            if not key or "__" in key:
                continue
            ent = by_eid.get(key)
            if ent is None:
                continue
            try:
                qty = int(ent.get("qty") or 1)
            except (TypeError, ValueError):
                qty = 1
            if qty != 1:
                continue
            ent["stock_document_id"] = int(document_id)
            ent["stock_document_line_id"] = int(sdi.id)
            ent["disposition"] = getattr(sdi, "return_disposition", None)
            ent["putaway_status"] = "PENDING"
            ent["putaway_completed_at"] = None
            changed = True
        if changed:
            ln.damage_entries_json = json.dumps(raw_list, ensure_ascii=False)


def ensure_rmz_return_receipt_document(db: Session, rmz: WmsOrderReturn) -> Optional[StockDocument]:
    """
    Tworzy lub dopisuje do Z-PZ (PZ zwrotna) przy finalizacji RMZ.
    REJECTED nie generuje ruchów magazynowych.
    """
    tenant_id = int(rmz.tenant_id)
    wh_id = int(rmz.warehouse_id)
    rid = int(rmz.id)

    existing = _find_existing_document_for_rmz(db, rmz)
    series = _resolve_z_pz_series(db, tenant_id, wh_id)
    collective = bool(getattr(series, "collective_return_receipt", True))

    if existing is not None:
        if _rmz_lines_already_posted(db, int(existing.id), rid):
            _link_rmz_to_document(db, rmz, existing, collective=collective)
            if not str(getattr(existing, "document_number", None) or "").strip():
                assign_return_receipt_document_number(db, existing, series=series)
            logger.info("[Z-PZ] idempotent rmz_id=%s doc_id=%s", rid, existing.id)
            return existing

    lines = db.query(RMZLine).filter(RMZLine.rmz_id == rid).order_by(RMZLine.id.asc()).all()
    if not lines or not _any_planned_lines(db, tenant_id, wh_id, lines):
        logger.info("[Z-PZ] skip — no ACCEPTED/DAMAGED quantities rmz_id=%s", rid)
        return None

    doc: StockDocument
    if collective:
        doc = _find_or_create_collective_z_pz(db, rmz, series=series)
    else:
        doc = _create_z_pz_shell(db, rmz, series=series, collective=False)

    if _rmz_lines_already_posted(db, int(doc.id), rid):
        _link_rmz_to_document(db, rmz, doc, collective=collective)
        logger.info("[Z-PZ] lines already on doc rmz_id=%s doc_id=%s", rid, doc.id)
        return doc

    item_rows = _append_rmz_lines_to_document(db, doc, rmz, lines)
    all_items = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == int(doc.id))
        .order_by(StockDocumentItem.id.asc())
        .all()
    )
    recompute_putaway_status_for_document(doc, all_items)
    doc.updated_at = datetime.utcnow()
    _link_rmz_to_document(db, rmz, doc, collective=collective)
    _patch_damage_entries_with_stock_links(db, lines, int(doc.id))
    db.flush()
    logger.info("[Z-PZ] posted rmz_id=%s doc_id=%s new_lines=%s", rid, doc.id, len(item_rows))
    return doc


def ensure_rmz_return_receipt_after_refund(db: Session, rmz: WmsOrderReturn) -> None:
    """Wywołaj po udanym zapisie refundu / zamknięciu RMZ (ta sama sesja, przed commit)."""
    ensure_rmz_return_receipt_document(db, rmz)
