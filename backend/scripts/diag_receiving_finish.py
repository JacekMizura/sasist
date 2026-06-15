"""Diagnose POST /api/wms/receiving/pz/{id}/finish validation chain (read-only)."""

from __future__ import annotations

import argparse
import sys

from sqlalchemy import func

from backend.database import SessionLocal
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.services.stock_document_service import ensure_pz_document_warehouse_resolved
from backend.services.tenant_default_warehouse import ERR_CHOOSE_WAREHOUSE_FOR_DOCUMENT
from backend.services.wms_receiving_service import _assert_receiving_session_open


def main() -> int:
    parser = argparse.ArgumentParser(description="Diagnose receiving finish blockers for a PZ")
    parser.add_argument("document_id", type=int)
    parser.add_argument("--tenant-id", type=int, default=1)
    args = parser.parse_args()

    db = SessionLocal()
    try:
        doc = (
            db.query(StockDocument)
            .filter(StockDocument.id == args.document_id, StockDocument.tenant_id == args.tenant_id)
            .first()
        )
        if not doc:
            print(f"DOCUMENT {args.document_id}: NOT FOUND (tenant_id={args.tenant_id})")
            return 1

        agg = (
            db.query(
                func.count(StockDocumentItem.id),
                func.coalesce(func.sum(StockDocumentItem.ordered_quantity), 0.0),
                func.coalesce(func.sum(StockDocumentItem.received_quantity), 0.0),
            )
            .filter(StockDocumentItem.document_id == args.document_id)
            .one()
        )
        lines_count, expected_qty, received_qty = int(agg[0]), float(agg[1]), float(agg[2])

        print("=== DOCUMENT ===")
        print(f"id={doc.id}")
        print(f"tenant_id={doc.tenant_id}")
        print(f"status={doc.status!r}")
        print(f"warehouse_id={doc.warehouse_id}")
        print(f"document_type={doc.document_type!r}")
        print(f"receiving_status={getattr(doc, 'receiving_status', None)!r}")
        print(f"putaway_status={getattr(doc, 'putaway_status', None)!r}")
        print(f"location_id={doc.location_id}")
        print(f"lines_count={lines_count}")
        print(f"expected_qty (sum ordered_quantity)={expected_qty}")
        print(f"received_qty (sum received_quantity)={received_qty}")
        print()

        checks: list[tuple[str, bool, str]] = []

        checks.append(("document_exists", True, "pass"))

        ok_draft = str(doc.status or "") == "draft"
        checks.append(
            (
                "status_is_draft",
                ok_draft,
                "pass" if ok_draft else f'fail: Only draft documents can be edited (actual status={doc.status!r})',
            )
        )

        dt_up = str(doc.document_type or "").strip().upper()
        ok_type = dt_up in ("PZ", "Z_PZ", "PZ_RT", "RETURN_RECEIPT")
        checks.append(
            (
                "document_type_pz",
                ok_type,
                "pass" if ok_type else f"fail: Not a PZ document (actual={dt_up!r})",
            )
        )

        try:
            ensure_pz_document_warehouse_resolved(db, doc)
            checks.append(("pz_warehouse_resolved", True, f"pass warehouse_id={doc.warehouse_id}"))
        except ValueError as e:
            checks.append(("pz_warehouse_resolved", False, f"fail: {e}"))

        rs = str(getattr(doc, "receiving_status", "") or "").strip().upper()
        try:
            _assert_receiving_session_open(doc)
            checks.append(("receiving_session_open", True, f"pass receiving_status={rs!r}"))
        except ValueError as e:
            checks.append(("receiving_session_open", False, f"fail: {e} (receiving_status={rs!r})"))

        print("=== VALIDATION CHAIN (finish_wms_receiving_pz) ===")
        blocking = None
        for name, ok, result in checks:
            print(f"[RECEIVING_FINISH_VALIDATE] check={name} result={result}")
            if not ok and blocking is None:
                blocking = (name, result)

        print()
        if blocking:
            name, result = blocking
            print("ROOT CAUSE (first failing check):")
            print(f"  check={name}")
            print(f"  HTTP 400 detail would be: {result.split('fail: ', 1)[-1] if 'fail:' in result else result}")
        else:
            print("All pre-patch checks PASS — 400 would come from patch_lines (Unknown line id / qty) if body invalid.")
        return 0 if blocking is None else 2
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
