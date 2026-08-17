"""
Domain Activity Log — returns narrative (business copy, no SCRAP AL duplicate, order).

  python -m pytest backend/tests/test_domain_activity_returns_production.py -q
"""

from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

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
    RETURN_LINE_DECISION,
    RETURN_RECEIPT_CREATED,
    RETURN_STOCK_INTAKE_SELECTED,
)
from backend.services.activity_log.return_activity_presentation import resolve_return_event_title
from backend.services.activity_log.service import list_activity_for_object
from backend.services.production_execution.production_domain_activity import emit_production_rw_created
from backend.services.returns.return_domain_activity import (
    emit_return_component_recovery,
    emit_return_created,
    emit_return_finalized,
    emit_return_line_decision,
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
            side_effect=lambda db, pid: {
                50: ("Sznurówadła CAT 100 cm", "ST-100"),
                99: ("Sznurówadła CAT 100 cm", "ST-100"),
                192: ("Sznurówadła CAT 150 cm", "ST-003"),
                200: ("Dezodorant x3", "BUN-1"),
                201: ("DEZODORANT ODŚWIEŻACZ ANTYBAKTERYJNY Coccine", "DEZ-1"),
            }.get(pid, (("Produkt", f"SKU-{pid}") if pid else (None, None))),
        )
        self._bundle_patch = patch(
            "backend.services.returns.return_domain_activity._line_is_bundle",
            return_value=False,
        )
        self._order_patch.start()
        self._prod_patch.start()
        self._bundle_patch.start()

    def tearDown(self):
        self._order_patch.stop()
        self._prod_patch.stop()
        self._bundle_patch.stop()
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

    def test_A_manufactured_full_disassembly_copy(self):
        rmz = SimpleNamespace(id=3, tenant_id=1, warehouse_id=1, order_id=10, rmz_number="RMZ-3")
        line = SimpleNamespace(
            id=101,
            product_id=50,
            order_item_id=1,
            stock_intake_mode="DISASSEMBLE",
            fg_intake_qty=0,
            disassembly_qty=1,
        )
        emit_return_stock_intake_selected(self.db, rmz=rmz, line=line, actor_user_id=7)
        self.db.commit()
        row = (
            self.db.query(ActivityEvent)
            .filter(ActivityEvent.event_code == RETURN_STOCK_INTAKE_SELECTED)
            .one()
        )
        self.assertIn("rozmontowano 1 szt.", row.description)
        self.assertNotIn("FG=", row.description)
        self.assertNotIn("rozbiór", row.description.lower())
        meta = json.loads(row.metadata_json or "{}")
        self.assertEqual(
            resolve_return_event_title(RETURN_STOCK_INTAKE_SELECTED, meta),
            "Rozmontowano produkt",
        )

    def test_B_manufactured_mixed_copy(self):
        rmz = SimpleNamespace(id=4, tenant_id=1, warehouse_id=1, order_id=10, rmz_number="RMZ-4")
        line = SimpleNamespace(
            id=102,
            product_id=50,
            order_item_id=1,
            stock_intake_mode="MIXED",
            fg_intake_qty=7,
            disassembly_qty=13,
        )
        emit_return_stock_intake_selected(self.db, rmz=rmz, line=line, actor_user_id=7)
        self.db.commit()
        row = (
            self.db.query(ActivityEvent)
            .filter(ActivityEvent.event_code == RETURN_STOCK_INTAKE_SELECTED)
            .one()
        )
        self.assertIn("przyjęto jako gotowy wyrób: 7 szt.", row.description)
        self.assertIn("rozmontowano: 13 szt.", row.description)
        self.assertNotIn("FG=", row.description)

    def test_C_bundle_full_disassembly_copy(self):
        self._bundle_patch.stop()
        with patch(
            "backend.services.returns.return_domain_activity._line_is_bundle",
            return_value=True,
        ), patch(
            "backend.services.returns.return_domain_activity._parent_label",
            return_value="Dezodorant x3",
        ):
            rmz = SimpleNamespace(id=5, tenant_id=1, warehouse_id=1, order_id=10, rmz_number="RMZ-5")
            line = SimpleNamespace(
                id=103,
                product_id=200,
                order_item_id=2,
                stock_intake_mode="DISASSEMBLE",
                fg_intake_qty=0,
                disassembly_qty=1,
            )
            emit_return_stock_intake_selected(self.db, rmz=rmz, line=line, actor_user_id=7)
            self.db.commit()
        self._bundle_patch.start()
        row = (
            self.db.query(ActivityEvent)
            .filter(ActivityEvent.event_code == RETURN_STOCK_INTAKE_SELECTED)
            .one()
        )
        self.assertEqual(row.description, "Dezodorant x3 — rozmontowano 1 zest.")
        meta = json.loads(row.metadata_json or "{}")
        self.assertEqual(
            resolve_return_event_title(RETURN_STOCK_INTAKE_SELECTED, meta),
            "Rozmontowano zestaw",
        )

    def test_D_bundle_mixed_copy(self):
        self._bundle_patch.stop()
        with patch(
            "backend.services.returns.return_domain_activity._line_is_bundle",
            return_value=True,
        ), patch(
            "backend.services.returns.return_domain_activity._parent_label",
            return_value="Dezodorant x3",
        ):
            rmz = SimpleNamespace(id=6, tenant_id=1, warehouse_id=1, order_id=10, rmz_number="RMZ-6")
            line = SimpleNamespace(
                id=104,
                product_id=200,
                order_item_id=2,
                stock_intake_mode="MIXED",
                fg_intake_qty=2,
                disassembly_qty=3,
            )
            emit_return_stock_intake_selected(self.db, rmz=rmz, line=line, actor_user_id=7)
            self.db.commit()
        self._bundle_patch.start()
        row = (
            self.db.query(ActivityEvent)
            .filter(ActivityEvent.event_code == RETURN_STOCK_INTAKE_SELECTED)
            .one()
        )
        self.assertIn("przyjęto jako zestaw: 2 szt.", row.description)
        self.assertIn("rozmontowano: 3 szt.", row.description)

    def test_E_accepted_zero_scrap_positive_single_event(self):
        rmz = SimpleNamespace(id=8, tenant_id=1, warehouse_id=1, order_id=11, rmz_number="RMZ-8")
        line = SimpleNamespace(id=44, product_id=99)
        emit_return_component_recovery(
            self.db,
            rmz=rmz,
            line=line,
            component_product_id=192,
            expected_qty=2,
            accepted_qty=0,
            scrap_qty=2,
            source_row_id=501,
            source="manufacturing",
            actor_user_id=7,
        )
        self.db.commit()
        codes = {e.event_code for e in self.db.query(ActivityEvent).all()}
        self.assertIn(RETURN_COMPONENT_RECOVERY, codes)
        self.assertNotIn(RETURN_COMPONENT_SCRAP, codes)
        row = self.db.query(ActivityEvent).one()
        self.assertIn("Odzyskano: 0 szt.", row.description)
        self.assertIn("Odrzucono: 2 szt.", row.description)
        self.assertNotIn("bez stocku", row.description)

    def test_F_accepted_and_scrap_single_event_no_scrap_al(self):
        rmz = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1, order_id=11, rmz_number="RMZ-9")
        line = SimpleNamespace(id=45, product_id=99)
        emit_return_component_recovery(
            self.db,
            rmz=rmz,
            line=line,
            component_product_id=192,
            expected_qty=2,
            accepted_qty=1,
            scrap_qty=1,
            source_row_id=502,
            source="manufacturing",
            actor_user_id=7,
        )
        self.db.commit()
        codes = {e.event_code for e in self.db.query(ActivityEvent).all()}
        self.assertEqual(codes, {RETURN_COMPONENT_RECOVERY})
        row = self.db.query(ActivityEvent).one()
        self.assertIn("Sznurówadła CAT 150 cm", row.description)
        self.assertIn("Odzyskano: 1 szt.", row.description)
        self.assertIn("Odrzucono: 1 szt.", row.description)
        meta = json.loads(row.metadata_json or "{}")
        self.assertEqual(
            resolve_return_event_title(RETURN_COMPONENT_RECOVERY, meta),
            "Rozliczono komponent",
        )
        prod_items = list_activity_for_object(self.db, object_type="product", object_id=192)
        self.assertGreaterEqual(len(prod_items), 1)

    def test_G_bundle_component_title(self):
        rmz = SimpleNamespace(id=10, tenant_id=1, warehouse_id=1, order_id=11, rmz_number="RMZ-10")
        line = SimpleNamespace(id=46, product_id=200)
        emit_return_component_recovery(
            self.db,
            rmz=rmz,
            line=line,
            component_product_id=201,
            expected_qty=3,
            accepted_qty=1,
            scrap_qty=2,
            source_row_id=503,
            source="bundle",
            actor_user_id=7,
        )
        self.db.commit()
        row = self.db.query(ActivityEvent).one()
        meta = json.loads(row.metadata_json or "{}")
        self.assertEqual(
            resolve_return_event_title(RETURN_COMPONENT_RECOVERY, meta),
            "Rozliczono element zestawu",
        )
        self.assertIn("Odzyskano: 1 szt.", row.description)
        self.assertIn("Odrzucono: 2 szt.", row.description)

    def test_H_technical_scrap_audit_still_callable(self):
        from backend.services.returns.manufactured_component_recovery_service import (
            audit_component_scrap,
        )

        rmz_line = SimpleNamespace(id=77, rmz_id=1, product_id=50)
        rec = SimpleNamespace(
            id=1,
            component_product_id=192,
            scrap_qty=1,
            expected_qty=2,
            accepted_qty=1,
        )
        with patch(
            "backend.services.returns.manufactured_component_recovery_service.log_audit_entry"
        ) as log_audit:
            audit_component_scrap(
                self.db,
                rmz_line=rmz_line,
                recoveries=[rec],
                actor_user_id=7,
            )
            log_audit.assert_called_once()
            kwargs = log_audit.call_args.kwargs
            self.assertEqual(kwargs.get("action"), "wms.return.component_recovery_scrap")

    def test_I_event_order_decision_intake_recovery_zpz_finalized(self):
        rmz = SimpleNamespace(id=21, tenant_id=1, warehouse_id=1, order_id=30, rmz_number="RMZ-21")
        line = SimpleNamespace(
            id=201,
            product_id=50,
            order_item_id=9,
            decision="OK",
            accepted_qty=1,
            rejected_qty=0,
            damaged_b_qty=0,
            damaged_c_qty=0,
            stock_intake_mode="DISASSEMBLE",
            fg_intake_qty=0,
            disassembly_qty=1,
        )
        emit_return_line_decision(self.db, rmz=rmz, line=line, actor_user_id=7)
        emit_return_stock_intake_selected(self.db, rmz=rmz, line=line, actor_user_id=7)
        emit_return_component_recovery(
            self.db,
            rmz=rmz,
            line=line,
            component_product_id=192,
            expected_qty=2,
            accepted_qty=2,
            scrap_qty=0,
            source_row_id=900,
            source="manufacturing",
            actor_user_id=7,
        )
        doc = SimpleNamespace(id=77, document_number="Z-PZ-2026-2", document_type="Z_PZ")
        emit_return_receipt_created(self.db, rmz=rmz, doc=doc, actor_user_id=7, new_line_count=1)
        emit_return_finalized(self.db, rmz=rmz, actor_user_id=7, z_pz_document_id=77)
        self.db.commit()
        rows = self.db.query(ActivityEvent).order_by(ActivityEvent.id.asc()).all()
        codes = [r.event_code for r in rows]
        self.assertEqual(
            codes,
            [
                RETURN_LINE_DECISION,
                RETURN_STOCK_INTAKE_SELECTED,
                RETURN_COMPONENT_RECOVERY,
                RETURN_RECEIPT_CREATED,
                RETURN_FINALIZED,
            ],
        )
        self.assertNotIn(RETURN_COMPONENT_SCRAP, codes)

    def test_J_fg_only_no_disassembly_jargon(self):
        rmz = SimpleNamespace(id=22, tenant_id=1, warehouse_id=1, order_id=30, rmz_number="RMZ-22")
        line = SimpleNamespace(
            id=202,
            product_id=50,
            order_item_id=9,
            stock_intake_mode="FG",
            fg_intake_qty=2,
            disassembly_qty=0,
        )
        emit_return_stock_intake_selected(self.db, rmz=rmz, line=line, actor_user_id=7)
        self.db.commit()
        row = self.db.query(ActivityEvent).one()
        self.assertIn("przyjęto jako gotowy wyrób: 2 szt.", row.description)
        self.assertNotIn("rozmontowano", row.description.lower())
        self.assertNotIn("FG=", row.description)
        meta = json.loads(row.metadata_json or "{}")
        self.assertEqual(
            resolve_return_event_title(RETURN_STOCK_INTAKE_SELECTED, meta),
            "Przyjęto gotowy produkt",
        )

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

    def test_finalize_emits_line_narrative_before_zpz(self):
        """I — finalize service calls line emitters before ensure_* Z-PZ."""
        from backend.services.returns import rmz_finalize_service as fin

        call_order: list[str] = []

        def _track(name):
            def _inner(*args, **kwargs):
                call_order.append(name)

            return _inner

        row = SimpleNamespace(
            id=1,
            tenant_id=1,
            warehouse_id=1,
            order_id=1,
            return_type="RMA",
            status_id=1,
            rmz_number="RMZ-1",
        )
        line = SimpleNamespace(
            id=1,
            order_item_id=10,
            product_id=50,
            decision="OK",
            stock_intake_mode="DISASSEMBLE",
            fg_intake_qty=0,
            disassembly_qty=1,
            accepted_qty=1,
            rejected_qty=0,
            damaged_b_qty=0,
            damaged_c_qty=0,
            quantity=1,
            component_recoveries=[],
        )
        settings = SimpleNamespace(
            returns_mode="OMS",
            require_photos=False,
            enable_refund=False,
        )
        payload = SimpleNamespace(order_item_id=10)

        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = [line]

        with (
            patch.object(fin, "assert_rmz_editable"),
            patch.object(fin, "apply_rmz_line_split"),
            patch.object(fin, "validate_rmz_lines_ready_for_finalize"),
            patch.object(
                fin,
                "ensure_required_rmz_return_receipt_document",
                side_effect=lambda *a, **k: (call_order.append("zpz") or SimpleNamespace(id=99)),
            ),
            patch.object(fin, "resolve_finalize_transition_key", return_value="COMPLETED"),
            patch.object(fin, "_apply_transition"),
            patch.object(fin, "log_audit_entry"),
            patch(
                "backend.services.returns.return_domain_activity.emit_return_line_decision",
                side_effect=_track("decision"),
            ),
            patch(
                "backend.services.returns.return_domain_activity.emit_return_stock_intake_selected",
                side_effect=_track("intake"),
            ),
            patch(
                "backend.services.returns.return_domain_activity.emit_component_recoveries_from_line_state",
                side_effect=_track("recovery"),
            ),
            patch(
                "backend.services.returns.return_domain_activity.emit_return_finalized",
                side_effect=_track("finalized"),
            ),
        ):
            fin.finalize_rmz_return(
                db,
                row,
                line_payloads=[payload],
                settings=settings,
                actor_user_id=7,
            )

        self.assertEqual(call_order[:4], ["decision", "intake", "recovery", "zpz"])
        self.assertIn("finalized", call_order)
        self.assertLess(call_order.index("recovery"), call_order.index("zpz"))
        self.assertLess(call_order.index("zpz"), call_order.index("finalized"))


if __name__ == "__main__":
    unittest.main()
