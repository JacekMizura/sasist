"""POST /api/direct-sales/session/{id}/complete — print raw HTTP JSON."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient

from backend.auth.deps import get_current_user
from backend.database import SessionLocal
from backend.main import app
from backend.models.app_user import AppUser
from backend.models.commerce_operational import DirectSaleSession
from backend.api.operational_features_deps import operational_sales_sessions_for_request
from backend.services.operational_features_context import (
    OperationalFeaturesContext,
    bind_operational_features,
    reset_operational_features,
)
from backend.services.direct_sale.line_service import add_product_to_session
from backend.services.direct_sale.complete_service import start_direct_sale_payment
from backend.services.direct_sale.session_service import create_session, get_session_for_complete

TENANT_ID = 1
WAREHOUSE_ID = 1
PRODUCT_ID = 309
LOCATION_ID = 1


def _fake_user() -> AppUser:
    u = AppUser()
    u.id = 1
    u.login = "admin"
    return u


def _fake_ops():
    ctx = OperationalFeaturesContext(
        tenant_id=TENANT_ID,
        warehouse_id=WAREHOUSE_ID,
        operational_sales=True,
        immediate_wms_exclusion=True,
        operational_sales_sessions=True,
        operational_runtime=False,
        replenishment_engine=False,
        resolution_scope="test",
    )
    yield ctx


def _prepare_checkout_session() -> int:
    db = SessionLocal()
    try:
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
        sess = get_session_for_complete(db, session_id=sid, tenant_id=TENANT_ID)
        add_product_to_session(
            db,
            sess,
            product_id=PRODUCT_ID,
            quantity=99999.0,
            source_location_id=LOCATION_ID,
        )
        db.commit()
        sess = get_session_for_complete(db, session_id=sid, tenant_id=TENANT_ID)
        start_direct_sale_payment(db, sess, payment_method="CASH", performed_by_user_id=1)
        db.commit()
        return sid
    finally:
        db.close()


def _pick_session_id() -> int:
    return _prepare_checkout_session()


def main() -> None:
    session_id = _pick_session_id()
    app.dependency_overrides[get_current_user] = _fake_user
    app.dependency_overrides[operational_sales_sessions_for_request] = _fake_ops
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.post(
        f"/api/direct-sales/session/{session_id}/complete",
        params={"tenant_id": TENANT_ID, "warehouse_id": WAREHOUSE_ID},
        json={"payment_method": "CASH", "document_subtype": "RECEIPT"},
    )
    print("HTTP", resp.status_code)
    print(json.dumps(resp.json(), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
