"""
SSOT aktywnej sesji zbierania operatora (wózkowej lub cartless).

Używane przez statusy / resume / anulowanie — nie zgaduj z kafelka UI.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from .cart_display import cart_display_name_for_wms
from .cart_picking_lifecycle_service import (
    SESSION_KIND_PICKING_ACTIVE,
    _load_meta,
    find_open_picking_session,
)
from .wms_status_tile_config import active_cart_tile_fields, cart_physical_family


def resolve_operator_active_picking_session(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    operator_user_id: int | None,
) -> dict[str, Any]:
    """
    Jedna aktywna sesja operatora w magazynie (najnowsza otwarta picking_active).

    Zwraca m.in.:
    - session_id, source_status_id, order_type
    - cart_id / cart_code / cart_name / cart_type (BULK|BASKETS) albo null (cartless)
    - has_cart
    """
    empty: dict[str, Any] = {
        "has_active_session": False,
        "session_id": None,
        "source_status_id": None,
        "order_type": None,
        "has_cart": False,
        "cart_id": None,
        "cart_code": None,
        "cart_name": None,
        "cart_type": None,
        "physical_cart_type": None,
        "products_picked": 0,
        "products_total": 0,
    }
    if operator_user_id is None or int(operator_user_id) <= 0:
        return empty

    from ..models.wms_operation_session import WmsOperationSession
    from ..models.cart import Cart
    from ..models.enums import CartStatus

    open_kinds = (SESSION_KIND_PICKING_ACTIVE, "picking_recovery_active")
    sess = (
        db.query(WmsOperationSession)
        .filter(
            WmsOperationSession.tenant_id == int(tenant_id),
            WmsOperationSession.warehouse_id == int(warehouse_id),
            WmsOperationSession.operator_user_id == int(operator_user_id),
            WmsOperationSession.completed_at.is_(None),
            WmsOperationSession.session_kind.in_(open_kinds),
        )
        .order_by(WmsOperationSession.id.desc())
        .first()
    )

    # Fallback: wózek PICKING/ASSIGNED operatora bez znalezionej sesji (heal).
    cart = None
    if sess is not None and getattr(sess, "cart_id", None) is not None:
        cart = db.query(Cart).filter(Cart.id == int(sess.cart_id)).first()
    if cart is None:
        active = (CartStatus.PICKING.value, CartStatus.ASSIGNED.value)
        cart = (
            db.query(Cart)
            .filter(
                Cart.tenant_id == int(tenant_id),
                Cart.warehouse_id == int(warehouse_id),
                Cart.assigned_user_id == int(operator_user_id),
                Cart.status.in_(active),
            )
            .order_by(Cart.id.desc())
            .first()
        )
        if cart is not None and sess is None:
            sess = find_open_picking_session(db, cart=cart)

    if sess is None and cart is None:
        return empty

    meta = _load_meta(getattr(sess, "metadata_json", None) if sess else None)
    meta_sid = meta.get("source_status_id")
    ot = str(meta.get("order_type") or "").strip().lower()
    cart_fields = active_cart_tile_fields(cart)
    fam = cart_physical_family(cart)

    products_picked = 0
    products_total = 0
    if cart is not None and meta_sid is not None:
        try:
            from .wms_picking_session_projection import project_operator_active_picking_for_status

            proj = project_operator_active_picking_for_status(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                source_status_id=int(meta_sid),
                operator_user_id=int(operator_user_id),
                cart_type_hint=None,
                order_type=ot if ot in ("single", "multi", "all") else "all",
            )
            products_picked = int(proj.get("products_picked") or 0)
            products_total = int(proj.get("products_total") or 0)
        except Exception:
            products_picked = 0
            products_total = 0

    return {
        "has_active_session": True,
        "session_id": int(sess.id) if sess is not None else None,
        "source_status_id": int(meta_sid) if meta_sid is not None else None,
        "order_type": ot if ot in ("single", "multi", "all") else None,
        "has_cart": cart is not None,
        "cart_id": cart_fields.get("active_cart_id"),
        "cart_code": cart_fields.get("active_cart_code"),
        "cart_name": cart_fields.get("active_cart_name")
        or (cart_display_name_for_wms(cart) if cart is not None else None),
        "cart_type": cart_fields.get("active_cart_type"),
        "physical_cart_type": fam,
        "products_picked": products_picked,
        "products_total": products_total,
    }
