"""WMS topbar pins persistence + operational modes catalog alignment."""

from __future__ import annotations

import json
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base
from backend.models.app_user import AppUser, UserWmsProfile
from backend.models.tenant import Tenant
from backend.services.app_user_admin_service import (
    parse_wms_topbar_pins,
    save_wms_topbar_pins,
    wms_profile_response,
)
from backend.wms_operational_modes import WMS_OPERATIONAL_MODES, is_valid_wms_mode


class WmsTopbarPinsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.db.add(Tenant(id=1, name="T"))
        self.db.add(
            AppUser(
                id=1,
                login="op",
                email="op@example.com",
                password_hash="x",
                role="user",
                is_active=True,
                language="pl",
            )
        )
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_parse_null_means_no_saved_config(self) -> None:
        self.assertIsNone(parse_wms_topbar_pins(None))
        self.assertIsNone(parse_wms_topbar_pins(""))

    def test_save_and_load_pins(self) -> None:
        pins = [
            {"key": "packing", "pinned": True, "order": 0},
            {"key": "picking", "pinned": True, "order": 1},
            {"key": "receiving", "pinned": False, "order": 0},
        ]
        saved = save_wms_topbar_pins(self.db, 1, pins)
        self.db.commit()
        self.assertEqual(len(saved), 3)
        wp = wms_profile_response(self.db, 1)
        self.assertIsNotNone(wp["wms_topbar_pins"])
        self.assertEqual(wp["wms_topbar_pins"][0]["key"], "packing")
        row = self.db.query(UserWmsProfile).filter(UserWmsProfile.user_id == 1).one()
        raw = json.loads(row.wms_topbar_pins_json or "[]")
        self.assertEqual(raw[1]["key"], "picking")

    def test_catalog_has_module_modes(self) -> None:
        for key in (
            "receiving",
            "putaway",
            "picking",
            "packing",
            "issues",
            "inventory",
            "product_preview",
            "production",
            "mm",
            "consolidations",
            "direct_sales",
            "operations",
        ):
            self.assertTrue(is_valid_wms_mode(key), key)
        labels = {k: v for k, v in WMS_OPERATIONAL_MODES}
        self.assertEqual(labels["issues"], "Braki")
        self.assertEqual(labels["putaway"], "Rozlokowanie PZ")


if __name__ == "__main__":
    unittest.main()
