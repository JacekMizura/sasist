"""
Direct sales add-product / scan / auth probes — structured errors, no anonymous 500.

  python -m pytest backend/tests/direct_sales/test_add_product_api.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from backend.api.direct_sales import _map_add_product_exception
from backend.api.operational_features_deps import operational_sales_sessions_for_request
from backend.auth.deps import get_current_user
from backend.auth.warehouse_deps import require_operable_warehouse
from backend.main import app
from backend.platform_state import mark_tier0_ready
from backend.schemas.direct_sales_settings import DirectSalesSettingsConfig, DirectSalesSettingsRead
from backend.services.direct_sale.errors import DirectSaleError
from backend.services.direct_sale.scan_service import _resolve_product_from_scan, session_add_product_line
from backend.services.operational_features_context import OperationalFeaturesContext
from backend.services.product_sales_offers.errors import OfferStockUnavailableError


_CTX_ON = OperationalFeaturesContext(
    tenant_id=1,
    warehouse_id=1,
    operational_sales=True,
    immediate_wms_exclusion=True,
    operational_sales_sessions=True,
    operational_runtime=False,
    replenishment_engine=False,
    resolution_scope="test",
)


def _user():
    return SimpleNamespace(id=1, login="test", role="super_admin", is_active=True)


def _ops_sessions_override():
    """Avoid ContextVar bind/reset under TestClient (different asyncio context)."""
    return _CTX_ON


class TestMapAddProductException(unittest.TestCase):
    def test_direct_sale_error_passthrough(self):
        exc = DirectSaleError("brak", code="offer_stock_unavailable", http_status=400)
        mapped = _map_add_product_exception(exc)
        self.assertIs(mapped, exc)

    def test_requires_putaway_maps_to_503(self):
        mapped = _map_add_product_exception(
            Exception("sqlite3.OperationalError: no such column: stock_document_items.requires_putaway")
        )
        self.assertEqual(mapped.code, "SCHEMA_REQUIRES_PUTAWAY")
        self.assertEqual(mapped.http_status, 503)

    def test_generic_schema_maps_to_503(self):
        mapped = _map_add_product_exception(Exception("no such column: foo_bar"))
        self.assertEqual(mapped.code, "SCHEMA_MISMATCH")
        self.assertEqual(mapped.http_status, 503)


class TestProductResolution(unittest.TestCase):
    def test_resolve_ean_then_sku(self):
        db = MagicMock()
        with patch(
            "backend.services.direct_sale.scan_service.resolve_product_id",
            side_effect=[None, 42],
        ) as resolve:
            pid = _resolve_product_from_scan(db, tenant_id=1, code="SKU-9")
        self.assertEqual(pid, 42)
        self.assertEqual(resolve.call_count, 2)

    def test_empty_scan_raises(self):
        with self.assertRaises(DirectSaleError) as ctx:
            _resolve_product_from_scan(MagicMock(), tenant_id=1, code="  ")
        self.assertEqual(ctx.exception.code, "empty_scan")


class TestSessionAddProductDomain(unittest.TestCase):
    def test_closed_session_structured(self):
        sess = MagicMock(status="COMPLETED", tenant_id=1, warehouse_id=1)
        with self.assertRaises(DirectSaleError) as ctx:
            session_add_product_line(MagicMock(), sess, product_id=1, quantity=1.0)
        self.assertEqual(ctx.exception.code, "session_closed")

    def test_cross_tenant_product_404(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        sess = MagicMock(status="ACTIVE", tenant_id=1, warehouse_id=1, id=87)
        with self.assertRaises(DirectSaleError) as ctx:
            session_add_product_line(db, sess, product_id=999, quantity=1.0)
        self.assertEqual(ctx.exception.code, "product_not_found")
        self.assertEqual(ctx.exception.http_status, 404)

    def test_offer_stock_unavailable_maps_400(self):
        db = MagicMock()
        product = MagicMock(id=5, tenant_id=1)
        db.query.return_value.filter.return_value.first.return_value = product
        sess = MagicMock(status="ACTIVE", tenant_id=1, warehouse_id=1, id=87, lines=[])
        offer = MagicMock(id=3)
        with patch(
            "backend.services.direct_sale.scan_service._resolve_offer_for_line",
            return_value=offer,
        ), patch(
            "backend.services.direct_sale.scan_service.assert_offer_quantity_available",
            side_effect=OfferStockUnavailableError("Brak dostępnego stocku oferty."),
        ):
            with self.assertRaises(DirectSaleError) as ctx:
                session_add_product_line(db, sess, product_id=5, quantity=1.0)
        self.assertEqual(ctx.exception.code, "offer_stock_unavailable")
        self.assertEqual(ctx.exception.http_status, 400)


class TestAddProductApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        mark_tier0_ready()
        from backend.database import get_db

        def _db():
            db = MagicMock()
            db.commit = MagicMock()
            db.refresh = MagicMock()
            db.rollback = MagicMock()
            yield db

        app.dependency_overrides[get_current_user] = _user
        app.dependency_overrides[operational_sales_sessions_for_request] = _ops_sessions_override
        app.dependency_overrides[get_db] = _db
        cls.client = TestClient(app, raise_server_exceptions=False)
        cls._get_db = get_db

    @classmethod
    def tearDownClass(cls) -> None:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(operational_sales_sessions_for_request, None)
        app.dependency_overrides.pop(cls._get_db, None)

    def test_a_add_product_200(self):
        line = MagicMock(id=11, product_id=5, quantity=1.0)
        sess = MagicMock(id=87, tenant_id=1, warehouse_id=1, status="ACTIVE", operator_user_id=None)
        with patch(
            "backend.api.direct_sales._require_session",
            return_value=sess,
        ), patch(
            "backend.api.direct_sales.add_product_to_session",
            return_value=(line, []),
        ):
            r = self.client.post(
                "/api/direct-sales/session/87/add-product",
                params={"tenant_id": 1, "warehouse_id": 1},
                json={"product_id": 5, "quantity": 1},
            )
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertEqual(body["product_id"], 5)
        self.assertEqual(body["line_id"], 11)

    def test_b_scan_ean_200(self):
        line = MagicMock(id=12, product_id=5, quantity=1.0)
        sess = MagicMock(id=87, tenant_id=1, warehouse_id=1, status="ACTIVE", operator_user_id=None)
        with patch(
            "backend.api.direct_sales._require_session",
            return_value=sess,
        ), patch(
            "backend.api.direct_sales.session_scan_add_line",
            return_value=(line, []),
        ):
            r = self.client.post(
                "/api/direct-sales/session/87/scan",
                params={"tenant_id": 1, "warehouse_id": 1},
                json={"code": "5901234567890", "quantity": 1},
            )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["product_id"], 5)

    def test_d_second_add_same_product_ok(self):
        line = MagicMock(id=13, product_id=5, quantity=1.0)
        sess = MagicMock(id=87, tenant_id=1, warehouse_id=1, status="ACTIVE", operator_user_id=None)
        with patch(
            "backend.api.direct_sales._require_session",
            return_value=sess,
        ), patch(
            "backend.api.direct_sales.add_product_to_session",
            return_value=(line, []),
        ) as add:
            r1 = self.client.post(
                "/api/direct-sales/session/87/add-product",
                params={"tenant_id": 1, "warehouse_id": 1},
                json={"product_id": 5, "quantity": 1},
            )
            r2 = self.client.post(
                "/api/direct-sales/session/87/add-product",
                params={"tenant_id": 1, "warehouse_id": 1},
                json={"product_id": 5, "quantity": 1},
            )
        self.assertEqual(r1.status_code, 200, r1.text)
        self.assertEqual(r2.status_code, 200, r2.text)
        self.assertEqual(add.call_count, 2)

    def test_e_no_stock_400_structured(self):
        sess = MagicMock(id=87, tenant_id=1, warehouse_id=1, status="ACTIVE", operator_user_id=None)
        with patch(
            "backend.api.direct_sales._require_session",
            return_value=sess,
        ), patch(
            "backend.api.direct_sales.add_product_to_session",
            side_effect=DirectSaleError(
                "Brak dostępnego stocku oferty.",
                code="offer_stock_unavailable",
                http_status=400,
            ),
        ):
            r = self.client.post(
                "/api/direct-sales/session/87/add-product",
                params={"tenant_id": 1, "warehouse_id": 1},
                json={"product_id": 5, "quantity": 1},
            )
        self.assertEqual(r.status_code, 400, r.text)
        detail = r.json()["detail"]
        self.assertEqual(detail["code"], "offer_stock_unavailable")
        self.assertIn("message", detail)

    def test_h_closed_session_4xx(self):
        sess = MagicMock(id=87, tenant_id=1, warehouse_id=1, status="COMPLETED", operator_user_id=None)
        with patch(
            "backend.api.direct_sales._require_session",
            return_value=sess,
        ), patch(
            "backend.api.direct_sales.add_product_to_session",
            side_effect=DirectSaleError("Sesja nie przyjmuje pozycji.", code="session_closed"),
        ):
            r = self.client.post(
                "/api/direct-sales/session/87/add-product",
                params={"tenant_id": 1, "warehouse_id": 1},
                json={"product_id": 5, "quantity": 1},
            )
        self.assertEqual(r.status_code, 400, r.text)
        self.assertEqual(r.json()["detail"]["code"], "session_closed")

    def test_requires_putaway_schema_error_503_not_anonymous(self):
        sess = MagicMock(id=87, tenant_id=1, warehouse_id=1, status="ACTIVE", operator_user_id=None)
        with patch(
            "backend.api.direct_sales._require_session",
            return_value=sess,
        ), patch(
            "backend.api.direct_sales.add_product_to_session",
            side_effect=Exception("no such column: stock_document_items.requires_putaway"),
        ):
            r = self.client.post(
                "/api/direct-sales/session/87/add-product",
                params={"tenant_id": 1, "warehouse_id": 1},
                json={"product_id": 5, "quantity": 1},
            )
        self.assertEqual(r.status_code, 503, r.text)
        self.assertEqual(r.json()["detail"]["code"], "SCHEMA_REQUIRES_PUTAWAY")


class TestAuthProbes(unittest.TestCase):
    """J/K: same get_current_user / require_operable_warehouse as other WMS routes."""

    @classmethod
    def setUpClass(cls) -> None:
        mark_tier0_ready()
        cls.client = TestClient(app, raise_server_exceptions=False)

    def tearDown(self) -> None:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_operable_warehouse, None)

    def test_j_features_401_without_auth(self):
        app.dependency_overrides.pop(get_current_user, None)
        r = self.client.get(
            "/api/operational/features",
            params={"tenant_id": 1, "warehouse_id": 1},
        )
        self.assertEqual(r.status_code, 401)

    def test_j_features_200_with_auth(self):
        app.dependency_overrides[get_current_user] = _user
        with patch(
            "backend.api.operational_features.build_feature_debug_bundle",
            return_value={
                "resolved": {
                    "direct_sales": True,
                    "runtime": False,
                    "replenishment": False,
                }
            },
        ):
            r = self.client.get(
                "/api/operational/features",
                params={"tenant_id": 1, "warehouse_id": 1},
            )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(r.json()["direct_sales"])

    def test_k_direct_sales_settings_401_without_auth(self):
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_operable_warehouse, None)
        r = self.client.get(
            "/api/wms/settings/direct-sales",
            params={"tenant_id": 1, "warehouse_id": 1},
        )
        self.assertEqual(r.status_code, 401)

    def test_k_direct_sales_settings_200_with_auth(self):
        app.dependency_overrides[get_current_user] = _user
        app.dependency_overrides[require_operable_warehouse] = lambda: 1
        cfg = DirectSalesSettingsConfig()
        fake = DirectSalesSettingsRead(
            tenant_id=1,
            warehouse_id=1,
            resolved=cfg,
            tenant_defaults=cfg,
            warehouse_overrides=None,
            has_warehouse_override=False,
        )
        with patch(
            "backend.api.wms_settings.resolve_direct_sales_settings",
            return_value=fake,
        ):
            r = self.client.get(
                "/api/wms/settings/direct-sales",
                params={"tenant_id": 1, "warehouse_id": 1},
            )
        self.assertEqual(r.status_code, 200, r.text)


class TestCommercialAvailabilitySelfHeal(unittest.TestCase):
    def test_missing_requires_putaway_retries(self):
        from backend.services import commercial_availability_service as cas

        db = MagicMock()
        first = Exception("no such column: stock_document_items.requires_putaway")
        query = MagicMock()
        query.join.return_value.filter.return_value.order_by.return_value.all.side_effect = [
            first,
            [],
        ]
        db.query.return_value = query
        db.get_bind.return_value = MagicMock()

        with patch(
            "backend.db.schema_upgrade.ensure_stock_document_item_requires_putaway_column"
        ) as ensure:
            out = cas._purchase_lines_for_products(
                db, tenant_id=1, warehouse_id=1, product_ids=[5]
            )
        ensure.assert_called_once()
        self.assertEqual(out, {})


if __name__ == "__main__":
    unittest.main()
