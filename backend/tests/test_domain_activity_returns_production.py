"""
Domain Activity Log — returns + production milestones (one event, multi-link, correlation idempotency).

  python -m pytest backend/tests/test_domain_activity_returns_production.py -q
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
from backend.services.activity_log.domain_activity import find_activity_by_correlation, record_domain_activity
from backend.services.activity_log.domain_event_codes import (
    PRODUCTION_RW_CREATED,
    RETURN_COMPONENT_RECOVERY,
    RETURN_COMPONENT_SCRAP,
    RETURN_CREATED,
    RETURN_FINALIZED,
    RETURN_RECEIPT_CREATED,
    RETURN_STOCK_INTAKE_SELECTED,
)
from backend.services.activity_log.service import list_activity_for_object
from backend.services.production_execution.production_domain_activity import emit_production_rw_created
from backend.services.returns.return_domain_activity import (
    emit_return_component_recovery,
    emit_return_created,
    emit_return_finalized,
    emit_return_receipt_created,
    emit_return_stock_intake_selected,
)


class TestDomainActivityReturnsProduction(unittest.TestCase):
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
            side_effect=lambda db, pid: (("Komponent", f"SKU-{pid}") if pid else (None, None)),
        )
        self._order_patch.start()
        self._prod_patch.start()

    def tearDown(self):
        self._order_patch.stop()
        self._prod_patch.stop()
        self.db.close()

    def test_record_domain_activity_multi_link_one_event(self):
        ev = record_domain_activity(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            event_type=RETURN_CREATED,
            description="Utworzono zwrot RMZ-1",
            actor_user_id=7,
            order_id=100,
            rmz_id=55,
            correlation_id="return:55:created",
            metadata={"rmz_number": "RMZ-1", "order_number": "ORD-100"},
        )
        self.db.commit()
        self.assertIsNotNone(ev)
        links = self.db.query(ActivityEventLink).filter(ActivityEventLink.event_id == ev.id).all()
        types = {str(x.object_type) for x in links}
        self.assertEqual(types, {"return", "order"})
        self.assertEqual(self.db.query(ActivityEvent).count(), 1)

        order_items = list_activity_for_object(self.db, object_type="order", object_id=100)
        ret_items = list_activity_for_object(self.db, object_type="return", object_id=55)
        self.assertEqual(len(order_items), 1)
        self.assertEqual(len(ret_items), 1)
        self.assertEqual(order_items[0]["id"], ret_items[0]["id"])

    def test_correlation_id_idempotent(self):
        a = record_domain_activity(
            self.db,
            tenant_id=1,
            event_type=RETURN_FINALIZED,
            description="Zwrot zakończony",
            actor_user_id=7,
            order_id=1,
            rmz_id=9,
            correlation_id="return:9:finalized",
        )
        b = record_domain_activity(
            self.db,
            tenant_id=1,
            event_type=RETURN_FINALIZED,
            description="Zwrot zakończony (retry)",
            actor_user_id=7,
            order_id=1,
            rmz_id=9,
            correlation_id="return:9:finalized",
        )
        self.db.commit()
        self.assertEqual(a.id, b.id)
        self.assertEqual(self.db.query(ActivityEvent).count(), 1)
        found = find_activity_by_correlation(self.db, correlation_id="return:9:finalized", tenant_id=1)
        self.assertEqual(found.id, a.id)

    def test_emit_return_created_and_finalize_actor(self):
        rmz = SimpleNamespace(
            id=12,
            tenant_id=1,
            warehouse_id=1,
            order_id=200,
            rmz_number="RMZ-2026-12",
        )
        emit_return_created(self.db, rmz=rmz, actor_user_id=7)
        emit_return_finalized(self.db, rmz=rmz, actor_user_id=7)
        emit_return_finalized(self.db, rmz=rmz, actor_user_id=7)  # retry
        self.db.commit()
        codes = {e.event_code for e in self.db.query(ActivityEvent).all()}
        self.assertIn(RETURN_CREATED, codes)
        self.assertIn(RETURN_FINALIZED, codes)
        fin = (
            self.db.query(ActivityEvent)
            .filter(ActivityEvent.event_code == RETURN_FINALIZED)
            .one()
        )
        self.assertEqual(fin.actor_user_id, 7)

    def test_stock_intake_modes_metadata(self):
        rmz = SimpleNamespace(id=3, tenant_id=1, warehouse_id=1, order_id=10, rmz_number="RMZ-3")
        for mode, fg, dq, lid in (
            ("DISASSEMBLE", 0, 2, 101),
            ("MIXED", 1, 1, 102),
            ("FG", 2, 0, 103),
        ):
            line = SimpleNamespace(
                id=lid,
                product_id=50,
                stock_intake_mode=mode,
                fg_intake_qty=fg,
                disassembly_qty=dq,
            )
            emit_return_stock_intake_selected(self.db, rmz=rmz, line=line, actor_user_id=7)
        self.db.commit()
        rows = (
            self.db.query(ActivityEvent)
            .filter(ActivityEvent.event_code == RETURN_STOCK_INTAKE_SELECTED)
            .all()
        )
        self.assertEqual(len(rows), 3)
        metas = [json.loads(r.metadata_json or "{}") for r in rows]
        modes = {m.get("stock_intake_mode") for m in metas}
        self.assertEqual(modes, {"DISASSEMBLE", "MIXED", "FG"})
        mixed = next(m for m in metas if m.get("stock_intake_mode") == "MIXED")
        self.assertEqual(int(mixed.get("fg_intake_qty") or 0), 1)
        self.assertEqual(int(mixed.get("disassembly_qty") or 0), 1)

    def test_component_recovery_and_scrap_product_link(self):
        rmz = SimpleNamespace(id=8, tenant_id=1, warehouse_id=1, order_id=11, rmz_number="RMZ-8")
        line = SimpleNamespace(id=44, product_id=99)
        emit_return_component_recovery(
            self.db,
            rmz=rmz,
            line=line,
            component_product_id=192,
            expected_qty=2,
            accepted_qty=1,
            scrap_qty=1,
            source_row_id=501,
            actor_user_id=7,
        )
        self.db.commit()
        codes = {e.event_code for e in self.db.query(ActivityEvent).all()}
        self.assertIn(RETURN_COMPONENT_RECOVERY, codes)
        self.assertIn(RETURN_COMPONENT_SCRAP, codes)
        prod_items = list_activity_for_object(self.db, object_type="product", object_id=192)
        self.assertGreaterEqual(len(prod_items), 1)

    def test_zpz_document_link(self):
        rmz = SimpleNamespace(id=21, tenant_id=1, warehouse_id=1, order_id=30, rmz_number="RMZ-21")
        doc = SimpleNamespace(id=77, document_number="Z-PZ-2026-2", document_type="Z_PZ")
        emit_return_receipt_created(self.db, rmz=rmz, doc=doc, actor_user_id=7, new_line_count=2)
        emit_return_receipt_created(self.db, rmz=rmz, doc=doc, actor_user_id=7, new_line_count=2)
        self.db.commit()
        self.assertEqual(
            self.db.query(ActivityEvent).filter(ActivityEvent.event_code == RETURN_RECEIPT_CREATED).count(),
            1,
        )
        doc_items = list_activity_for_object(self.db, object_type="document", object_id=77)
        self.assertEqual(len(doc_items), 1)

    def test_production_rw_milestone_links(self):
        emit_production_rw_created(
            self.db,
            tenant_id=1,
            warehouse_id=1,
            stock_document_id=900,
            document_number="RW-1",
            production_order_id=15,
            product_id=50,
            actor_user_id=None,
            label="MO-15",
        )
        self.db.commit()
        ev = (
            self.db.query(ActivityEvent)
            .filter(ActivityEvent.event_code == PRODUCTION_RW_CREATED)
            .one()
        )
        self.assertIsNone(ev.actor_user_id)
        meta = json.loads(ev.metadata_json or "{}")
        self.assertEqual(meta.get("actor_type"), "SYSTEM")
        types = {
            str(x.object_type)
            for x in self.db.query(ActivityEventLink).filter(ActivityEventLink.event_id == ev.id)
        }
        self.assertIn("production", types)
        self.assertIn("document", types)
        self.assertIn("product", types)

    def test_system_actor_null_user(self):
        ev = record_domain_activity(
            self.db,
            tenant_id=1,
            event_type="PRODUCTION_COMPLETED",
            description="Zakończono produkcję: BAT-1",
            actor_user_id=None,
            batch_id=3,
            correlation_id="batch:3:completed",
        )
        self.db.commit()
        self.assertIsNone(ev.actor_user_id)
        self.assertEqual(json.loads(ev.metadata_json or "{}").get("actor_type"), "SYSTEM")


if __name__ == "__main__":
    unittest.main()
