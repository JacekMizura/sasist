"""Draft PZ line commercial fields (ordered qty / purchase price / VAT) + supplier change."""

from __future__ import annotations

import math
from datetime import datetime

from sqlalchemy.orm import Session

from ..models.app_user import AppUser
from ..models.product import Product
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.supplier import Supplier
from ..schemas.stock_document import StockDocumentRead
from ..schemas.wms_receiving import WmsReceivingLineCommercialBody
from .stock_document_service import build_stock_document_read
from .wms_receiving_activity import (
    EVENT_PZ_DOCUMENT_QTY_CHANGED,
    EVENT_PZ_PRICE_CHANGED,
    EVENT_PZ_PRODUCT_REMOVED,
    EVENT_PZ_SUPPLIER_CHANGED,
    EVENT_PZ_VAT_CHANGED,
    fmt_money_pl,
    fmt_qty_pl,
    fmt_vat_pl,
    product_label,
    record_pz_activity,
)


def _assert_draft_pz(doc: StockDocument | None) -> StockDocument:
    if not doc:
        raise ValueError("PZ document not found")
    if doc.status != "draft":
        raise ValueError("Only draft PZ documents can be updated from WMS receiving")
    if str(getattr(doc, "document_type", "") or "").strip().upper() != "PZ":
        raise ValueError("Not a PZ document")
    return doc


def _product_snap(db: Session, product_id: int | None) -> tuple[str | None, str | None, str | None]:
    if product_id is None:
        return None, None, None
    p = db.query(Product).filter(Product.id == int(product_id)).first()
    if p is None:
        return None, None, None
    return (
        (getattr(p, "name", None) or "").strip() or None,
        (getattr(p, "ean", None) or "").strip() or None,
        (getattr(p, "sku", None) or "").strip() or None,
    )


def patch_wms_receiving_line_commercial(
    db: Session,
    tenant_id: int,
    pz_id: int,
    item_id: int,
    body: WmsReceivingLineCommercialBody,
    *,
    performed_by: AppUser,
) -> StockDocumentRead:
    """
    Manual overrides for document qty / purchase net / VAT on a draft PZ line.
    Does not re-apply product catalog defaults (snapshot stays until user edits).
    """
    doc = _assert_draft_pz(
        db.query(StockDocument)
        .filter(StockDocument.id == int(pz_id), StockDocument.tenant_id == int(tenant_id))
        .first()
    )
    line = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.id == int(item_id), StockDocumentItem.document_id == int(pz_id))
        .with_for_update()
        .first()
    )
    if line is None:
        raise ValueError("PZ line not found")

    name, ean, sku = _product_snap(db, getattr(line, "product_id", None))
    label = product_label(name=name, ean=ean, sku=sku, product_id=getattr(line, "product_id", None))
    fields_set = getattr(body, "model_fields_set", None) or set()

    if "ordered_quantity" in fields_set and body.ordered_quantity is not None:
        old = float(line.ordered_quantity or 0)
        new = float(body.ordered_quantity)
        if not math.isfinite(new) or new < 0:
            raise ValueError("ordered_quantity must be a non-negative finite number")
        if abs(old - new) > 1e-9:
            line.ordered_quantity = new
            record_pz_activity(
                db,
                tenant_id=tenant_id,
                document_id=int(pz_id),
                warehouse_id=getattr(doc, "warehouse_id", None),
                event_code=EVENT_PZ_DOCUMENT_QTY_CHANGED,
                description=(
                    f"Zmieniono ilość z dokumentu produktu {label}: "
                    f"{fmt_qty_pl(old)} → {fmt_qty_pl(new)} szt."
                ),
                performed_by=performed_by,
                metadata={
                    "product_id": line.product_id,
                    "product_name": name,
                    "product_ean": ean,
                    "old_ordered_quantity": old,
                    "new_ordered_quantity": new,
                    "item_id": int(line.id),
                },
            )

    if "purchase_price_net" in fields_set:
        old_pp = float(line.purchase_price_net) if line.purchase_price_net is not None else None
        new_pp = body.purchase_price_net
        if new_pp is not None:
            if not math.isfinite(float(new_pp)) or float(new_pp) < 0:
                raise ValueError("purchase_price_net must be a non-negative finite number")
            new_pp = float(new_pp)
        changed = (old_pp is None) != (new_pp is None) or (
            old_pp is not None and new_pp is not None and abs(old_pp - new_pp) > 1e-9
        )
        if changed:
            line.purchase_price_net = new_pp
            old_txt = fmt_money_pl(old_pp) if old_pp is not None else "—"
            new_txt = fmt_money_pl(new_pp) if new_pp is not None else "—"
            record_pz_activity(
                db,
                tenant_id=tenant_id,
                document_id=int(pz_id),
                warehouse_id=getattr(doc, "warehouse_id", None),
                event_code=EVENT_PZ_PRICE_CHANGED,
                description=f"Zmieniono cenę netto produktu {label}: {old_txt} → {new_txt}.",
                performed_by=performed_by,
                metadata={
                    "product_id": line.product_id,
                    "product_name": name,
                    "product_ean": ean,
                    "old_purchase_price_net": old_pp,
                    "new_purchase_price_net": new_pp,
                    "item_id": int(line.id),
                },
            )

    if "vat_rate" in fields_set and body.vat_rate is not None:
        old_v = float(line.vat_rate) if line.vat_rate is not None else None
        new_v = float(body.vat_rate)
        if not math.isfinite(new_v) or new_v < 0:
            raise ValueError("vat_rate must be a non-negative finite number")
        if old_v is None or abs(old_v - new_v) > 1e-9:
            line.vat_rate = new_v
            old_txt = fmt_vat_pl(old_v) if old_v is not None else "—"
            record_pz_activity(
                db,
                tenant_id=tenant_id,
                document_id=int(pz_id),
                warehouse_id=getattr(doc, "warehouse_id", None),
                event_code=EVENT_PZ_VAT_CHANGED,
                description=f"Zmieniono VAT produktu {label}: {old_txt} → {fmt_vat_pl(new_v)}.",
                performed_by=performed_by,
                metadata={
                    "product_id": line.product_id,
                    "product_name": name,
                    "product_ean": ean,
                    "old_vat_rate": old_v,
                    "new_vat_rate": new_v,
                    "item_id": int(line.id),
                },
            )

    doc.updated_at = datetime.utcnow()
    db.flush()
    db.commit()
    db.refresh(doc)
    return build_stock_document_read(db, doc)


def patch_wms_receiving_pz_supplier(
    db: Session,
    tenant_id: int,
    pz_id: int,
    *,
    supplier_id: int,
    performed_by: AppUser,
) -> StockDocumentRead:
    doc = _assert_draft_pz(
        db.query(StockDocument)
        .filter(StockDocument.id == int(pz_id), StockDocument.tenant_id == int(tenant_id))
        .first()
    )
    new_sup = (
        db.query(Supplier)
        .filter(Supplier.id == int(supplier_id), Supplier.tenant_id == int(tenant_id))
        .first()
    )
    if new_sup is None:
        raise ValueError("Dostawca nie istnieje")
    old_id = getattr(doc, "supplier_id", None)
    if old_id is not None and int(old_id) == int(supplier_id):
        return build_stock_document_read(db, doc)
    old_name = "—"
    if old_id is not None:
        old = db.query(Supplier).filter(Supplier.id == int(old_id)).first()
        if old is not None:
            old_name = (getattr(old, "name", None) or getattr(old, "company_name", None) or f"#{old_id}").strip()
    new_name = (getattr(new_sup, "name", None) or getattr(new_sup, "company_name", None) or f"#{supplier_id}").strip()
    doc.supplier_id = int(supplier_id)
    doc.updated_at = datetime.utcnow()
    record_pz_activity(
        db,
        tenant_id=tenant_id,
        document_id=int(pz_id),
        warehouse_id=getattr(doc, "warehouse_id", None),
        event_code=EVENT_PZ_SUPPLIER_CHANGED,
        description=f"Zmieniono dostawcę: {old_name} → {new_name}.",
        performed_by=performed_by,
        metadata={"old_supplier_id": old_id, "new_supplier_id": int(supplier_id), "old_name": old_name, "new_name": new_name},
    )
    db.commit()
    db.refresh(doc)
    return build_stock_document_read(db, doc)


def remove_wms_receiving_extra_line(
    db: Session,
    tenant_id: int,
    pz_id: int,
    item_id: int,
    *,
    performed_by: AppUser,
) -> StockDocumentRead:
    """
    Remove EXTRA/ghost PZ line from draft receiving.

    A) received=0, putaway=0 → delete
    B) received>0, putaway=0 → withdraw DOCK stock, audit, then delete
    C) putaway>0 → reject (no stock mutation)
    Source delivery lines (delivery_item_id set) are never deleted.
    """
    # Local import avoids circular dependency with wms_receiving_service.
    from .stock_document_service import (
        ensure_default_pz_receiving_location_if_missing,
        ensure_pz_document_warehouse_resolved,
        purge_wms_ghost_stock_document_lines,
    )
    from .wms_receiving_service import (
        _append_receiving_scan_log,
        _apply_dock_inventory_for_receipt,
        _assert_receiving_session_open,
        _record_receive_delta_activity,
    )

    doc = _assert_draft_pz(
        db.query(StockDocument)
        .filter(StockDocument.id == int(pz_id), StockDocument.tenant_id == int(tenant_id))
        .first()
    )
    ensure_pz_document_warehouse_resolved(db, doc)
    ensure_default_pz_receiving_location_if_missing(db, doc)
    _assert_receiving_session_open(doc)

    line = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.id == int(item_id), StockDocumentItem.document_id == int(pz_id))
        .with_for_update()
        .first()
    )
    if line is None:
        raise ValueError("PZ line not found")

    put_qty = float(getattr(line, "quantity_putaway", 0) or 0)
    if put_qty > 1e-9:
        raise ValueError(
            "Nie można usunąć pozycji, ponieważ część towaru została już rozlokowana. "
            "Najpierw wykonaj korektę stanu lub odpowiednią operację magazynową."
        )

    if line.delivery_item_id is not None:
        raise ValueError("Nie można usunąć pozycji z dokumentu źródłowego dostawy.")

    name, ean, sku = _product_snap(db, getattr(line, "product_id", None))
    label = product_label(name=name, ean=ean, sku=sku, product_id=getattr(line, "product_id", None))
    rec = float(line.received_quantity or 0)

    if rec > 1e-9:
        wc_id = getattr(line, "warehouse_carrier_id", None)
        _apply_dock_inventory_for_receipt(
            db,
            tenant_id=int(tenant_id),
            doc=doc,
            line=line,
            add_qty=-rec,
            warehouse_carrier_id=int(wc_id) if wc_id is not None else None,
            performed_by=performed_by,
        )
        _append_receiving_scan_log(
            db,
            document_id=int(pz_id),
            item_id=int(line.id),
            admin_id=int(performed_by.id),
            quantity_added=-rec,
            packaging_type="quantity",
            cartons_added=None,
            loose_units_added=None,
        )
        _record_receive_delta_activity(
            db,
            tenant_id=int(tenant_id),
            doc=doc,
            line=line,
            add_q=-rec,
            performed_by=performed_by,
        )
        line.received_quantity = 0.0
        line.quantity = 0.0
        line.cartons_count = 0
        line.loose_units_count = 0
        db.flush()

    pid = getattr(line, "product_id", None)
    db.delete(line)
    purge_wms_ghost_stock_document_lines(db, int(pz_id))
    record_pz_activity(
        db,
        tenant_id=tenant_id,
        document_id=int(pz_id),
        warehouse_id=getattr(doc, "warehouse_id", None),
        event_code=EVENT_PZ_PRODUCT_REMOVED,
        description=(
            f"Wycofano przyjęcie i usunięto produkt {label}."
            if rec > 1e-9
            else f"Usunięto produkt {label}."
        ),
        performed_by=performed_by,
        metadata={
            "product_id": pid,
            "product_name": name,
            "product_ean": ean,
            "item_id": int(item_id),
            "withdrawn_quantity": float(rec),
        },
    )
    doc.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(doc)
    return build_stock_document_read(db, doc)
