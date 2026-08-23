"""
Return Activity Log — mutation coverage (status, item, refund, archive, presentation).

  python -m pytest backend/tests/test_return_activity_mutations.py -q
"""

from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.activity_event import ActivityEvent, ActivityEventLink
from backend.models.app_user import AppUser
from backend.services.activity_log.domain_event_codes import (
    RETURN_ARCHIVED,
    RETURN_CREATED,
    RETURN_FINALIZED,
    RETURN_ITEM_ADDED,
    RETURN_REFUND_COMPLETED,
    RETURN_STATUS_CHANGED,
)
from backend.services.activity_log.presentation import enrich_activity_item
from backend.services.activity_log.return_activity_presentation import (
    WMS_RETURNS_PREFIX,
    build_return_inline_detail_rows,
    resolve_return_event_title,
    return_details_display_for,
)
from backend.services.activity_log.service import list_activity_for_object
from backend.services.returns.return_domain_activity import (
    emit_return_archived,
    emit_return_created,
    emit_return_finalized,
    emit_return_item_added,
    emit_return_refund_completed,
    emit_return_status_changed,
)


class TestReturnActivityMutations(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO tenants (id) VALUES (1), (2)"))
            conn.execute(
                text(
                    "CREATE TABLE warehouses (id INTEGER PRIMARY KEY, tenant_id INTEGER NOT NULL, name VARCHAR(64))"
                )
            )
            conn.execute(text("INSERT INTO warehouses (id, tenant_id, name) VALUES (1, 1, 'WH')"))
        AppUser.__table__.create(engine, checkfirst=True)
        ActivityEvent.__table__.create(engine, checkfirst=True)
        ActivityEventLink.__table__.create(engine, checkfirst=True)
        Session = sessionmaker(bind=engine)
        self.db = Session()
        self.db.add(
            AppUser(
                id=7,
                login="jacek",
                email="j@test.local",
                password_hash="x",
                first_name="Jacek",
                last_name="Test",
                is_active=True,
            )
        )
        self.db.commit()
        self._order_patch = patch(
            "backend.services.returns.return_domain_activity._order_number",
            side_effect=lambda db, oid: f"ORD-{oid}" if oid else None,
        )
        self._prod_patch = patch(
            "backend.services.returns.return_domain_activity._product_snap",
            side_effect=lambda db, pid: {
                50: {"name": "Sznurówadła CAT 100 cm", "sku": "ST-001", "ean": "5905450181185"},
            }.get(pid, {"name": "Produkt", "sku": f"SKU-{pid}", "ean": None}),
        )
        self._order_patch.start()
        self._prod_patch.start()

    def tearDown(self):
        self._order_patch.stop()
        self._prod_patch.stop()
        self.db.close()

    def test_create_user_actor_and_return_only_link(self):
        rmz = SimpleNamespace(
            id=1, tenant_id=1, warehouse_id=1, order_id=99, rmz_number="RMZ-1", return_type="RMA"
        )
        emit_return_created(self.db, rmz=rmz, actor_user_id=7)
        self.db.commit()
        ev = self.db.query(ActivityEvent).filter(ActivityEvent.event_code == RETURN_CREATED).one()
        self.assertEqual(ev.actor_user_id, 7)
        meta = json.loads(ev.metadata_json or "{}")
        self.assertEqual(meta.get("actor_kind"), "USER")
        links = self.db.query(ActivityEventLink).filter(ActivityEventLink.event_id == ev.id).all()
        self.assertEqual({x.object_type for x in links}, {"return"})
        self.assertEqual(len(list_activity_for_object(self.db, object_type="order", object_id=99)), 0)

    def test_status_changed_before_after(self):
        rmz = SimpleNamespace(id=2, tenant_id=1, warehouse_id=1, order_id=None, rmz_number="RMZ-2")
        emit_return_status_changed(
            self.db,
            rmz=rmz,
            old_status_id=1,
            new_status_id=2,
            old_status_name="Nowy",
            new_status_name="Przyjęty",
            status_kind="panel",
            actor_user_id=7,
        )
        self.db.commit()
        ev = self.db.query(ActivityEvent).filter(ActivityEvent.event_code == RETURN_STATUS_CHANGED).one()
        self.assertIn("Nowy → Przyjęty", ev.description)
        rows = build_return_inline_detail_rows(RETURN_STATUS_CHANGED, json.loads(ev.metadata_json or "{}"))
        self.assertTrue(any("Nowy" in r["value"] and "Przyjęty" in r["value"] for r in rows))
        self.assertEqual(return_details_display_for(RETURN_STATUS_CHANGED), "inline")

    def test_item_added_snapshot(self):
        rmz = SimpleNamespace(id=3, tenant_id=1, warehouse_id=1, order_id=10, rmz_number="RMZ-3")
        line = SimpleNamespace(id=11, product_id=50, order_item_id=5, quantity=2)
        emit_return_item_added(self.db, rmz=rmz, line=line, actor_user_id=7, unit_price=6.15)
        self.db.commit()
        ev = self.db.query(ActivityEvent).filter(ActivityEvent.event_code == RETURN_ITEM_ADDED).one()
        self.assertIn("Sznurówadła CAT 100 cm", ev.description)
        self.assertIn("ST-001", ev.description)
        self.assertIn("5905450181185", ev.description)
        meta = json.loads(ev.metadata_json or "{}")
        self.assertEqual(meta.get("product_sku"), "ST-001")
        self.assertEqual(meta.get("quantity"), 2)
        self.assertIsNotNone(meta.get("unit_price_display"))

    def test_refund_and_finalize(self):
        rmz = SimpleNamespace(id=4, tenant_id=1, warehouse_id=1, order_id=10, rmz_number="RMZ-4")
        emit_return_refund_completed(
            self.db,
            rmz=rmz,
            refund_type="TRANSFER",
            refund_amount=152.30,
            actor_user_id=7,
            source="office",
        )
        emit_return_finalized(self.db, rmz=rmz, actor_user_id=7, transition="success")
        self.db.commit()
        codes = {e.event_code for e in self.db.query(ActivityEvent).all()}
        self.assertIn(RETURN_REFUND_COMPLETED, codes)
        self.assertIn(RETURN_FINALIZED, codes)
        refund = (
            self.db.query(ActivityEvent)
            .filter(ActivityEvent.event_code == RETURN_REFUND_COMPLETED)
            .one()
        )
        self.assertIn("przelew", refund.description.lower())

    def test_system_actor_when_no_user(self):
        rmz = SimpleNamespace(id=5, tenant_id=1, warehouse_id=1, order_id=None, rmz_number="RMZ-5")
        emit_return_archived(self.db, rmz=rmz, actor_user_id=None)
        self.db.commit()
        ev = self.db.query(ActivityEvent).filter(ActivityEvent.event_code == RETURN_ARCHIVED).one()
        self.assertIsNone(ev.actor_user_id)
        meta = json.loads(ev.metadata_json or "{}")
        self.assertEqual(meta.get("actor_kind"), "SYSTEM")

    def test_tenant_isolation(self):
        rmz = SimpleNamespace(id=6, tenant_id=1, warehouse_id=1, order_id=None, rmz_number="RMZ-6")
        emit_return_created(self.db, rmz=rmz, actor_user_id=7)
        self.db.commit()
        t1 = (
            self.db.query(ActivityEvent)
            .filter(ActivityEvent.event_code == RETURN_CREATED, ActivityEvent.tenant_id == 1)
            .count()
        )
        t2 = (
            self.db.query(ActivityEvent)
            .filter(ActivityEvent.event_code == RETURN_CREATED, ActivityEvent.tenant_id == 2)
            .count()
        )
        self.assertEqual(t1, 1)
        self.assertEqual(t2, 0)
        # Cross-tenant object_id collision must not leak via wrong tenant on the event row.
        self.assertEqual(
            self.db.query(ActivityEvent).filter(ActivityEvent.tenant_id == 2).count(),
            0,
        )

    def test_idempotency_status(self):
        rmz = SimpleNamespace(id=7, tenant_id=1, warehouse_id=1, order_id=None, rmz_number="RMZ-7")
        emit_return_status_changed(
            self.db,
            rmz=rmz,
            old_status_id=1,
            new_status_id=2,
            old_status_name="A",
            new_status_name="B",
            actor_user_id=7,
        )
        emit_return_status_changed(
            self.db,
            rmz=rmz,
            old_status_id=1,
            new_status_id=2,
            old_status_name="A",
            new_status_name="B",
            actor_user_id=7,
        )
        self.db.commit()
        self.assertEqual(
            self.db.query(ActivityEvent).filter(ActivityEvent.event_code == RETURN_STATUS_CHANGED).count(),
            1,
        )

    def test_wms_prefix_presentation(self):
        title = resolve_return_event_title(
            RETURN_FINALIZED,
            {"source_category": "WMS", "wms_module": "returns"},
        )
        self.assertTrue(str(title).startswith(WMS_RETURNS_PREFIX))
        enriched = enrich_activity_item(
            {
                "event_code": RETURN_FINALIZED,
                "description": "Zakończono obsługę zwrotu RMZ-1.",
                "category": "wms",
                "metadata": {"source_category": "WMS", "wms_module": "returns"},
                "actor_user_id": 7,
                "actor_name": "Jacek Test",
                "severity": "SUCCESS",
            }
        )
        self.assertTrue(str(enriched.get("event_display_label") or "").startswith(WMS_RETURNS_PREFIX))
        self.assertEqual(enriched.get("details_display"), "none")


if __name__ == "__main__":
    unittest.main()
