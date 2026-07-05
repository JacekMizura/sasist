"""Business assignment usage — where templates are used across ERP scopes."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy.orm import Session

from ..constants import SCOPE_TYPE_LABELS, SCOPE_TYPE_SERIES
from ..models import (
    DocumentTemplate,
    DocumentTemplateBinding,
    DocumentTemplateKind,
    DocumentTemplateScopeAssignment,
    DocumentTemplateVersion,
)
from ...models.document_series import DocumentSeries
from ...models.warehouse import Warehouse


def _erp_link(scope_type: str, scope_id: int | str, *, kind_code: str | None = None) -> str | None:
    st = str(scope_type)
    sid = scope_id
    if st == "SERIES":
        return f"/documents/series/{sid}"
    if st == "WAREHOUSE":
        return "/settings/wms"
    if st == "COMPANY":
        return "/settings/company"
    if st == "PRODUCT":
        return f"/products/{sid}"
    if st == "CUSTOMER":
        return f"/customers/{sid}"
    if st == "SUPPLIER":
        return "/assortment/suppliers"
    if st == "PRODUCTION":
        return "/settings/wms"
    if st == "RETURNS":
        return "/orders/returns/configurator"
    if st == "COMPLAINTS":
        return "/settings/complaints/ui-statuses"
    if st == "MODULE" and kind_code:
        return "/settings/document-templates"
    return None


def list_assignments_for_template(
    db: Session,
    *,
    tenant_id: int,
    template_id: int,
) -> list[dict[str, Any]]:
    version_ids = [
        int(v.id)
        for v in db.query(DocumentTemplateVersion)
        .filter(DocumentTemplateVersion.template_id == int(template_id))
        .all()
    ]
    if not version_ids:
        return []
    return _collect_assignments(db, tenant_id=tenant_id, version_ids=version_ids)


def list_assignments_for_version(
    db: Session,
    *,
    tenant_id: int,
    version_id: int,
) -> list[dict[str, Any]]:
    return _collect_assignments(db, tenant_id=tenant_id, version_ids=[int(version_id)])


def usage_summary_for_template(
    db: Session,
    *,
    tenant_id: int,
    template_id: int,
) -> dict[str, Any]:
    items = list_assignments_for_template(db, tenant_id=tenant_id, template_id=template_id)
    badges = _badges_from_items(items)
    return {"badges": badges, "total": len(items), "items": items}


def usage_summary_for_templates_batch(
    db: Session,
    *,
    tenant_id: int,
    template_ids: list[int],
) -> dict[int, dict[str, Any]]:
    out: dict[int, dict[str, Any]] = {}
    for tid in template_ids:
        out[int(tid)] = usage_summary_for_template(db, tenant_id=tenant_id, template_id=int(tid))
    return out


def preview_version_replacement_impact(
    db: Session,
    *,
    tenant_id: int,
    from_version_id: int,
) -> dict[str, Any]:
    items = list_assignments_for_version(db, tenant_id=tenant_id, version_id=int(from_version_id))
    by_scope: dict[str, int] = defaultdict(int)
    for item in items:
        by_scope[str(item.get("scope_type_label") or item.get("scope_type"))] += 1
    return {
        "assignment_count": len(items),
        "by_scope": dict(by_scope),
        "items": items,
    }


def replace_version_assignments(
    db: Session,
    *,
    tenant_id: int,
    from_version_id: int,
    to_version_id: int,
) -> dict[str, Any]:
    if int(from_version_id) == int(to_version_id):
        raise ValueError("Wersje muszą być różne.")

    to_ver = db.query(DocumentTemplateVersion).filter(DocumentTemplateVersion.id == int(to_version_id)).first()
    if to_ver is None:
        raise ValueError("Docelowa wersja nie istnieje.")

    updated = 0
    for row in (
        db.query(DocumentTemplateScopeAssignment)
        .filter(
            DocumentTemplateScopeAssignment.tenant_id == int(tenant_id),
            DocumentTemplateScopeAssignment.version_id == int(from_version_id),
        )
        .all()
    ):
        row.version_id = int(to_version_id)
        updated += 1

    for row in (
        db.query(DocumentTemplateBinding)
        .filter(
            DocumentTemplateBinding.tenant_id == int(tenant_id),
            DocumentTemplateBinding.version_id == int(from_version_id),
        )
        .all()
    ):
        row.version_id = int(to_version_id)
        row.template_id = int(to_ver.template_id)
        updated += 1

    for row in (
        db.query(DocumentSeries)
        .filter(
            DocumentSeries.tenant_id == int(tenant_id),
            DocumentSeries.document_template_version_id == int(from_version_id),
        )
        .all()
    ):
        row.document_template_version_id = int(to_version_id)
        updated += 1

    db.commit()
    return {"updated_count": updated}


def _collect_assignments(
    db: Session,
    *,
    tenant_id: int,
    version_ids: list[int],
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    if not version_ids:
        return items

    for row in (
        db.query(DocumentTemplateScopeAssignment)
        .filter(
            DocumentTemplateScopeAssignment.tenant_id == int(tenant_id),
            DocumentTemplateScopeAssignment.version_id.in_(version_ids),
        )
        .all()
    ):
        kind = db.query(DocumentTemplateKind).filter(DocumentTemplateKind.id == int(row.kind_id)).first()
        items.append(
            _item(
                scope_type=str(row.scope_type),
                scope_id=int(row.scope_id),
                scope_label=_scope_label(db, row.scope_type, row.scope_id),
                kind_code=kind.code if kind else None,
                kind_name=kind.name_pl if kind else None,
                version_id=int(row.version_id),
            )
        )

    for row in (
        db.query(DocumentTemplateBinding)
        .filter(
            DocumentTemplateBinding.tenant_id == int(tenant_id),
            DocumentTemplateBinding.version_id.in_(version_ids),
            DocumentTemplateBinding.is_active.is_(True),
        )
        .all()
    ):
        kind = db.query(DocumentTemplateKind).filter(DocumentTemplateKind.id == int(row.kind_id)).first()
        wh_label = None
        if row.warehouse_id is not None:
            wh = db.query(Warehouse).filter(Warehouse.id == int(row.warehouse_id)).first()
            wh_label = wh.name if wh else f"Magazyn #{row.warehouse_id}"
        items.append(
            _item(
                scope_type="WAREHOUSE" if row.warehouse_id else "COMPANY",
                scope_id=int(row.warehouse_id or tenant_id),
                scope_label=wh_label or "Domyślne powiązanie",
                kind_code=kind.code if kind else None,
                kind_name=kind.name_pl if kind else None,
                version_id=int(row.version_id) if row.version_id else None,
                extra="Binding",
            )
        )

    for row in (
        db.query(DocumentSeries)
        .filter(
            DocumentSeries.tenant_id == int(tenant_id),
            DocumentSeries.document_template_version_id.in_(version_ids),
        )
        .all()
    ):
        items.append(
            _item(
                scope_type=SCOPE_TYPE_SERIES,
                scope_id=str(row.id),
                scope_label=f"{row.prefix or row.name or row.id}",
                kind_code=None,
                kind_name=row.name,
                version_id=int(row.document_template_version_id),
            )
        )
    return items


def _item(
    *,
    scope_type: str,
    scope_id: int | str,
    scope_label: str,
    kind_code: str | None,
    kind_name: str | None,
    version_id: int | None,
    extra: str | None = None,
) -> dict[str, Any]:
    label = SCOPE_TYPE_LABELS.get(scope_type, scope_type)
    return {
        "scope_type": scope_type,
        "scope_type_label": label,
        "scope_id": scope_id,
        "scope_label": scope_label,
        "kind_code": kind_code,
        "kind_name": kind_name,
        "version_id": version_id,
        "extra": extra,
        "erp_link": _erp_link(scope_type, scope_id, kind_code=kind_code),
    }


def _scope_label(db: Session, scope_type: str, scope_id: int) -> str:
    st = str(scope_type)
    if st == "WAREHOUSE":
        wh = db.query(Warehouse).filter(Warehouse.id == int(scope_id)).first()
        return wh.name if wh else f"Magazyn #{scope_id}"
    if st == "COMPANY":
        return "Ustawienia firmy"
    if st == "PRODUCT":
        from ...models.product import Product

        prod = db.query(Product).filter(Product.id == int(scope_id)).first()
        return prod.name if prod else f"Produkt #{scope_id}"
    if st == "CUSTOMER":
        from ...models.customer import Customer

        cust = db.query(Customer).filter(Customer.id == int(scope_id)).first()
        return cust.name if cust else f"Klient #{scope_id}"
    return f"{SCOPE_TYPE_LABELS.get(st, st)} #{scope_id}"


def _badges_from_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: dict[str, int] = defaultdict(int)
    for item in items:
        label = str(item.get("scope_type_label") or item.get("scope_type"))
        counts[label] += 1
    return [{"label": label, "count": count} for label, count in sorted(counts.items())]
