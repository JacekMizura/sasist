"""Hard Carton ↔ ShippingMethod compatibility for Smart Matching v2."""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from ....models.carton import carton_shipping_method_links


def is_carton_compatible_with_shipping(
    db: Session,
    *,
    carton_id: str,
    shipping_method_id: Optional[str],
) -> bool:
    """
    Hard filter: if the order has a shipping_method_id, the carton must be linked
    via carton_shipping_method_links. No shipping method → compatible (no hard fail).
    """
    if shipping_method_id is None or shipping_method_id == "":
        return True
    sid = str(shipping_method_id).strip()
    if not sid:
        return True
    cid = (carton_id or "").strip()
    if not cid:
        return False
    row = (
        db.query(carton_shipping_method_links.c.carton_id)
        .filter(
            carton_shipping_method_links.c.carton_id == cid,
            carton_shipping_method_links.c.shipping_method_id == sid,
        )
        .first()
    )
    return row is not None
