"""
Pending inventory correction from picking „empty location” (DOCUMENTS_ONLY).

Reuses InventoryDocument + InventoryLocationLock so routing excludes the location
via ``locked_location_ids_for_picking`` without illegal direct stock writes.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.constants import (
    AUDIT_DOC_CREATED,
    AUDIT_LOCK,
    INV_STATUS_IN_PROGRESS,
    INV_TYPE_CONTROL,
    LINE_STATUS_OPEN,
    MOVEMENT_POLICY_BLOCK_PICK,
)
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.inventory_count.location_lock import InventoryLocationLock
from .audit_service import log_inventory_audit


def create_picking_empty_location_pending_correction(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    location_id: int,
    product_id: int,
    expected_quantity: float,
    cart_id: int | None = None,
    operator_user_id: int | None = None,
    location_code: str | None = None,
    product_ean: str | None = None,
) -> dict[str, Any]:
    """
    Represent: formal stock may still be N, physically confirmed empty, awaiting document posting.

    Creates CONTROL inventory document IN_PROGRESS + line (counted=0) + location lock
    with ``block_picking`` so ``PickingRoutingService`` skips this location.
    Does **not** mutate ``Inventory.quantity``. Does **not** commit.
    """
    stamp = datetime.utcnow().strftime("%Y%m%d")
    number = f"INV-PICK-EMPTY-{tenant_id}-{stamp}-{uuid.uuid4().hex[:8].upper()}"
    meta = {
        "source": "picking_confirm_empty_location",
        "title": f"Pusta lokalizacja (picking) {location_code or location_id}",
        "product_id": int(product_id),
        "product_ean": product_ean,
        "location_id": int(location_id),
        "location_code": location_code,
        "cart_id": int(cart_id) if cart_id is not None else None,
        "formal_stock_qty": float(expected_quantity),
        "physical_confirmed_qty": 0.0,
        "awaiting_document_posting": True,
    }
    doc = InventoryDocument(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        number=number,
        inventory_type=INV_TYPE_CONTROL,
        status=INV_STATUS_IN_PROGRESS,
        created_by_user_id=int(operator_user_id) if operator_user_id else None,
        lock_mode=MOVEMENT_POLICY_BLOCK_PICK,
        notes=f"Picking: potwierdzono pustą lokalizację {location_code or location_id} "
        f"dla produktu #{product_id} (formalny stan {float(expected_quantity):g}).",
        metadata_json=json.dumps(meta, ensure_ascii=False),
        started_at=datetime.utcnow(),
        total_lines=1,
        counted_lines=1,
        difference_lines=1,
        coverage_percent=100,
    )
    db.add(doc)
    db.flush()

    line = InventoryDocumentLine(
        inventory_document_id=int(doc.id),
        location_id=int(location_id),
        product_id=int(product_id),
        expected_quantity=float(expected_quantity),
        counted_quantity=0.0,
        difference_quantity=-float(expected_quantity),
        status=LINE_STATUS_OPEN,
        last_counted_at=datetime.utcnow(),
        last_counted_by_user_id=int(operator_user_id) if operator_user_id else None,
        confirmed_at=datetime.utcnow(),
        confirmed_by_user_id=int(operator_user_id) if operator_user_id else None,
        notes="Operator picking: lokalizacja fizycznie pusta",
        metadata_json=json.dumps(
            {"source": "picking_confirm_empty_location", "cart_id": cart_id},
            ensure_ascii=False,
        ),
    )
    db.add(line)
    db.flush()

    existing_lock = (
        db.query(InventoryLocationLock)
        .filter(
            InventoryLocationLock.location_id == int(location_id),
            InventoryLocationLock.released_at.is_(None),
        )
        .first()
    )
    lock_id: int | None = None
    if existing_lock is None:
        lock = InventoryLocationLock(
            inventory_document_id=int(doc.id),
            location_id=int(location_id),
            lock_mode=MOVEMENT_POLICY_BLOCK_PICK,
            locked_by_user_id=int(operator_user_id) if operator_user_id else None,
            metadata_json=json.dumps(
                {"source": "picking_confirm_empty_location", "product_id": int(product_id)},
                ensure_ascii=False,
            ),
        )
        db.add(lock)
        db.flush()
        lock_id = int(lock.id)
        log_inventory_audit(
            db,
            tenant_id=int(tenant_id),
            inventory_document_id=int(doc.id),
            user_id=operator_user_id,
            action=AUDIT_LOCK,
            entity_type="location",
            entity_id=int(location_id),
            detail={
                "movement_policy": MOVEMENT_POLICY_BLOCK_PICK,
                "blocks_picking": True,
                "source": "picking_confirm_empty_location",
            },
        )
    else:
        lock_id = int(existing_lock.id)

    log_inventory_audit(
        db,
        tenant_id=int(tenant_id),
        inventory_document_id=int(doc.id),
        user_id=operator_user_id,
        action=AUDIT_DOC_CREATED,
        entity_type="inventory_document",
        entity_id=int(doc.id),
        detail={
            "number": number,
            "inventory_type": INV_TYPE_CONTROL,
            "source": "picking_confirm_empty_location",
            "formal_stock_qty": float(expected_quantity),
        },
    )

    return {
        "inventory_document_id": int(doc.id),
        "inventory_document_number": number,
        "inventory_document_line_id": int(line.id),
        "location_lock_id": lock_id,
        "stock_effect": "pending_document_correction",
        "formal_stock_qty": float(expected_quantity),
        "routing_blocked": True,
    }
