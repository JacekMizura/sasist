"""P4.17 — Bundle logistic unit & EAN automation API."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user
from ..auth.warehouse_deps import require_operable_warehouse
from ..database import get_db
from ..models.app_user import AppUser
from ..schemas.bundle_logistics import (
    BundleBarcodeResolveOut,
    BundleBulkStockScanBody,
    BundleBulkStockScanOut,
    BundleLogisticUnitPlaceBody,
    BundleLogisticUnitRead,
    BundlePackingScanBody,
    BundlePickingScanBody,
    BundleScanComponentOut,
    BundleScanOut,
    ConsolidationRackBundleRowOut,
)
from ..services.bundles.bundle_barcode_resolver import resolve_bundle_barcode
from ..services.bundles.bundle_consolidation_view import consolidation_rack_bundle_rows
from ..services.bundles.bundle_logistic_unit_service import list_logistic_units_for_warehouse, place_bundle_logistic_unit
from ..services.bundles.bundle_scan_service import (
    bulk_stock_pick_scan_result,
    handle_complaint_bundle_scan,
    handle_packing_bundle_scan,
    handle_picking_bundle_scan,
    handle_returns_bundle_scan,
)
from ..services.fulfillment_event_service import sum_pick_events_for_line_cart

router = APIRouter(prefix="/bundles/logistics", tags=["Bundle logistics"])


def _scan_to_out(result) -> BundleScanOut:
    return BundleScanOut(
        found=result.found,
        domain=result.domain,
        barcode=result.barcode,
        match_kind=result.match_kind,
        bundle_id=result.bundle_id,
        bundle_name=result.bundle_name,
        bundle_fulfillment_mode=result.bundle_fulfillment_mode,
        action=result.action,
        product_id=result.product_id,
        order_id=result.order_id,
        order_item_id=result.order_item_id,
        quantity=result.quantity,
        missing_components=[
            BundleScanComponentOut(
                order_item_id=c.order_item_id,
                product_id=c.product_id,
                product_name=c.product_name,
                quantity_required=c.quantity_required,
                quantity_picked=c.quantity_picked,
                quantity_to_pick=c.quantity_to_pick,
                bundle_component_index=c.bundle_component_index,
                pick_done=c.pick_done,
            )
            for c in result.missing_components
        ],
        bundle_verified=result.bundle_verified,
        message=result.message,
        traceability_links=result.traceability_links,
        return_tree_order_ids=result.return_tree_order_ids,
    )


@router.get("/resolve-barcode", response_model=BundleBarcodeResolveOut)
def get_resolve_bundle_barcode(
    barcode: str = Query(..., min_length=1),
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
) -> BundleBarcodeResolveOut:
    match = resolve_bundle_barcode(db, tenant_id=int(tenant_id), barcode=barcode)
    if match is None:
        return BundleBarcodeResolveOut(found=False, barcode=barcode.strip())
    return BundleBarcodeResolveOut(
        found=True,
        match_kind=match.match_kind,
        barcode=match.barcode,
        bundle_id=match.bundle_id,
        bundle_name=match.bundle_name,
        bundle_fulfillment_mode=match.bundle_fulfillment_mode,
        product_id=match.product_id,
        linked_product_id=match.linked_product_id,
        is_stock_logistic_sku=match.is_stock_logistic_sku,
    )


@router.post("/picking/scan", response_model=BundleScanOut)
def post_picking_bundle_scan(
    body: BundlePickingScanBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
) -> BundleScanOut:
    result = handle_picking_bundle_scan(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        barcode=body.barcode,
        cart_id=int(body.cart_id),
        source_status_id=int(body.source_status_id),
        order_type=str(body.order_type),
        location_id=body.location_id,
        sum_pick_fn=sum_pick_events_for_line_cart,
    )
    out = _scan_to_out(result)
    if out.found and out.action == "pick_stock_line" and body.location_id and out.product_id:
        from ..services.wms_picking_product_list_service import record_wms_quick_pick

        try:
            oid, oiid = record_wms_quick_pick(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                source_status_id=int(body.source_status_id),
                order_type=body.order_type,
                product_id=int(out.product_id),
                location_id=int(body.location_id),
                quantity=float(out.quantity),
                cart_id=int(body.cart_id),
                operator_user_id=int(current_user.id) if current_user else None,
            )
            out.order_id = oid
            out.order_item_id = oiid
            out.message = "STOCK — linia bundle SKU zaliczona."
            db.commit()
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    return out


@router.post("/packing/scan/{order_id:int}", response_model=BundleScanOut)
def post_packing_bundle_scan(
    order_id: int,
    body: BundlePackingScanBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
) -> BundleScanOut:
    result = handle_packing_bundle_scan(
        db,
        tenant_id=int(tenant_id),
        order_id=int(order_id),
        barcode=body.barcode,
    )
    out = _scan_to_out(result)
    return out


@router.get("/returns/resolve-barcode", response_model=BundleScanOut)
def get_returns_bundle_scan(
    barcode: str = Query(..., min_length=1),
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
) -> BundleScanOut:
    return _scan_to_out(
        handle_returns_bundle_scan(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            barcode=barcode,
        )
    )


@router.get("/complaints/resolve-barcode", response_model=BundleScanOut)
def get_complaints_bundle_scan(
    barcode: str = Query(..., min_length=1),
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
) -> BundleScanOut:
    return _scan_to_out(
        handle_complaint_bundle_scan(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            barcode=barcode,
        )
    )


@router.post("/picking/bulk-stock-scan", response_model=BundleBulkStockScanOut)
def post_bulk_stock_bundle_scan(
    body: BundleBulkStockScanBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
) -> BundleBulkStockScanOut:
    match = resolve_bundle_barcode(db, tenant_id=int(tenant_id), barcode=body.barcode)
    if match is None or not match.is_stock_logistic_sku:
        raise HTTPException(status_code=404, detail="Kod nie rozpoznany jako STOCK bundle SKU.")
    scans = [
        _scan_to_out(bulk_stock_pick_scan_result(scan_index=i + 1, total_scans=int(body.scan_count), match=match))
        for i in range(int(body.scan_count))
    ]
    return BundleBulkStockScanOut(
        scans=scans,
        lines_complete=int(body.scan_count),
        target_scans=int(body.scan_count),
    )


@router.get("/consolidation-rack/{order_id:int}", response_model=List[ConsolidationRackBundleRowOut])
def get_consolidation_rack_bundle_view(
    order_id: int,
    shelf_label: Optional[str] = Query(None),
    db: Session = Depends(get_db),
) -> List[ConsolidationRackBundleRowOut]:
    rows = consolidation_rack_bundle_rows(db, order_id=int(order_id), shelf_label=shelf_label)
    return [ConsolidationRackBundleRowOut(**r.__dict__) for r in rows]


@router.post("/units", response_model=BundleLogisticUnitRead)
def post_place_logistic_unit(
    body: BundleLogisticUnitPlaceBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
) -> BundleLogisticUnitRead:
    row = place_bundle_logistic_unit(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        bundle_id=int(body.bundle_id),
        linked_product_id=int(body.linked_product_id),
        quantity=float(body.quantity),
        placement_type=str(body.placement_type),
        cart_id=body.cart_id,
        carrier_id=body.carrier_id,
        location_id=body.location_id,
        order_id=body.order_id,
    )
    db.commit()
    return BundleLogisticUnitRead(
        id=int(row.id),
        bundle_id=int(row.bundle_id),
        linked_product_id=row.linked_product_id,
        quantity=float(row.quantity),
        placement_type=str(row.placement_type),
        status=str(row.status),
        cart_id=row.cart_id,
        carrier_id=row.carrier_id,
        location_id=row.location_id,
        order_id=row.order_id,
    )


@router.get("/units", response_model=List[BundleLogisticUnitRead])
def get_logistic_units(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    bundle_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
) -> List[BundleLogisticUnitRead]:
    rows = list_logistic_units_for_warehouse(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        bundle_id=bundle_id,
    )
    return [
        BundleLogisticUnitRead(
            id=int(r.id),
            bundle_id=int(r.bundle_id),
            linked_product_id=r.linked_product_id,
            quantity=float(r.quantity),
            placement_type=str(r.placement_type),
            status=str(r.status),
            cart_id=r.cart_id,
            carrier_id=r.carrier_id,
            location_id=r.location_id,
            order_id=r.order_id,
        )
        for r in rows
    ]
