"""Document Templates API — isolated from Label Engine."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..auth.deps import get_current_user
from ..document_templates.errors import (
    DocumentKindNotFoundError,
    DocumentRenderError,
    DocumentTemplateError,
    DocumentTemplateNotFoundError,
)
from ..document_templates.render.output_formats import DocumentOutputFormat
from ..document_templates.services.document_render_service import preview_document
from ..document_templates.services.template_service import (
    create_template_from_starter,
    get_template_detail,
    get_variable_tree,
    list_families_with_kinds,
    list_starters,
    list_templates,
    publish_version,
    save_draft_version,
    upsert_binding,
)
from ..document_templates.services.dependency_graph_service import DependencyGraphService
from ..document_templates.services.change_impact_service import ChangeImpactAnalysisService
from ..document_templates.services.publication_validation_service import validate_publication
from ..document_templates.services.template_editor_service import (
    compare_versions,
    get_editor_catalog,
    get_editor_context,
    get_version_content,
    list_layout_templates,
    list_published_versions,
    list_templates_enriched,
)
from ..document_templates.services.starter_gallery_service import (
    get_starter_gallery_detail,
    get_starter_thumbnail_bytes,
    list_starter_gallery_enriched,
)
from ..document_templates.services.published_template_options_service import list_published_template_options
from ..document_templates.services.document_migration_service import migrate_tenant_document_bindings
from ..document_templates.services.starter_service import clone_starter, export_starter, import_starter
from ..document_templates.services.context_schema_registry import fields_for_schema_key
from ..models.app_user import AppUser
from ..schemas.document_template_schemas import (
    DocumentTemplateBindingPayload,
    DocumentTemplateCreateFromStarter,
    DocumentTemplatePreviewPayload,
    DocumentTemplatePublish,
    DocumentTemplateSaveDraft,
    DocumentTemplateStarterClonePayload,
    DocumentTemplateStarterImportPayload,
    DocumentTemplateLiveValidatePayload,
    DocumentTemplateUsageSearchPayload,
    DocumentTemplateImportPayload,
    DocumentTemplateScopeAssignmentPayload,
    DocumentTemplateVersionReplacePayload,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/document-templates", tags=["Document Templates"])
logger = logging.getLogger(__name__)


def _log_starter_thumbnail_failure(*, starter_id: int, tenant_id: int, exc: BaseException) -> None:
    logger.error(
        "api_starter_thumbnail failed starter_id=%s tenant_id=%s exc_type=%s message=%s",
        starter_id,
        tenant_id,
        type(exc).__name__,
        exc,
        exc_info=exc,
    )


def _map_error(exc: DocumentTemplateError) -> HTTPException:
    code = getattr(exc, "code", "error")
    status = 404 if code in {"not_found", "kind_not_found", "starter_not_found"} else 400
    if code == "publication_blocked":
        status = 422
        validation = getattr(exc, "validation", None)
        if validation:
            return HTTPException(
                status_code=status,
                detail={
                    "message": str(exc),
                    "code": code,
                    "validation": validation,
                },
            )
    if code in {"pdf_engine_missing", "pdf_render_failed"}:
        status = 503
    return HTTPException(status_code=status, detail=str(exc))


@router.get("/catalog")
def api_document_template_catalog(
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    return {"families": list_families_with_kinds(db)}


@router.get("/templates/list")
def api_list_document_templates_enriched(
    tenant_id: int = Query(..., ge=1),
    family_code: str | None = Query(default=None),
    kind_code: str | None = Query(default=None),
    variant_code: str | None = Query(default=None),
    status: str | None = Query(default=None),
    source: str | None = Query(default=None),
    template_role: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    return {
        "items": list_templates_enriched(
            db,
            tenant_id=tenant_id,
            family_code=family_code,
            kind_code=kind_code,
            variant_code=variant_code,
            status=status,
            source=source,
            template_role=template_role,
        )
    }


@router.get("/templates/{template_id}/editor")
def api_document_template_editor_context(
    template_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    try:
        return get_editor_context(db, tenant_id=tenant_id, template_id=template_id)
    except DocumentTemplateNotFoundError as exc:
        raise _map_error(exc) from exc


@router.get("/layout-templates")
def api_layout_templates(
    tenant_id: int = Query(..., ge=1),
    role: str = Query(..., pattern="^(BASE|PARTIAL)$"),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    return {"items": list_layout_templates(db, tenant_id=tenant_id, role=role)}


@router.get("/layout-templates/{template_id}/versions")
def api_layout_template_versions(
    template_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    try:
        return {"items": list_published_versions(db, tenant_id=tenant_id, template_id=template_id)}
    except DocumentTemplateNotFoundError as exc:
        raise _map_error(exc) from exc


@router.get("/editor-catalog")
def api_editor_catalog(
    user: AppUser = Depends(get_current_user),
):
    _ = user
    return get_editor_catalog()


@router.post("/migrate-default-bindings")
def api_migrate_default_bindings(
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    return {"results": migrate_tenant_document_bindings(db, tenant_id=tenant_id)}


@router.get("/templates")
def api_list_document_templates(
    tenant_id: int = Query(..., ge=1),
    kind_code: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    return {"items": list_templates(db, tenant_id=tenant_id, kind_code=kind_code)}


@router.get("/templates/{template_id}")
def api_get_document_template(
    template_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    try:
        return get_template_detail(db, tenant_id=tenant_id, template_id=template_id)
    except DocumentTemplateNotFoundError as exc:
        raise _map_error(exc) from exc


@router.post("/templates/from-starter")
def api_create_document_template_from_starter(
    payload: DocumentTemplateCreateFromStarter,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    try:
        return create_template_from_starter(
            db,
            tenant_id=tenant_id,
            kind_code=payload.kind_code,
            name=payload.name,
            starter_code=payload.starter_code,
            variant_code=payload.variant_code,
            user_id=int(user.id),
        )
    except DocumentTemplateError as exc:
        raise _map_error(exc) from exc


@router.put("/templates/{template_id}/draft")
def api_save_document_template_draft(
    template_id: int,
    payload: DocumentTemplateSaveDraft,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    try:
        return save_draft_version(
            db,
            tenant_id=tenant_id,
            template_id=template_id,
            twig_content=payload.twig_content,
            change_summary=payload.change_summary,
            extends_version_id=payload.extends_version_id,
            partial_pins_json=payload.partial_pins_json,
            user_id=int(user.id),
        )
    except DocumentTemplateNotFoundError as exc:
        raise _map_error(exc) from exc


@router.post("/templates/{template_id}/publish")
def api_publish_document_template(
    template_id: int,
    payload: DocumentTemplatePublish,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    try:
        return publish_version(
            db,
            tenant_id=tenant_id,
            template_id=template_id,
            version_id=payload.version_id,
            user_id=int(user.id),
            skip_validation=payload.skip_validation,
            change_summary=payload.change_summary,
        )
    except DocumentTemplateError as exc:
        raise _map_error(exc) from exc


@router.get("/starters")
def api_list_document_starters(
    kind_code: str = Query(...),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    try:
        return {"items": list_starters(db, kind_code=kind_code)}
    except DocumentKindNotFoundError as exc:
        raise _map_error(exc) from exc


@router.get("/starters/{starter_id}/export")
def api_export_document_starter(
    starter_id: int,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    try:
        return export_starter(db, starter_id=starter_id)
    except DocumentTemplateError as exc:
        raise _map_error(exc) from exc


@router.post("/starters/import")
def api_import_document_starter(
    payload: DocumentTemplateStarterImportPayload,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    try:
        return import_starter(
            db,
            kind_code=payload.kind_code,
            payload=payload.payload,
            code=payload.code,
        )
    except DocumentTemplateError as exc:
        raise _map_error(exc) from exc


@router.post("/starters/{starter_id}/clone")
def api_clone_document_starter(
    starter_id: int,
    payload: DocumentTemplateStarterClonePayload,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    try:
        return clone_starter(
            db,
            starter_id=starter_id,
            new_code=payload.new_code,
            name_pl=payload.name_pl,
        )
    except DocumentTemplateError as exc:
        raise _map_error(exc) from exc


@router.get("/schema-fields")
def api_document_schema_fields(
    kind_code: str = Query(...),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    try:
        from ..document_templates.services.template_service import get_kind_by_code

        kind = get_kind_by_code(db, kind_code=kind_code)
        return {"fields": fields_for_schema_key(str(kind.schema_key))}
    except DocumentKindNotFoundError as exc:
        raise _map_error(exc) from exc


@router.get("/variable-tree")
def api_document_variable_tree(
    kind_code: str = Query(...),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    try:
        return {"tree": get_variable_tree(db, kind_code=kind_code)}
    except DocumentKindNotFoundError as exc:
        raise _map_error(exc) from exc


@router.post("/bindings")
def api_upsert_document_binding(
    payload: DocumentTemplateBindingPayload,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    try:
        return upsert_binding(
            db,
            tenant_id=tenant_id,
            kind_code=payload.kind_code,
            template_id=payload.template_id,
            version_id=payload.version_id,
            warehouse_id=payload.warehouse_id,
            variant_code=payload.variant_code,
            priority=payload.priority,
        )
    except DocumentTemplateError as exc:
        raise _map_error(exc) from exc


@router.post("/preview/html")
def api_preview_document_html(
    payload: DocumentTemplatePreviewPayload,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    try:
        html = preview_document(
            db,
            tenant_id=tenant_id,
            kind_code=payload.kind_code,
            template=payload.twig_content,
            params=payload.params,
            output_format=DocumentOutputFormat.HTML,
            warehouse_id=payload.warehouse_id,
            version_id=payload.version_id,
            context_mode=payload.context_mode,
            extends_version_id=payload.extends_version_id,
            partial_pins_json=payload.partial_pins_json,
        )
        return Response(content=str(html), media_type="text/html; charset=utf-8")
    except (DocumentRenderError, DocumentTemplateError) as exc:
        raise _map_error(exc) from exc


@router.post("/preview/pdf")
def api_preview_document_pdf(
    payload: DocumentTemplatePreviewPayload,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    try:
        pdf = preview_document(
            db,
            tenant_id=tenant_id,
            kind_code=payload.kind_code,
            template=payload.twig_content,
            params=payload.params,
            output_format=DocumentOutputFormat.PDF,
            warehouse_id=payload.warehouse_id,
            version_id=payload.version_id,
            context_mode=payload.context_mode,
            extends_version_id=payload.extends_version_id,
            partial_pins_json=payload.partial_pins_json,
        )
        return Response(content=bytes(pdf), media_type="application/pdf")
    except (DocumentRenderError, DocumentTemplateError) as exc:
        raise _map_error(exc) from exc


@router.get("/versions/{version_id}/dependencies")
def api_version_dependencies(
    version_id: int,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    try:
        graph = DependencyGraphService(db)
        return graph.build_dependency_graph(int(version_id))
    except DocumentTemplateError as exc:
        raise _map_error(exc) from exc


@router.get("/versions/{version_id}/impact")
def api_version_impact(
    version_id: int,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    try:
        service = ChangeImpactAnalysisService(db)
        from ..document_templates.models import DocumentTemplate, DocumentTemplateVersion

        version = db.query(DocumentTemplateVersion).filter(DocumentTemplateVersion.id == int(version_id)).first()
        if version is None:
            raise DocumentTemplateError("Wersja nie istnieje.", code="not_found")
        template = db.query(DocumentTemplate).filter(DocumentTemplate.id == int(version.template_id)).first()
        role = str(template.template_role if template else "DOCUMENT")
        if role == "PARTIAL":
            return service.analyze_partial_publish(int(version_id))
        if role == "BASE":
            return service.analyze_base_publish(int(version_id))
        return DependencyGraphService(db).impact_of_version_change(int(version_id))
    except DocumentTemplateError as exc:
        raise _map_error(exc) from exc


@router.get("/templates/{template_id}/can-delete")
def api_template_can_delete(
    template_id: int,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    try:
        service = ChangeImpactAnalysisService(db)
        return service.analyze_delete_template(int(template_id))
    except DocumentTemplateError as exc:
        raise _map_error(exc) from exc


@router.post("/versions/{version_id}/validate")
def api_validate_version(
    version_id: int,
    kind_code: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    from ..document_templates.services.publication_validation_service import (
        kind_code_for_version,
        validate_publication,
    )

    resolved_kind = kind_code or kind_code_for_version(db, int(version_id))
    report = validate_publication(
        db,
        version_id=int(version_id),
        kind_code=resolved_kind,
        run_render=bool(resolved_kind),
    )
    return report.to_dict()


@router.post("/validate/live")
def api_live_validate(
    payload: DocumentTemplateLiveValidatePayload,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    from ..document_templates.services.live_validation_service import live_validation_report
    from ..document_templates.services.variable_schema_service import build_variable_schema

    schema = build_variable_schema(db, tenant_id=tenant_id, kind_code=payload.kind_code)
    return live_validation_report(payload.twig_content, known_fields=schema.get("fields") or [])


@router.get("/versions/compare")
def api_compare_versions(
    left_version_id: int = Query(..., ge=1),
    right_version_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    try:
        return compare_versions(db, left_version_id=left_version_id, right_version_id=right_version_id)
    except DocumentTemplateError as exc:
        raise _map_error(exc) from exc


@router.get("/versions/{version_id}/content")
def api_version_content(
    version_id: int,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    try:
        return get_version_content(db, version_id=version_id)
    except DocumentTemplateError as exc:
        raise _map_error(exc) from exc


@router.post("/usage/search")
def api_usage_search(
    payload: DocumentTemplateUsageSearchPayload,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    from ..document_templates.services.template_usage_service import search_symbol_usage

    return {
        "items": search_symbol_usage(
            db,
            tenant_id=tenant_id,
            symbol=payload.symbol,
            symbol_type=payload.symbol_type,
        )
    }


@router.get("/starters/gallery")
def api_starter_gallery(
    tenant_id: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    return list_starter_gallery_enriched(db, tenant_id=int(tenant_id))


@router.get("/starters/{starter_id}")
def api_starter_gallery_detail(
    starter_id: int,
    tenant_id: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    try:
        return get_starter_gallery_detail(db, starter_id=int(starter_id), tenant_id=int(tenant_id))
    except DocumentTemplateError as exc:
        raise _map_error(exc) from exc


@router.get("/starters/{starter_id}/thumbnail")
def api_starter_thumbnail(
    starter_id: int,
    tenant_id: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    try:
        png, cached = get_starter_thumbnail_bytes(db, starter_id=int(starter_id), tenant_id=int(tenant_id))
        return Response(
            content=png,
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=86400", "X-Starter-Thumbnail-Cached": "1" if cached else "0"},
        )
    except DocumentTemplateError as exc:
        raise _map_error(exc) from exc
    except (FileNotFoundError, RuntimeError, ValueError) as exc:
        _log_starter_thumbnail_failure(starter_id=starter_id, tenant_id=tenant_id, exc=exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        _log_starter_thumbnail_failure(starter_id=starter_id, tenant_id=tenant_id, exc=exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/versions/{version_id}/thumbnail")
def api_published_version_thumbnail(
    version_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    from ..document_templates.services.published_template_options_service import get_published_version_thumbnail_bytes

    try:
        png, cached = get_published_version_thumbnail_bytes(
            db,
            tenant_id=int(tenant_id),
            version_id=int(version_id),
        )
        return Response(
            content=png,
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=86400", "X-Template-Thumbnail-Cached": "1" if cached else "0"},
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (FileNotFoundError, RuntimeError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/published-options")
def api_published_template_options(
    tenant_id: int = Query(..., ge=1),
    kind_code: str | None = None,
    variant_code: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    return {
        "items": list_published_template_options(
            db,
            tenant_id=int(tenant_id),
            kind_code=kind_code,
            variant_code=variant_code,
            search=search,
        )
    }


@router.get("/templates/{template_id}/export")
def api_export_template(
    template_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    from ..document_templates.services.template_package_service import export_template_zip

    try:
        data = export_template_zip(db, tenant_id=tenant_id, template_id=template_id)
        return Response(
            content=data,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="szablon-{template_id}.zip"'},
        )
    except DocumentTemplateError as exc:
        raise _map_error(exc) from exc


@router.get("/export/family/{family_code}")
def api_export_family(
    family_code: str,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    from ..document_templates.services.template_package_service import export_family_zip

    try:
        data = export_family_zip(db, tenant_id=tenant_id, family_code=family_code)
        return Response(
            content=data,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="rodzina-{family_code}.zip"'},
        )
    except DocumentTemplateError as exc:
        raise _map_error(exc) from exc


@router.get("/export/package")
def api_export_package(
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    from ..document_templates.services.template_package_service import export_full_package_zip

    data = export_full_package_zip(db, tenant_id=tenant_id)
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="szablony-pelny-pakiet.zip"'},
    )


@router.post("/import/analyze")
def api_import_analyze(
    payload: DocumentTemplateImportPayload,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    from ..document_templates.services.template_package_service import analyze_import_conflicts

    return {
        "conflicts": analyze_import_conflicts(
            db,
            tenant_id=tenant_id,
            manifest=payload.manifest,
            templates=payload.templates,
        )
    }


@router.post("/import/apply")
def api_import_apply(
    payload: DocumentTemplateImportPayload,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    from ..document_templates.services.template_package_service import apply_import

    try:
        return apply_import(
            db,
            tenant_id=tenant_id,
            templates=payload.templates,
            resolutions=payload.resolutions,
        )
    except DocumentTemplateError as exc:
        raise _map_error(exc) from exc


@router.get("/scope-assignments")
def api_list_scope_assignments(
    tenant_id: int = Query(..., ge=1),
    scope_type: str = Query(...),
    scope_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    from ..document_templates.services.scope_assignment_service import list_scope_assignments

    return {"items": list_scope_assignments(db, tenant_id=tenant_id, scope_type=scope_type, scope_id=scope_id)}


@router.put("/scope-assignments")
def api_upsert_scope_assignment(
    payload: DocumentTemplateScopeAssignmentPayload,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    from ..document_templates.services.scope_assignment_service import upsert_scope_assignment

    try:
        item = upsert_scope_assignment(
            db,
            tenant_id=tenant_id,
            kind_code=payload.kind_code,
            scope_type=payload.scope_type,
            scope_id=payload.scope_id,
            version_id=payload.version_id,
            variant_code=payload.variant_code,
        )
        return {"item": item}
    except DocumentTemplateError as exc:
        raise _map_error(exc) from exc


@router.get("/templates/{template_id}/usage")
def api_template_usage(
    template_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    from ..document_templates.services.template_assignment_usage_service import usage_summary_for_template

    return usage_summary_for_template(db, tenant_id=tenant_id, template_id=template_id)


@router.get("/templates/{template_id}/assignments")
def api_template_assignments(
    template_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    from ..document_templates.services.template_assignment_usage_service import list_assignments_for_template

    return {"items": list_assignments_for_template(db, tenant_id=tenant_id, template_id=template_id)}


@router.get("/versions/{version_id}/assignments")
def api_version_assignments(
    version_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    from ..document_templates.services.template_assignment_usage_service import list_assignments_for_version

    return {"items": list_assignments_for_version(db, tenant_id=tenant_id, version_id=version_id)}


@router.get("/versions/{version_id}/replace-impact")
def api_version_replace_impact(
    version_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    from ..document_templates.services.template_assignment_usage_service import preview_version_replacement_impact

    return preview_version_replacement_impact(db, tenant_id=tenant_id, from_version_id=version_id)


@router.post("/versions/{version_id}/replace-assignments")
def api_version_replace_assignments(
    version_id: int,
    payload: DocumentTemplateVersionReplacePayload,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    if not payload.confirm:
        raise HTTPException(status_code=400, detail="Wymagane potwierdzenie (confirm=true).")
    from ..document_templates.services.template_assignment_usage_service import replace_version_assignments

    try:
        return replace_version_assignments(
            db,
            tenant_id=tenant_id,
            from_version_id=version_id,
            to_version_id=payload.to_version_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
