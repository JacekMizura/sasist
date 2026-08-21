"""Returns report API — live table + CSV/XLSX export."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.returns.returns_report_service import (
    ReturnsReportFilters,
    build_returns_report_csv,
    build_returns_report_xlsx,
    query_returns_report,
    summarize_returns_report,
)

router = APIRouter(prefix="/returns/report", tags=["Returns report"])


def _parse_dt(raw: str | None) -> datetime | None:
    if not raw:
        return None
    t = str(raw).strip()
    if not t:
        return None
    try:
        if t.endswith("Z"):
            t = t[:-1] + "+00:00"
        return datetime.fromisoformat(t)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid datetime: {raw}") from exc


def _filters_from_query(
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    date_from: Optional[str],
    date_to: Optional[str],
    date_field: str,
    status_id: Optional[int],
    decision: Optional[str],
    product_query: Optional[str],
    order_query: Optional[str],
    source: Optional[str],
    country: Optional[str],
    sort: str,
    direction: str,
    page: int,
    limit: int,
) -> ReturnsReportFilters:
    df = str(date_field or "created").strip().lower()
    if df not in ("created", "warehouse_commit", "refund"):
        df = "created"
    s = str(sort or "date").strip().lower()
    allowed_sort = {"date", "return_number", "order_number", "product", "qty", "line_value", "status"}
    if s not in allowed_sort:
        s = "date"
    d = str(direction or "desc").strip().lower()
    if d not in ("asc", "desc"):
        d = "desc"
    return ReturnsReportFilters(
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        date_from=_parse_dt(date_from),
        date_to=_parse_dt(date_to),
        date_field=df,  # type: ignore[arg-type]
        status_id=status_id,
        decision=decision,
        product_query=product_query,
        order_query=order_query,
        source=source,
        country=country,
        sort=s,  # type: ignore[arg-type]
        direction=d,  # type: ignore[arg-type]
        page=page,
        limit=limit,
    )


@router.get("")
def get_returns_report(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    date_field: str = Query("created"),
    status_id: Optional[int] = Query(None, ge=1),
    decision: Optional[str] = Query(None),
    product_query: Optional[str] = Query(None),
    order_query: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    sort: str = Query("date"),
    direction: str = Query("desc"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    filters = _filters_from_query(
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        date_from=date_from,
        date_to=date_to,
        date_field=date_field,
        status_id=status_id,
        decision=decision,
        product_query=product_query,
        order_query=order_query,
        source=source,
        country=country,
        sort=sort,
        direction=direction,
        page=page,
        limit=limit,
    )
    page_data = query_returns_report(db, filters)
    summary = summarize_returns_report(db, filters)
    return {**page_data, "summary": summary}


@router.get("/summary")
def get_returns_report_summary(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    date_field: str = Query("created"),
    status_id: Optional[int] = Query(None, ge=1),
    decision: Optional[str] = Query(None),
    product_query: Optional[str] = Query(None),
    order_query: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    filters = _filters_from_query(
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        date_from=date_from,
        date_to=date_to,
        date_field=date_field,
        status_id=status_id,
        decision=decision,
        product_query=product_query,
        order_query=order_query,
        source=source,
        country=country,
        sort="date",
        direction="desc",
        page=1,
        limit=50,
    )
    return summarize_returns_report(db, filters)


@router.get("/export")
def export_returns_report(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    date_field: str = Query("created"),
    status_id: Optional[int] = Query(None, ge=1),
    decision: Optional[str] = Query(None),
    product_query: Optional[str] = Query(None),
    order_query: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    sort: str = Query("date"),
    direction: str = Query("desc"),
    format: Literal["csv", "xlsx"] = Query("csv"),
    db: Session = Depends(get_db),
):
    filters = _filters_from_query(
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        date_from=date_from,
        date_to=date_to,
        date_field=date_field,
        status_id=status_id,
        decision=decision,
        product_query=product_query,
        order_query=order_query,
        source=source,
        country=country,
        sort=sort,
        direction=direction,
        page=1,
        limit=50,
    )
    stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    if format == "csv":
        data = build_returns_report_csv(db, filters)
        filename = f"raport_zwrotow_{stamp}.csv"
        return StreamingResponse(
            iter([data]),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    try:
        data = build_returns_report_xlsx(db, filters)
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="Eksport XLSX wymaga pakietu openpyxl.") from exc
    filename = f"raport_zwrotow_{stamp}.xlsx"
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
