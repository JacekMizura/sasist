"""P2 — warehouse ownership helpers (SSOT for backfill + validation)."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.location import Location
from ..models.order import Order
from ..models.stock_document import StockDocument
from ..models.warehouse_carrier import WarehouseCarrier


class StockDocumentWarehouseRequiredError(ValueError):
    """Raised when a stock document is persisted without warehouse_id (P2)."""


def stock_document_warehouse_required_http(detail: str = "Dokument magazynowy wymaga warehouse_id.") -> HTTPException:
    return HTTPException(status_code=400, detail=detail)


def resolve_pick_task_warehouse_id(
    db: Session,
    *,
    location_id: int,
    order_id: int | None = None,
    explicit_warehouse_id: int | None = None,
) -> int:
    """SSOT: location → order.fulfillment WH → explicit."""
    if explicit_warehouse_id is not None and int(explicit_warehouse_id) > 0:
        return int(explicit_warehouse_id)
    loc = db.query(Location.warehouse_id).filter(Location.id == int(location_id)).first()
    if loc is not None and loc[0] is not None:
        return int(loc[0])
    if order_id is not None:
        ow = db.query(Order.warehouse_id).filter(Order.id == int(order_id)).first()
        if ow is not None and ow[0] is not None:
            return int(ow[0])
    raise ValueError(f"Nie można ustalić magazynu dla pick_task (location_id={location_id}).")


def sync_carrier_current_warehouse(
    carrier: WarehouseCarrier,
    db: Session,
    *,
    location_id: int | None = None,
) -> int | None:
    """Set ``current_warehouse_id`` from location (mobile carrier — current position, not owner)."""
    lid = location_id if location_id is not None else getattr(carrier, "current_location_id", None)
    if lid is None:
        carrier.current_warehouse_id = None
        return None
    loc = db.query(Location.warehouse_id).filter(Location.id == int(lid)).first()
    if loc is None or loc[0] is None:
        carrier.current_warehouse_id = None
        return None
    wid = int(loc[0])
    carrier.current_warehouse_id = wid
    return wid


def resolve_mm_warehouse_ids(
    db: Session,
    doc: StockDocument,
) -> tuple[int | None, int | None]:
    """Derive source/destination WH for MM (and sync header warehouse_id when missing)."""
    src = getattr(doc, "source_warehouse_id", None)
    dst = getattr(doc, "destination_warehouse_id", None)
    hdr = getattr(doc, "warehouse_id", None)

    if src is None and hdr is not None:
        src = int(hdr)
    if src is None and doc.mm_from_location_id is not None:
        row = db.query(Location.warehouse_id).filter(Location.id == int(doc.mm_from_location_id)).first()
        if row and row[0] is not None:
            src = int(row[0])

    if dst is None and doc.mm_to_location_id is not None:
        row = db.query(Location.warehouse_id).filter(Location.id == int(doc.mm_to_location_id)).first()
        if row and row[0] is not None:
            dst = int(row[0])
    if dst is None and src is not None:
        dst = int(src)
    if src is None and dst is not None:
        src = int(dst)

    return src, dst


def apply_mm_warehouse_ids_to_document(db: Session, doc: StockDocument) -> None:
    src, dst = resolve_mm_warehouse_ids(db, doc)
    if src is not None:
        doc.source_warehouse_id = int(src)
    if dst is not None:
        doc.destination_warehouse_id = int(dst)
    if getattr(doc, "warehouse_id", None) is None and src is not None:
        doc.warehouse_id = int(src)


def assert_stock_document_has_warehouse(doc: StockDocument, *, context: str = "stock_document") -> int:
    wid = getattr(doc, "warehouse_id", None)
    if wid is None or int(wid) <= 0:
        raise StockDocumentWarehouseRequiredError(
            f"Dokument magazynowy ({context}) wymaga przypisanego magazynu (warehouse_id)."
        )
    return int(wid)


def validate_new_stock_document_warehouse_id(warehouse_id: int | None, *, context: str = "stock_document") -> int:
    if warehouse_id is None or int(warehouse_id) <= 0:
        raise StockDocumentWarehouseRequiredError(
            f"Nie można utworzyć dokumentu ({context}) bez magazynu (warehouse_id)."
        )
    return int(warehouse_id)


def register_stock_document_warehouse_guard() -> None:
    """ORM hook: block new stock documents without warehouse_id."""
    from sqlalchemy import event

    @event.listens_for(StockDocument, "before_insert")
    def _require_warehouse_on_insert(_mapper, _connection, target: StockDocument) -> None:
        wid = getattr(target, "warehouse_id", None)
        if wid is None or int(wid) <= 0:
            raise StockDocumentWarehouseRequiredError(
                "Nie można utworzyć dokumentu magazynowego bez warehouse_id (P2)."
            )


def ownership_audit_report(db: Session) -> dict[str, Any]:
    """Counts for P2.5 — NULL warehouse_id on stock documents."""
    from sqlalchemy import func

    from ..models.pick_task import PickTask

    by_type = {
        str(r[0] or "?"): int(r[1])
        for r in db.query(StockDocument.document_type, func.count(StockDocument.id))
        .filter(StockDocument.warehouse_id.is_(None))
        .group_by(StockDocument.document_type)
        .all()
    }
    pick_null = int(db.query(func.count(PickTask.id)).filter(PickTask.warehouse_id.is_(None)).scalar() or 0)
    return {
        "stock_documents_null_warehouse_total": sum(by_type.values()),
        "stock_documents_null_by_type": by_type,
        "pick_tasks_null_warehouse": pick_null,
    }
