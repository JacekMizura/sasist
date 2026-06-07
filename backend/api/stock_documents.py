"""List stock documents (PZ) for Dokumenty magazynowe UI."""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user, get_optional_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..models.customer import Customer
from ..models.document_series import DocumentSeries
from ..models.location import Location
from ..models.order import Order
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.stock_item_location import StockItemLocation
from ..models.stock_operation import StockOperation
from ..models.supplier import Supplier
from ..models.warehouse import Warehouse
from ..schemas.stock_document import (
    PatchStockDocumentItemsBody,
    PatchStockDocumentMetadataBody,
    PatchStockDocumentReceivingTargetBody,
    StockDocumentHardDeleteResult,
    StockDocumentListRow,
    StockDocumentRead,
)
from ..services.stock_document_pdf_service import build_stock_document_pdf_bytes
from ..services.stock_document_hard_delete_service import hard_delete_stock_document
from ..services.document_creator_service import batch_load_app_users, created_by_read_for_document
from ..services.stock_document_service import (
    accept_stock_document,
    cancel_stock_document,
    compute_document_edit_mode_for_list_row,
    compute_is_fully_putaway_for_items,
    compute_is_fully_received_for_items,
    compute_pz_line_financial_totals,
    duplicate_stock_document,
    get_stock_document_read,
    patch_stock_document_items,
    patch_stock_document_metadata,
    set_stock_document_receiving_target,
)
from ..services.document_series_seed_service import ensure_default_document_series
from ..services.wms_audit_service import touch_wms_operation_session

router = APIRouter(prefix="/stock-documents", tags=["Stock documents"])
documents_router = APIRouter(prefix="/documents", tags=["Documents"])
_logger = logging.getLogger(__name__)


@router.get("/", response_model=List[StockDocumentListRow])
def list_stock_documents(
    tenant_id: int = Query(..., ge=1),
    document_type: Optional[str] = Query(None, description="Filter e.g. PZ"),
    warehouse_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
):
    if warehouse_id is not None:
        try:
            ensure_default_document_series(db, int(tenant_id), int(warehouse_id))
        except Exception:
            _logger.exception(
                "ensure_default_document_series failed in list_stock_documents tenant=%s warehouse=%s",
                tenant_id,
                warehouse_id,
            )
            db.rollback()
    q = db.query(StockDocument).filter(StockDocument.tenant_id == tenant_id)
    if document_type and document_type.strip():
        q = q.filter(StockDocument.document_type == document_type.strip().upper())
    if warehouse_id is not None:
        q = q.filter(StockDocument.warehouse_id == warehouse_id)
    docs = q.order_by(StockDocument.created_at.desc()).all()
    if not docs:
        return []

    sids = {int(d.supplier_id) for d in docs if d.supplier_id is not None}
    oids = {int(d.order_id) for d in docs if getattr(d, "order_id", None) is not None}
    series_ids = {
        str(d.document_series_id)
        for d in docs
        if getattr(d, "document_series_id", None) is not None and str(d.document_series_id).strip()
    }
    wids = {d.warehouse_id for d in docs if d.warehouse_id is not None}
    lids = {d.location_id for d in docs if d.location_id is not None}
    poids = {
        int(d.production_order_id)
        for d in docs
        if getattr(d, "production_order_id", None) is not None
    }
    dids = [d.id for d in docs]

    sup_names = {r.id: (r.name or "").strip() for r in db.query(Supplier).filter(Supplier.id.in_(sids)).all()}
    order_by_id: dict[int, Order] = {}
    customer_names: dict[int, str] = {}
    if oids:
        for o in db.query(Order).filter(Order.id.in_(oids)).all():
            order_by_id[int(o.id)] = o
        cids = {int(o.customer_id) for o in order_by_id.values() if o.customer_id is not None}
        if cids:
            for c in db.query(Customer).filter(Customer.id.in_(cids)).all():
                customer_names[int(c.id)] = (c.name or "").strip()
    series_prefix_by_id: dict[str, str] = {}
    if series_ids:
        for s in db.query(DocumentSeries).filter(DocumentSeries.id.in_(series_ids)).all():
            label = (s.prefix or "").strip() or (s.code or "").strip()
            if label:
                series_prefix_by_id[str(s.id)] = label
    wh_names = (
        {r.id: (r.name or "").strip() for r in db.query(Warehouse).filter(Warehouse.id.in_(wids)).all()} if wids else {}
    )
    loc_names = (
        {r.id: (r.name or "").strip() for r in db.query(Location).filter(Location.id.in_(lids)).all()} if lids else {}
    )
    prod_order_numbers: dict[int, str] = {}
    if poids:
        from ..models.production import ProductionOrder

        for po in db.query(ProductionOrder).filter(ProductionOrder.id.in_(poids)).all():
            prod_order_numbers[int(po.id)] = str(po.number or "").strip()

    cnt_rows = (
        db.query(StockDocumentItem.document_id, func.count(StockDocumentItem.id))
        .filter(StockDocumentItem.document_id.in_(dids))
        .group_by(StockDocumentItem.document_id)
        .all()
    )
    counts = {int(did): int(c or 0) for did, c in cnt_rows}

    item_rows = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id.in_(dids))
        .order_by(StockDocumentItem.id)
        .all()
    )
    sums_by_doc: dict[int, tuple[float, float]] = {}
    by_doc_lines: dict[int, list] = defaultdict(list)
    for it in item_rows:
        o = float(it.ordered_quantity or 0)
        r = float(it.received_quantity or 0)
        cur_o, cur_r = sums_by_doc.get(it.document_id, (0.0, 0.0))
        sums_by_doc[it.document_id] = (cur_o + o, cur_r + r)
        by_doc_lines[it.document_id].append(it)

    docs_with_ops: set[int] = set()
    if dids:
        for (did,) in db.query(StockOperation.document_id).filter(StockOperation.document_id.in_(dids)).distinct().all():
            docs_with_ops.add(int(did))

    creator_ids = {
        int(d.created_by_user_id)
        for d in docs
        if getattr(d, "created_by_user_id", None) is not None
    }
    users_by_id = batch_load_app_users(db, creator_ids)

    docs_blocked: set[int] = set(docs_with_ops)
    for d in docs:
        _, tr = sums_by_doc.get(d.id, (0.0, 0.0))
        if tr > 1e-9:
            docs_blocked.add(d.id)
    if dids:
        for (did,) in (
            db.query(StockDocumentItem.document_id)
            .join(StockItemLocation, StockItemLocation.stock_document_item_id == StockDocumentItem.id)
            .filter(StockDocumentItem.document_id.in_(dids), StockItemLocation.quantity > 1e-9)
            .distinct()
            .all()
        ):
            docs_blocked.add(int(did))

    out: List[StockDocumentListRow] = []
    for d in docs:
        to, tr = sums_by_doc.get(d.id, (0.0, 0.0))
        em = compute_document_edit_mode_for_list_row(d, tr)
        if em == "full":
            em_lit: Literal["full", "metadata", "none"] = "full"
        elif em == "metadata":
            em_lit = "metadata"
        else:
            em_lit = "none"
        st_l = str(getattr(d, "status", "") or "").lower()
        can_cancel = st_l == "draft" and d.id not in docs_blocked
        cur = str(getattr(d, "currency", None) or "PLN").strip() or "PLN"
        tn = getattr(d, "total_net", None)
        tg = getattr(d, "total_gross", None)
        tv: Optional[float] = None
        doc_lines = by_doc_lines.get(d.id, [])
        dt_u = str(getattr(d, "document_type", "") or "").strip().upper()
        if dt_u in ("PZ", "WZ") and doc_lines:
            cn, cv, cg = compute_pz_line_financial_totals(doc_lines)
            tn, tg, tv = cn, cg, cv
        oid = int(d.order_id) if getattr(d, "order_id", None) is not None else None
        order_row = order_by_id.get(oid) if oid is not None else None
        order_number = (order_row.number or "").strip() if order_row is not None else None
        cust_name = ""
        if order_row is not None and order_row.customer_id is not None:
            cust_name = customer_names.get(int(order_row.customer_id), "")
        series_id = str(getattr(d, "document_series_id", None) or "").strip() or None
        series_label = series_prefix_by_id.get(series_id, "") if series_id else ""
        doc_number = str(getattr(d, "document_number", None) or "").strip() or None
        supplier_label = (
            sup_names.get(int(d.supplier_id), f"#{int(d.supplier_id)}")
            if d.supplier_id is not None
            else ""
        )
        display_customer = cust_name if dt_u == "WZ" and cust_name else supplier_label
        out.append(
            StockDocumentListRow(
                id=d.id,
                tenant_id=d.tenant_id,
                document_type=d.document_type,
                document_number=doc_number,
                document_series_prefix=series_label or None,
                order_id=oid,
                order_number=order_number or None,
                customer_name=display_customer or None,
                production_order_id=(
                    int(d.production_order_id) if getattr(d, "production_order_id", None) is not None else None
                ),
                production_order_number=(
                    prod_order_numbers.get(int(d.production_order_id))
                    if getattr(d, "production_order_id", None) is not None
                    else None
                ),
                delivery_id=d.delivery_id,
                supplier_id=d.supplier_id,
                supplier_name=supplier_label,
                warehouse_id=d.warehouse_id,
                warehouse_name=wh_names.get(d.warehouse_id, "") if d.warehouse_id is not None else "",
                location_id=d.location_id,
                location_name=loc_names.get(d.location_id, "") if d.location_id is not None else "",
                status=d.status,
                created_at=d.created_at,
                created_by=created_by_read_for_document(d, users_by_id),
                line_count=counts.get(d.id, 0),
                total_ordered=to,
                total_received=tr,
                receiving_status=str(getattr(d, "receiving_status", None) or "NEW"),
                putaway_status=str(getattr(d, "putaway_status", None) or "NOT_STARTED"),
                relocation_status=str(getattr(d, "relocation_status", None) or "OPEN"),
                is_fully_received=compute_is_fully_received_for_items(by_doc_lines.get(d.id, [])),
                is_fully_putaway=compute_is_fully_putaway_for_items(db, by_doc_lines.get(d.id, [])),
                currency=cur,
                total_net=float(tn) if tn is not None else None,
                total_gross=float(tg) if tg is not None else None,
                total_vat=tv,
                edit_mode=em_lit,
                can_cancel=can_cancel,
            )
        )
    return out


@router.get("/{document_id}", response_model=StockDocumentRead)
def get_stock_document(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser | None = Depends(get_optional_current_user),
):
    read = get_stock_document_read(db, tenant_id, document_id)
    if not read:
        raise HTTPException(status_code=404, detail="Document not found")
    if current_user is not None and current_user.id is not None and getattr(read, "warehouse_id", None) is not None:
        dtype = str(getattr(read, "document_type", "") or "").upper()
        receiving_status = str(getattr(read, "receiving_status", "") or "").upper()
        if dtype in {"PZ", "PZ_RT", "RETURN_RECEIPT"} and receiving_status != "DONE":
            total = sum(float(getattr(it, "ordered_quantity", 0) or 0) for it in read.items or [])
            done = sum(float(getattr(it, "received_quantity", 0) or 0) for it in read.items or [])
            touch_wms_operation_session(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(read.warehouse_id),
                session_kind="receiving_active",
                operator_user_id=int(current_user.id),
                metadata={
                    "screen": "receiving_document",
                    "document_id": int(document_id),
                    "document": f"{read.document_type}/{read.id}",
                    "progress_done": done,
                    "progress_total": total,
                    "progress_percent": int(round((done / total) * 100)) if total > 0 else 0,
                },
            )
            db.commit()
    return read


@router.patch("/{document_id}", response_model=StockDocumentRead)
def patch_stock_document_lines(
    document_id: int,
    body: PatchStockDocumentItemsBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return patch_stock_document_items(db, tenant_id, document_id, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{document_id}/receiving-target", response_model=StockDocumentRead)
def patch_stock_document_receiving_target(
    document_id: int,
    body: PatchStockDocumentReceivingTargetBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return set_stock_document_receiving_target(
            db, tenant_id, document_id, body.location_id, body.warehouse_id
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{document_id}/accept", response_model=StockDocumentRead)
def post_accept_stock_document(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return accept_stock_document(db, tenant_id, document_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{document_id}/cancel", response_model=StockDocumentRead)
def post_cancel_stock_document(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return cancel_stock_document(db, tenant_id, document_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{document_id}", response_model=StockDocumentHardDeleteResult)
def delete_stock_document_hard(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """Hard-delete: revert inventory when stock_operations exist, then remove document and lines."""
    try:
        hard_delete_stock_document(db, tenant_id, document_id)
        return StockDocumentHardDeleteResult(id=document_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        _logger.exception("hard_delete stock document failed")
        raise HTTPException(status_code=500, detail="Nie udało się usunąć dokumentu")


@documents_router.delete("/{document_id}", response_model=StockDocumentHardDeleteResult)
def delete_document_hard_alias(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """Alias: DELETE /documents/{id} — same as DELETE /stock-documents/{id}."""
    try:
        hard_delete_stock_document(db, tenant_id, document_id)
        return StockDocumentHardDeleteResult(id=document_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        _logger.exception("hard_delete stock document failed")
        raise HTTPException(status_code=500, detail="Nie udało się usunąć dokumentu")


@router.post("/{document_id}/duplicate", response_model=StockDocumentRead)
def post_duplicate_stock_document(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    try:
        return duplicate_stock_document(db, tenant_id, document_id, created_by=user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{document_id}/metadata", response_model=StockDocumentRead)
def patch_stock_document_metadata_route(
    document_id: int,
    body: PatchStockDocumentMetadataBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return patch_stock_document_metadata(db, tenant_id, document_id, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


def _stock_document_pdf_response(db: Session, tenant_id: int, document_id: int) -> Response:
    from ..services.document_print_service import PdfRendererUnavailable
    from ..services.pdf_deps import PdfGenerationUnavailable
    from ..services.stock_document_html_pdf_service import build_stock_document_html_pdf_bytes

    try:
        try:
            pdf = build_stock_document_html_pdf_bytes(db, tenant_id=tenant_id, document_id=document_id)
        except PdfRendererUnavailable:
            raise
        except (FileNotFoundError, RuntimeError, OSError):
            pdf = build_stock_document_pdf_bytes(db, tenant_id, document_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Document not found")
    except PdfRendererUnavailable as exc:
        _logger.error(
            "[stock_document_pdf] renderer unavailable document_id=%s tenant_id=%s: %s",
            document_id,
            tenant_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=503, detail="PDF renderer unavailable") from exc
    except PdfGenerationUnavailable:
        raise HTTPException(
            status_code=503,
            detail="PDF renderer unavailable",
        )
    except Exception as exc:
        _logger.exception(
            "[stock_document_pdf] failed document_id=%s tenant_id=%s",
            document_id,
            tenant_id,
        )
        raise HTTPException(status_code=500, detail="Nie udało się wygenerować PDF dokumentu.") from exc
    if not pdf or not pdf.startswith(b"%PDF"):
        raise HTTPException(status_code=503, detail="PDF renderer unavailable")
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="document-{document_id}.pdf"'},
    )


@router.get("/{document_id}/pdf")
def get_stock_document_pdf(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    return _stock_document_pdf_response(db, tenant_id, document_id)


@documents_router.get("/{document_id}/pdf")
def get_document_pdf_alias(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """Alias: GET /documents/{id}/pdf (same as /stock-documents/{id}/pdf)."""
    return _stock_document_pdf_response(db, tenant_id, document_id)
