"""
Reproduce POST /direct-sales/session/{id}/complete against backend/test.db.
Prints full exception + stage on failure.
"""
from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.database import SessionLocal
from backend.models.commerce_operational import DirectSaleSession, DirectSaleSessionLine
from backend.services.direct_sale.complete_debug_log import real_failure_json_response
from backend.services.direct_sale.complete_service import complete_direct_sale_session
from backend.services.direct_sale.session_service import get_session_for_complete


def main() -> int:
    db = SessionLocal()
    try:
        sessions = (
            db.query(DirectSaleSession)
            .order_by(DirectSaleSession.id.desc())
            .limit(20)
            .all()
        )
        print("=== Sessions ===")
        for s in sessions:
            lines = (
                db.query(DirectSaleSessionLine)
                .filter(DirectSaleSessionLine.session_id == s.id)
                .all()
            )
            print(
                f"id={s.id} status={s.status} pipeline={s.pipeline_status} "
                f"failed={s.pipeline_failed_stage} lines={len(lines)} order={s.order_id}"
            )

        target = None
        for s in sessions:
            st = str(s.status or "").upper()
            if st in {"CHECKOUT", "ACTIVE", "FAILED", "SUSPENDED"}:
                target = s
                break

        if target is None:
            print("\nNo completable session found — creating one is out of scope for this probe.")
            print("Use UI to create CHECKOUT session or extend this script.")
            return 1

        sid = int(target.id)
        tid = int(target.tenant_id)
        print(f"\n=== Attempting complete session_id={sid} tenant_id={tid} ===")
        sess = get_session_for_complete(db, session_id=sid, tenant_id=tid)
        if sess is None:
            print("Session not found after reload")
            return 1

        try:
            result = complete_direct_sale_session(
                db,
                sess,
                payment_method="CASH",
                document_subtype="RECEIPT",
                payment_splits=None,
                performed_by_user_id=1,
            )
            if db.new or db.dirty or db.deleted:
                db.commit()
            print("SUCCESS:", result)
            return 0
        except Exception as exc:
            tb = traceback.format_exc()
            print("\n=== RAW EXCEPTION ===")
            print(type(exc).__name__, str(exc))
            print(tb)
            resp = real_failure_json_response(
                exc,
                stage="repro_script",
                session_id=sid,
                tenant_id=tid,
                warehouse_id=int(sess.warehouse_id),
            )
            print("\n=== JSON RESPONSE BODY ===")
            print(json.dumps(json.loads(resp.body), indent=2))
            return 2
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
