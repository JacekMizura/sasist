"""Cart FOR UPDATE must not use joinedload (PG outer-join restriction)."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch, call

from backend.services.cart_picking_lifecycle_service import _lock_cart, _lock_cart_by_keys
from backend.models.cart import Cart


class TestCartForUpdateNoOuterJoin(unittest.TestCase):
    def test_lock_cart_for_update_without_joinedload(self) -> None:
        cart = MagicMock(spec=Cart)
        cart.id = 42

        locked = MagicMock(spec=Cart)
        locked.id = 42

        populated = MagicMock(spec=Cart)
        populated.id = 42

        db = MagicMock()
        # First query chain: filter → with_for_update → first
        q_lock = MagicMock()
        q_lock.filter.return_value = q_lock
        q_lock.with_for_update.return_value = q_lock
        q_lock.first.return_value = locked

        # Second query: options(selectinload) → filter → first
        q_load = MagicMock()
        q_load.options.return_value = q_load
        q_load.filter.return_value = q_load
        q_load.first.return_value = populated

        db.query.side_effect = [q_lock, q_load]

        out = _lock_cart(db, cart)

        self.assertIs(out, populated)
        # Lock query: no .options(...) before with_for_update
        q_lock.options.assert_not_called()
        q_lock.with_for_update.assert_called_once_with()
        # Baskets loaded separately via options(selectinload)
        q_load.options.assert_called_once()
        q_load.with_for_update.assert_not_called()

    def test_lock_cart_by_keys_same_pattern(self) -> None:
        locked = MagicMock(spec=Cart)
        locked.id = 7
        populated = MagicMock(spec=Cart)
        populated.id = 7

        db = MagicMock()
        q_lock = MagicMock()
        q_lock.filter.return_value = q_lock
        q_lock.with_for_update.return_value = q_lock
        q_lock.first.return_value = locked

        q_load = MagicMock()
        q_load.options.return_value = q_load
        q_load.filter.return_value = q_load
        q_load.first.return_value = populated

        db.query.side_effect = [q_lock, q_load]

        out = _lock_cart_by_keys(db, cart_id=7, tenant_id=1, warehouse_id=2)
        self.assertIs(out, populated)
        q_lock.options.assert_not_called()
        q_lock.with_for_update.assert_called_once_with()
        q_load.with_for_update.assert_not_called()


if __name__ == "__main__":
    unittest.main()
