"""Create draft PZ (stock document) from supplier order — document only; no warehouse/location."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from ..models.carton import Carton
from ..models.inbound_delivery import InboundDelivery
from ..models.packaging_material import PackagingMaterial
from ..models.product import Product
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.supplier import Supplier
from .delivery_item_catalog_snapshot import hydrate_delivery_item_snapshots
from .tenant_default_warehouse import list_tenant_warehouse_ids
from .document_creator_service import stamp_document_creator
from .purchase_order_warehouse_sync_service import sync_purchase_order_status_for_delivery_id
from ..utils.product_vat import product_vat_rate_percent

QTY_EPS = 1e-9


def pz_display_number(created_at: datetime, doc_id: int) -> str:
    y = created_at.year if created_at else datetime.utcnow().year
    return f"PZ-{y}-{doc_id:04d}"


def mm_display_number(created_at: datetime, doc_id: int) -> str:
    """WMS label for internal transfer (MM); shown as PM in operator UI."""
    y = created_at.year if created_at else datetime.utcnow().year
    return f"PM-{y}-{doc_id:04d}"


def warehouse_document_display_number(document_type: str, created_at: datetime, doc_id: int) -> str:
    dt = str(document_type or "PZ").strip().upper()
    if dt == "MM":
        return mm_display_number(created_at, doc_id)
    if dt in ("PZ", "PZ_RT", "RETURN_RECEIPT"):
        return pz_display_number(created_at, doc_id)
    y = created_at.year if created_at else datetime.utcnow().year
    return f"{dt}-{y}-{doc_id:04d}"


def create_pz_from_delivery(
    db: Session,
    tenant_id: int,
    delivery_id: int,
    *,
    created_by=None,
) -> StockDocument:
    """
    Draft PZ: warehouse auto-set when tenant has exactly one linked warehouse; otherwise NULL until chosen.
    Location remains NULL until receiving-target (WMS).
    Lines: ordered qty and purchase price from delivery items; received stays 0.
    """
    d = (
        db.query(InboundDelivery)
        .filter(InboundDelivery.id == delivery_id, InboundDelivery.tenant_id == tenant_id)
        .first()
    )
    if not d:
        raise ValueError("Purchase order not found")

    if d.status in ("cancelled", "received"):
        raise ValueError("Cannot create PZ for cancelled or fully received purchase order")

    sup = db.query(Supplier).filter(Supplier.id == d.supplier_id, Supplier.tenant_id == tenant_id).first()
    if not sup:
        raise ValueError("Supplier not found")

    plan_items = [it for it in d.items if float(it.quantity_ordered or 0) > QTY_EPS]

    def _is_receivable_line(it) -> bool:
        if it.product_id is not None:
            return True
        k = (getattr(it, "wm_kind", None) or "").strip().lower()
        wid = (getattr(it, "wm_id", None) or "").strip()
        return k in ("carton", "packaging") and bool(wid)

    receivable_plan = [it for it in plan_items if _is_receivable_line(it)]
    if not receivable_plan:
        raise ValueError(
            "Brak pozycji do przyjęcia — zamówienie nie zawiera linii produktowych ani materiałów magazynowych "
            "(kartony / materiały pakowe) z poprawnym powiązaniem katalogowym."
        )

    for it in receivable_plan:
        hydrate_delivery_item_snapshots(db, tenant_id, it)
    db.flush()

    now = datetime.utcnow()
    whs = list_tenant_warehouse_ids(db, tenant_id)
    initial_wh = whs[0] if len(whs) == 1 else None
    doc = StockDocument(
        tenant_id=tenant_id,
        document_type="PZ",
        creation_source="PANEL",
        supplier_id=d.supplier_id,
        delivery_id=d.id,
        warehouse_id=initial_wh,
        location_id=None,
        status="draft",
        receiving_status="NEW",
        putaway_status="NOT_STARTED",
        relocation_status="OPEN",
        created_at=now,
        updated_at=now,
    )
    stamp_document_creator(doc, created_by)
    db.add(doc)
    db.flush()

    for it in receivable_plan:
        q_plan = float(it.quantity_ordered)
        pp = float(it.purchase_price) if it.purchase_price is not None else None

        if it.product_id is not None:
            p = db.query(Product).filter(Product.id == it.product_id, Product.tenant_id == tenant_id).first()
            if not p:
                raise ValueError(f"Product {it.product_id} not found for tenant")
            vat = product_vat_rate_percent(getattr(p, "metadata_json", None))
            sdi = StockDocumentItem(
                document_id=doc.id,
                delivery_item_id=it.id,
                product_id=it.product_id,
                wm_kind=None,
                wm_id=None,
                ordered_quantity=q_plan,
                received_quantity=0,
                quantity=0,
                purchase_price_net=pp,
                vat_rate=float(vat),
            )
            db.add(sdi)
            continue

        k = (getattr(it, "wm_kind", None) or "").strip().lower()
        wid = (getattr(it, "wm_id", None) or "").strip()
        vat = 23.0
        if k == "carton":
            c = db.query(Carton).filter(Carton.id == wid, Carton.tenant_id == tenant_id).first()
            if not c:
                raise ValueError(f"Karton {wid} nie znaleziony dla tenant_id={tenant_id}")
            vat = float(getattr(c, "vat_rate_pct", None) or 23.0)
        elif k == "packaging":
            m = db.query(PackagingMaterial).filter(PackagingMaterial.id == wid, PackagingMaterial.tenant_id == tenant_id).first()
            if not m:
                raise ValueError(f"Materiał opakowaniowy {wid} nie znaleziony dla tenant_id={tenant_id}")
            vat = float(getattr(m, "vat_rate_pct", None) or 23.0)

        sdi = StockDocumentItem(
            document_id=doc.id,
            delivery_item_id=it.id,
            product_id=None,
            wm_kind=k,
            wm_id=wid,
            ordered_quantity=q_plan,
            received_quantity=0,
            quantity=0,
            purchase_price_net=pp,
            vat_rate=float(vat),
        )
        db.add(sdi)

    sync_purchase_order_status_for_delivery_id(db, tenant_id, delivery_id)
    db.commit()
    db.refresh(doc)
    return doc
