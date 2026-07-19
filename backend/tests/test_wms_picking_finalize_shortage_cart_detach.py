"""
Finalize picking with shortage must detach via CartLifecycle.

  python -m pytest backend/tests/test_wms_picking_finalize_shortage_cart_detach.py -q
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.models.enums import CartStatus
from backend.services.cart_picking_lifecycle_service import finish_picking_after_wms_finalize
from backend.services.wms_picking_shortage_settings_service import is_shortage_auto_detach_enabled


def _cart(**kw):
    defaults = {
        "id": 3,
        "tenant_id": 1,
        "warehouse_id": 1,
        "code": "CART-0001",
        "status": CartStatus.PICKING.value,
        "assigned_user_id": 7,
        "current_session_id": 55,
        "baskets": [],
        "used_volume": 10.0,
    }
    defaults.update(kw)
    return SimpleNamespace(**defaults)


def _order(oid: int, *, cart_id: int | None = 3):
    return SimpleNamespace(
        id=oid,
        number=str(oid),
        cart_id=cart_id,
        picking_session_id=55 if cart_id else None,
        basket_id=None,
        status="MISSING",
        fulfillment_state="MISSING",
        picking_started_at=None,
        total_volume_dm3=1.0,
        tenant_id=1,
        warehouse_id=1,
    )


class TestAutoDetachSemantics:
    def test_disable_false_means_detach_on(self):
        assert is_shortage_auto_detach_enabled(
            SimpleNamespace(disable_auto_detach_missing_orders_from_carts=False)
        )

    def test_disable_true_means_detach_off(self):
        assert not is_shortage_auto_detach_enabled(
            SimpleNamespace(disable_auto_detach_missing_orders_from_carts=True)
        )


class TestFinishPickingAfterWmsFinalize:
    def test_all_shortage_detaches_and_releases_cart(self):
        cart = _cart()
        o1 = _order(1215)
        o2 = _order(1231)
        released = {"n": 0}
        detached_calls: list[int] = []

        def release_side(db_arg, *, cart, reason="", _already_locked=False):
            released["n"] += 1
            cart.status = CartStatus.AVAILABLE.value
            cart.assigned_user_id = None
            cart.used_volume = 0.0

        def status_of(c):
            raw = (getattr(c, "status", None) or "PICKING").upper()
            return CartStatus[raw] if raw in CartStatus.__members__ else CartStatus.PICKING

        def detach_side(db_arg, **kw):
            oid = int(kw["order_id"])
            detached_calls.append(oid)
            target = o1 if oid == 1215 else o2
            target.cart_id = None
            target.picking_session_id = None
            return {"cart_released": False, "order_id": oid}

        with (
            patch(
                "backend.services.cart_picking_lifecycle_service._lock_cart",
                return_value=cart,
            ),
            patch(
                "backend.services.cart_picking_lifecycle_service.get_cart_status",
                side_effect=status_of,
            ),
            patch(
                "backend.services.cart_picking_lifecycle_service._orders_on_cart",
                side_effect=lambda db_arg, cid: [o for o in (o1, o2) if o.cart_id == cid],
            ),
            patch(
                "backend.services.cart_picking_lifecycle_service.detach_order_from_cart",
                side_effect=detach_side,
            ),
            patch(
                "backend.services.cart_picking_lifecycle_service.find_open_picking_session",
                return_value=SimpleNamespace(id=55, completed_at=None),
            ),
            patch(
                "backend.services.cart_picking_lifecycle_service.release_cart",
                side_effect=release_side,
            ),
            patch("backend.services.cart_picking_lifecycle_service._record_event"),
            patch(
                "backend.services.cart_capacity.engine.order_volume_dm3",
                return_value=1.0,
            ),
            patch("backend.services.cart_stats_service.list_orders_on_cart", return_value=[]),
        ):
            out = finish_picking_after_wms_finalize(
                MagicMock(),
                cart=cart,
                orders=[o1, o2],
                packing_bound_order_ids=[],
                shortage_detach_order_ids=[1215, 1231],
                operator_user_id=7,
            )

        assert out["cart_released"] is True
        assert set(out["detached_order_ids"]) == {1215, 1231}
        assert set(detached_calls) == {1215, 1231}
        assert released["n"] == 1

    def test_mixed_detaches_shortage_keeps_picked_for_finish(self):
        cart = _cart()
        picked = _order(100)
        shortage = _order(200)
        finish_calls: list = []

        def finish_side(db_arg, *, cart, orders=None, operator_user_id=None):
            finish_calls.append([int(o.id) for o in (orders or [])])
            cart.status = CartStatus.READY_FOR_PACKING.value

        def status_of(c):
            raw = (getattr(c, "status", None) or "PICKING").upper()
            return CartStatus[raw] if raw in CartStatus.__members__ else CartStatus.PICKING

        def orders_on(_db, cid):
            return [o for o in (picked, shortage) if o.cart_id == cid]

        def detach_side(db_arg, **kw):
            shortage.cart_id = None
            shortage.picking_session_id = None
            return {"cart_released": False, "order_id": int(kw["order_id"])}

        with (
            patch(
                "backend.services.cart_picking_lifecycle_service._lock_cart",
                return_value=cart,
            ),
            patch(
                "backend.services.cart_picking_lifecycle_service.get_cart_status",
                side_effect=status_of,
            ),
            patch(
                "backend.services.cart_picking_lifecycle_service._orders_on_cart",
                side_effect=orders_on,
            ),
            patch(
                "backend.services.cart_picking_lifecycle_service.detach_order_from_cart",
                side_effect=detach_side,
            ),
            patch(
                "backend.services.cart_picking_lifecycle_service.finish_picking",
                side_effect=finish_side,
            ),
            patch("backend.services.cart_picking_lifecycle_service._record_event"),
            patch(
                "backend.services.cart_capacity.engine.order_volume_dm3",
                return_value=1.0,
            ),
            patch("backend.services.cart_picking_lifecycle_service._after_mutation"),
            patch(
                "backend.services.cart_stats_service.list_orders_on_cart",
                side_effect=lambda db_arg, c: orders_on(db_arg, int(c.id)),
            ),
        ):
            out = finish_picking_after_wms_finalize(
                MagicMock(),
                cart=cart,
                orders=[picked, shortage],
                packing_bound_order_ids=[100],
                shortage_detach_order_ids=[200],
                operator_user_id=7,
            )

        assert out["cart_released"] is False
        assert out["detached_order_ids"] == [200]
        assert out["packing_order_ids"] == [100]
        assert shortage.cart_id is None
        assert picked.cart_id == 3
        assert finish_calls == [[100]]

    def test_heal_ready_for_packing_detaches(self):
        cart = _cart(status=CartStatus.READY_FOR_PACKING.value)
        o1 = _order(1215)
        detached: list[int] = []

        def detach_side(db_arg, **kw):
            detached.append(int(kw["order_id"]))
            o1.cart_id = None
            return {"cart_released": False}

        def status_of(c):
            raw = (getattr(c, "status", None) or "").upper()
            if raw == "READY_FOR_PACKING":
                return CartStatus.READY_FOR_PACKING
            if raw == "AVAILABLE":
                return CartStatus.AVAILABLE
            return CartStatus.PICKING

        with (
            patch(
                "backend.services.cart_picking_lifecycle_service._lock_cart",
                return_value=cart,
            ),
            patch(
                "backend.services.cart_picking_lifecycle_service.get_cart_status",
                side_effect=status_of,
            ),
            patch(
                "backend.services.cart_picking_lifecycle_service._orders_on_cart",
                side_effect=lambda db_arg, cid: [o1] if o1.cart_id == cid else [],
            ),
            patch(
                "backend.services.cart_picking_lifecycle_service.detach_order_from_cart",
                side_effect=detach_side,
            ),
            patch(
                "backend.services.cart_picking_lifecycle_service.release_cart",
                side_effect=lambda *a, **k: setattr(cart, "status", CartStatus.AVAILABLE.value),
            ),
            patch(
                "backend.services.cart_capacity.engine.order_volume_dm3",
                return_value=1.0,
            ),
        ):
            out = finish_picking_after_wms_finalize(
                MagicMock(),
                cart=cart,
                orders=[o1],
                packing_bound_order_ids=[],
                shortage_detach_order_ids=[1215],
                operator_user_id=1,
            )
        assert out.get("healed_ready_for_packing") is True
        assert detached == [1215]
        assert out["cart_released"] is True
