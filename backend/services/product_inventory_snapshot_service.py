"""
Jedno źródło prawdy: stan operacyjny produktu (jak Asortyment / Stan magazynowy) + pipeline zakupowy.

- on_hand: suma fizyczna z ``inventory`` po lokalizacjach widocznych (bez śmieci legacy importu).
- reserved: aktywne rezerwacje (status ``reserved``) w obrębie magazynu.
- available: on_hand - reserved (nie ujemne).
- inbound_open: otwarte linie ZZ (Draft/Sent/Confirmed), gdy brak dostawy w statusie ordered/in_transit.
- inbound_confirmed: linie dostaw ``ordered`` / ``in_transit`` (+ szkice dostaw **bez** powiązania z ZZ).
- inbound_total: suma logiczna bez podwójnego liczenia ZZ + szkicu dostawy powiązanej z tym samym ZZ.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..models.inbound_delivery import DeliveryItem, InboundDelivery
from ..models.inventory import Inventory
from ..models.location import Location
from ..models.purchase_order import PurchaseOrder, PurchaseOrderItem
from ..models.stock_reservation import StockReservation
from .legacy_import_inventory_display_filter import should_hide_legacy_csv_import_inventory_location

OPEN_PO_STATUSES = ("Draft", "Sent", "Confirmed")
TRANSIT_DELIVERY_STATUSES = ("ordered", "in_transit")


def _nz(x: float) -> float:
    """Usuwa -0 / szum float — do JSON i UI."""
    v = float(x)
    if abs(v) < 1e-12:
        return 0.0
    return v


def _on_hand_visible_by_product(
    db: Session,
    tenant_id: int,
    warehouse_id: Optional[int],
    product_ids: Optional[Sequence[int]],
) -> Dict[int, float]:
    """Suma ``inventory.quantity`` jak w API produktów (bez ukrywanych lokalizacji)."""
    q = (
        db.query(
            Inventory.product_id,
            Inventory.quantity,
            Location.name,
            Location.type,
            Location.location_type,
            Location.location_uuid,
        )
        .join(Location, Location.id == Inventory.location_id)
        .filter(Inventory.tenant_id == tenant_id)
    )
    if warehouse_id is not None:
        q = q.filter(Inventory.warehouse_id == int(warehouse_id))
    if product_ids is not None and len(product_ids) > 0:
        q = q.filter(Inventory.product_id.in_(tuple(int(x) for x in product_ids)))
    acc: Dict[int, float] = defaultdict(float)
    for r in q.all():
        if should_hide_legacy_csv_import_inventory_location(
            loc_name=r.name or "",
            loc_type=r.type,
            location_type=r.location_type,
            location_uuid=r.location_uuid,
        ):
            continue
        acc[int(r.product_id)] += float(r.quantity or 0)
    return {pid: _nz(v) for pid, v in acc.items()}


def _reserved_by_product(
    db: Session,
    tenant_id: int,
    warehouse_id: Optional[int],
    product_ids: Optional[Sequence[int]],
) -> Dict[int, float]:
    q = (
        db.query(StockReservation.product_id, func.coalesce(func.sum(StockReservation.quantity), 0.0))
        .join(Location, Location.id == StockReservation.location_id)
        .filter(StockReservation.tenant_id == tenant_id, StockReservation.status == "reserved")
    )
    if warehouse_id is not None:
        q = q.filter(Location.warehouse_id == int(warehouse_id))
    if product_ids is not None and len(product_ids) > 0:
        q = q.filter(StockReservation.product_id.in_(tuple(int(x) for x in product_ids)))
    rows = q.group_by(StockReservation.product_id).all()
    return {int(pid): _nz(float(qty or 0)) for pid, qty in rows}


def _po_ids_with_transit_delivery(db: Session, tenant_id: int) -> Set[int]:
    rows = (
        db.query(InboundDelivery.purchase_order_id)
        .filter(
            InboundDelivery.tenant_id == tenant_id,
            InboundDelivery.purchase_order_id.isnot(None),
            InboundDelivery.status.in_(TRANSIT_DELIVERY_STATUSES),
        )
        .distinct()
        .all()
    )
    return {int(r[0]) for r in rows if r[0] is not None}


def _po_ids_with_draft_delivery(db: Session, tenant_id: int) -> Set[int]:
    """
    ZZ z szkicem dostawy, na którym są **niezerowe** linie otwarte — wtedy nie liczymy duplikatu z pozycji ZZ.
    """
    diff = func.coalesce(DeliveryItem.quantity_ordered, 0) - func.coalesce(DeliveryItem.quantity_received, 0)
    rows = (
        db.query(InboundDelivery.purchase_order_id)
        .join(DeliveryItem, DeliveryItem.delivery_id == InboundDelivery.id)
        .filter(
            InboundDelivery.tenant_id == tenant_id,
            InboundDelivery.purchase_order_id.isnot(None),
            InboundDelivery.status == "draft",
            DeliveryItem.product_id.isnot(None),
            diff > 0,
        )
        .distinct()
        .all()
    )
    return {int(r[0]) for r in rows if r[0] is not None}


def _inbound_from_transit_and_manual_drafts(
    db: Session,
    tenant_id: int,
    warehouse_id: Optional[int],
    product_ids: Optional[Sequence[int]],
) -> Tuple[Dict[int, float], Dict[int, float]]:
    """
    Zwraca (inbound_confirmed_by_pid, inbound_manual_draft_by_pid).

    inbound_confirmed: dostawy ``ordered``/``in_transit`` (z filtrem magazynu po ZZ, jeśli jest).
    inbound_manual_draft: szkice dostaw **bez** ``purchase_order_id`` (ręczne), magazyn jak wyżej.
    """
    confirmed: Dict[int, float] = defaultdict(float)
    manual_draft: Dict[int, float] = defaultdict(float)

    q = (
        db.query(
            DeliveryItem.product_id,
            DeliveryItem.quantity_ordered,
            DeliveryItem.quantity_received,
            InboundDelivery.status,
            InboundDelivery.purchase_order_id,
            PurchaseOrder.warehouse_id,
        )
        .join(InboundDelivery, InboundDelivery.id == DeliveryItem.delivery_id)
        .outerjoin(PurchaseOrder, PurchaseOrder.id == InboundDelivery.purchase_order_id)
        .filter(InboundDelivery.tenant_id == tenant_id, DeliveryItem.product_id.isnot(None))
    )
    if product_ids is not None and len(product_ids) > 0:
        q = q.filter(DeliveryItem.product_id.in_(tuple(int(x) for x in product_ids)))

    for pid, qo, qr, st, po_id, po_wh in q.all():
        if pid is None:
            continue
        pid_i = int(pid)
        open_qty = max(0.0, float(qo or 0) - float(qr or 0))
        if open_qty <= 0:
            continue
        st_l = (st or "").strip().lower()
        if st_l in ("ordered", "in_transit"):
            if warehouse_id is not None:
                if po_id is None:
                    continue
                if po_wh is not None and int(po_wh) != int(warehouse_id):
                    continue
            confirmed[pid_i] += open_qty
        elif st_l == "draft" and (po_id is None):
            if warehouse_id is not None:
                continue
            manual_draft[pid_i] += open_qty

    return {k: _nz(v) for k, v in confirmed.items()}, {k: _nz(v) for k, v in manual_draft.items()}


def _inbound_from_draft_po_deliveries(
    db: Session,
    tenant_id: int,
    warehouse_id: Optional[int],
    transit_po_ids: Set[int],
    product_ids: Optional[Sequence[int]],
) -> Dict[int, float]:
    """
    Szkice dostaw powiązane z ZZ, dla których **nie** ma jeszcze dostawy w toku (ordered/in_transit).
    Eliminuje sztuczne „1 szt.” na każdym produkcie z auto-tworzonej dostawy-szkicu obok otwartego ZZ.
    """
    out: Dict[int, float] = defaultdict(float)
    q = (
        db.query(
            DeliveryItem.product_id,
            DeliveryItem.quantity_ordered,
            DeliveryItem.quantity_received,
            PurchaseOrder.warehouse_id,
        )
        .join(InboundDelivery, InboundDelivery.id == DeliveryItem.delivery_id)
        .join(PurchaseOrder, PurchaseOrder.id == InboundDelivery.purchase_order_id)
        .filter(
            InboundDelivery.tenant_id == tenant_id,
            InboundDelivery.status == "draft",
            InboundDelivery.purchase_order_id.isnot(None),
            DeliveryItem.product_id.isnot(None),
        )
    )
    if transit_po_ids:
        q = q.filter(~PurchaseOrder.id.in_(list(transit_po_ids)))
    if warehouse_id is not None:
        q = q.filter(
            or_(PurchaseOrder.warehouse_id == int(warehouse_id), PurchaseOrder.warehouse_id.is_(None))
        )
    if product_ids is not None and len(product_ids) > 0:
        q = q.filter(DeliveryItem.product_id.in_(tuple(int(x) for x in product_ids)))

    for pid, qo, qr, po_wh in q.all():
        if pid is None:
            continue
        open_qty = max(0.0, float(qo or 0) - float(qr or 0))
        if open_qty <= 0:
            continue
        if warehouse_id is not None and po_wh is not None and int(po_wh) != int(warehouse_id):
            continue
        out[int(pid)] += open_qty
    return {k: _nz(v) for k, v in out.items()}


def _inbound_from_po_lines(
    db: Session,
    tenant_id: int,
    warehouse_id: Optional[int],
    transit_po_ids: Set[int],
    draft_po_ids: Set[int],
    product_ids: Optional[Sequence[int]],
) -> Dict[int, float]:
    """Pozostałość na liniach ZZ, gdy nie ma dostawy ordered/in_transit ani szkicu dostawy z liniami."""
    q = (
        db.query(PurchaseOrderItem.product_id, PurchaseOrderItem.qty, PurchaseOrderItem.received_qty)
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderItem.purchase_order_id)
        .filter(
            PurchaseOrder.tenant_id == tenant_id,
            PurchaseOrder.status.in_(OPEN_PO_STATUSES),
        )
    )
    if transit_po_ids:
        q = q.filter(~PurchaseOrder.id.in_(list(transit_po_ids)))
    if draft_po_ids:
        q = q.filter(~PurchaseOrder.id.in_(list(draft_po_ids)))
    if warehouse_id is not None:
        q = q.filter(
            or_(PurchaseOrder.warehouse_id == int(warehouse_id), PurchaseOrder.warehouse_id.is_(None))
        )
    if product_ids is not None and len(product_ids) > 0:
        q = q.filter(PurchaseOrderItem.product_id.in_(tuple(int(x) for x in product_ids)))

    out: Dict[int, float] = defaultdict(float)
    for pid, qty, rq in q.all():
        open_qty = max(0.0, float(qty or 0) - float(rq or 0))
        if open_qty > 0:
            out[int(pid)] += open_qty
    return {k: _nz(v) for k, v in out.items()}


def _merge_sum(maps: List[Dict[int, float]]) -> Dict[int, float]:
    acc: Dict[int, float] = defaultdict(float)
    for m in maps:
        for k, v in m.items():
            acc[k] += float(v)
    return {k: _nz(v) for k, v in acc.items()}


def inventory_snapshots_for_products(
    db: Session,
    tenant_id: int,
    warehouse_id: Optional[int],
    product_ids: Sequence[int],
) -> Dict[int, Dict[str, float]]:
    """
    Snapshot per ``product_id`` (tylko przekazane id).

    Klucze: on_hand, reserved, available, inbound_open, inbound_confirmed, inbound_total.
    """
    pids = tuple(int(x) for x in product_ids)
    if not pids:
        return {}

    # SQLite parameter limits — chunk IN clauses and merges.
    _CHUNK = 400
    out: Dict[int, Dict[str, float]] = {}
    for off in range(0, len(pids), _CHUNK):
        chunk = pids[off : off + _CHUNK]
        part = _inventory_snapshots_for_products_chunk(db, tenant_id, warehouse_id, chunk)
        out.update(part)
    return out


def _inventory_snapshots_for_products_chunk(
    db: Session,
    tenant_id: int,
    warehouse_id: Optional[int],
    pids: Tuple[int, ...],
) -> Dict[int, Dict[str, float]]:
    if not pids:
        return {}

    on_hand = _on_hand_visible_by_product(db, tenant_id, warehouse_id, pids)
    reserved = _reserved_by_product(db, tenant_id, warehouse_id, pids)
    transit_po_ids = _po_ids_with_transit_delivery(db, tenant_id)
    draft_po_ids = _po_ids_with_draft_delivery(db, tenant_id)
    conf, manual_draft = _inbound_from_transit_and_manual_drafts(db, tenant_id, warehouse_id, pids)
    draft_linked = _inbound_from_draft_po_deliveries(db, tenant_id, warehouse_id, transit_po_ids, pids)
    po_open = _inbound_from_po_lines(db, tenant_id, warehouse_id, transit_po_ids, draft_po_ids, pids)

    inbound_open = _merge_sum([manual_draft, draft_linked, po_open])
    inbound_confirmed = dict(conf)
    inbound_total = _merge_sum([inbound_open, inbound_confirmed])

    out: Dict[int, Dict[str, float]] = {}
    for pid in pids:
        oh = float(on_hand.get(pid, 0.0))
        rs = float(reserved.get(pid, 0.0))
        av = _nz(max(0.0, oh - rs))
        io = float(inbound_open.get(pid, 0.0))
        ic = float(inbound_confirmed.get(pid, 0.0))
        it = float(inbound_total.get(pid, 0.0))
        out[int(pid)] = {
            "on_hand": _nz(oh),
            "reserved": _nz(rs),
            "available": av,
            "inbound_open": _nz(io),
            "inbound_confirmed": _nz(ic),
            "inbound_total": _nz(it),
        }
    return out


def get_product_inventory_snapshot(
    db: Session,
    *,
    product_id: int,
    tenant_id: int,
    warehouse_id: Optional[int],
) -> Dict[str, float]:
    """Pojedynczy produkt — ten sam kształt co element słownika z ``inventory_snapshots_for_products``."""
    m = inventory_snapshots_for_products(db, tenant_id, warehouse_id, [int(product_id)])
    return m.get(int(product_id), {
        "on_hand": 0.0,
        "reserved": 0.0,
        "available": 0.0,
        "inbound_open": 0.0,
        "inbound_confirmed": 0.0,
        "inbound_total": 0.0,
    })


def on_hand_visible_all_product_ids(db: Session, tenant_id: int, warehouse_id: Optional[int]) -> Set[int]:
    """Zestaw ``product_id`` z dodatnim stanem widocznym (dla kandydatów dashboardu)."""
    m = _on_hand_visible_by_product(db, tenant_id, warehouse_id, None)
    return {pid for pid, q in m.items() if q > 1e-12}


def inbound_total_all_product_ids(db: Session, tenant_id: int, warehouse_id: Optional[int]) -> Set[int]:
    """Produkty z niezerowym pipeline zakupowym (dla kandydatów dashboardu)."""
    transit_po_ids = _po_ids_with_transit_delivery(db, tenant_id)
    draft_po_ids = _po_ids_with_draft_delivery(db, tenant_id)
    conf, manual_draft = _inbound_from_transit_and_manual_drafts(db, tenant_id, warehouse_id, None)
    draft_linked = _inbound_from_draft_po_deliveries(db, tenant_id, warehouse_id, transit_po_ids, None)
    po_open = _inbound_from_po_lines(db, tenant_id, warehouse_id, transit_po_ids, draft_po_ids, None)
    merged = _merge_sum([conf, manual_draft, draft_linked, po_open])
    return {pid for pid, q in merged.items() if q > 1e-12}


def reserved_product_ids_positive(db: Session, tenant_id: int, warehouse_id: Optional[int]) -> Set[int]:
    """Produkty z aktywną rezerwacją (żeby nie gubić kandydatów przy samym stanie 0 na półce)."""
    m = _reserved_by_product(db, tenant_id, warehouse_id, None)
    return {pid for pid, q in m.items() if q > 1e-12}


def visible_on_hand_by_product(
    db: Session,
    tenant_id: int,
    warehouse_id: Optional[int],
    product_ids: Optional[Sequence[int]] = None,
) -> Dict[int, float]:
    """Widoczny stan fizyczny (jak lista produktów) — suma po lokalizacjach po filtrze legacy."""
    return _on_hand_visible_by_product(db, tenant_id, warehouse_id, product_ids)


def inbound_total_by_product_map(db: Session, tenant_id: int, warehouse_id: Optional[int]) -> Dict[int, float]:
    """Mapa product_id → łączna ilość w pipeline zakupowym (ZZ + dostawy), z deduplikacją ZZ/szkic."""
    transit_po_ids = _po_ids_with_transit_delivery(db, tenant_id)
    draft_po_ids = _po_ids_with_draft_delivery(db, tenant_id)
    conf, manual_draft = _inbound_from_transit_and_manual_drafts(db, tenant_id, warehouse_id, None)
    draft_linked = _inbound_from_draft_po_deliveries(db, tenant_id, warehouse_id, transit_po_ids, None)
    po_open = _inbound_from_po_lines(db, tenant_id, warehouse_id, transit_po_ids, draft_po_ids, None)
    open_parts = _merge_sum([manual_draft, draft_linked, po_open])
    return _merge_sum([open_parts, conf])
