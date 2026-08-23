"""
Complaint Activity Log — projection from structured complaint_events.

  python -m pytest backend/tests/test_complaint_activity.py -q
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
from backend.models.complaint import Complaint
from backend.services.activity_log.complaint_activity_presentation import (
    WMS_COMPLAINTS_PREFIX,
    resolve_complaint_event_title,
)
from backend.services.activity_log.presentation import enrich_activity_item
from backend.services.activity_log.service import list_activity_for_object
from backend.services.complaint_event_types import (
    COMPLAINT_CREATED,
    COMPLAINT_PROCESS_STATUS,
    PHOTO_ADDED,
    RESOLUTION_SET,
    WMS_INSPECTION_SAVED,
)
from backend.services.complaints.complaint_domain_activity import (
    emit_complaint_archived,
    project_complaint_event_to_activity,
)


class TestComplaintActivity(unittest.TestCase):
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
            conn.execute(text("CREATE TABLE orders (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO orders (id) VALUES (99)"))
        AppUser.__table__.create(engine, checkfirst=True)
        ActivityEvent.__table__.create(engine, checkfirst=True)
        ActivityEventLink.__table__.create(engine, checkfirst=True)
        Complaint.__table__.create(engine, checkfirst=True)
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
        self.db.add(
            Complaint(
                id=10,
                tenant_id=1,
                warehouse_id=1,
                order_id=99,
                reference_code="R-10",
                title="Test",
            )
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_created_user_actor_complaint_only_link(self):
        project_complaint_event_to_activity(
            self.db,
            complaint_id=10,
            event_type=COMPLAINT_CREATED,
            payload={"photos_count": 1},
            actor_user_id=7,
            event_row_id="evt-created-1",
        )
        self.db.commit()
        ev = self.db.query(ActivityEvent).filter(ActivityEvent.event_code == COMPLAINT_CREATED).one()
        self.assertEqual(ev.actor_user_id, 7)
        links = self.db.query(ActivityEventLink).filter(ActivityEventLink.event_id == ev.id).all()
        self.assertEqual({x.object_type for x in links}, {"complaint"})
        self.assertEqual(len(list_activity_for_object(self.db, object_type="order", object_id=99)), 0)
        self.assertEqual(len(list_activity_for_object(self.db, object_type="complaint", object_id=10)), 1)

    def test_status_before_after(self):
        project_complaint_event_to_activity(
            self.db,
            complaint_id=10,
            event_type=COMPLAINT_PROCESS_STATUS,
            payload={"from": "NOWE", "to": "WERYFIKACJA"},
            actor_user_id=7,
            event_row_id="evt-status-1",
        )
        self.db.commit()
        ev = self.db.query(ActivityEvent).one()
        self.assertIn("Nowe → Weryfikacja", ev.description)

    def test_idempotency(self):
        for _ in range(2):
            project_complaint_event_to_activity(
                self.db,
                complaint_id=10,
                event_type=PHOTO_ADDED,
                payload={"count": 2},
                actor_user_id=7,
                event_row_id="evt-photo-dup",
            )
        self.db.commit()
        self.assertEqual(self.db.query(ActivityEvent).count(), 1)

    def test_system_actor(self):
        emit_complaint_archived(
            self.db,
            complaint=SimpleNamespace(
                id=10, tenant_id=1, warehouse_id=1, reference_code="R-10"
            ),
            actor_user_id=None,
        )
        self.db.commit()
        ev = self.db.query(ActivityEvent).filter(ActivityEvent.event_code == "COMPLAINT_ARCHIVED").one()
        self.assertIsNone(ev.actor_user_id)
        meta = json.loads(ev.metadata_json or "{}")
        self.assertEqual(meta.get("actor_kind"), "SYSTEM")

    def test_wms_prefix(self):
        title = resolve_complaint_event_title(
            WMS_INSPECTION_SAVED,
            {"source_category": "WMS", "wms_module": "complaints"},
        )
        self.assertTrue(str(title).startswith(WMS_COMPLAINTS_PREFIX))
        enriched = enrich_activity_item(
            {
                "event_code": RESOLUTION_SET,
                "description": "Ustawiono rozliczenie reklamacji: REFUND.",
                "category": "status",
                "metadata": {"resolution_type": "REFUND", "amount": 50, "currency": "PLN"},
                "actor_user_id": 7,
                "actor_name": "Jacek Test",
                "severity": "SUCCESS",
            }
        )
        self.assertEqual(enriched.get("details_display"), "inline")
        self.assertTrue(any(r.get("label") == "Kwota" for r in (enriched.get("details") or [])))

    def test_tenant_isolation_on_event(self):
        project_complaint_event_to_activity(
            self.db,
            complaint_id=10,
            event_type=COMPLAINT_CREATED,
            payload={},
            actor_user_id=7,
            event_row_id="evt-tenant",
        )
        self.db.commit()
        self.assertEqual(
            self.db.query(ActivityEvent).filter(ActivityEvent.tenant_id == 1).count(),
            1,
        )
        self.assertEqual(
            self.db.query(ActivityEvent).filter(ActivityEvent.tenant_id == 2).count(),
            0,
        )


if __name__ == "__main__":
    unittest.main()
