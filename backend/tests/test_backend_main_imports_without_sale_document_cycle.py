"""Regression: backend.main must import without sale-document circular import."""

from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _run_isolated(code: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-c", code],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=180,
    )


class TestBackendMainImportsWithoutSaleDocumentCycle(unittest.TestCase):
    def test_create_sale_document_import_before_main(self) -> None:
        proc = _run_isolated(
            "from backend.services.wms_sale_document_service import create_sale_document; "
            "assert callable(create_sale_document); "
            "print('SALE_DOC_BEFORE_MAIN_OK')"
        )
        self.assertEqual(proc.returncode, 0, msg=proc.stderr or proc.stdout)
        self.assertIn("SALE_DOC_BEFORE_MAIN_OK", proc.stdout)

    def test_backend_main_imports_without_cycle(self) -> None:
        proc = _run_isolated(
            "import backend.main; "
            "assert hasattr(backend.main, 'app'); "
            "print('MAIN_IMPORT_OK')"
        )
        self.assertEqual(proc.returncode, 0, msg=proc.stderr or proc.stdout)
        self.assertIn("MAIN_IMPORT_OK", proc.stdout)
        self.assertNotIn("circular import", (proc.stderr or "").lower())

    def test_create_sale_document_import_after_main(self) -> None:
        proc = _run_isolated(
            "import backend.main; "
            "from backend.services.wms_sale_document_service import create_sale_document; "
            "assert callable(create_sale_document); "
            "print('SALE_DOC_AFTER_MAIN_OK')"
        )
        self.assertEqual(proc.returncode, 0, msg=proc.stderr or proc.stdout)
        self.assertIn("SALE_DOC_AFTER_MAIN_OK", proc.stdout)

    def test_direct_sale_package_import_stays_light(self) -> None:
        proc = _run_isolated(
            "import sys\n"
            "import backend.services.direct_sale as ds\n"
            "assert not hasattr(ds, 'complete_direct_sale_session')\n"
            "from backend.services.direct_sale import retail_customer_service as rcs\n"
            "assert callable(rcs.is_retail_system_customer)\n"
            "assert 'backend.workers.document_generation_worker' not in sys.modules\n"
            "print('DIRECT_SALE_LIGHT_OK')\n"
        )
        self.assertEqual(proc.returncode, 0, msg=proc.stderr or proc.stdout)
        self.assertIn("DIRECT_SALE_LIGHT_OK", proc.stdout)


if __name__ == "__main__":
    unittest.main()
