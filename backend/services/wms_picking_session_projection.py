"""
Projekcja aktywnej sesji zbierania operatora — jedno źródło dla kart statusu / hub / re-entry.

Czyta ten sam zakres zamówień co lista produktów (cart_id + source_status_id),
nie kohortę wolnych zamówień.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from .cart_picking_lifecycle_service import compute_session_stats_from_product_lines
from .wms_status_tile_config import (
    active_cart_tile_fields,
    cart_physical_family,
    resolve_operator_active_picking_cart,
)


def project_operator_active_picking_for_status(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
    operator_user_id: int | None,
    cart_type_hint: str | None,
    order_type: str = "all",
) -> dict[str, Any]:
    """
    Zwraca projekcję aktywnej sesji operatora dla jednego statusu panelu.

    Pola:
    - active_cart_* (id/code/name/type)
    - session_id
    - order_type (z meta sesji, jeśli znany)
    - products_picked / products_total — SSOT jak na liście produktów wózka
    - has_active_session
    """
    empty: dict[str, Any] = {
        "has_active_session": False,
        "session_id": None,
        "order_type": None,
        "products_picked": 0,
        "products_total": 0,
        **active_cart_tile_fields(None),
    }
    if operator_user_id is None or int(operator_user_id) <= 0:
        return empty

    cart = resolve_operator_active_picking_cart(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        operator_user_id=int(operator_user_id),
        cart_type_hint=cart_type_hint,
    )
    if cart is None:
        return empty

    from .cart_picking_lifecycle_service import find_open_picking_session, _load_meta
    from .wms_picking_product_list_service import build_wms_picking_product_lines

    sess = find_open_picking_session(db, cart=cart)
    meta = _load_meta(getattr(sess, "metadata_json", None) if sess else None)
    meta_sid = meta.get("source_status_id")
    # Sesja z innym source_status — nie projekcja dla tej karty (chyba że zamówienia
    # nadal wiszą na tym statusie; wtedy i tak policzymy po order_ui_status_id).
    ot_meta = str(meta.get("order_type") or "").strip().lower()
    # Przy wznowieniu licz produkty w zakresie order_type sesji (nie „all” na siłę).
    ot = ot_meta if ot_meta in ("single", "multi", "all") else (
        order_type if order_type in ("single", "multi", "all") else "all"
    )

    try:
        lines = build_wms_picking_product_lines(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            source_status_id=int(source_status_id),
            order_type=ot,  # type: ignore[arg-type]
            cart_id=int(cart.id),
            recovery_mode=False,
        )
    except Exception:
        cart_fields = active_cart_tile_fields(cart)
        return {
            **empty,
            **cart_fields,
            "has_active_session": True,
            "session_id": int(sess.id) if sess is not None else None,
            "order_type": ot_meta if ot_meta in ("single", "multi", "all") else None,
        }

    products = list(lines.products or [])
    # Brak pozycji w tym statusie na wózku → sesja może należeć do innego statusu.
    if not products and meta_sid is not None and int(meta_sid) != int(source_status_id):
        return empty

    stats = compute_session_stats_from_product_lines(products)
    zebrane = int(stats.get("zebrane") or 0)
    do_zebrania = int(stats.get("do_zebrania") or 0)
    w_trakcie = int(stats.get("w_trakcie") or 0)
    total = zebrane + do_zebrania + w_trakcie

    # Aktywna gdy jest wózek w cyklu i (są pozycje LUB zamówienia in_progress na tym statusie).
    has_work = total > 0 or len(products) > 0
    if not has_work:
        # Pusty wózek ASSIGNED/PICKING bez pozycji tego statusu — nadal pokaż wózek,
        # jeśli meta sesji wskazuje ten status.
        if meta_sid is not None and int(meta_sid) == int(source_status_id):
            has_work = True
        elif sess is not None and meta_sid is None:
            has_work = True

    cart_fields = active_cart_tile_fields(cart)
    if not has_work and not cart_fields.get("active_cart_id"):
        return empty

    return {
        "has_active_session": bool(has_work or cart_fields.get("active_cart_id")),
        "session_id": int(sess.id) if sess is not None else None,
        "order_type": ot_meta if ot_meta in ("single", "multi", "all") else None,
        "products_picked": zebrane,
        "products_total": total,
        **cart_fields,
        # convenience for FE hydrate
        "physical_cart_type": cart_physical_family(cart),
        "cart_display": (cart_fields.get("active_cart_name") or cart_fields.get("active_cart_code")),
    }


def build_session_aware_order_type_hub(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    source_status_id: int,
    operator_user_id: int | None,
    cart_type_hint: str | None,
) -> dict[str, Any]:
    """
    Hub „Wybierz”:
    - bez aktywnej sesji → wolna kolejka (jak wcześniej),
    - z aktywną sesją operatora → produkty z SESJI (ten sam SSOT co lista produktów).
    ``order_count`` nadal = wolne do startu (osobna metryka).
    """
    from .wms_picking_product_list_service import (
        _assignable_order_ids_for_picking_type,
        build_picking_order_type_hub,
        build_wms_picking_product_lines,
    )

    free_hub = build_picking_order_type_hub(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        source_status_id=int(source_status_id),
    )

    proj = project_operator_active_picking_for_status(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        source_status_id=int(source_status_id),
        operator_user_id=operator_user_id,
        cart_type_hint=cart_type_hint,
        order_type="all",
    )
    cart_id = proj.get("active_cart_id")
    if not proj.get("has_active_session") or cart_id is None:
        return {
            "slices": free_hub,
            "active_projection": proj,
        }

    out: dict[str, dict[str, int]] = {}
    for ot in ("single", "multi", "all"):
        free_ids = _assignable_order_ids_for_picking_type(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            source_status_id=int(source_status_id),
            order_type=ot,  # type: ignore[arg-type]
        )
        try:
            lines = build_wms_picking_product_lines(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                source_status_id=int(source_status_id),
                order_type=ot,  # type: ignore[arg-type]
                cart_id=int(cart_id),
                recovery_mode=False,
            )
            stats = compute_session_stats_from_product_lines(lines.products or [])
            zebrane = int(stats.get("zebrane") or 0)
            do_zebrania = int(stats.get("do_zebrania") or 0)
            w_trakcie = int(stats.get("w_trakcie") or 0)
            total = zebrane + do_zebrania + w_trakcie
        except Exception:
            zebrane, total = 0, 0
        out[ot] = {
            "order_count": len(free_ids),
            "products_picked": zebrane,
            "products_total": total,
        }

    return {
        "slices": out,
        "active_projection": proj,
    }
