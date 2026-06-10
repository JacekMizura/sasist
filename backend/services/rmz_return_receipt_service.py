"""RMZ → PZ_RT: przyjęcie magazynowe po zamknięciu zwrotu (refund / rozliczenie biura).

Idempotentnie tworzy jeden dokument ``PZ_RT`` na RMZ, linkuje linie z jednostkami uszkodzeń
oraz natychmiast księguje RECEIPT (towar na lokacji przyjęcia), kolejka rozłożenia jak PZ.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime
from typing import Dict, List, Optional, Sequence

from sqlalchemy.orm import Session

from ..models.order_item import OrderItem
from ..models.product import Product
from ..models.return_module_config import ReturnProductDecision
from ..models.stock_document import StockDocument, StockDocumentItem
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

logger = logging.getLogger(__name__)

PZ_RT = "PZ_RT"
RETURN_RECEIPT = "RETURN_RECEIPT"
RETURN_RECEIPT_DOCUMENT_TYPES = frozenset({PZ_RT, RETURN_RECEIPT})

DISPOSITION_SALEABLE = "SALEABLE"
DISPOSITION_OUTLET_B = "OUTLET_B"
DISPOSITION_SERVICE_C = "SERVICE_C"
DISPOSITION_REJECTED_STOCK = "REJECTED_STOCK"

# Wbudowane kody WMS (wmsRejectReasons.tsx) — gdy brak wpisu w konfiguracji modułu zwrotów.
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
) -> Tuple[int, List[Tuple[str, str]], int]:
    """accepted units, list of (damage_entry_key, B|C) per physical damaged unit, rejected units eligible for stock."""
    aq = int(ln.accepted_qty or 0)
    rq_raw = int(ln.rejected_qty or 0)
    reason_id = parse_reject_reason_id_from_damage_type(
        (str(ln.damage_type).strip() if getattr(ln, "damage_type", None) else None) or None,
        ln.decision,
    )
    rej_stock_n = 0
    if rq_raw > 0 and rejection_creates_stock_document(db, tenant_id, warehouse_id, reason_id):
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
        aq, dmg, rj = _planned_stock_counts_for_line(db, tenant_id, warehouse_id, ln)
        if aq > 0 or dmg or rj > 0:
            return True
    return False


def assign_return_receipt_document_number(db: Session, doc: StockDocument) -> Optional[str]:
    """Numeracja PZ_RT — preferuje serię PZ_RT (prefiks PZR), fallback ZW / PZ."""
    from ..models.warehouse import Warehouse

    tenant_id = int(doc.tenant_id)
    wh_id = int(doc.warehouse_id)
    wh = db.query(Warehouse).filter(Warehouse.id == wh_id).first()
    wh_code = str(getattr(wh, "code", None) or "").strip() or None
    if getattr(doc, "document_number", None):
        return str(doc.document_number)
    for subtype in ("PZ_RT", "ZW", "PZ"):
        try:
            series = require_warehouse_series(
                db,
                tenant_id=tenant_id,
                warehouse_id=wh_id,
                subtype=subtype,
            )
            number = assign_series_number_to_stock_document(
                db, doc, series, warehouse_code=wh_code
            )
            logger.info(
                "[PZ_RT] assigned number doc_id=%s number=%s series_subtype=%s",
                doc.id,
                number,
                subtype,
            )
            return number
        except DocumentSeriesOperationalError:
            continue
    logger.warning(
        "[PZ_RT] no document series for return receipt tenant_id=%s warehouse_id=%s",
        tenant_id,
        wh_id,
    )
    return None


def ensure_rmz_return_receipt_document(db: Session, rmz: WmsOrderReturn) -> Optional[StockDocument]:
    """
    Tworzy lub zwraca istniejący PZ_RT dla RMZ. Wykonuje RECEIPT na lokacji przyjęcia i ustawia receiving=DONE.
    """
    tenant_id = int(rmz.tenant_id)
    wh_id = int(rmz.warehouse_id)

    existing = (
        db.query(StockDocument)
        .filter(
            StockDocument.tenant_id == tenant_id,
            StockDocument.rmz_id == int(rmz.id),
            StockDocument.document_type.in_(tuple(RETURN_RECEIPT_DOCUMENT_TYPES)),
        )
        .first()
    )
    if existing is not None:
        if not str(getattr(existing, "document_number", None) or "").strip():
            assign_return_receipt_document_number(db, existing)
        logger.info("[PZ_RT] already exists rmz_id=%s doc_id=%s", rmz.id, existing.id)
        return existing

    lines = db.query(RMZLine).filter(RMZLine.rmz_id == rmz.id).order_by(RMZLine.id.asc()).all()
    if not lines or not _any_planned_lines(db, tenant_id, wh_id, lines):
        logger.info("[PZ_RT] skip — no inbound quantities rmz_id=%s", rmz.id)
        return None

    now = datetime.utcnow()

    doc = StockDocument(
        tenant_id=tenant_id,
        document_type=PZ_RT,
        supplier_id=None,
        delivery_id=None,
        rmz_id=int(rmz.id),
        warehouse_id=wh_id,
        location_id=None,
        status="draft",
        receiving_status="DONE",
        putaway_status="NOT_STARTED",
        relocation_status="OPEN",
        created_at=now,
        updated_at=now,
    )
    db.add(doc)
    db.flush()

    ensure_pz_document_warehouse_resolved(db, doc)
    ensure_default_pz_receiving_location_if_missing(db, doc)

    item_rows: List[StockDocumentItem] = []

    def add_line(
        *,
        product_id: int,
        qty: float,
        disposition: str,
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
        )
        db.add(row)
        db.flush()
        append_receipt_operation(db, doc, row, float(qty))
        item_rows.append(row)

    for ln in lines:
        pid = int(ln.product_id)
        p = db.query(Product).filter(Product.id == pid, Product.tenant_id == tenant_id).first()
        if not p:
            raise ValueError(f"PZ_RT: produkt {pid} nie znaleziony dla tenant_id={tenant_id}")
        unit_price, vat = _order_item_pricing(db, int(ln.order_item_id))

        aq, damaged_pairs, rej_stock_n = _planned_stock_counts_for_line(db, tenant_id, wh_id, ln)
        if aq > 0:
            add_line(
                product_id=pid,
                qty=float(aq),
                disposition=DISPOSITION_SALEABLE,
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
                rmz_damage_entry_id=entry_key,
                purchase_price_net=unit_price,
                vat_rate=vat,
            )

        if rej_stock_n > 0:
            for i in range(rej_stock_n):
                add_line(
                    product_id=pid,
                    qty=1.0,
                    disposition=DISPOSITION_REJECTED_STOCK,
                    rmz_damage_entry_id=f"reject-{int(ln.id)}-{i}",
                    purchase_price_net=unit_price,
                    vat_rate=vat,
                )

    recompute_putaway_status_for_document(doc, item_rows)
    doc.updated_at = datetime.utcnow()
    assign_return_receipt_document_number(db, doc)

    _patch_damage_entries_with_stock_links(db, lines, doc.id)
    db.flush()
    logger.info("[PZ_RT] created rmz_id=%s doc_id=%s lines=%s", rmz.id, doc.id, len(item_rows))
    return doc


def _patch_damage_entries_with_stock_links(db: Session, lines: Sequence[RMZLine], document_id: int) -> None:
    """Uzupełnia ``damage_entries_json`` o powiązanie z dokumentem (wpisy qty=1)."""
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


def ensure_rmz_return_receipt_after_refund(db: Session, rmz: WmsOrderReturn) -> None:
    """Wywołaj po udanym zapisie refundu / zamknięciu RMZ (ta sama sesja, przed commit)."""
    ensure_rmz_return_receipt_document(db, rmz)
