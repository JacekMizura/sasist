"""
Direct sale /complete — raw exception logging; no SQL dump in str/repr.

  python -m pytest backend/tests/test_direct_sale_complete_rollback.py -q
"""

from __future__ import annotations

import unittest

from sqlalchemy.exc import IntegrityError, PendingRollbackError

import inspect

from backend.services.direct_sale import pipeline_orchestrator
from backend.services.direct_sale.complete_debug_log import (
    log_stage_failure,
    root_complete_exception,
    safe_exception_repr,
    safe_exception_str,
)


class TestCompleteRollbackHelpers(unittest.TestCase):
    def test_root_complete_exception_unwraps_pending_rollback(self):
        root = IntegrityError("stmt", {}, Exception("FOREIGN KEY constraint failed"))
        wrapped = PendingRollbackError(
            "This Session's transaction has been rolled back due to a previous exception during flush."
        )
        wrapped.__cause__ = root
        self.assertIs(root_complete_exception(wrapped), root)

    def test_root_complete_exception_unwraps_pending_rollback_via_context(self):
        root = IntegrityError("stmt", {}, Exception("FOREIGN KEY constraint failed"))
        wrapped = PendingRollbackError("pending rollback")
        wrapped.__context__ = root
        self.assertIs(root_complete_exception(wrapped), root)

    def test_generate_documents_does_not_swallow_db_errors(self):
        source = inspect.getsource(pipeline_orchestrator._stage_generate_documents)
        self.assertNotIn("soft_fail", source)
        self.assertNotIn("except Exception as doc_exc", source)

    def test_log_stage_failure_returns_traceback(self):
        root = IntegrityError("stmt", {}, Exception("FOREIGN KEY constraint failed"))
        tb = log_stage_failure(root, stage="generate_documents", session_id=1)
        self.assertIn("IntegrityError", tb)
        self.assertIn("FOREIGN KEY", tb)

    def test_safe_exception_str_uses_orig_not_full_sql(self):
        root = IntegrityError(
            "SELECT direct_sale_sessions.id, direct_sale_session_lines.id FROM direct_sale_sessions",
            {},
            Exception("FOREIGN KEY constraint failed"),
        )
        wrapped = PendingRollbackError("pending rollback")
        wrapped.__cause__ = root
        text = safe_exception_str(wrapped)
        self.assertIn("FOREIGN KEY", text)
        self.assertNotIn("direct_sale_sessions", text)

    def test_safe_exception_repr_omits_sql_statement(self):
        root = IntegrityError(
            "SELECT direct_sale_sessions.id FROM direct_sale_sessions",
            {},
            Exception("no such column: foo"),
        )
        rep = safe_exception_repr(root)
        self.assertIn("IntegrityError", rep)
        self.assertNotIn("SELECT direct_sale_sessions", rep)


if __name__ == "__main__":
    unittest.main()
