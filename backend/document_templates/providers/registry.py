"""Resolve domain provider output — returns PrintContext DTO only."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..dto.print_context import PrintContext
from ..errors import DocumentProviderError
from .complaint_provider import complaint_provider
from .inventory_provider import inventory_provider
from .order_provider import order_provider
from .product_provider import product_provider
from .production_provider import production_provider
from .return_provider import return_provider
from .stub_providers import customer_provider, report_provider, supplier_provider
from .transfer_provider import transfer_provider
from .warehouse_provider import warehouse_document_provider


def build_domain_print_context(
    db: Session,
    *,
    provider_key: str,
    kind_code: str,
    tenant_id: int,
    params: dict[str, Any],
) -> PrintContext:
    key = str(provider_key or "").strip().lower()
    if params.get("sample"):
        if key == "production":
            from .sample_data import sample_production_context

            return sample_production_context()
        if key == "order":
            return order_provider.build(db, tenant_id=tenant_id, kind_code=kind_code, **params)
        if key == "warehouse_document":
            return warehouse_document_provider.build(db, tenant_id=tenant_id, kind_code=kind_code, **params)
        if key == "inventory":
            return inventory_provider.build(db, tenant_id=tenant_id, **params)
        if key == "transfer":
            return transfer_provider.build(db, tenant_id=tenant_id, kind_code=kind_code, **params)
        if key == "return":
            return return_provider.build(db, tenant_id=tenant_id, **params)
        if key == "complaint":
            return complaint_provider.build(db, tenant_id=tenant_id, **params)
        if key == "product":
            return product_provider.build(db, tenant_id=tenant_id, **params)
        if key == "report":
            return report_provider.build(db, tenant_id=tenant_id, **params)
    if key == "production":
        if kind_code == "production_card":
            if params.get("batch_id") is not None:
                return production_provider.build_batch_production_card(
                    db, tenant_id=tenant_id, batch_id=int(params["batch_id"])
                )
            if params.get("order_id") is not None:
                return production_provider.build_order_production_card(
                    db, tenant_id=tenant_id, order_id=int(params["order_id"])
                )
            if params.get("sample"):
                from .sample_data import sample_production_context

                return sample_production_context()
            raise DocumentProviderError("Wymagany batch_id lub order_id.", code="missing_param")
        if params.get("batch_id"):
            return production_provider.build_batch_production_card(
                db,
                tenant_id=tenant_id,
                batch_id=int(params["batch_id"]),
            )
        return production_provider.build_order_production_card(
            db,
            tenant_id=tenant_id,
            order_id=int(params.get("order_id") or 0),
        )
    if key == "order":
        return order_provider.build(db, tenant_id=tenant_id, kind_code=kind_code, **params)
    if key == "warehouse_document":
        return warehouse_document_provider.build(db, tenant_id=tenant_id, kind_code=kind_code, **params)
    if key == "inventory":
        return inventory_provider.build(db, tenant_id=tenant_id, **params)
    if key == "transfer":
        return transfer_provider.build(db, tenant_id=tenant_id, kind_code=kind_code, **params)
    if key == "return":
        return return_provider.build(db, tenant_id=tenant_id, **params)
    if key == "complaint":
        return complaint_provider.build(db, tenant_id=tenant_id, **params)
    if key == "product":
        return product_provider.build(db, tenant_id=tenant_id, **params)
    if key == "customer":
        return customer_provider.build(db, tenant_id=tenant_id, **params)
    if key == "supplier":
        return supplier_provider.build(db, tenant_id=tenant_id, **params)
    if key == "report":
        return report_provider.build(db, tenant_id=tenant_id, **params)
    raise DocumentProviderError(f"Nieznany provider: {provider_key}", code="unknown_provider")
