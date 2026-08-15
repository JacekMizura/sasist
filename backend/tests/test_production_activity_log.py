"""
Production Activity Log — emitters, idempotency, formatter, multi-link.

  python -m pytest backend/tests/test_production_activity_log.py -q
"""

from __future__ import annotations

import json
import unittest
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.activity_event import ActivityEvent, ActivityEventLink
from backend.models.app_user import AppUser
from backend.services.activity_log.domain_event_codes import (
    PRODUCTION_CANCELLED,
    PRODUCTION_COLLECTION_COMPLETED,
    PRODUCTION_COLLECTION_STARTED,
    PRODUCTION_COMPLETED,
    PRODUCTION_COMPONENT_SHORTAGE,
    PRODUCTION_ORDER_CREATED,
    PRODUCTION_OUTPUT_REGISTERED,
    PRODUCTION_PW_CREATED,
    PRODUCTION_PUTAWAY_COMPLETED,
    PRODUCTION_RW_CREATED,
    PRODUCTION_SHORTAGE_AUTO_RESUMED,
    PRODUCTION_STARTED,
)
from backend.services.activity_log.presentation import enrich_activity_item
from backend.services.activity_log.production_activity_format import format_production_activity_message
from backend.services.activity_log.service import list_activity_for_object
from backend.services.production_execution.production_domain_activity import (
    emit_production_cancelled,
    emit_production_collection_completed,
    emit_production_collection_started,
    emit_production_completed,
    emit_production_component_shortage,
    emit_production_order_created,
    emit_production_output_registered,
    emit_production_putaway_completed,
    emit_production_pw_created,
    emit_production_rw_created,
    emit_production_shortage_auto_resumed,
    emit_production_started,
)


class TestProductionActivityLog(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
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
                last_name="Mizura",
                is_active=True,
            )
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_create_once_and_retry(self):
        emit_production_order_created(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            production_order_id=42,
            product_id=100,
            planned_quantity=1000,
            actor_user_id=7,
            label="MO/2026/0042",
        )
        emit_production_order_created(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            production_order_id=42,
            product_id=100,
            planned_quantity=1000,
            actor_user_id=7,
            label="MO/2026/0042",
        )
        self.db.commit()
        rows = self.db.query(ActivityEvent).filter(ActivityEvent.event_code == PRODUCTION_ORDER_CREATED).all()
        self.assertEqual(len(rows), 1)
        prod = list_activity_for_object(self.db, object_type="product", object_id=100)
        self.assertEqual(len(prod), 1)

    def test_collect_start_end_idempotent(self):
        emit_production_collection_started(
            self.db, tenant_id=1, warehouse_id=1, production_order_id=1, actor_user_id=7, label="MO-1"
        )
        emit_production_collection_started(
            self.db, tenant_id=1, warehouse_id=1, production_order_id=1, actor_user_id=7, label="MO-1"
        )
        emit_production_collection_completed(
            self.db, tenant_id=1, warehouse_id=1, production_order_id=1, actor_user_id=7, label="MO-1"
        )
        emit_production_collection_completed(
            self.db, tenant_id=1, warehouse_id=1, production_order_id=1, actor_user_id=7, label="MO-1"
        )
        self.db.commit()
        codes = {e.event_code for e in self.db.query(ActivityEvent).all()}
        self.assertEqual(codes, {PRODUCTION_COLLECTION_STARTED, PRODUCTION_COLLECTION_COMPLETED})

    def test_shortage_and_auto_resume_system_actor(self):
        emit_production_component_shortage(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            production_order_id=9,
            order_id=1234,
            product_id=50,
            shortage_sku="ST-003",
            shortage_qty=20,
            correlation_suffix="order:1234",
            actor_user_id=None,
            label="MO-9",
        )
        emit_production_shortage_auto_resumed(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            production_order_id=9,
            order_id=1234,
            product_id=50,
            label="MO-9",
            correlation_suffix="order:1234:src:1",
        )
        self.db.commit()
        short = (
            self.db.query(ActivityEvent)
            .filter(ActivityEvent.event_code == PRODUCTION_COMPONENT_SHORTAGE)
            .one()
        )
        resume = (
            self.db.query(ActivityEvent)
            .filter(ActivityEvent.event_code == PRODUCTION_SHORTAGE_AUTO_RESUMED)
            .one()
        )
        self.assertIsNone(resume.actor_user_id)
        self.assertEqual(json.loads(resume.metadata_json or "{}").get("actor_type"), "SYSTEM")
        order_items = list_activity_for_object(self.db, object_type="order", object_id=1234)
        self.assertGreaterEqual(len(order_items), 2)
        enriched = enrich_activity_item(
            {
                "event_code": short.event_code,
                "description": short.description,
                "metadata": json.loads(short.metadata_json or "{}"),
                "actor_user_id": short.actor_user_id,
            }
        )
        self.assertIn("ST-003", enriched["action"])
        self.assertNotIn("PRODUCTION_COMPONENT_SHORTAGE", enriched["action"])

    def test_rw_pw_putaway_completed_links(self):
        emit_production_rw_created(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            stock_document_id=55,
            document_number="RW/2026/55",
            production_order_id=3,
            product_id=10,
            actor_user_id=7,
            label="MO-3",
            order_id=99,
        )
        emit_production_started(
            self.db, tenant_id=1, warehouse_id=1, production_order_id=3, actor_user_id=7, label="MO-3"
        )
        emit_production_pw_created(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            stock_document_id=101,
            document_number="PW/2026/101",
            production_order_id=3,
            product_id=10,
            actor_user_id=7,
            label="MO-3",
            quantity=200,
        )
        emit_production_putaway_completed(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            stock_document_id=101,
            document_number="PW/2026/101",
            production_order_id=3,
            product_id=10,
            actor_user_id=7,
            label="MO-3",
            quantity=200,
        )
        emit_production_completed(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            production_order_id=3,
            product_id=10,
            actor_user_id=None,
            label="MO-3",
            produced_total=1000,
            planned_quantity=1000,
        )
        emit_production_cancelled(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            production_order_id=4,
            product_id=11,
            actor_user_id=7,
            label="MO-4",
        )
        self.db.commit()
        rw = self.db.query(ActivityEvent).filter(ActivityEvent.event_code == PRODUCTION_RW_CREATED).one()
        types = {
            str(x.object_type)
            for x in self.db.query(ActivityEventLink).filter(ActivityEventLink.event_id == rw.id)
        }
        self.assertTrue({"production", "document", "product", "order"}.issubset(types))
        completed = (
            self.db.query(ActivityEvent).filter(ActivityEvent.event_code == PRODUCTION_COMPLETED).one()
        )
        self.assertIsNone(completed.actor_user_id)
        self.assertEqual(
            self.db.query(ActivityEvent).filter(ActivityEvent.event_code == PRODUCTION_CANCELLED).count(),
            1,
        )

    def test_output_deltas_lot_sn_metadata_and_idempotency(self):
        emit_production_output_registered(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            output_id=1,
            quantity=200,
            produced_total=200,
            planned_quantity=1000,
            production_order_id=7,
            product_id=50,
            order_id=1234,
            stock_document_id=200,
            document_number="PW/1",
            actor_user_id=7,
            label="MO-7",
            batch_number="LOT-A",
        )
        emit_production_output_registered(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            output_id=1,
            quantity=200,
            produced_total=200,
            planned_quantity=1000,
            production_order_id=7,
            product_id=50,
            actor_user_id=7,
            label="MO-7",
            batch_number="LOT-A",
        )
        emit_production_output_registered(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            output_id=2,
            quantity=300,
            produced_total=500,
            planned_quantity=1000,
            production_order_id=7,
            product_id=50,
            order_id=1234,
            stock_document_id=201,
            actor_user_id=7,
            label="MO-7",
            batch_number="LOT-B",
        )
        emit_production_output_registered(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            output_id=3,
            quantity=20,
            produced_total=520,
            planned_quantity=1000,
            production_order_id=7,
            product_id=50,
            actor_user_id=7,
            label="MO-7",
            serial_numbers=[f"SN-{i}" for i in range(20)],
        )
        self.db.commit()
        outs = (
            self.db.query(ActivityEvent)
            .filter(ActivityEvent.event_code == PRODUCTION_OUTPUT_REGISTERED)
            .order_by(ActivityEvent.id.asc())
            .all()
        )
        self.assertEqual(len(outs), 3)
        m1 = json.loads(outs[0].metadata_json or "{}")
        m2 = json.loads(outs[1].metadata_json or "{}")
        m3 = json.loads(outs[2].metadata_json or "{}")
        self.assertEqual(m1.get("batch_number"), "LOT-A")
        self.assertEqual(m2.get("batch_number"), "LOT-B")
        self.assertEqual(int(m3.get("serial_count") or 0), 20)
        e1 = enrich_activity_item(
            {"event_code": PRODUCTION_OUTPUT_REGISTERED, "description": outs[0].description, "metadata": m1}
        )
        self.assertIn("200/1000", e1["action"])
        self.assertIn("LOT-A", e1["action"])
        e3 = enrich_activity_item(
            {"event_code": PRODUCTION_OUTPUT_REGISTERED, "description": outs[2].description, "metadata": m3}
        )
        self.assertIn("numerami seryjnymi", e3["action"])
        self.assertNotIn("SN-0", e3["action"])
        prod_items = list_activity_for_object(self.db, object_type="product", object_id=50)
        self.assertEqual(len(prod_items), 3)
        order_items = list_activity_for_object(self.db, object_type="order", object_id=1234)
        self.assertGreaterEqual(len(order_items), 2)

    def test_formatter_no_raw_enums(self):
        msg = format_production_activity_message(
            event_code=PRODUCTION_STARTED,
            stored_description=PRODUCTION_STARTED,
            metadata={"mo_number": "MO/1"},
        )
        self.assertEqual(msg, "Rozpoczęto produkcję.")
        self.assertNotIn("PRODUCTION_", msg)

    def test_wms_audit_passes_lot_expiry(self):
        from backend.services.production_execution.production_warehouse_audit import (
            record_production_pw_receipt_audit,
            record_production_rw_issue_audit,
        )

        calls = []

        def _capture(db, **kwargs):
            del db
            calls.append(kwargs)
            return SimpleNamespace(id=1)

        rw = SimpleNamespace(id=55, tenant_id=1, warehouse_id=1, document_number="RW/1", created_by_user_id=7)
        pw = SimpleNamespace(id=101, tenant_id=1, warehouse_id=1, document_number="PW/1", created_by_user_id=7)
        with patch(
            "backend.services.production_execution.production_warehouse_audit.record_warehouse_product_operation",
            side_effect=_capture,
        ), patch(
            "backend.services.production_execution.production_warehouse_audit._resolve_audit_user",
            return_value=SimpleNamespace(id=7, login="jacek"),
        ):
            record_production_rw_issue_audit(
                MagicMock(),
                rw_doc=rw,
                product_id=10,
                quantity=100,
                from_location_id=1,
                performed_by_user_id=7,
                batch_number="CAT-121",
                expiry_date=date(2028, 10, 30),
            )
            record_production_pw_receipt_audit(
                MagicMock(),
                pw_doc=pw,
                product_id=50,
                quantity=200,
                staging_location_id=2,
                performed_by_user_id=7,
                batch_number="FG-0826-A",
                expiry_date=date(2028, 10, 30),
            )
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0]["batch_number"], "CAT-121")
        self.assertEqual(calls[0]["wms_mode"], "RW")
        self.assertEqual(calls[1]["batch_number"], "FG-0826-A")
        self.assertEqual(calls[1]["wms_mode"], "PW")
        self.assertEqual(calls[1]["quantity"], 200.0)


if __name__ == "__main__":
    unittest.main()
