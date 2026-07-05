"""ERP order / product / return document PDF generation via Document Template Engine."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..document_templates.services.erp_document_render_service import render_erp_document_pdf_bytes
from ..document_templates.services.template_hierarchy_resolver import RenderTemplateContext
from ..models.order import Order


def _order_warehouse_id(db: Session, order: Order | None) -> int | None:
    if order is None:
        return None
    wh = getattr(order, "warehouse_id", None)
    return int(wh) if wh is not None else None


def _ctx_with_explicit_version(
    *,
    tenant_id: int,
    kind_code: str,
    warehouse_id: int | None,
    template_version_id: int | None = None,
    scope_type: str | None = None,
    scope_id: int | None = None,
) -> RenderTemplateContext | None:
    if template_version_id is None and scope_type is None:
        return None
    return RenderTemplateContext(
        tenant_id=int(tenant_id),
        kind_code=str(kind_code),
        warehouse_id=warehouse_id,
        explicit_version_id=int(template_version_id) if template_version_id is not None else None,
        scope_type=scope_type,
        scope_id=scope_id,
    )


def generate_order_confirmation_pdf_bytes(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    template_version_id: int | None = None,
) -> bytes:
    order = db.query(Order).filter(Order.id == int(order_id), Order.tenant_id == int(tenant_id)).first()
    if order is None:
        raise ValueError("Order not found")

    def _legacy() -> str:
        return f"<html><body><h1>Potwierdzenie zamówienia #{order_id}</h1></body></html>"

    wh = _order_warehouse_id(db, order)
    return render_erp_document_pdf_bytes(
        db,
        tenant_id=int(tenant_id),
        kind_code="order_confirmation",
        params={"order_id": int(order_id)},
        legacy_renderer=_legacy,
        warehouse_id=wh,
        ctx=_ctx_with_explicit_version(
            tenant_id=int(tenant_id),
            kind_code="order_confirmation",
            warehouse_id=wh,
            template_version_id=template_version_id,
        ),
        log_label=f"order_confirmation order_id={order_id}",
    )


def generate_picking_list_pdf_bytes(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    template_version_id: int | None = None,
) -> bytes:
    order = db.query(Order).filter(Order.id == int(order_id), Order.tenant_id == int(tenant_id)).first()
    if order is None:
        raise ValueError("Order not found")

    def _legacy() -> str:
        return f"<html><body><h1>Lista kompletacyjna #{order_id}</h1></body></html>"

    wh = _order_warehouse_id(db, order)
    return render_erp_document_pdf_bytes(
        db,
        tenant_id=int(tenant_id),
        kind_code="picking_list",
        params={"order_id": int(order_id)},
        legacy_renderer=_legacy,
        warehouse_id=wh,
        ctx=_ctx_with_explicit_version(
            tenant_id=int(tenant_id),
            kind_code="picking_list",
            warehouse_id=wh,
            template_version_id=template_version_id,
        ),
        log_label=f"picking_list order_id={order_id}",
    )


def generate_return_document_pdf_bytes(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    template_version_id: int | None = None,
) -> bytes:
    order = db.query(Order).filter(Order.id == int(order_id), Order.tenant_id == int(tenant_id)).first()
    if order is None:
        raise ValueError("Order not found")

    def _legacy() -> str:
        return f"<html><body><h1>Dokument zwrotu #{order_id}</h1></body></html>"

    wh = _order_warehouse_id(db, order)
    ctx = RenderTemplateContext(
        tenant_id=int(tenant_id),
        kind_code="return_document",
        warehouse_id=wh,
        scope_type="RETURNS",
        scope_id=int(tenant_id),
        explicit_version_id=int(template_version_id) if template_version_id is not None else None,
    )
    return render_erp_document_pdf_bytes(
        db,
        tenant_id=int(tenant_id),
        kind_code="return_document",
        params={"order_id": int(order_id)},
        legacy_renderer=_legacy,
        warehouse_id=wh,
        ctx=ctx,
        log_label=f"return_document order_id={order_id}",
    )


def generate_product_card_pdf_bytes(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
    template_version_id: int | None = None,
) -> bytes:
    from ..models.product import Product

    product = db.query(Product).filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id)).first()
    if product is None:
        raise ValueError("Product not found")

    def _legacy() -> str:
        name = product.name or f"Produkt #{product_id}"
        return f"<html><body><h1>Karta produktu</h1><p>{name}</p></body></html>"

    ctx = RenderTemplateContext(
        tenant_id=int(tenant_id),
        kind_code="product_card",
        scope_type="PRODUCT",
        scope_id=int(product_id),
        explicit_version_id=int(template_version_id) if template_version_id is not None else None,
    )
    return render_erp_document_pdf_bytes(
        db,
        tenant_id=int(tenant_id),
        kind_code="product_card",
        params={"product_id": int(product_id)},
        legacy_renderer=_legacy,
        ctx=ctx,
        log_label=f"product_card product_id={product_id}",
    )
