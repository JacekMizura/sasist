"""Business assignment usage — where templates are used across ERP scopes."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy.orm import Session

from ..constants import (
    SCOPE_TYPE_COMPANY,
    SCOPE_TYPE_COMPLAINTS,
    SCOPE_TYPE_CUSTOMER,
    SCOPE_TYPE_MODULE,
    SCOPE_TYPE_PRODUCT,
    SCOPE_TYPE_PRODUCTION,
    SCOPE_TYPE_RETURNS,
    SCOPE_TYPE_SERIES,
    SCOPE_TYPE_SUPPLIER,
    SCOPE_TYPE_WAREHOUSE,
    SCOPE_TYPE_LABELS,
)
from ..models import (
    DocumentTemplate,
    DocumentTemplateBinding,
    DocumentTemplateKind,
    DocumentTemplateScopeAssignment,
    DocumentTemplateVersion,
)
from ...models.company_profile import CompanyProfile
from ...models.document_series import DocumentSeries
from ...models.printing.printing_auto_setting import PrintingAutoSetting
from ...models.tenant import Tenant
from ...models.warehouse import Warehouse
from ...models.wms_workstations.workstation import WmsWorkstation
from ...services.wms_workstations.serialize import _default_printer_names_batch

WAREHOUSE_KIND_CODES = frozenset(
    {
        "wz",
        "pz",
        "pw",
        "rw",
        "mm",
        "inventory_count",
        "stock_transfer",
        "relocation_document",
    }
)
SALE_KIND_CODES = frozenset({"invoice", "receipt", "correction", "order_confirmation"})
LABEL_KIND_CODES = frozenset({"product_card"})  # closest DTE mapping for label auto-print


def _erp_link(scope_type: str, scope_id: int | str, *, kind_code: str | None = None) -> str | None:
    st = str(scope_type)
    sid = scope_id
    if st == SCOPE_TYPE_SERIES:
        return f"/documents/series/{sid}"
    if st == SCOPE_TYPE_WAREHOUSE:
        return "/settings/company/warehouses"
    if st == SCOPE_TYPE_COMPANY:
        return "/settings/company"
    if st == "WORKSTATION":
        return f"/settings/wms/workstations/{sid}"
    if st == "AUTO_RULE":
        return "/settings/wms/workstations"
    if st == SCOPE_TYPE_PRODUCT:
        return f"/products/{sid}"
    if st == SCOPE_TYPE_CUSTOMER:
        return f"/customers/{sid}"
    if st == SCOPE_TYPE_SUPPLIER:
        return "/assortment/suppliers"
    if st == SCOPE_TYPE_PRODUCTION:
        return "/settings/wms"
    if st == SCOPE_TYPE_RETURNS:
        return "/orders/returns/configurator"
    if st == SCOPE_TYPE_COMPLAINTS:
        return "/settings/complaints/ui-statuses"
    if st == SCOPE_TYPE_MODULE and kind_code:
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
    report = build_usage_report(db, tenant_id=tenant_id, template_id=template_id, items=items)
    return {
        "badges": badges,
        "total": len(items),
        "items": items,
        **report,
    }


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


def build_usage_report(
    db: Session,
    *,
    tenant_id: int,
    template_id: int,
    items: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Structured impact report: companies / warehouses / stations / series / rules / other."""
    if items is None:
        items = list_assignments_for_template(db, tenant_id=tenant_id, template_id=template_id)

    template = db.query(DocumentTemplate).filter(DocumentTemplate.id == int(template_id)).first()
    template_name = template.name if template else f"Szablon #{template_id}"

    companies: list[dict[str, Any]] = []
    warehouses: list[dict[str, Any]] = []
    series: list[dict[str, Any]] = []
    other: list[dict[str, Any]] = []
    warehouse_ids: set[int] = set()
    kind_codes: set[str] = set()

    company_name = _company_display_name(db, tenant_id)

    for item in items:
        st = str(item.get("scope_type") or "")
        kind_code = (item.get("kind_code") or None) and str(item.get("kind_code"))
        kind_name = (item.get("kind_name") or "").strip() or None
        if kind_code:
            kind_codes.add(kind_code)
        role = _usage_role_label(item)

        if st == SCOPE_TYPE_COMPANY:
            companies.append(
                _usage_entry(
                    entry_id=f"company-{item.get('scope_id')}-{kind_code or 'x'}",
                    title=company_name,
                    subtitle=role,
                    erp_link=_erp_link(st, item.get("scope_id"), kind_code=kind_code),
                    meta={"kind_code": kind_code, "kind_name": kind_name},
                )
            )
        elif st == SCOPE_TYPE_WAREHOUSE:
            try:
                warehouse_ids.add(int(item.get("scope_id")))
            except (TypeError, ValueError):
                pass
            warehouses.append(
                _usage_entry(
                    entry_id=f"wh-{item.get('scope_id')}-{kind_code or 'x'}",
                    title=str(item.get("scope_label") or f"Magazyn #{item.get('scope_id')}"),
                    subtitle=role,
                    erp_link=_erp_link(st, item.get("scope_id"), kind_code=kind_code),
                    meta={"kind_code": kind_code, "kind_name": kind_name, "warehouse_id": item.get("scope_id")},
                )
            )
        elif st == SCOPE_TYPE_SERIES:
            series.append(
                _usage_entry(
                    entry_id=f"series-{item.get('scope_id')}",
                    title=str(item.get("kind_name") or item.get("scope_label") or f"Seria {item.get('scope_id')}"),
                    subtitle=_series_subtitle(item),
                    erp_link=_erp_link(st, item.get("scope_id")),
                    meta={"series_id": item.get("scope_id")},
                )
            )
        else:
            other.append(
                _usage_entry(
                    entry_id=f"other-{st}-{item.get('scope_id')}-{kind_code or 'x'}",
                    title=str(item.get("scope_label") or SCOPE_TYPE_LABELS.get(st, st)),
                    subtitle=role or str(item.get("scope_type_label") or st),
                    erp_link=item.get("erp_link") or _erp_link(st, item.get("scope_id"), kind_code=kind_code),
                    meta={"scope_type": st, "kind_code": kind_code},
                )
            )

    # Company-level default implies all warehouses linked to the tenant.
    if not warehouse_ids and companies:
        from ...models.tenant_warehouse import TenantWarehouse

        for link in db.query(TenantWarehouse).filter(TenantWarehouse.tenant_id == int(tenant_id)).all():
            warehouse_ids.add(int(link.warehouse_id))
        if not warehouse_ids:
            for wh in db.query(Warehouse).filter(Warehouse.tenant_id == int(tenant_id)).all():
                warehouse_ids.add(int(wh.id))

    # Surface inherited warehouses under company default (impact visibility).
    if companies and warehouse_ids:
        existing_wh = {str(e.get("meta", {}).get("warehouse_id")) for e in warehouses}
        for wh in db.query(Warehouse).filter(Warehouse.id.in_(warehouse_ids)).all():
            if str(wh.id) in existing_wh:
                continue
            role = companies[0].get("subtitle") or "Dziedziczy domyślny szablon firmy"
            warehouses.append(
                _usage_entry(
                    entry_id=f"wh-inherited-{wh.id}",
                    title=str(wh.name),
                    subtitle=f"Dziedziczy: {role}",
                    erp_link=_erp_link(SCOPE_TYPE_WAREHOUSE, int(wh.id)),
                    meta={"warehouse_id": int(wh.id), "inherited": True},
                )
            )

    workstations = _workstations_for_warehouses(db, tenant_id=tenant_id, warehouse_ids=warehouse_ids)
    rules = _auto_rules_for_kinds(db, tenant_id=tenant_id, kind_codes=kind_codes, template_name=template_name)

    companies = _dedupe_entries(companies)
    warehouses = _dedupe_entries(warehouses)
    series = _dedupe_entries(series)
    other = _dedupe_entries(other)

    summary = {
        "companies": len(companies),
        "warehouses": len(warehouses),
        "workstations": len(workstations),
        "series": len(series),
        "rules": len(rules),
        "other": len(other),
        "total": len(companies) + len(warehouses) + len(workstations) + len(series) + len(rules) + len(other),
    }

    return {
        "template_id": int(template_id),
        "template_name": template_name,
        "summary": summary,
        "sections": {
            "companies": companies,
            "warehouses": warehouses,
            "workstations": workstations,
            "series": series,
            "rules": rules,
            "other": other,
        },
    }


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
                scope_label=_scope_label(db, row.scope_type, row.scope_id, tenant_id=tenant_id),
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
        if row.warehouse_id is not None:
            wh = db.query(Warehouse).filter(Warehouse.id == int(row.warehouse_id)).first()
            items.append(
                _item(
                    scope_type=SCOPE_TYPE_WAREHOUSE,
                    scope_id=int(row.warehouse_id),
                    scope_label=wh.name if wh else f"Magazyn #{row.warehouse_id}",
                    kind_code=kind.code if kind else None,
                    kind_name=kind.name_pl if kind else None,
                    version_id=int(row.version_id) if row.version_id else None,
                    extra="Binding",
                )
            )
        else:
            items.append(
                _item(
                    scope_type=SCOPE_TYPE_COMPANY,
                    scope_id=int(tenant_id),
                    scope_label=_company_display_name(db, tenant_id),
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
        wh = db.query(Warehouse).filter(Warehouse.id == int(row.warehouse_id)).first() if row.warehouse_id else None
        prefix = (row.prefix or "").strip()
        items.append(
            _item(
                scope_type=SCOPE_TYPE_SERIES,
                scope_id=str(row.id),
                scope_label=prefix or (row.name or str(row.id)),
                kind_code=None,
                kind_name=row.name,
                version_id=int(row.document_template_version_id),
                extra=wh.name if wh else None,
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


def _scope_label(db: Session, scope_type: str, scope_id: int, *, tenant_id: int) -> str:
    st = str(scope_type)
    if st == SCOPE_TYPE_WAREHOUSE:
        wh = db.query(Warehouse).filter(Warehouse.id == int(scope_id)).first()
        return wh.name if wh else f"Magazyn #{scope_id}"
    if st == SCOPE_TYPE_COMPANY:
        return _company_display_name(db, tenant_id)
    if st == SCOPE_TYPE_PRODUCT:
        from ...models.product import Product

        prod = db.query(Product).filter(Product.id == int(scope_id)).first()
        return prod.name if prod else f"Produkt #{scope_id}"
    if st == SCOPE_TYPE_CUSTOMER:
        from ...models.customer import Customer

        cust = db.query(Customer).filter(Customer.id == int(scope_id)).first()
        return cust.name if cust else f"Klient #{scope_id}"
    return f"{SCOPE_TYPE_LABELS.get(st, st)} #{scope_id}"


def _company_display_name(db: Session, tenant_id: int) -> str:
    profile = db.query(CompanyProfile).filter(CompanyProfile.tenant_id == int(tenant_id)).first()
    if profile and (profile.company_name or "").strip():
        return str(profile.company_name).strip()
    tenant = db.query(Tenant).filter(Tenant.id == int(tenant_id)).first()
    if tenant:
        if (tenant.company_name or "").strip():
            return str(tenant.company_name).strip()
        if (tenant.name or "").strip():
            return str(tenant.name).strip()
    return f"Firma #{tenant_id}"


def _usage_role_label(item: dict[str, Any]) -> str:
    kind = (item.get("kind_name") or item.get("kind_code") or "").strip()
    if not kind:
        if item.get("extra") and item.get("extra") not in {"Binding"}:
            return str(item["extra"])
        return "Przypisanie szablonu"
    if item.get("extra") == "Binding":
        return f"Domyślny szablon: {kind}"
    return f"Domyślny szablon: {kind}"


def _series_subtitle(item: dict[str, Any]) -> str:
    parts: list[str] = []
    prefix = (item.get("scope_label") or "").strip()
    name = (item.get("kind_name") or "").strip()
    if prefix and prefix != name:
        parts.append(f"Prefiks {prefix}")
    if item.get("extra"):
        parts.append(str(item["extra"]))
    if not parts:
        return "Seria dokumentów"
    return " · ".join(parts)


def _usage_entry(
    *,
    entry_id: str,
    title: str,
    subtitle: str | None,
    erp_link: str | None,
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": entry_id,
        "title": title,
        "subtitle": subtitle,
        "erp_link": erp_link,
        "meta": meta or {},
    }


def _dedupe_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for e in entries:
        key = str(e.get("id") or f"{e.get('title')}|{e.get('subtitle')}")
        if key in seen:
            continue
        seen.add(key)
        out.append(e)
    return out


def _workstations_for_warehouses(
    db: Session,
    *,
    tenant_id: int,
    warehouse_ids: set[int],
) -> list[dict[str, Any]]:
    if not warehouse_ids:
        return []
    rows = (
        db.query(WmsWorkstation)
        .filter(
            WmsWorkstation.tenant_id == int(tenant_id),
            WmsWorkstation.warehouse_id.in_(warehouse_ids),
            WmsWorkstation.is_active.is_(True),
        )
        .order_by(WmsWorkstation.name.asc())
        .all()
    )
    if not rows:
        return []
    printer_names = _default_printer_names_batch(db, {int(w.id) for w in rows})
    out: list[dict[str, Any]] = []
    for w in rows:
        printer = printer_names.get(int(w.id))
        out.append(
            _usage_entry(
                entry_id=f"ws-{w.id}",
                title=str(w.name),
                subtitle=printer or "Brak przypisanej drukarki",
                erp_link=_erp_link("WORKSTATION", int(w.id)),
                meta={"workstation_id": int(w.id), "warehouse_id": int(w.warehouse_id)},
            )
        )
    return out


def _auto_rules_for_kinds(
    db: Session,
    *,
    tenant_id: int,
    kind_codes: set[str],
    template_name: str,
) -> list[dict[str, Any]]:
    if not kind_codes:
        return []
    settings = (
        db.query(PrintingAutoSetting).filter(PrintingAutoSetting.tenant_id == int(tenant_id)).first()
    )
    if settings is None:
        return []

    rules: list[dict[str, Any]] = []
    link = _erp_link("AUTO_RULE", tenant_id)

    if settings.stock_documents and kind_codes & WAREHOUSE_KIND_CODES:
        matched = sorted(kind_codes & WAREHOUSE_KIND_CODES)
        rules.append(
            _usage_entry(
                entry_id="rule-stock_documents",
                title="Automatyczny wydruk dokumentów magazynowych",
                subtitle=f"Szablon „{template_name}” · {', '.join(matched)}",
                erp_link=link,
                meta={"rule": "stock_documents"},
            )
        )
    if settings.sale_documents and kind_codes & SALE_KIND_CODES:
        matched = sorted(kind_codes & SALE_KIND_CODES)
        rules.append(
            _usage_entry(
                entry_id="rule-sale_documents",
                title="Automatyczny wydruk dokumentów sprzedaży",
                subtitle=f"Szablon „{template_name}” · {', '.join(matched)}",
                erp_link=link,
                meta={"rule": "sale_documents"},
            )
        )
    if settings.labels and kind_codes & LABEL_KIND_CODES:
        rules.append(
            _usage_entry(
                entry_id="rule-labels",
                title="Automatyczny wydruk etykiet",
                subtitle=f"Szablon „{template_name}”",
                erp_link=link,
                meta={"rule": "labels"},
            )
        )
    return rules


def _badges_from_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: dict[str, int] = defaultdict(int)
    for item in items:
        label = str(item.get("scope_type_label") or item.get("scope_type"))
        counts[label] += 1
    return [{"label": label, "count": count} for label, count in sorted(counts.items())]
