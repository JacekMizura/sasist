"""Validate warehouse.requires_putaway profile changes (P2.5C.1)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.inventory import Inventory
from ..models.location import Location
from ..models.product_composition import ProductionBatch
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.warehouse import Warehouse
from .pick_eligible_inventory_service import warehouse_requires_putaway

_EPS = 1e-9

_ACTIVE_PRODUCTION_STATUSES = frozenset({"planned", "collecting", "in_progress", "putaway"})


@dataclass(frozen=True)
class WarehouseProfileChangeBlock:
    code: str
    message: str


def _dock_inventory_qty(db: Session, warehouse_id: int) -> float:
    row = (
        db.query(func.coalesce(func.sum(Inventory.quantity), 0.0))
        .join(Location, Location.id == Inventory.location_id)
        .filter(
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.quantity > _EPS,
            Location.location_type == "DOCK",
        )
        .scalar()
    )
    return float(row or 0.0)


def _active_inbound_blocks(db: Session, warehouse_id: int) -> List[WarehouseProfileChangeBlock]:
    blocks: List[WarehouseProfileChangeBlock] = []
    docs = (
        db.query(StockDocument)
        .filter(
            StockDocument.warehouse_id == int(warehouse_id),
            func.lower(StockDocument.status) == "draft",
            func.upper(StockDocument.document_type).in_(("PZ", "Z_PZ", "PZ_RT", "RETURN_RECEIPT", "MM")),
        )
        .all()
    )
    for doc in docs:
        dt = str(getattr(doc, "document_type", "") or "").strip().upper()
        rs = str(getattr(doc, "receiving_status", "") or "").strip().upper()
        ps = str(getattr(doc, "putaway_status", "") or "").strip().upper()
        whs = str(getattr(doc, "warehouse_workflow_status", "") or "").strip().upper()

        if dt == "MM":
            has_lines = (
                db.query(StockDocumentItem.id)
                .filter(StockDocumentItem.document_id == int(doc.id))
                .limit(1)
                .first()
                is not None
            )
            if has_lines:
                blocks.append(
                    WarehouseProfileChangeBlock(
                        code="ACTIVE_MM_DRAFT",
                        message=f"Aktywny dokument MM #{doc.id} (szkic z liniami).",
                    )
                )
            continue

        if rs == "IN_PROGRESS":
            blocks.append(
                WarehouseProfileChangeBlock(
                    code="ACTIVE_RECEIVING",
                    message=f"Trwa przyjęcie dokumentu {dt} #{doc.id}.",
                )
            )
        if ps == "IN_PROGRESS":
            blocks.append(
                WarehouseProfileChangeBlock(
                    code="ACTIVE_PUTAWAY",
                    message=f"Trwa rozlokowanie dokumentu {dt} #{doc.id}.",
                )
            )
        if whs not in ("", "NEW", "CLOSED", "DONE") and rs != "DONE":
            blocks.append(
                WarehouseProfileChangeBlock(
                    code="ACTIVE_WAREHOUSE_WORKFLOW",
                    message=f"Dokument {dt} #{doc.id} ma otwarty workflow magazynowy ({whs}).",
                )
            )

        items = db.query(StockDocumentItem).filter(StockDocumentItem.document_id == int(doc.id)).all()
        rec = sum(float(getattr(x, "received_quantity", 0) or 0) for x in items)
        put = sum(float(getattr(x, "quantity_putaway", 0) or 0) for x in items)
        if rec > _EPS and put + _EPS < rec and ps != "DONE":
            blocks.append(
                WarehouseProfileChangeBlock(
                    code="PENDING_PUTAWAY",
                    message=f"Dokument {dt} #{doc.id} ma towar oczekujący na rozlokowanie.",
                )
            )
    return blocks


def _active_production_blocks(db: Session, warehouse_id: int) -> List[WarehouseProfileChangeBlock]:
    try:
        rows = (
            db.query(ProductionBatch.id, ProductionBatch.number, ProductionBatch.status)
            .filter(
                ProductionBatch.warehouse_id == int(warehouse_id),
                ProductionBatch.status.in_(tuple(_ACTIVE_PRODUCTION_STATUSES)),
            )
            .limit(5)
            .all()
        )
    except Exception:
        return []
    return [
        WarehouseProfileChangeBlock(
            code="ACTIVE_PRODUCTION",
            message=f"Aktywna produkcja: partia {num or f'#{bid}'} (status: {st}).",
        )
        for bid, num, st in rows
    ]


def validate_requires_putaway_change(
    db: Session,
    *,
    warehouse_id: int,
    new_requires_putaway: bool,
) -> List[WarehouseProfileChangeBlock]:
    wh = db.query(Warehouse).filter(Warehouse.id == int(warehouse_id)).first()
    if wh is None:
        return [WarehouseProfileChangeBlock(code="NOT_FOUND", message="Magazyn nie istnieje.")]

    current = warehouse_requires_putaway(wh)
    if bool(new_requires_putaway) == bool(current):
        return []

    blocks: List[WarehouseProfileChangeBlock] = []
    blocks.extend(_active_inbound_blocks(db, int(warehouse_id)))
    blocks.extend(_active_production_blocks(db, int(warehouse_id)))

    if current and not new_requires_putaway:
        dock_qty = _dock_inventory_qty(db, int(warehouse_id))
        if dock_qty > _EPS:
            blocks.append(
                WarehouseProfileChangeBlock(
                    code="DOCK_INVENTORY",
                    message=(
                        f"Na DOCK-IN pozostało {dock_qty:.2f} szt. — dokończ rozlokowanie przed przełączeniem na magazyn prosty."
                    ),
                )
            )

    seen: set[str] = set()
    unique: List[WarehouseProfileChangeBlock] = []
    for b in blocks:
        key = f"{b.code}:{b.message}"
        if key in seen:
            continue
        seen.add(key)
        unique.append(b)
    return unique


def assert_requires_putaway_change_allowed(
    db: Session,
    *,
    warehouse_id: int,
    new_requires_putaway: bool,
) -> None:
    blocks = validate_requires_putaway_change(
        db, warehouse_id=int(warehouse_id), new_requires_putaway=bool(new_requires_putaway)
    )
    if blocks:
        raise ValueError(blocks[0].message)
