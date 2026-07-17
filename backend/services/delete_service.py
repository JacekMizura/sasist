"""
Jednolita warstwa usuwania / archiwizacji dla WMS (zamówienia, produkty, zwroty, reklamacje).

Routery powinny delegować tutaj zamiast wykonywać ``session.delete`` na nagłówkach bez kolejności FK.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, TYPE_CHECKING

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from .order_bulk_delete_service import bulk_delete_orders_transaction

if TYPE_CHECKING:
    from ..models.complaint import Complaint
from .product_bulk_delete_service import bulk_delete_products_transaction
from .wms_return_delete_service import archive_wms_returns_bulk_transaction


def delete_orders_bulk(db: Session, tenant_id: int, warehouse_id: int | None, id_list: list[int]) -> dict[str, Any]:
    """Usuwanie twarde lub archiwizacja (``orders.deleted_at``) przy historii zwrotów / dokumentów / reklamacji."""
    r = bulk_delete_orders_transaction(db, tenant_id, warehouse_id, id_list)
    deleted = int(r.get("deleted_count") or r.get("deleted") or 0)
    soft = int(r.get("soft_deleted_count") or 0)
    err_list = [str(x) for x in (r.get("errors") or [])]
    messages: list[str] = []
    if deleted:
        messages.append(f"Usunięto: {deleted}")
    if soft:
        messages.append(f"Zarchiwizowano: {soft}")
    if err_list:
        messages.append(f"Błędy: {len(err_list)}")
        messages.extend(err_list)
    return {
        **r,
        "success_count": deleted,
        "soft_deleted_count": soft,
        "messages": messages,
    }


def delete_products_bulk(db: Session, tenant_id: int, id_list: list[int]) -> dict[str, Any]:
    """Soft delete przy historii; twarde usuwanie gdy brak blokujących powiązań."""
    return bulk_delete_products_transaction(db, tenant_id, id_list)


def archive_wms_returns_bulk(db: Session, tenant_id: int, warehouse_id: int, id_list: list[int]) -> dict[str, Any]:
    """Archiwizacja RMZ + zwolnienie FK (linie RMZ/refund usuwane)."""
    return archive_wms_returns_bulk_transaction(db, tenant_id, warehouse_id, id_list)


def soft_delete_complaint(db: Session, complaint_row: "Complaint") -> None:
    """Pojedyncza reklamacja — ustawia deleted_at (bez usuwania powiązań)."""
    complaint_row.deleted_at = datetime.utcnow()


def _entity_empty() -> dict[str, Any]:
    return {
        "success_count": 0,
        "soft_deleted_count": 0,
        "blocked_count": 0,
        "blocked": [],
        "errors": [],
        "skipped_not_found": 0,
        "skipped_already_archived": 0,
        "messages": [],
        "deleted": 0,
    }


def delete_customer_transaction(db: Session, tenant_id: int, customer_id: int) -> dict[str, Any]:
    """Jeden klient: soft gdy są zamówienia, inaczej twarde usunięcie (adresy/zniżki CASCADE)."""
    from ..models.customer import Customer
    from ..models.order import Order

    r = _entity_empty()
    row = db.query(Customer).filter(Customer.id == int(customer_id), Customer.tenant_id == int(tenant_id)).first()
    if row is None:
        r["skipped_not_found"] = 1
        return r
    if getattr(row, "deleted_at", None) is not None:
        r["skipped_already_archived"] = 1
        r["messages"] = ["Klient był już zarchiwizowany."]
        return r
    has_orders = bool(
        db.scalar(select(exists().where(Order.customer_id == int(customer_id), Order.tenant_id == int(tenant_id))))
    )
    now = datetime.utcnow()
    if has_orders:
        row.deleted_at = now
        db.add(row)
        r["soft_deleted_count"] = 1
        r["deleted"] = 1
        r["messages"] = ["Klient posiada historię zamówień — został zarchiwizowany."]
        return r
    db.delete(row)
    r["success_count"] = 1
    r["deleted"] = 1
    r["messages"] = ["Klient został trwale usunięty."]
    return r


def delete_customers_bulk_transaction(db: Session, tenant_id: int, id_list: list[int]) -> dict[str, Any]:
    out = _entity_empty()
    ids = sorted({int(x) for x in id_list if isinstance(x, int) and x > 0})
    if not ids:
        return out
    for cid in ids:
        part = delete_customer_transaction(db, tenant_id, cid)
        out["success_count"] += int(part.get("success_count") or 0)
        out["soft_deleted_count"] += int(part.get("soft_deleted_count") or 0)
        out["skipped_not_found"] += int(part.get("skipped_not_found") or 0)
        out["skipped_already_archived"] += int(part.get("skipped_already_archived") or 0)
        out["messages"].extend(list(part.get("messages") or []))
    out["deleted"] = out["success_count"] + out["soft_deleted_count"]
    return out


def delete_bundle_transaction(db: Session, tenant_id: int, bundle_id: int) -> dict[str, Any]:
    """Jeden zestaw: soft gdy był w pozycjach zamówień (source_bundle_id), inaczej DELETE."""
    from ..models.bundle import Bundle
    from ..models.order_item import OrderItem

    r = _entity_empty()
    row = db.query(Bundle).filter(Bundle.id == int(bundle_id), Bundle.tenant_id == int(tenant_id)).first()
    if row is None:
        r["skipped_not_found"] = 1
        return r
    if getattr(row, "deleted_at", None) is not None:
        r["skipped_already_archived"] = 1
        r["messages"] = ["Zestaw był już zarchiwizowany."]
        return r
    used = bool(db.scalar(select(exists().where(OrderItem.source_bundle_id == int(bundle_id)))))
    now = datetime.utcnow()
    if used:
        row.deleted_at = now
        row.active = False
        db.add(row)
        r["soft_deleted_count"] = 1
        r["deleted"] = 1
        r["messages"] = ["Zestaw występuje w historii zamówień — zarchiwizowano (ukryto z listy)."]
        return r
    db.delete(row)
    r["success_count"] = 1
    r["deleted"] = 1
    r["messages"] = ["Zestaw został trwale usunięty."]
    return r


def delete_bundles_bulk_transaction(db: Session, tenant_id: int, id_list: list[int]) -> dict[str, Any]:
    out = _entity_empty()
    ids = sorted({int(x) for x in id_list if isinstance(x, int) and x > 0})
    if not ids:
        return out
    for bid in ids:
        part = delete_bundle_transaction(db, tenant_id, bid)
        out["success_count"] += int(part.get("success_count") or 0)
        out["soft_deleted_count"] += int(part.get("soft_deleted_count") or 0)
        out["skipped_not_found"] += int(part.get("skipped_not_found") or 0)
        out["skipped_already_archived"] += int(part.get("skipped_already_archived") or 0)
        out["messages"].extend(list(part.get("messages") or []))
    out["deleted"] = out["success_count"] + out["soft_deleted_count"]
    return out
