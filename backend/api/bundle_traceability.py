"""P4.16 — Bundle lot traceability & recall API."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.bundle_traceability import (
    BundleRecallReportRead,
    BundleTraceabilityTreeRead,
    LotToBundleHitRead,
    LotToCustomerHitRead,
    LotToOrderHitRead,
    LotTraceReportRowRead,
)
from ..services.bundles.bundle_recall_service import build_bundle_recall_report
from ..services.bundles.bundle_traceability_reports_service import bundle_lots_report, lot_trace_report
from ..services.bundles.bundle_traceability_service import (
    bundle_lot_tree_for_order,
    lot_to_bundles,
    lot_to_customers,
    lot_to_orders,
)

router = APIRouter(prefix="/bundles/traceability", tags=["Bundle traceability"])


@router.get("/lot/{lot_number}/bundles", response_model=List[LotToBundleHitRead])
def get_lot_to_bundles(
    lot_number: str,
    tenant_id: int = Query(...),
    db: Session = Depends(get_db),
) -> List[LotToBundleHitRead]:
    hits = lot_to_bundles(db, lot_number, tenant_id=int(tenant_id))
    return [LotToBundleHitRead(**h.__dict__) for h in hits]


@router.get("/lot/{lot_number}/orders", response_model=List[LotToOrderHitRead])
def get_lot_to_orders(
    lot_number: str,
    tenant_id: int = Query(...),
    db: Session = Depends(get_db),
) -> List[LotToOrderHitRead]:
    return [LotToOrderHitRead(**row) for row in lot_to_orders(db, lot_number, tenant_id=int(tenant_id))]


@router.get("/lot/{lot_number}/customers", response_model=List[LotToCustomerHitRead])
def get_lot_to_customers(
    lot_number: str,
    tenant_id: int = Query(...),
    db: Session = Depends(get_db),
) -> List[LotToCustomerHitRead]:
    hits = lot_to_customers(db, lot_number, tenant_id=int(tenant_id))
    return [LotToCustomerHitRead(**h.__dict__) for h in hits]


@router.get("/orders/{order_id:int}/bundle-lots", response_model=List[BundleTraceabilityTreeRead])
def get_order_bundle_lot_tree(
    order_id: int,
    tenant_id: int = Query(...),
    db: Session = Depends(get_db),
) -> List[BundleTraceabilityTreeRead]:
    from ..models.order import Order

    order = db.query(Order).filter(Order.id == int(order_id), Order.tenant_id == int(tenant_id)).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    trees = bundle_lot_tree_for_order(db, int(order_id))
    return [
        BundleTraceabilityTreeRead(
            bundle_id=n.bundle_id,
            bundle_name=n.bundle_name,
            parent_order_line_id=n.parent_order_line_id,
            fulfillment_mode=n.fulfillment_mode,
            components=[
                {
                    "snapshot_id": c.snapshot_id,
                    "product_id": c.product_id,
                    "product_name": c.product_name,
                    "lots": list(c.lots),
                }
                for c in n.components
            ],
        )
        for n in trees
    ]


@router.get("/recall", response_model=BundleRecallReportRead)
def get_bundle_recall_report(
    lot_number: str = Query(..., min_length=1),
    tenant_id: int = Query(...),
    db: Session = Depends(get_db),
) -> BundleRecallReportRead:
    report = build_bundle_recall_report(db, lot_number, tenant_id=int(tenant_id))
    return BundleRecallReportRead(
        lot_number=report.lot_number,
        bundles=report.bundles,
        orders=report.orders,
        customers=report.customers,
        summary=report.summary,
    )


@router.get("/reports/lot-trace", response_model=List[LotTraceReportRowRead])
def get_lot_trace_report(
    lot_number: str = Query(..., min_length=1),
    tenant_id: int = Query(...),
    db: Session = Depends(get_db),
) -> List[LotTraceReportRowRead]:
    rows = lot_trace_report(db, lot_number, tenant_id=int(tenant_id))
    return [LotTraceReportRowRead(**r.__dict__) for r in rows]


@router.get("/reports/bundle-lots")
def get_bundle_lots_report(
    order_id: int = Query(..., ge=1),
    tenant_id: int = Query(...),
    db: Session = Depends(get_db),
) -> dict:
    from ..models.order import Order

    order = db.query(Order).filter(Order.id == int(order_id), Order.tenant_id == int(tenant_id)).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return {"order_id": int(order_id), "bundles": bundle_lots_report(db, int(order_id))}
