"""Purchasing & delivery planning module API."""

import csv
import io
import json
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..auth.deps import get_current_user
from ..auth.warehouse_deps import (
    assert_warehouse_scoped_entity_access,
    load_purchase_order_for_active_warehouse,
    require_active_or_query_operable_warehouse,
)
from ..models.app_user import AppUser
from ..schemas.purchasing_dashboard import PurchasingDashboardOut
from ..schemas.purchasing_forecast import PurchasingForecastOut
from ..schemas.purchasing_orders import (
    InboundDeliveryFromPoOut,
    PurchaseOrderDetailOut,
    PurchaseOrderFromGeneratorBody,
    PurchaseOrderListOut,
    PurchaseOrderListRowOut,
    PurchaseOrderPatchBody,
    PurchaseOrdersFromGeneratorOut,
    PurchaseOrderStatusBody,
)
from ..schemas.purchasing_alerts import (
    PurchasingAlertBulkResolveBody,
    PurchasingAlertBulkResolveOut,
    PurchasingAlertCreateDraftBody,
    PurchasingAlertCreateDraftOut,
    PurchasingAlertEventOut,
    PurchasingAlertListOut,
    PurchasingAlertRuleCreateBody,
    PurchasingAlertRuleOut,
    PurchasingAlertRulePatchBody,
    PurchasingAlertRunScanBody,
    PurchasingAlertRunScanOut,
    PurchasingAlertSummaryOut,
    PurchasingAutoDraftListOut,
    PurchasingAutoDraftRowOut,
)
from ..schemas.purchasing_replenishment import ReplenishmentListOut
from ..schemas.purchasing_auto_reorder import (
    PurchaseAutoReorderHistoryOut,
    PurchaseAutoReorderKpisOut,
    PurchaseAutoReorderPreviewOut,
    PurchaseAutoReorderRunNowBody,
    PurchaseAutoReorderRunResponseOut,
    PurchaseAutoRuleCreateBody,
    PurchaseAutoRuleOut,
    PurchaseAutoRulePatchBody,
    PurchaseAutoRunOut,
)
from ..schemas.purchasing_price_opportunities import PurchasingPriceOpportunitiesOut
from ..schemas.purchasing_segments import PurchasingSegmentsOut
from ..schemas.purchasing_supplier_analytics import PurchasingSupplierAnalyticsOut
from ..schemas.purchasing_cooperation_history import PurchasingCooperationHistoryOut
from ..schemas.purchasing_fx import FxManualRateBody, FxRateListOut, FxRateRowOut
from ..schemas.purchasing_integrity import PurchasingIntegrityAuditOut
from ..services import purchasing_alert_service as purch_alert_svc
from ..services import purchasing_order_service as po_order_service
from ..services import currency_rate_service as fx_rates
from ..services.purchasing_dashboard_service import build_purchasing_dashboard
from ..services.purchasing_forecast_service import build_purchasing_forecast
from ..services import purchasing_auto_reorder_service as auto_reorder_svc
from ..services.purchasing_segments_service import build_purchasing_segments
from ..services import purchasing_price_opportunities_service as price_opp_svc
from ..services.purchasing_supplier_analytics_service import build_supplier_analytics
from ..services.purchasing_cooperation_history_service import build_cooperation_history
from ..services.purchasing_replenishment_service import build_replenishment_payload, replenishment_rows_for_export
from ..services.purchasing_api_trace import purchasing_api_span
from ..services.purchase_order_warehouse_sync_service import (
    run_purchasing_integrity_audit,
    sync_purchase_order_status_for_po_id,
)
from ..models.inbound_delivery import InboundDelivery

router = APIRouter(prefix="/purchasing", tags=["Purchasing"])

_REPLENISHMENT_CSV_HEADERS = [
    "product_id",
    "product_name",
    "sku",
    "ean",
    "category_name",
    "supplier_id",
    "supplier_name",
    "current_stock",
    "incoming_qty",
    "sales_30d",
    "avg_daily_sales",
    "stock_cover_days",
    "min_stock",
    "suggested_qty",
    "buy_price",
    "sell_price",
    "margin_percent",
    "margin_value",
    "estimated_order_value",
    "critical_flag",
    "low_stock_flag",
    "image_url",
]


def _replenishment_rows_to_csv_stream(rows: List[dict]) -> io.BytesIO:
    text = io.StringIO()
    w = csv.writer(text, delimiter=";", quoting=csv.QUOTE_MINIMAL)
    w.writerow(_REPLENISHMENT_CSV_HEADERS)
    for r in rows:
        w.writerow([r.get(h, "") for h in _REPLENISHMENT_CSV_HEADERS])
    payload = "\ufeff" + text.getvalue()
    out = io.BytesIO(payload.encode("utf-8"))
    out.seek(0)
    return out


@router.get("/forecast", response_model=PurchasingForecastOut)
def get_purchasing_forecast(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    product_id: Optional[int] = Query(None, ge=1),
    supplier_id: Optional[int] = Query(None, ge=1),
    range_days: int = Query(90, description="Chart window: 30, 90, or 365 calendar days."),
    db: Session = Depends(get_db),
) -> PurchasingForecastOut:
    """Heuristic purchasing forecast from order history + inventory (no ML)."""
    with purchasing_api_span(
        "GET /purchasing/forecast",
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        supplier_id=supplier_id,
        range_days=range_days,
    ):
        if range_days not in (30, 90, 365):
            range_days = 90
        raw = build_purchasing_forecast(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            product_id=product_id,
            supplier_id=supplier_id,
            range_days=range_days,
        )
        return PurchasingForecastOut.model_validate(raw)


@router.get("/suppliers/analytics", response_model=PurchasingSupplierAnalyticsOut)
def get_purchasing_suppliers_analytics(
    tenant_id: int = Query(..., ge=1),
    supplier_id: Optional[int] = Query(None, ge=1),
    range_days: int = Query(90, description="Lookback window: 30, 90, or 365 calendar days."),
    db: Session = Depends(get_db),
) -> PurchasingSupplierAnalyticsOut:
    """Supplier scorecard from purchase orders, inbound deliveries, and catalog prices."""
    if range_days not in (30, 90, 365):
        range_days = 90
    raw = build_supplier_analytics(db, tenant_id=tenant_id, supplier_id=supplier_id, range_days=range_days)
    return PurchasingSupplierAnalyticsOut.model_validate(raw)


@router.get("/cooperation-history", response_model=PurchasingCooperationHistoryOut)
def get_purchasing_cooperation_history(
    tenant_id: int = Query(..., ge=1),
    supplier_id: int = Query(..., ge=1),
    limit_docs: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> PurchasingCooperationHistoryOut:
    raw = build_cooperation_history(db, tenant_id=tenant_id, supplier_id=supplier_id, limit_docs=limit_docs)
    return PurchasingCooperationHistoryOut.model_validate(raw)


@router.get("/segments", response_model=PurchasingSegmentsOut)
def get_purchasing_segments(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    range_days: int = Query(90, description="Okno sprzedaży: 30, 90 lub 365 dni."),
    segment_filter: Optional[str] = Query(None, max_length=2, description="Np. AX, BY — filtr dokładnego segmentu."),
    supplier_id: Optional[int] = Query(None, ge=1),
    dead_stock_only: bool = Query(False),
    high_priority_only: bool = Query(False, description="Priorytet uzupełnienia >= 70."),
    db: Session = Depends(get_db),
) -> PurchasingSegmentsOut:
    """Segmentacja ABC/XYZ z historii zamówień i stanów magazynowych (spójnie z forecast)."""
    with purchasing_api_span(
        "GET /purchasing/segments",
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        range_days=range_days,
    ):
        if range_days not in (30, 90, 365):
            range_days = 90
        raw = build_purchasing_segments(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            range_days=range_days,
            segment_filter=segment_filter,
            supplier_id=supplier_id,
            dead_stock_only=dead_stock_only,
            high_priority_only=high_priority_only,
        )
        return PurchasingSegmentsOut.model_validate(raw)


# --- Auto-reorder: reguły, uruchomienia, wyłącznie szkice PO ---


@router.get("/auto-reorder/rules", response_model=List[PurchaseAutoRuleOut])
def list_purchase_auto_reorder_rules(
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
) -> List[PurchaseAutoRuleOut]:
    """Lista reguł automatycznego uzupełniania dla podmiotu."""
    rows = auto_reorder_svc.list_rules(db, tenant_id)
    return [PurchaseAutoRuleOut.model_validate(r) for r in rows]


@router.post("/auto-reorder/rules", response_model=PurchaseAutoRuleOut, status_code=201)
def create_purchase_auto_reorder_rule(
    body: PurchaseAutoRuleCreateBody,
    db: Session = Depends(get_db),
) -> PurchaseAutoRuleOut:
    """Dodaje regułę (harmonogram na późniejszy cron; silnik i tak można uruchomić ręcznie)."""
    r = auto_reorder_svc.create_rule(
        db,
        tenant_id=body.tenant_id,
        name=body.name,
        is_enabled=body.is_enabled,
        run_time=body.run_time,
        weekdays_json=body.weekdays_json,
        config_json=body.config_json,
    )
    return PurchaseAutoRuleOut.model_validate(r)


@router.patch("/auto-reorder/rules/{rule_id}", response_model=PurchaseAutoRuleOut)
def patch_purchase_auto_reorder_rule(
    rule_id: int,
    tenant_id: int = Query(..., ge=1),
    body: Optional[PurchaseAutoRulePatchBody] = Body(None),
    db: Session = Depends(get_db),
) -> PurchaseAutoRuleOut:
    """Aktualizacja reguły (częściowa)."""
    payload = body or PurchaseAutoRulePatchBody()
    r = auto_reorder_svc.patch_rule(
        db,
        tenant_id,
        rule_id,
        name=payload.name,
        is_enabled=payload.is_enabled,
        run_time=payload.run_time,
        weekdays_json=payload.weekdays_json,
        config_json=payload.config_json,
    )
    return PurchaseAutoRuleOut.model_validate(r)


@router.delete("/auto-reorder/rules/{rule_id}", status_code=204)
def delete_purchase_auto_reorder_rule(
    rule_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
) -> None:
    """Usuwa regułę."""
    auto_reorder_svc.delete_rule(db, tenant_id, rule_id)


@router.get("/auto-reorder/history", response_model=PurchaseAutoReorderHistoryOut)
def get_purchase_auto_reorder_history(
    tenant_id: int = Query(..., ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> PurchaseAutoReorderHistoryOut:
    """Historia uruchomień + KPI na pulpit strony."""
    kpis_raw = auto_reorder_svc.build_kpis(db, tenant_id)
    runs = auto_reorder_svc.list_runs(db, tenant_id, limit)
    return PurchaseAutoReorderHistoryOut(
        kpis=PurchaseAutoReorderKpisOut.model_validate(kpis_raw),
        runs=[PurchaseAutoRunOut.model_validate(r) for r in runs],
    )


@router.get("/auto-reorder/preview", response_model=PurchaseAutoReorderPreviewOut)
def get_purchase_auto_reorder_preview(
    tenant_id: int = Query(..., ge=1),
    rule_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
) -> PurchaseAutoReorderPreviewOut:
    """Podgląd produktów, które trafiłyby do szkiców PO wg reguły (bez zapisu)."""
    raw = auto_reorder_svc.preview_rule(db, tenant_id=tenant_id, rule_id=rule_id)
    return PurchaseAutoReorderPreviewOut.model_validate(raw)


@router.post("/auto-reorder/run-now", response_model=PurchaseAutoReorderRunResponseOut)
def post_purchase_auto_reorder_run_now(
    body: PurchaseAutoReorderRunNowBody,
    db: Session = Depends(get_db),
) -> PurchaseAutoReorderRunResponseOut:
    """Uruchamia silnik: tworzy wyłącznie szkice PO (Draft), nigdy nie wysyła do dostawcy."""
    raw = auto_reorder_svc.run_auto_reorder_now(
        db,
        tenant_id=body.tenant_id,
        rule_id=body.rule_id,
        dry_run=body.dry_run,
    )
    return PurchaseAutoReorderRunResponseOut.model_validate(raw)


# --- Okazje cenowe (oszczędności zakupowe) — tylko dane z bazy ---


_ALLOWED_PRICE_OPP_TYPES = frozenset(
    {
        "cheaper_supplier",
        "price_increase",
        "threshold_discount",
        "bulk_discount",
        "low_rotation_high_cost",
    }
)


@router.get("/price-opportunities", response_model=PurchasingPriceOpportunitiesOut)
def get_purchasing_price_opportunities(
    tenant_id: int = Query(..., ge=1),
    supplier_id: Optional[int] = Query(None, ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    opportunity_type: Optional[str] = Query(None, alias="type", description="Filtr typu okazji (MVP)."),
    range_days: int = Query(90, description="Okno analizy: 30, 90 lub 365 dni."),
    active_sku_only: bool = Query(
        False,
        description="Pomija SKU bez ruchu (zakupy/sprzedaż/stan) w wybranym oknie — redukcja szumu.",
    ),
    product_id: Optional[int] = Query(
        None,
        ge=1,
        description="Opcjonalnie: dane do szuflady (historia cen, porównanie ofert).",
    ),
    db: Session = Depends(get_db),
) -> PurchasingPriceOpportunitiesOut:
    """Wykrywa m.in. tańszych dostawców, podwyżki vs historia PO, brak do progu dostawy, partie MOQ."""
    if range_days not in (30, 90, 365):
        range_days = 90
    tnorm = (opportunity_type or "").strip().lower() or None
    if tnorm and tnorm not in _ALLOWED_PRICE_OPP_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Niedozwolony typ okazji. Dozwolone: {', '.join(sorted(_ALLOWED_PRICE_OPP_TYPES))}.",
        )
    raw = price_opp_svc.build_price_opportunities(
        db,
        tenant_id=tenant_id,
        supplier_id=supplier_id,
        warehouse_id=warehouse_id,
        type_filter=tnorm,
        range_days=range_days,
        active_sku_only=active_sku_only,
        detail_product_id=product_id,
    )
    return PurchasingPriceOpportunitiesOut.model_validate(raw)


# --- Purchasing alerts (rules, scan, deduped events, draft PO helper) ---


@router.get("/alerts/summary", response_model=PurchasingAlertSummaryOut)
def get_purchasing_alerts_summary(
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
) -> PurchasingAlertSummaryOut:
    with purchasing_api_span("GET /purchasing/alerts/summary", tenant_id=tenant_id):
        raw = purch_alert_svc.alert_summary(db, tenant_id)
        return PurchasingAlertSummaryOut.model_validate(raw)


@router.get("/alerts", response_model=PurchasingAlertListOut)
def list_purchasing_alerts(
    tenant_id: int = Query(..., ge=1),
    status: Optional[str] = Query(None, max_length=32),
    severity: Optional[str] = Query(None, max_length=32),
    rule_type: Optional[str] = Query(None, max_length=64),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
) -> PurchasingAlertListOut:
    with purchasing_api_span("GET /purchasing/alerts", tenant_id=tenant_id):
        rows = purch_alert_svc.list_alert_events(
            db,
            tenant_id=tenant_id,
            status=status,
            severity=severity,
            rule_type=rule_type,
            limit=limit,
        )
        return PurchasingAlertListOut(rows=[PurchasingAlertEventOut.from_event(r) for r in rows])


@router.get("/alerts/rules", response_model=List[PurchasingAlertRuleOut])
def list_purchasing_alert_rules(
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
) -> List[PurchasingAlertRuleOut]:
    rules = purch_alert_svc.list_alert_rules(db, tenant_id)
    return [PurchasingAlertRuleOut.model_validate(r) for r in rules]


@router.get("/alerts/auto-drafts", response_model=PurchasingAutoDraftListOut)
def list_purchasing_alert_auto_drafts(
    tenant_id: int = Query(..., ge=1),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
) -> PurchasingAutoDraftListOut:
    rows = purch_alert_svc.list_recent_auto_drafts(db, tenant_id, limit)
    out_rows: List[PurchasingAutoDraftRowOut] = []
    for r in rows:
        try:
            po_ids = [int(x) for x in json.loads(r.purchase_order_ids_json or "[]")]
        except (json.JSONDecodeError, TypeError, ValueError):
            po_ids = []
        summ = None
        if r.summary_json:
            try:
                summ = json.loads(r.summary_json)
            except json.JSONDecodeError:
                summ = None
        out_rows.append(
            PurchasingAutoDraftRowOut(id=int(r.id), generated_at=r.generated_at, purchase_order_ids=po_ids, summary=summ)
        )
    return PurchasingAutoDraftListOut(rows=out_rows)


@router.post("/alerts/rules", response_model=PurchasingAlertRuleOut, status_code=201)
def post_purchasing_alert_rule(
    body: PurchasingAlertRuleCreateBody,
    db: Session = Depends(get_db),
) -> PurchasingAlertRuleOut:
    r = purch_alert_svc.create_alert_rule(
        db,
        tenant_id=body.tenant_id,
        name=body.name,
        rule_type=body.type,
        severity=body.severity,
        config_json=body.config_json,
        is_enabled=body.is_enabled,
    )
    return PurchasingAlertRuleOut.model_validate(r)


@router.patch("/alerts/rules/{rule_id}", response_model=PurchasingAlertRuleOut)
def patch_purchasing_alert_rule(
    rule_id: int,
    tenant_id: int = Query(..., ge=1),
    body: Optional[PurchasingAlertRulePatchBody] = Body(None),
    db: Session = Depends(get_db),
) -> PurchasingAlertRuleOut:
    payload = body or PurchasingAlertRulePatchBody()
    r = purch_alert_svc.patch_alert_rule(
        db,
        tenant_id,
        rule_id,
        name=payload.name,
        is_enabled=payload.is_enabled,
        severity=payload.severity,
        config_json=payload.config_json,
    )
    return PurchasingAlertRuleOut.model_validate(r)


@router.post("/alerts/run-scan", response_model=PurchasingAlertRunScanOut)
def post_purchasing_alerts_run_scan(
    body: PurchasingAlertRunScanBody,
    db: Session = Depends(get_db),
) -> PurchasingAlertRunScanOut:
    with purchasing_api_span(
        "POST /purchasing/alerts/run-scan",
        tenant_id=body.tenant_id,
        warehouse_id=body.warehouse_id,
    ):
        raw = purch_alert_svc.run_alert_scan(db, body.tenant_id, body.warehouse_id)
        return PurchasingAlertRunScanOut.model_validate(raw)


@router.post("/alerts/create-draft-orders", response_model=PurchasingAlertCreateDraftOut, status_code=201)
def post_purchasing_alerts_create_draft_orders(
    body: PurchasingAlertCreateDraftBody,
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
) -> PurchasingAlertCreateDraftOut:
    assert_warehouse_scoped_entity_access(db, user, int(body.warehouse_id), warehouse_id)
    raw = purch_alert_svc.create_draft_orders_from_critical_alerts(
        db,
        tenant_id=body.tenant_id,
        warehouse_id=body.warehouse_id,
    )
    return PurchasingAlertCreateDraftOut.model_validate(raw)


@router.post("/alerts/bulk-resolve", response_model=PurchasingAlertBulkResolveOut)
def post_purchasing_alerts_bulk_resolve(
    body: PurchasingAlertBulkResolveBody,
    db: Session = Depends(get_db),
) -> PurchasingAlertBulkResolveOut:
    raw = purch_alert_svc.bulk_resolve_events(db, body.tenant_id, body.event_ids)
    return PurchasingAlertBulkResolveOut.model_validate(raw)


@router.patch("/alerts/{event_id}/acknowledge", response_model=PurchasingAlertEventOut)
def patch_purchasing_alert_acknowledge(
    event_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
) -> PurchasingAlertEventOut:
    ev = purch_alert_svc.acknowledge_event(db, tenant_id, event_id)
    return PurchasingAlertEventOut.from_event(ev)


@router.patch("/alerts/{event_id}/resolve", response_model=PurchasingAlertEventOut)
def patch_purchasing_alert_resolve(
    event_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
) -> PurchasingAlertEventOut:
    ev = purch_alert_svc.resolve_event(db, tenant_id, event_id)
    return PurchasingAlertEventOut.from_event(ev)


@router.get("/dashboard", response_model=PurchasingDashboardOut)
def get_purchasing_dashboard(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(
        None,
        ge=1,
        description="If set, inventory and sales KPIs are scoped to this warehouse; incoming deliveries stay tenant-wide.",
    ),
    db: Session = Depends(get_db),
) -> PurchasingDashboardOut:
    """Aggregate KPIs, critical stock, heuristic replenishment suggestions, recent deliveries."""
    with purchasing_api_span("GET /purchasing/dashboard", tenant_id=tenant_id, warehouse_id=warehouse_id):
        raw = build_purchasing_dashboard(db, tenant_id, warehouse_id)
        return PurchasingDashboardOut.model_validate(raw)


@router.get("/integrity-audit", response_model=PurchasingIntegrityAuditOut)
def get_purchasing_integrity_audit(
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
) -> PurchasingIntegrityAuditOut:
    """Read-only audit: draft PO + PZ drift, null product_id lines, orphan PO items, etc."""
    with purchasing_api_span("GET /purchasing/integrity-audit", tenant_id=tenant_id):
        raw = run_purchasing_integrity_audit(db, tenant_id)
        return PurchasingIntegrityAuditOut.model_validate(raw)


@router.post("/po/resync-status-from-warehouse")
def post_resync_purchase_order_statuses_from_warehouse(
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
) -> dict:
    """
    One-shot: re-derive PO.status from linked deliveries + PZ for every PO that has an inbound delivery.
    Use after deploying sync hooks or to repair historical drift (e.g. PO stuck on Draft).
    """
    with purchasing_api_span("POST /purchasing/po/resync-status-from-warehouse", tenant_id=tenant_id):
        rows = (
            db.query(InboundDelivery.purchase_order_id)
            .filter(InboundDelivery.tenant_id == tenant_id, InboundDelivery.purchase_order_id.isnot(None))
            .distinct()
            .all()
        )
        changed: list[int] = []
        for (po_id,) in rows:
            if po_id is None:
                continue
            prev = sync_purchase_order_status_for_po_id(db, tenant_id, int(po_id))
            if prev is not None:
                changed.append(int(po_id))
        db.commit()
        return {"tenant_id": tenant_id, "purchase_orders_considered": len(rows), "status_changed_count": len(changed)}


@router.get("/replenishment", response_model=ReplenishmentListOut)
def get_purchasing_replenishment(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None, max_length=200),
    supplier_id: Optional[int] = Query(None, ge=1),
    category_id: Optional[int] = Query(None, ge=1),
    critical_only: bool = Query(False),
    low_stock_only: bool = Query(False),
    positive_margin_only: bool = Query(False),
    stock_zero_only: bool = Query(False, description="Tylko produkty ze stanem 0."),
    below_min_stock_only: bool = Query(False, description="Stan poniżej progu min."),
    has_buy_price_only: bool = Query(False, description="Tylko z ceną zakupu w katalogu / master."),
    margin_min: Optional[float] = Query(None, ge=0, le=100, description="Minimalna marża %."),
    show_loss_products: bool = Query(False, description="Pokaż tylko produkty ze stratą (marża < 0%)."),
    low_margin_lt: Optional[float] = Query(None, ge=0, le=100, description="Pokaż produkty z marżą poniżej X%."),
    top_sales_limit: Optional[int] = Query(None, ge=1, le=5000, description="Top N po sprzedaży 30d (rotacja)."),
    segment_abc: Optional[str] = Query(None, max_length=1, description="Filtr klasy ABC: A, B lub C."),
    sort_by: str = Query("suggested_qty", max_length=64),
    sort_dir: str = Query("desc", max_length=4),
    db: Session = Depends(get_db),
) -> ReplenishmentListOut:
    """Paginated replenishment generator rows (shared formulas with purchasing dashboard)."""
    with purchasing_api_span("GET /purchasing/replenishment", tenant_id=tenant_id, warehouse_id=warehouse_id, page=page):
        raw = build_replenishment_payload(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            page=page,
            page_size=page_size,
            search=search,
            supplier_id=supplier_id,
            category_id=category_id,
            critical_only=critical_only,
            low_stock_only=low_stock_only,
            positive_margin_only=positive_margin_only,
            sort_by=sort_by,
            sort_dir=sort_dir,
            stock_zero_only=stock_zero_only,
            below_min_stock_only=below_min_stock_only,
            has_buy_price_only=has_buy_price_only,
            margin_min=margin_min,
            show_loss_products=show_loss_products,
            low_margin_lt=low_margin_lt,
            top_sales_limit=top_sales_limit,
            segment_abc=segment_abc,
        )
        return ReplenishmentListOut.model_validate(raw)


@router.get("/replenishment/export")
def export_purchasing_replenishment_csv(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    search: Optional[str] = Query(None, max_length=200),
    supplier_id: Optional[int] = Query(None, ge=1),
    category_id: Optional[int] = Query(None, ge=1),
    critical_only: bool = Query(False),
    low_stock_only: bool = Query(False),
    positive_margin_only: bool = Query(False),
    stock_zero_only: bool = Query(False),
    below_min_stock_only: bool = Query(False),
    has_buy_price_only: bool = Query(False),
    margin_min: Optional[float] = Query(None, ge=0, le=100),
    show_loss_products: bool = Query(False),
    low_margin_lt: Optional[float] = Query(None, ge=0, le=100),
    top_sales_limit: Optional[int] = Query(None, ge=1, le=5000),
    segment_abc: Optional[str] = Query(None, max_length=1),
    sort_by: str = Query("suggested_qty", max_length=64),
    sort_dir: str = Query("desc", max_length=4),
    product_ids: Optional[str] = Query(
        None,
        description="Comma-separated product ids to export a subset; omit for full filtered list.",
        max_length=8000,
    ),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """CSV export (UTF-8 with BOM, semicolon) until XLSX is wired."""
    ids: Optional[List[int]] = None
    if product_ids and product_ids.strip():
        ids = []
        for part in product_ids.split(","):
            part = part.strip()
            if not part:
                continue
            ids.append(int(part))
        if not ids:
            ids = None
    rows = replenishment_rows_for_export(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        search=search,
        supplier_id=supplier_id,
        category_id=category_id,
        critical_only=critical_only,
        low_stock_only=low_stock_only,
        positive_margin_only=positive_margin_only,
        sort_by=sort_by,
        sort_dir=sort_dir,
        product_ids=ids,
        stock_zero_only=stock_zero_only,
        below_min_stock_only=below_min_stock_only,
        has_buy_price_only=has_buy_price_only,
        margin_min=margin_min,
        show_loss_products=show_loss_products,
        low_margin_lt=low_margin_lt,
        top_sales_limit=top_sales_limit,
        segment_abc=segment_abc,
    )
    buf = _replenishment_rows_to_csv_stream(rows)
    headers = {"Content-Disposition": 'attachment; filename="replenishment_export.csv"'}
    return StreamingResponse(buf, media_type="text/csv; charset=utf-8", headers=headers)


@router.post("/orders/from-generator", response_model=PurchaseOrdersFromGeneratorOut, status_code=201)
def post_purchase_orders_from_generator(
    body: PurchaseOrderFromGeneratorBody,
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
) -> PurchaseOrdersFromGeneratorOut:
    """Create one draft purchase order per supplier from replenishment rows for selected products."""
    assert_warehouse_scoped_entity_access(db, user, int(body.warehouse_id), warehouse_id)
    with purchasing_api_span(
        "POST /purchasing/orders/from-generator",
        tenant_id=body.tenant_id,
        warehouse_id=body.warehouse_id,
    ):
        raw = po_order_service.create_orders_from_generator(
            db,
            tenant_id=body.tenant_id,
            warehouse_id=body.warehouse_id,
            product_ids=body.product_ids,
            override_qty_map=body.override_qty_map,
        )
        return PurchaseOrdersFromGeneratorOut.model_validate(raw)


@router.get("/orders", response_model=PurchaseOrderListOut)
def list_purchase_orders(
    tenant_id: int = Query(..., ge=1),
    supplier_id: Optional[int] = Query(None, ge=1),
    status: Optional[str] = Query(None, max_length=32),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> PurchaseOrderListOut:
    rows, total = po_order_service.list_purchase_orders(
        db,
        tenant_id=tenant_id,
        supplier_id=supplier_id,
        status=status,
        page=page,
        page_size=page_size,
    )
    return PurchaseOrderListOut(
        rows=[PurchaseOrderListRowOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/orders/{order_id}", response_model=PurchaseOrderDetailOut)
def get_purchase_order(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
) -> PurchaseOrderDetailOut:
    load_purchase_order_for_active_warehouse(
        db, user, tenant_id=tenant_id, order_id=order_id, active_warehouse_id=warehouse_id
    )
    raw = po_order_service.get_purchase_order(db, tenant_id, order_id)
    return PurchaseOrderDetailOut.model_validate(raw)


@router.patch("/orders/{order_id}", response_model=PurchaseOrderDetailOut)
def patch_purchase_order(
    order_id: int,
    body: PurchaseOrderPatchBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
) -> PurchaseOrderDetailOut:
    load_purchase_order_for_active_warehouse(
        db, user, tenant_id=tenant_id, order_id=order_id, active_warehouse_id=warehouse_id
    )
    line_dicts = None
    if body.line_updates:
        line_dicts = []
        for lu in body.line_updates:
            d: dict = {"id": lu.id}
            u = lu.model_dump(exclude_unset=True)
            for k, v in u.items():
                if k == "id":
                    continue
                d[k] = v
            line_dicts.append(d)
    fs = body.model_fields_set
    raw = po_order_service.patch_purchase_order(
        db,
        tenant_id,
        order_id,
        notes=body.notes,
        expected_date=body.expected_date,
        shipping_cost=body.shipping_cost,
        currency=body.currency,
        invoice_date=body.invoice_date,
        update_invoice_date="invoice_date" in fs,
        tax_mode=body.tax_mode,
        line_updates=line_dicts,
    )
    return PurchaseOrderDetailOut.model_validate(raw)


@router.patch("/orders/{order_id}/status", response_model=PurchaseOrderDetailOut)
def patch_purchase_order_status(
    order_id: int,
    body: PurchaseOrderStatusBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
) -> PurchaseOrderDetailOut:
    load_purchase_order_for_active_warehouse(
        db, user, tenant_id=tenant_id, order_id=order_id, active_warehouse_id=warehouse_id
    )
    raw = po_order_service.patch_purchase_order_status(db, tenant_id, order_id, body.status)
    return PurchaseOrderDetailOut.model_validate(raw)


@router.delete("/orders/{order_id}")
def delete_purchase_order(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
) -> dict:
    """Delete draft PO or archive non-draft PO according to warehouse/PZ constraints."""
    load_purchase_order_for_active_warehouse(
        db, user, tenant_id=tenant_id, order_id=order_id, active_warehouse_id=warehouse_id
    )
    return po_order_service.delete_or_archive_purchase_order(db, tenant_id, order_id)


@router.post("/orders/{order_id}/inbound-delivery", response_model=InboundDeliveryFromPoOut, status_code=201)
def post_inbound_delivery_from_purchase_order(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
) -> InboundDeliveryFromPoOut:
    """Create draft inbound delivery (`/deliveries`) linked to this purchase order."""
    load_purchase_order_for_active_warehouse(
        db, user, tenant_id=tenant_id, order_id=order_id, active_warehouse_id=warehouse_id
    )
    raw = po_order_service.create_inbound_delivery_from_purchase_order(db, tenant_id, order_id)
    return InboundDeliveryFromPoOut.model_validate(raw)


@router.get("/fx/rates", response_model=FxRateListOut)
def list_purchasing_fx_rates(
    tenant_id: int = Query(..., ge=1),
    currency: Optional[str] = Query(None, max_length=8),
    limit: int = Query(60, ge=1, le=500),
    db: Session = Depends(get_db),
) -> FxRateListOut:
    rows = fx_rates.list_rates(db, tenant_id=tenant_id, currency=currency, limit=limit)
    return FxRateListOut(
        rows=[
            FxRateRowOut(
                id=int(r["id"]),
                tenant_id=r.get("tenant_id"),
                currency=str(r["currency"]),
                rate_date=str(r["rate_date"] or ""),
                rate_to_pln=float(r["rate_to_pln"]),
                source=str(r["source"]),
            )
            for r in rows
        ]
    )


@router.post("/fx/manual", response_model=FxRateRowOut)
def post_purchasing_fx_manual(body: FxManualRateBody, db: Session = Depends(get_db)) -> FxRateRowOut:
    row = fx_rates.upsert_manual_rate(
        db,
        tenant_id=body.tenant_id,
        currency=body.currency,
        rate_date=body.rate_date,
        rate_to_pln=body.rate_to_pln,
    )
    db.commit()
    db.refresh(row)
    rd = row.rate_date.isoformat() if row.rate_date else ""
    return FxRateRowOut(
        id=int(row.id),
        tenant_id=int(row.tenant_id) if row.tenant_id is not None else None,
        currency=row.currency,
        rate_date=rd,
        rate_to_pln=float(row.rate_to_pln),
        source=row.source,
    )


@router.post("/fx/nbp/fetch", response_model=FxRateRowOut)
def post_purchasing_fx_nbp_fetch(
    tenant_id: int = Query(..., ge=1),
    currency: str = Query(..., max_length=8),
    rate_date: Optional[date] = Query(None, description="Domyślnie dziś (UTC)."),
    db: Session = Depends(get_db),
) -> FxRateRowOut:
    """Pobierz kurs tabeli A NBP i zapisz w bazie (globalnie, tenant_id ignorowany przy zapisie NBP)."""
    from datetime import datetime as dt_module

    d = rate_date or dt_module.utcnow().date()
    row = fx_rates.fetch_and_store_nbp_rate(db, currency, d)
    if not row:
        raise HTTPException(status_code=404, detail="NBP rate not available for this currency/date")
    db.commit()
    db.refresh(row)
    rd = row.rate_date.isoformat() if row.rate_date else ""
    return FxRateRowOut(
        id=int(row.id),
        tenant_id=int(row.tenant_id) if row.tenant_id is not None else None,
        currency=row.currency,
        rate_date=rd,
        rate_to_pln=float(row.rate_to_pln),
        source=row.source,
    )
