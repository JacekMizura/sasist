"""
Active WMS operations that block structure rebuild / soft-remove of locations.

Read-only projection over existing operational tables — not a lifecycle engine.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session


@dataclass(frozen=True)
class ActiveLocationOp:
    location_uuid: str
    location_label: str
    operation_type: str
    document_number: str

    def as_dict(self) -> dict[str, str]:
        return {
            "location_uuid": self.location_uuid,
            "location_label": self.location_label,
            "operation_type": self.operation_type,
            "document_number": self.document_number,
        }


def _norm_uuid(v: Any) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def find_active_ops_for_location_uuids(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    location_uuids: list[str],
    location_labels: dict[str, str] | None = None,
) -> list[ActiveLocationOp]:
    """
    Return active operations referencing the given location UUIDs.
    Empty input → empty list. Failures per domain are skipped (best-effort).
    """
    uuids = [_norm_uuid(u) for u in location_uuids]
    uuids = [u for u in uuids if u]
    if not uuids:
        return []
    labels = location_labels or {}

    from ...models.location import Location

    loc_rows = (
        db.query(Location.id, Location.location_uuid, Location.name)
        .filter(
            Location.warehouse_id == int(warehouse_id),
            Location.location_uuid.in_(uuids),
        )
        .all()
    )
    id_by_uuid: dict[str, int] = {}
    label_by_id: dict[int, str] = {}
    uuid_by_id: dict[int, str] = {}
    for row in loc_rows:
        uu = _norm_uuid(getattr(row, "location_uuid", None))
        if not uu:
            continue
        lid = int(row.id)
        id_by_uuid[uu] = lid
        uuid_by_id[lid] = uu
        label_by_id[lid] = labels.get(uu) or (getattr(row, "name", None) or uu)

    location_ids = list(id_by_uuid.values())
    if not location_ids:
        return []

    found: list[ActiveLocationOp] = []
    seen: set[tuple[str, str, str]] = set()

    def _add(loc_id: int, op_type: str, doc_no: str) -> None:
        uu = uuid_by_id.get(int(loc_id))
        if not uu:
            return
        key = (uu, op_type, doc_no)
        if key in seen:
            return
        seen.add(key)
        found.append(
            ActiveLocationOp(
                location_uuid=uu,
                location_label=label_by_id.get(int(loc_id), uu),
                operation_type=op_type,
                document_number=doc_no or "—",
            )
        )

    # Inventory locks / count in progress
    try:
        from ...models.inventory_count.constants import INV_STATUS_IN_PROGRESS
        from ...models.inventory_count.document import InventoryDocument
        from ...models.inventory_count.location_lock import InventoryLocationLock

        rows = (
            db.query(InventoryLocationLock.location_id, InventoryDocument.document_number, InventoryDocument.id)
            .join(InventoryDocument, InventoryDocument.id == InventoryLocationLock.inventory_document_id)
            .filter(
                InventoryLocationLock.location_id.in_(location_ids),
                InventoryLocationLock.released_at.is_(None),
                InventoryDocument.status == INV_STATUS_IN_PROGRESS,
                InventoryDocument.tenant_id == int(tenant_id),
            )
            .all()
        )
        for loc_id, doc_no, doc_id in rows:
            _add(int(loc_id), "Inwentaryzacja", str(doc_no or f"#{doc_id}"))
    except Exception:
        pass

    # Open picks
    try:
        from ...models.pick_task import PickTask

        rows = (
            db.query(PickTask.location_id, PickTask.order_id, PickTask.id)
            .filter(
                PickTask.warehouse_id == int(warehouse_id),
                PickTask.tenant_id == int(tenant_id),
                PickTask.location_id.in_(location_ids),
                PickTask.status.in_(("waiting", "picking")),
            )
            .all()
        )
        for loc_id, order_id, task_id in rows:
            _add(int(loc_id), "Kompletacja", f"zamówienie #{order_id}" if order_id else f"zadanie #{task_id}")
    except Exception:
        pass

    # Stock reservations
    try:
        from ...models.stock_reservation import StockReservation

        rows = (
            db.query(StockReservation.location_id, StockReservation.order_id, StockReservation.id)
            .filter(
                StockReservation.tenant_id == int(tenant_id),
                StockReservation.location_id.in_(location_ids),
                StockReservation.status == "reserved",
            )
            .all()
        )
        for loc_id, order_id, rid in rows:
            _add(int(loc_id), "Rezerwacja", f"zamówienie #{order_id}" if order_id else f"#{rid}")
    except Exception:
        pass

    # Putaway / MM / open stock documents
    try:
        from ...models.stock_document import StockDocument
        from sqlalchemy import or_

        terminal = ("closed", "cancelled", "CLOSED", "CANCELLED", "DONE")
        rows = (
            db.query(
                StockDocument.id,
                StockDocument.document_type,
                StockDocument.document_number,
                StockDocument.location_id,
                StockDocument.mm_from_location_id,
                StockDocument.mm_to_location_id,
                StockDocument.putaway_status,
                StockDocument.status,
            )
            .filter(
                StockDocument.tenant_id == int(tenant_id),
                or_(
                    StockDocument.warehouse_id == int(warehouse_id),
                    StockDocument.source_warehouse_id == int(warehouse_id),
                    StockDocument.destination_warehouse_id == int(warehouse_id),
                ),
                or_(
                    StockDocument.location_id.in_(location_ids),
                    StockDocument.mm_from_location_id.in_(location_ids),
                    StockDocument.mm_to_location_id.in_(location_ids),
                ),
            )
            .all()
        )
        for row in rows:
            st = str(getattr(row, "status", "") or "")
            if st.lower() in {t.lower() for t in terminal}:
                continue
            putaway = str(getattr(row, "putaway_status", "") or "")
            dtype = str(getattr(row, "document_type", "") or "Dokument")
            doc_no = str(getattr(row, "document_number", None) or f"#{row.id}")
            op = "Przesunięcie MM" if dtype.upper() == "MM" else (
                "Rozlokowanie" if putaway in ("NOT_STARTED", "IN_PROGRESS") else f"Dokument {dtype}"
            )
            for lid in (
                getattr(row, "location_id", None),
                getattr(row, "mm_from_location_id", None),
                getattr(row, "mm_to_location_id", None),
            ):
                if lid is not None and int(lid) in location_ids:
                    _add(int(lid), op, doc_no)
    except Exception:
        pass

    # Replenishment
    try:
        from ...models.replenishment_task import ReplenishmentTask
        from sqlalchemy import or_

        rows = (
            db.query(
                ReplenishmentTask.id,
                ReplenishmentTask.source_location_id,
                ReplenishmentTask.target_location_id,
                ReplenishmentTask.status,
            )
            .filter(
                ReplenishmentTask.tenant_id == int(tenant_id),
                ReplenishmentTask.warehouse_id == int(warehouse_id),
                ReplenishmentTask.status.notin_(("DONE", "CANCELLED", "done", "cancelled")),
                or_(
                    ReplenishmentTask.source_location_id.in_(location_ids),
                    ReplenishmentTask.target_location_id.in_(location_ids),
                ),
            )
            .all()
        )
        for row in rows:
            for lid in (row.source_location_id, row.target_location_id):
                if lid is not None and int(lid) in location_ids:
                    _add(int(lid), "Uzupełnienie", f"#{row.id}")
    except Exception:
        pass

    # Production
    try:
        from ...models.production import ProductionOrder

        terminal_po = {"completed", "cancelled", "done", "CLOSED", "closed"}
        rows = (
            db.query(ProductionOrder.id, ProductionOrder.number, ProductionOrder.location_id, ProductionOrder.status)
            .filter(
                ProductionOrder.tenant_id == int(tenant_id),
                ProductionOrder.warehouse_id == int(warehouse_id),
                ProductionOrder.location_id.in_(location_ids),
            )
            .all()
        )
        for row in rows:
            if str(row.status or "").lower() in {t.lower() for t in terminal_po}:
                continue
            if row.location_id is not None:
                _add(int(row.location_id), "Produkcja", str(row.number or f"#{row.id}"))
    except Exception:
        pass

    return found
