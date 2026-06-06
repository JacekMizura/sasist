"""
End-to-end direct sale complete against backend/test.db.
Creates session → add line → start payment → complete.
"""
from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.database import SessionLocal
from backend.services.direct_sale.complete_debug_log import real_failure_json_response
from backend.services.direct_sale.complete_service import (
    complete_direct_sale_session,
    start_direct_sale_payment,
)
from backend.services.direct_sale.line_service import add_product_to_session
from backend.services.direct_sale.session_service import create_session, get_session_for_complete


TENANT_ID = 1
WAREHOUSE_ID = 1
PRODUCT_ID = 309
LOCATION_ID = 1


def main() -> int:
    db = SessionLocal()
    try:
        print("=== Creating session ===")
        sess = create_session(
            db,
            tenant_id=TENANT_ID,
            warehouse_id=WAREHOUSE_ID,
            operator_user_id=1,
            issue_strategy="STRICT_LOCATION",
        )
        db.commit()
        db.refresh(sess)
        sid = int(sess.id)
        print(f"session_id={sid}")

        print("=== Adding product ===")
        sess = get_session_for_complete(db, session_id=sid, tenant_id=TENANT_ID)
        add_product_to_session(
            db,
            sess,
            product_id=PRODUCT_ID,
            quantity=1.0,
            source_location_id=LOCATION_ID,
        )
        db.commit()
        db.refresh(sess)
        print(f"lines={len(sess.lines)}")

        print("=== Start payment ===")
        sess = get_session_for_complete(db, session_id=sid, tenant_id=TENANT_ID)
        start_direct_sale_payment(db, sess, payment_method="CASH", performed_by_user_id=1)
        db.commit()
        db.refresh(sess)
        print(f"status={sess.status} pipeline={sess.pipeline_status}")

        print("=== Complete ===")
        sess = get_session_for_complete(db, session_id=sid, tenant_id=TENANT_ID)
        try:
            result = complete_direct_sale_session(
                db,
                sess,
                payment_method="CASH",
                document_subtype="RECEIPT",
                performed_by_user_id=1,
            )
            if db.new or db.dirty or db.deleted:
                db.commit()
            print("SUCCESS")
            print(result)
            return 0
        except Exception as exc:
            db.rollback()
            print("\n=== RAW EXCEPTION ===")
            print(type(exc).__name__, str(exc))
            print(traceback.format_exc())
            resp = real_failure_json_response(
                exc,
                stage="e2e_repro",
                session_id=sid,
                tenant_id=TENANT_ID,
                warehouse_id=WAREHOUSE_ID,
            )
            print("\n=== JSON RESPONSE ===")
            print(json.dumps(json.loads(resp.body), indent=2))
            return 2
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
