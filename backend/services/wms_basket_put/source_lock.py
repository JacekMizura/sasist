"""Server-side source location provenance for MULTI quantity basket-put.

Persisted in WmsOperationSession.metadata_json under basket_put.source_lock.
Not a stock reservation — only provenance of the accepted source location.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from ...models.cart import Cart
from ...models.location import Location
from ...models.wms_operation_session import WmsOperationSession
from . import error_codes as ec
from . import state as put_state
from .location_stock import effective_pickable_qty_at_location

logger = logging.getLogger(__name__)


def _basket_put_error(code: str, message: str, *, http_status: int = 409, extra: dict | None = None):
    from .scan_service import BasketPutError

    raise BasketPutError(code, message, http_status=http_status, extra=extra or {})


def accept_source_location(
    db: Session,
    *,
    cart: Cart,
    sess: WmsOperationSession,
    product_id: int,
    location_id: int,
    operator_user_id: int | None,
) -> dict[str, Any]:
    """
    Validate and persist source_lock for this cart session + product.

    Hard gates: location in cart warehouse, effective pickable qty > 0.
    Replaces any previous lock (including other SKU) on this session block.
    """
    pid = int(product_id)
    lid = int(location_id)
    cid = int(cart.id)
    tid = int(cart.tenant_id)
    wid = int(cart.warehouse_id)

    loc = (
        db.query(Location)
        .filter(Location.id == lid, Location.warehouse_id == wid)
        .first()
    )
    if loc is None:
        _basket_put_error(
            ec.SOURCE_LOCATION_INVALID,
            "Lokalizacja nie należy do tego magazynu albo nie istnieje.",
            extra={"phase": ec.SOURCE_LOCATION_INVALID, "location_id": lid},
        )
    if getattr(loc, "is_active", True) is False:
        _basket_put_error(
            ec.SOURCE_LOCATION_INVALID,
            "Ta lokalizacja jest nieaktywna.",
            extra={"phase": ec.SOURCE_LOCATION_INVALID, "location_id": lid},
        )

    avail = effective_pickable_qty_at_location(
        db,
        tenant_id=tid,
        warehouse_id=wid,
        product_id=pid,
        location_id=lid,
        for_update=True,
    )
    if float(avail) <= 1e-9:
        _basket_put_error(
            ec.QUANTITY_EXCEEDS_LOCATION_STOCK,
            "W tej lokalizacji nie ma dostępnego stanu dla tego produktu.",
            extra={
                "phase": ec.QUANTITY_EXCEEDS_LOCATION_STOCK,
                "location_id": lid,
                "location_available": float(avail),
            },
        )

    lock = {
        "tenant_id": tid,
        "warehouse_id": wid,
        "cart_id": cid,
        "session_id": int(sess.id),
        "product_id": pid,
        "location_id": lid,
        "operator_user_id": int(operator_user_id) if operator_user_id else None,
        "locked_at": put_state.utc_now_iso(),
        "location_code": (getattr(loc, "name", None) or "").strip() or None,
        "effective_available_at_lock": round(float(avail), 6),
    }
    put_state.set_source_lock(db, sess, lock)
    logger.info(
        "LOKALIZACJA_ZRODLOWA_ZATWIERDZONA session_id=%s cart_id=%s product_id=%s "
        "location_id=%s operator=%s",
        sess.id,
        cid,
        pid,
        lid,
        operator_user_id,
    )
    return lock


def resolve_locked_source_for_confirm(
    sess: WmsOperationSession,
    *,
    cart: Cart,
    product_id: int,
    body_location_id: int | None,
    operator_user_id: int | None = None,
) -> dict[str, Any]:
    """
    Return validated source_lock for basket confirm.

    body.location_id is optional compatibility check only — never SSOT.
    """
    lock = put_state.get_source_lock(sess)
    if lock is None:
        _basket_put_error(
            ec.NO_PENDING_SOURCE_LOCATION,
            "Brak zatwierdzonej lokalizacji pobrania. Zeskanuj lokalizację produktu ponownie.",
            extra={"phase": ec.NO_PENDING_SOURCE_LOCATION},
        )

    if int(lock.get("cart_id") or 0) != int(cart.id):
        _basket_put_error(
            ec.PENDING_PICK_STATE_CONFLICT,
            "Zatwierdzona lokalizacja należy do innej sesji wózka. Zeskanuj lokalizację ponownie.",
            extra={"phase": ec.PENDING_PICK_STATE_CONFLICT},
        )
    if int(lock.get("session_id") or 0) != int(sess.id):
        _basket_put_error(
            ec.PENDING_PICK_STATE_CONFLICT,
            "Zatwierdzona lokalizacja należy do innej sesji zbierania. Zeskanuj lokalizację ponownie.",
            extra={"phase": ec.PENDING_PICK_STATE_CONFLICT},
        )
    if int(lock.get("product_id") or 0) != int(product_id):
        _basket_put_error(
            ec.PENDING_PICK_STATE_CONFLICT,
            "Zatwierdzona lokalizacja dotyczy innego produktu. Zeskanuj lokalizację dla tego produktu.",
            extra={"phase": ec.PENDING_PICK_STATE_CONFLICT},
        )
    if int(lock.get("tenant_id") or 0) != int(cart.tenant_id) or int(lock.get("warehouse_id") or 0) != int(
        cart.warehouse_id
    ):
        _basket_put_error(
            ec.SOURCE_LOCATION_INVALID,
            "Zatwierdzona lokalizacja nie należy do tego magazynu.",
            extra={"phase": ec.SOURCE_LOCATION_INVALID},
        )

    if operator_user_id is not None and lock.get("operator_user_id") is not None:
        if int(lock["operator_user_id"]) != int(operator_user_id):
            _basket_put_error(
                ec.PENDING_PICK_STATE_CONFLICT,
                "Lokalizacja została zatwierdzona przez innego operatora. Zeskanuj lokalizację ponownie.",
                extra={"phase": ec.PENDING_PICK_STATE_CONFLICT},
            )

    locked_lid = int(lock.get("location_id") or 0)
    if locked_lid <= 0:
        _basket_put_error(
            ec.NO_PENDING_SOURCE_LOCATION,
            "Brak zatwierdzonej lokalizacji pobrania. Zeskanuj lokalizację produktu ponownie.",
            extra={"phase": ec.NO_PENDING_SOURCE_LOCATION},
        )

    if body_location_id is not None and int(body_location_id) > 0:
        if int(body_location_id) != locked_lid:
            _basket_put_error(
                ec.SOURCE_LOCATION_MISMATCH,
                (
                    "Lokalizacja źródłowa nie zgadza się z wcześniej zeskanowaną lokalizacją. "
                    "Zeskanuj produkt ponownie."
                ),
                extra={
                    "phase": ec.SOURCE_LOCATION_MISMATCH,
                    "locked_location_id": locked_lid,
                    "body_location_id": int(body_location_id),
                },
            )

    return lock
