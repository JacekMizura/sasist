"""Force generate_documents SQL failure (missing document_type_id) and POST /complete."""
from __future__ import annotations

import json
import shutil
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

DB = ROOT / "backend" / "test.db"
BACKUP = ROOT / "backend" / "test.db.bak_trigger"


def _strip_sale_documents_extended_columns() -> None:
    shutil.copy2(DB, BACKUP)
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE sale_documents_old AS
        SELECT id, tenant_id, warehouse_id, order_id, document_series_id,
               document_number, panel_document_type, series_type, created_at
        FROM sale_documents
        """
    )
    cur.execute("DROP TABLE sale_documents")
    cur.execute(
        """
        CREATE TABLE sale_documents (
            id VARCHAR(36) PRIMARY KEY,
            tenant_id INTEGER NOT NULL,
            warehouse_id INTEGER NOT NULL,
            order_id INTEGER NOT NULL,
            document_series_id VARCHAR(36) NOT NULL,
            document_number VARCHAR(128) NOT NULL,
            panel_document_type VARCHAR(16) NOT NULL,
            series_type VARCHAR(24) NOT NULL DEFAULT 'SALE',
            created_at DATETIME
        )
        """
    )
    cur.execute("INSERT INTO sale_documents SELECT * FROM sale_documents_old")
    cur.execute("DROP TABLE sale_documents_old")
    conn.commit()
    conn.close()


def _restore_db() -> None:
    if BACKUP.exists():
        shutil.copy2(BACKUP, DB)
        BACKUP.unlink()


def main() -> None:
    from fastapi.testclient import TestClient
    from backend.auth.deps import get_current_user
    from backend.main import app
    from backend.models.app_user import AppUser
    from backend.api.operational_features_deps import operational_sales_sessions_for_request
    from backend.services.operational_features_context import OperationalFeaturesContext
    from backend.database import SessionLocal
    from backend.services.direct_sale.line_service import add_product_to_session
    from backend.services.direct_sale.complete_service import start_direct_sale_payment
    from backend.services.direct_sale.session_service import create_session, get_session_for_complete

    TENANT_ID = 1
    WAREHOUSE_ID = 1

    import backend.services.direct_sale.complete_service as cs

    cs._complete_schema_ready = True
    cs._ensure_direct_sale_complete_schema = lambda: None  # type: ignore[method-assign]

    _strip_sale_documents_extended_columns()
    try:
        db = SessionLocal()
        try:
            sess = create_session(
                db, tenant_id=1, warehouse_id=1, operator_user_id=1, issue_strategy="STRICT_LOCATION"
            )
            db.commit()
            sid = int(sess.id)
            sess = get_session_for_complete(db, session_id=sid, tenant_id=1)
            add_product_to_session(db, sess, product_id=309, quantity=1.0, source_location_id=1)
            db.commit()
            sess = get_session_for_complete(db, session_id=sid, tenant_id=1)
            start_direct_sale_payment(db, sess, payment_method="CASH", performed_by_user_id=1)
            db.commit()
        finally:
            db.close()

        def _fake_user() -> AppUser:
            u = AppUser()
            u.id = 1
            return u

        def _fake_ops():
            yield OperationalFeaturesContext(
                tenant_id=1,
                warehouse_id=1,
                operational_sales=True,
                immediate_wms_exclusion=True,
                operational_sales_sessions=True,
                operational_runtime=False,
                replenishment_engine=False,
                resolution_scope="test",
            )

        app.dependency_overrides[get_current_user] = _fake_user
        app.dependency_overrides[operational_sales_sessions_for_request] = _fake_ops
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post(
            f"/api/direct-sales/session/{sid}/complete",
            params={"tenant_id": TENANT_ID, "warehouse_id": WAREHOUSE_ID},
            json={"payment_method": "CASH", "document_subtype": "RECEIPT"},
        )
        print("HTTP", resp.status_code)
        print(json.dumps(resp.json(), indent=2, ensure_ascii=False))
    finally:
        _restore_db()


if __name__ == "__main__":
    main()
