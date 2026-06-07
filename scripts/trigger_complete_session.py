"""POST /complete for a specific session id."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient
from backend.auth.deps import get_current_user
from backend.main import app
from backend.models.app_user import AppUser
from backend.api.operational_features_deps import operational_sales_sessions_for_request
from backend.services.operational_features_context import OperationalFeaturesContext

TENANT_ID = 1
WAREHOUSE_ID = 1
SESSION_ID = int(sys.argv[1]) if len(sys.argv) > 1 else 3


def _fake_user() -> AppUser:
    u = AppUser()
    u.id = 1
    return u


def _fake_ops():
    yield OperationalFeaturesContext(
        tenant_id=TENANT_ID,
        warehouse_id=WAREHOUSE_ID,
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
    f"/api/direct-sales/session/{SESSION_ID}/complete",
    params={"tenant_id": TENANT_ID, "warehouse_id": WAREHOUSE_ID},
    json={"payment_method": "CASH", "document_subtype": "RECEIPT"},
)
print("HTTP", resp.status_code)
print(json.dumps(resp.json(), indent=2, ensure_ascii=False))
