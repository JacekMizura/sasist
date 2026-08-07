"""BDO report layer — projections from stock documents + packaging master data only."""

from __future__ import annotations

from calendar import monthrange
from datetime import date
from typing import Iterable, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...models.carton import Carton
from ...models.packaging_material import PackagingMaterial
from ...models.stock_document import StockDocument, StockDocumentItem
from ...models.stock_operation import STOCK_OP_ISSUE, STOCK_OP_RECEIPT, StockOperation
from ...schemas.bdo_packaging import BdoMonthlyReportRead, BdoMonthlyReportRow


def _last_day(y: int, m: int) -> date:
    return date(y, m, monthrange(y, m)[1])


def _tracked_materials(
    db: Session, tenant_id: int, warehouse_id: Optional[int] = None
) -> List[Tuple[str, str, object, int]]:
    """(wm_kind, wm_id, row, product_id) for include_in_bdo materials with stockable product."""
    out: List[Tuple[str, str, object, int]] = []
    q1 = db.query(PackagingMaterial).filter(
        PackagingMaterial.tenant_id == int(tenant_id),
        PackagingMaterial.include_in_bdo.is_(True),
    )
    if warehouse_id is not None:
        q1 = q1.filter(PackagingMaterial.warehouse_id == int(warehouse_id))
    for r in q1.all():
        if getattr(r, "product_id", None) is None:
            from .stockable_bridge import ensure_packaging_stockable_product

            ensure_packaging_stockable_product(db, r)
        if r.product_id is not None:
            out.append(("packaging", str(r.id), r, int(r.product_id)))

    q2 = db.query(Carton).filter(Carton.tenant_id == int(tenant_id), Carton.include_in_bdo.is_(True))
    if warehouse_id is not None:
        q2 = q2.filter(Carton.warehouse_id == int(warehouse_id))
    for r in q2.all():
        if getattr(r, "product_id", None) is None:
            from .stockable_bridge import ensure_carton_stockable_product

            ensure_carton_stockable_product(db, r)
        if r.product_id is not None:
            out.append(("carton", str(r.id), r, int(r.product_id)))
    return out


def _ops_qty(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    product_ids: Iterable[int],
    op_type: str,
    d0: date,
    d1: date,
    document_types: Optional[tuple[str, ...]] = None,
) -> dict[int, float]:
    pids = [int(x) for x in product_ids]
    if not pids:
        return {}
    q = (
        db.query(StockOperation.product_id, func.coalesce(func.sum(StockOperation.qty), 0.0))
        .join(StockDocument, StockDocument.id == StockOperation.document_id)
        .filter(
            StockDocument.tenant_id == int(tenant_id),
            StockOperation.product_id.in_(pids),
            StockOperation.type == op_type,
            func.date(StockDocument.created_at) >= d0,
            func.date(StockDocument.created_at) <= d1,
        )
    )
    if warehouse_id is not None:
        q = q.filter(StockDocument.warehouse_id == int(warehouse_id))
    if document_types:
        q = q.filter(StockDocument.document_type.in_(document_types))
    rows = q.group_by(StockOperation.product_id).all()
    return {int(pid): float(qty) for pid, qty in rows}


def build_monthly_bdo_report(
    db: Session,
    *,
    tenant_id: int,
    year: int,
    month: int,
    warehouse_id: Optional[int] = None,
    methodology_note: Optional[str] = None,
) -> BdoMonthlyReportRead:
    """
    Monthly BDO from warehouse documents only:

    - purchases ≈ RECEIPT ops on PZ (and related receive docs)
    - usage ≈ ISSUE ops on RW / packing / adjustments
    - kg = usage × material *_kg_per_unit
    """
    if month < 1 or month > 12:
        raise ValueError("Nieprawidłowy miesiąc")
    first = date(year, month, 1)
    last = _last_day(year, month)
    mats = _tracked_materials(db, tenant_id, warehouse_id)
    pids = [pid for *_, pid in mats]

    receipts = _ops_qty(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_ids=pids,
        op_type=STOCK_OP_RECEIPT,
        d0=first,
        d1=last,
        document_types=("PZ", "Z_PZ", "PZ_RT", "RETURN_RECEIPT"),
    )
    issues = _ops_qty(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_ids=pids,
        op_type=STOCK_OP_ISSUE,
        d0=first,
        d1=last,
        document_types=("RW", "WZ"),  # packing RW + manual RW; WZ unlikely for packaging
    )

    rows: list[BdoMonthlyReportRow] = []
    tp = tw = tg = tm = tpaper = 0.0
    for kind, wid, m, pid in mats:
        purchased = float(receipts.get(pid, 0.0))
        used = max(0.0, float(issues.get(pid, 0.0)))
        plastic = used * float(getattr(m, "plastic_kg_per_unit", 0) or 0)
        paper = used * float(getattr(m, "paper_kg_per_unit", 0) or 0)
        wood = used * float(getattr(m, "wood_kg_per_unit", 0) or 0)
        glass = used * float(getattr(m, "glass_kg_per_unit", 0) or 0)
        metal = used * float(getattr(m, "metal_kg_per_unit", 0) or 0)
        tp += plastic
        tpaper += paper
        tw += wood
        tg += glass
        tm += metal
        sku = getattr(m, "sku", None)
        rows.append(
            BdoMonthlyReportRow(
                wm_ref=f"{kind}:{wid}",
                material_name=str(getattr(m, "name", "") or ""),
                sku=(str(sku).strip()[:128] if sku else None),
                beginning_qty=0.0,  # inventory opening — optional phase-2 from Inventory snapshots
                purchased_qty=purchased,
                corrections_qty=0.0,
                ending_qty=None,
                used_qty=used,
                plastic_kg=round(plastic, 4),
                paper_kg=round(paper, 4),
                wood_kg=round(wood, 4),
                glass_kg=round(glass, 4),
                metal_kg=round(metal, 4),
            )
        )
    return BdoMonthlyReportRead(
        year=year,
        month=month,
        methodology_note=methodology_note
        or (
            "Raport BDO z dokumentów magazynowych: przyjęcia (PZ/RECEIPT) i zużycie (RW/ISSUE, w tym pakowanie). "
            "Masy = zużycie × kg/jednostkę z kartoteki materiałów opakowaniowych."
        ),
        totals_plastic_kg=round(tp, 3),
        totals_paper_kg=round(tpaper, 3),
        totals_wood_kg=round(tw, 3),
        totals_glass_kg=round(tg, 3),
        totals_metal_kg=round(tm, 3),
        rows=rows,
    )
