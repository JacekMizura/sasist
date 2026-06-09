"""ERP inventory count management API."""

from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..auth.deps import get_optional_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..models.inventory_count.document import InventoryDocument
from ..schemas.inventory_count import (
    InventoryDashboardRead,
    InventoryDocumentCreateBody,
    InventoryDocumentRead,
    InventoryDocumentWizardUpdateBody,
    InventoryGenerateTasksBody,
    InventoryScopePreviewBody,
    InventoryScopePreviewRead,
    InventoryReportKindRead,
    InventoryReportsCatalogRead,
    InventoryConflictsRead,
    InventoryDifferenceAnalysisRead,
    InventoryUnknownProductMapBody,
    InventoryUnknownProductRead,
    InventoryUnknownProductRejectBody,
    InventoryPostingPreviewRead,
    InventoryLineRead,
    InventoryApprovalNotesBody,
    InventoryRecountCompleteBody,
)
from ..services.inventory_count.approval_service import (
    approve_inventory_document,
    evaluate_submit_readiness,
    reject_inventory_document,
    submit_for_approval,
)
from ..services.inventory_count.adjustment_service import post_inventory_adjustments
from ..services.inventory_count.audit_package_service import build_audit_package
from ..services.inventory_count.line_service import get_document_difference_analysis, list_document_lines
from ..services.inventory_count.recount_service import complete_recount, create_recounts_for_document
from ..services.inventory_count.scope_preview_service import preview_document_scope, preview_inventory_scope
from ..services.inventory_count.posting_preview_service import build_posting_preview
from ..services.inventory_count.unknown_product_service import (
    list_unknown_products,
    map_unknown_to_product,
    reject_unknown_product,
)
from ..api.inventory_count_deps import require_inventory_permission
from ..services.inventory_count.permissions import (
    PERM_APPROVE,
    PERM_AUDIT_PACKAGE,
    PERM_EXPORT,
    PERM_POST,
    PERM_RECOUNT,
    PERM_REJECT,
    PERM_SUBMIT,
    PERM_VIEW,
    PERM_DELETE,
)
from ..services.inventory_count.audit_log_service import get_document_timelines, list_document_audit_log
from ..services.inventory_count.job_service import ASYNC_EXPORT_LINE_THRESHOLD, enqueue_inventory_job, get_inventory_job
from ..services.inventory_count.report_service import REPORT_KINDS, generate_inventory_report
from ..models.inventory_count.constants import REPORT_FORMAT_PDF, REPORT_FORMAT_XLSX
from ..services.inventory_count.observability import inventory_metrics_snapshot
from ..services.inventory_count import (
    InventoryCountError,
    build_inventory_dashboard,
    create_inventory_document,
    delete_draft_inventory_document,
    generate_inventory_tasks,
    get_inventory_document,
    list_inventory_documents,
    plan_inventory_document,
    start_inventory_document,
    update_inventory_document_wizard,
)

router = APIRouter(prefix="/inventory-count", tags=["Inventory Count"])
logger = logging.getLogger(__name__)


def _inventory_error_payload(exc: InventoryCountError) -> dict:
    payload: dict = {"code": exc.code, "message": str(exc)}
    if exc.details:
        payload["details"] = exc.details
    return payload


def _map_inventory_error(exc: InventoryCountError) -> HTTPException:
    if "not_found" in exc.code:
        status = 404
    elif exc.code in ("concurrent_update", "posting_in_progress", "pending_recounts"):
        status = 409
    elif exc.code == "line_locked":
        status = 423
    elif exc.code == "duplicate_post":
        status = 409
    elif exc.code == "permission_denied":
        status = 403
    elif exc.code in ("scope_not_configured", "scope_not_materialized", "inventory_start_failed"):
        status = 400
    elif exc.code == "posting_failed":
        status = 422
    elif exc.code == "location_inventory_locked":
        status = 423
    else:
        status = 400

    if status in (400, 409, 422):
        logger.warning(
            "inventory_api_rejected code=%s status=%s message=%s details=%s",
            exc.code,
            status,
            str(exc),
            exc.details or {},
        )

    return HTTPException(status_code=status, detail=_inventory_error_payload(exc))


@router.get("/dashboard", response_model=InventoryDashboardRead)
def inventory_count_dashboard(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(require_inventory_permission(PERM_VIEW)),
):
    try:
        return build_inventory_dashboard(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            user_id=user.id,
        )
    except Exception as exc:
        logger.exception(
            "INVENTORY_DASHBOARD_FATAL tenant_id=%s warehouse_id=%s",
            tenant_id,
            warehouse_id,
        )
        import traceback as tb

        return {
            "kpis": {
                "active_inventories": 0,
                "awaiting_approval": 0,
                "open_differences": 0,
                "completed_last_7_days": 0,
                "warehouse_coverage_percent": 0,
                "active_operator_sessions": 0,
            },
            "active_inventories": [],
            "awaiting_approval": [],
            "recent_completed": [],
            "difference_stats": {},
            "heatmap_preview": [],
            "operator_activity": [],
            "dashboard_status": "failed",
            "failed_sections": ["fatal"],
            "section_errors": [
                {
                    "section": "fatal",
                    "error_type": type(exc).__name__,
                    "message": str(exc),
                    "traceback": tb.format_exc(),
                }
            ],
            "schema_audit": None,
        }


@router.get("/documents", response_model=List[InventoryDocumentRead])
def inventory_count_list_documents(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    return list_inventory_documents(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status=status,
        limit=limit,
    )


@router.get("/documents/{document_id}", response_model=InventoryDocumentRead)
def inventory_count_get_document(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        payload = get_inventory_document(db, tenant_id=tenant_id, document_id=document_id)
        doc = (
            db.query(InventoryDocument)
            .filter(
                InventoryDocument.id == int(document_id),
                InventoryDocument.tenant_id == int(tenant_id),
            )
            .first()
        )
        if doc is not None:
            payload["submit_readiness"] = evaluate_submit_readiness(db, doc)
        return payload
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc


@router.delete("/documents/{document_id}")
def inventory_count_delete_document(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(require_inventory_permission(PERM_DELETE)),
):
    try:
        delete_draft_inventory_document(
            db,
            tenant_id=tenant_id,
            document_id=document_id,
            user_id=user.id,
        )
        return {"ok": True, "document_id": document_id}
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc


@router.post("/documents", response_model=InventoryDocumentRead)
def inventory_count_create_document(
    body: InventoryDocumentCreateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser | None = Depends(get_optional_current_user),
):
    return create_inventory_document(
        db,
        tenant_id=tenant_id,
        warehouse_id=body.warehouse_id,
        inventory_type=body.inventory_type,
        user_id=user.id if user else None,
        notes=body.notes,
    )


@router.patch("/documents/{document_id}/wizard", response_model=InventoryDocumentRead)
def inventory_count_wizard_update(
    document_id: int,
    body: InventoryDocumentWizardUpdateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser | None = Depends(get_optional_current_user),
):
    try:
        return update_inventory_document_wizard(
            db,
            tenant_id=tenant_id,
            document_id=document_id,
            user_id=user.id if user else None,
            inventory_type=body.inventory_type,
            title=body.title,
            filters=body.filters.model_dump() if body.filters else None,
            count_mode=body.count_mode,
            lock_mode=body.lock_mode,
            recount_required=body.recount_required,
            scan_mode=body.scan_mode,
            strategy=body.strategy.model_dump() if body.strategy else None,
            notes=body.notes,
            planned_start_at=body.planned_start_at,
            planned_end_at=body.planned_end_at,
        )
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc


@router.post("/scope-preview", response_model=InventoryScopePreviewRead)
def inventory_count_scope_preview(
    body: InventoryScopePreviewBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    return preview_inventory_scope(
        db,
        tenant_id=tenant_id,
        warehouse_id=body.warehouse_id,
        filters=body.filters.model_dump(),
    )


@router.get("/documents/{document_id}/scope-preview", response_model=InventoryScopePreviewRead)
def inventory_count_document_scope_preview(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(document_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return preview_document_scope(db, document=doc)


@router.post("/documents/{document_id}/plan", response_model=InventoryDocumentRead)
def inventory_count_plan_document(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser | None = Depends(get_optional_current_user),
):
    try:
        return plan_inventory_document(
            db,
            tenant_id=tenant_id,
            document_id=document_id,
            user_id=user.id if user else None,
        )
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc


@router.post("/documents/{document_id}/start", response_model=InventoryDocumentRead)
def inventory_count_start_document(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser | None = Depends(get_optional_current_user),
):
    try:
        return start_inventory_document(
            db,
            tenant_id=tenant_id,
            document_id=document_id,
            user_id=user.id if user else None,
        )
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc
    except Exception as exc:
        logger.exception(
            "inventory_start_unhandled document_id=%s tenant_id=%s",
            document_id,
            tenant_id,
        )
        raise HTTPException(
            status_code=500,
            detail={
                "code": "inventory_start_failed",
                "message": str(exc) or "Start inwentaryzacji nie powiódł się.",
                "details": {
                    "document_id": document_id,
                    "error_type": type(exc).__name__,
                },
            },
        ) from exc


@router.post("/documents/{document_id}/generate-tasks")
def inventory_count_generate_tasks(
    document_id: int,
    body: InventoryGenerateTasksBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser | None = Depends(get_optional_current_user),
):
    try:
        return generate_inventory_tasks(
            db,
            tenant_id=tenant_id,
            document_id=document_id,
            user_id=user.id if user else None,
            location_ids=body.location_ids,
        )
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc


@router.get("/reports/catalog", response_model=InventoryReportsCatalogRead)
def inventory_count_reports_catalog():
    reports = [
        InventoryReportKindRead(
            kind=kind,
            label=label,
            formats=["pdf", "xlsx"],
            status="ready",
        )
        for kind, label in REPORT_KINDS.items()
    ]
    return InventoryReportsCatalogRead(reports=reports)


@router.get("/documents/{document_id}/lines")
def inventory_count_document_lines(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    supervisor: bool = Query(True),
    focus: str = Query("operational", pattern="^(operational|all|differences|uncounted)$"),
    offset: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=2000),
    db: Session = Depends(get_db),
    _: AppUser = Depends(require_inventory_permission(PERM_VIEW)),
):
    try:
        return list_document_lines(
            db,
            tenant_id=tenant_id,
            document_id=document_id,
            include_supervisor_fields=supervisor,
            focus=focus,
            offset=offset,
            limit=limit,
        )
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc


@router.get("/documents/{document_id}/differences", response_model=InventoryDifferenceAnalysisRead)
def inventory_count_differences(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return get_document_difference_analysis(db, tenant_id=tenant_id, document_id=document_id)
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc


@router.get("/documents/{document_id}/posting-preview", response_model=InventoryPostingPreviewRead)
def inventory_count_posting_preview(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(require_inventory_permission(PERM_VIEW)),
):
    try:
        return build_posting_preview(db, tenant_id=tenant_id, document_id=document_id)
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc


@router.get("/documents/{document_id}/conflicts", response_model=InventoryConflictsRead)
def inventory_count_conflicts(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(require_inventory_permission(PERM_VIEW)),
):
    try:
        return list_document_conflicts(db, tenant_id=tenant_id, document_id=document_id)
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc


@router.get("/documents/{document_id}/unknown-products", response_model=list[InventoryUnknownProductRead])
def inventory_count_unknown_products(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    status: str = Query("draft"),
    db: Session = Depends(get_db),
    _: AppUser = Depends(require_inventory_permission(PERM_VIEW)),
):
    return list_unknown_products(db, tenant_id=tenant_id, document_id=document_id, status=status or None)


@router.post("/unknown-products/{unknown_id}/map", response_model=InventoryUnknownProductRead)
def inventory_count_map_unknown(
    unknown_id: int,
    body: InventoryUnknownProductMapBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser | None = Depends(get_optional_current_user),
):
    try:
        return map_unknown_to_product(
            db,
            tenant_id=tenant_id,
            unknown_id=unknown_id,
            product_id=body.product_id,
            user_id=user.id if user else None,
        )
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc


@router.post("/unknown-products/{unknown_id}/reject", response_model=InventoryUnknownProductRead)
def inventory_count_reject_unknown(
    unknown_id: int,
    body: InventoryUnknownProductRejectBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser | None = Depends(get_optional_current_user),
):
    try:
        return reject_unknown_product(
            db,
            tenant_id=tenant_id,
            unknown_id=unknown_id,
            user_id=user.id if user else None,
            reason=body.reason,
        )
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc


@router.post("/documents/{document_id}/submit-approval")
def inventory_count_submit_approval(
    document_id: int,
    body: InventoryApprovalNotesBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(require_inventory_permission(PERM_SUBMIT)),
):
    try:
        return submit_for_approval(
            db,
            tenant_id=tenant_id,
            document_id=document_id,
            user_id=user.id if user else None,
            notes=body.notes,
        )
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc


@router.post("/documents/{document_id}/approve")
def inventory_count_approve(
    document_id: int,
    body: InventoryApprovalNotesBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(require_inventory_permission(PERM_APPROVE)),
):
    try:
        return approve_inventory_document(
            db,
            tenant_id=tenant_id,
            document_id=document_id,
            user_id=user.id if user else None,
            notes=body.notes,
        )
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc


@router.post("/documents/{document_id}/reject")
def inventory_count_reject(
    document_id: int,
    body: InventoryApprovalNotesBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(require_inventory_permission(PERM_REJECT)),
):
    try:
        return reject_inventory_document(
            db,
            tenant_id=tenant_id,
            document_id=document_id,
            user_id=user.id if user else None,
            notes=body.notes,
        )
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc


@router.post("/documents/{document_id}/post")
def inventory_count_post(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    idempotency_key: Optional[str] = Query(None, max_length=128),
    expected_version: Optional[int] = Query(None, ge=0),
    db: Session = Depends(get_db),
    user: AppUser = Depends(require_inventory_permission(PERM_POST)),
):
    import traceback as tb

    try:
        return post_inventory_adjustments(
            db,
            tenant_id=tenant_id,
            document_id=document_id,
            user_id=user.id,
            idempotency_key=idempotency_key,
            expected_version=expected_version,
        )
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc
    except Exception as exc:
        logger.exception(
            "inventory_post_fatal document_id=%s tenant_id=%s error=%s",
            document_id,
            tenant_id,
            exc,
        )
        raise HTTPException(
            status_code=500,
            detail={
                "code": "internal_posting_error",
                "message": str(exc),
                "error_type": type(exc).__name__,
                "document_id": document_id,
                "traceback": tb.format_exc(),
            },
        ) from exc


@router.post("/documents/{document_id}/recounts/generate")
def inventory_count_generate_recounts(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser | None = Depends(get_optional_current_user),
):
    try:
        return create_recounts_for_document(
            db,
            tenant_id=tenant_id,
            document_id=document_id,
            user_id=user.id if user else None,
        )
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc


@router.post("/recounts/{recount_id}/complete")
def inventory_count_complete_recount(
    recount_id: int,
    body: InventoryRecountCompleteBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser | None = Depends(get_optional_current_user),
):
    try:
        return complete_recount(
            db,
            tenant_id=tenant_id,
            recount_id=recount_id,
            counted_quantity=body.counted_quantity,
            user_id=user.id if user else None,
        )
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc


@router.get("/documents/{document_id}/reports/{report_kind}")
def inventory_count_download_report(
    document_id: int,
    report_kind: str,
    tenant_id: int = Query(..., ge=1),
    format: str = Query("xlsx", pattern="^(pdf|xlsx)$"),
    db: Session = Depends(get_db),
    user: AppUser = Depends(require_inventory_permission(PERM_EXPORT)),
):
    fmt = REPORT_FORMAT_PDF if format.lower() == "pdf" else REPORT_FORMAT_XLSX
    try:
        result = generate_inventory_report(
            db,
            tenant_id=tenant_id,
            document_id=document_id,
            report_kind=report_kind,
            report_format=fmt,
            user_id=user.id,
        )
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return Response(
        content=result["content"],
        media_type=result["media_type"],
        headers={"Content-Disposition": f'attachment; filename="{result["file_name"]}"'},
    )


@router.get("/documents/{document_id}/audit-package")
def inventory_count_audit_package(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(require_inventory_permission(PERM_AUDIT_PACKAGE)),
):
    try:
        result = build_audit_package(
            db,
            tenant_id=tenant_id,
            document_id=document_id,
            user_id=user.id,
        )
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc
    return Response(
        content=result["content"],
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{result["file_name"]}"'},
    )


@router.get("/metrics")
def inventory_count_metrics(
    _: AppUser = Depends(require_inventory_permission(PERM_VIEW)),
):
    return inventory_metrics_snapshot()


@router.get("/documents/{document_id}/audit-log")
def inventory_count_audit_log(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    offset: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
    _: AppUser = Depends(require_inventory_permission(PERM_VIEW)),
):
    try:
        return list_document_audit_log(
            db, tenant_id=tenant_id, document_id=document_id, offset=offset, limit=limit
        )
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc


@router.get("/documents/{document_id}/timelines")
def inventory_count_timelines(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(require_inventory_permission(PERM_VIEW)),
):
    try:
        return get_document_timelines(db, tenant_id=tenant_id, document_id=document_id)
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc


@router.post("/documents/{document_id}/jobs")
def inventory_count_enqueue_job(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    job_kind: str = Query("report"),
    report_kind: str = Query("differences"),
    format: str = Query("xlsx"),
    idempotency_key: Optional[str] = Query(None, max_length=128),
    db: Session = Depends(get_db),
    user: AppUser = Depends(require_inventory_permission(PERM_EXPORT)),
):
    job = enqueue_inventory_job(
        db,
        tenant_id=tenant_id,
        document_id=document_id,
        job_kind=job_kind,
        payload={"report_kind": report_kind, "format": format, "document_id": document_id},
        user_id=user.id,
        idempotency_key=idempotency_key,
    )
    return {"job_id": job.id, "status": job.status}


@router.get("/jobs/{job_id}")
def inventory_count_job_status(
    job_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(require_inventory_permission(PERM_EXPORT)),
):
    try:
        return get_inventory_job(db, tenant_id=tenant_id, job_id=job_id)
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc
