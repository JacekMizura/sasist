"""
Direct sale /complete — no ORM access after rollback; unwrap PendingRollbackError.

  python -m pytest backend/tests/test_direct_sale_complete_rollback.py -q
"""

from __future__ import annotations

import unittest

from sqlalchemy.exc import IntegrityError, PendingRollbackError

from backend.services.direct_sale.complete_debug_log import (
    root_complete_exception,
    sqlalchemy_exception_details,
)


class TestCompleteRollbackHelpers(unittest.TestCase):
    def test_root_complete_exception_unwraps_pending_rollback(self):
        root = IntegrityError("stmt", {}, Exception("FOREIGN KEY constraint failed"))
        wrapped = PendingRollbackError(
            "This Session's transaction has been rolled back due to a previous exception during flush."
        )
        wrapped.__cause__ = root
        self.assertIs(root_complete_exception(wrapped), root)

    def test_sqlalchemy_exception_details_surfaces_orig_not_pending_rollback(self):
        root = IntegrityError("stmt", {}, Exception("FOREIGN KEY constraint failed"))
        wrapped = PendingRollbackError("pending rollback")
        wrapped.__cause__ = root
        details = sqlalchemy_exception_details(wrapped)
        self.assertEqual(details["error_type"], "IntegrityError")
        self.assertEqual(details["wrapped_error_type"], "PendingRollbackError")
        self.assertIn("FOREIGN KEY", details.get("orig_message", str(root)))


if __name__ == "__main__":
    unittest.main()
