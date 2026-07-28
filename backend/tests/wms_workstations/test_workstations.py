"""WMS workstations — pair / disconnect / mapping / migration tests."""

from __future__ import annotations

import re
import unittest

from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user
from backend.database import get_db
from backend.db.wms_workstations_schema import ensure_wms_workstations_schema
from backend.main import app
from backend.models.printing.agent_printer import AgentPrinter
from backend.models.printing.printer_agent import PrinterAgent
from backend.models.wms_workstations import WmsWorkstation, WorkstationPrinterMapping
from backend.platform_state import mark_tier0_ready
from backend.services.wms_workstations.migration import (
    ensure_data_migrations_table,
    migrate_agents_to_workstations,
)
from backend.services.wms_workstations.service import looks_like_pairing_code
from backend.tests.printing._helpers import (
    create_printing_test_engine,
    make_session_factory,
    user_override,
)


def _create_engine():
    engine = create_printing_test_engine()
    ensure_wms_workstations_schema(engine)
    ensure_data_migrations_table(engine)
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS warehouses"))
        conn.execute(
            text(
                "CREATE TABLE warehouses ("
                "id INTEGER PRIMARY KEY,"
                "name TEXT,"
                "address TEXT,"
                "type TEXT,"
                "tenant_id INTEGER,"
                "start_x REAL,"
                "start_y REAL,"
                "requires_putaway INTEGER DEFAULT 1,"
                "created_at DATETIME,"
                "updated_at DATETIME"
                ")"
            )
        )
        conn.execute(
            text(
                "INSERT INTO warehouses (id, name, tenant_id, requires_putaway) "
                "VALUES (1, 'Main', 1, 1), (2, 'Secondary', 1, 1)"
            )
        )
        conn.execute(text("DROP TABLE IF EXISTS tenant_warehouses"))
        conn.execute(
            text(
                "CREATE TABLE tenant_warehouses ("
                "id INTEGER PRIMARY KEY,"
                "tenant_id INTEGER NOT NULL,"
                "warehouse_id INTEGER NOT NULL,"
                "role TEXT DEFAULT 'operator',"
                "is_default INTEGER DEFAULT 0,"
                "participates_in_network_stock INTEGER DEFAULT 1,"
                "fulfillment_eligible INTEGER DEFAULT 1,"
                "fulfillment_priority INTEGER DEFAULT 100,"
                "created_at DATETIME,"
                "updated_at DATETIME"
                ")"
            )
        )
        conn.execute(
            text(
                "INSERT INTO tenant_warehouses "
                "(id, tenant_id, warehouse_id, role, is_default) "
                "VALUES (1, 1, 1, 'owner', 1), (2, 1, 2, 'owner', 0)"
            )
        )
    return engine


class WorkstationsTestCase(unittest.TestCase):
    engine = None
    SessionLocal = None

    @classmethod
    def setUpClass(cls) -> None:
        mark_tier0_ready()
        cls.engine = _create_engine()
        cls.SessionLocal = make_session_factory(cls.engine)

        def _override_get_db():
            db = cls.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = _override_get_db
        app.dependency_overrides[get_current_user] = lambda: user_override()
        cls.client = TestClient(app, raise_server_exceptions=True)

    @classmethod
    def tearDownClass(cls) -> None:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)

    def setUp(self) -> None:
        assert self.SessionLocal is not None
        self.db = self.SessionLocal()
        with self.engine.begin() as conn:
            for table in (
                "wms_data_migrations",
                "wms_workstation_events",
                "wms_workstation_printer_mappings",
                "wms_workstations",
                "print_jobs",
                "printing_defaults",
                "agent_printers",
                "printer_agents",
                "integration_api_keys",
            ):
                try:
                    conn.execute(text(f"DELETE FROM {table}"))
                except Exception:
                    pass

    def tearDown(self) -> None:
        if self.db is not None:
            self.db.close()

    def _create_ws(self, name: str = "Pakowanie 1") -> dict:
        res = self.client.post(
            "/api/wms/workstations",
            params={"tenant_id": 1},
            json={
                "name": name,
                "warehouse_id": 1,
                "station_type": "packing",
                "description": "Stół testowy",
            },
        )
        self.assertEqual(res.status_code, 200, res.text)
        return res.json()


class TestWorkstationLifecycle(WorkstationsTestCase):
    def test_create_list_unpaired(self):
        created = self._create_ws()
        self.assertEqual(created["connection_status"], "unpaired")
        self.assertIsNone(created["computer_name"])
        self.assertEqual(created["station_type"], "packing")

        listed = self.client.get("/api/wms/workstations", params={"tenant_id": 1})
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()["items"]), 1)

    def test_pair_register_disconnect(self):
        ws = self._create_ws()
        pair = self.client.post(
            f"/api/wms/workstations/{ws['id']}/pair",
            params={"tenant_id": 1},
        )
        self.assertEqual(pair.status_code, 200, pair.text)
        body = pair.json()
        code = body["pairing_code"]
        self.assertTrue(looks_like_pairing_code(code))
        self.assertRegex(code, r"^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$")
        # Must not leak API jargon / spa_ key
        self.assertNotIn("spa_", str(body).lower())
        self.assertNotIn("api key", str(body).lower())
        self.assertNotIn("token", str(body).lower())
        self.assertNotIn("endpoint", str(body).lower())

        reg = self.client.post(
            "/api/printing/agents/register",
            headers={"Authorization": f"Bearer {code}"},
            json={
                "machine_id": "WIN-WS-001",
                "name": "MAGAZYN-PC-01",
                "version": "1.2.0",
                "warehouse_id": 1,
                "printers": [
                    {
                        "name": "Zebra ZD220",
                        "system_name": "Zebra ZD220",
                        "printer_type": "label",
                        "is_default": True,
                    },
                    {
                        "name": "Brother HL",
                        "system_name": "Brother HL-L2350DW",
                        "printer_type": "a4",
                        "is_default": True,
                    },
                ],
            },
        )
        self.assertEqual(reg.status_code, 200, reg.text)
        self.assertTrue(reg.json()["token"].startswith("spt_"))

        detail = self.client.get(
            f"/api/wms/workstations/{ws['id']}",
            params={"tenant_id": 1},
        )
        self.assertEqual(detail.status_code, 200)
        d = detail.json()
        self.assertEqual(d["computer_name"], "MAGAZYN-PC-01")
        self.assertIn(d["connection_status"], ("connected", "offline"))
        self.assertIsNotNone(d["agent"])

        # One agent cannot bind to two workstations
        ws2 = self._create_ws("Pakowanie 2")
        pair2 = self.client.post(
            f"/api/wms/workstations/{ws2['id']}/pair",
            params={"tenant_id": 1},
        ).json()
        reg2 = self.client.post(
            "/api/printing/agents/register",
            headers={"Authorization": f"Bearer {pair2['pairing_code']}"},
            json={
                "machine_id": "WIN-WS-001",
                "name": "MAGAZYN-PC-01",
                "version": "1.2.0",
                "warehouse_id": 1,
                "printers": [],
            },
        )
        self.assertEqual(reg2.status_code, 200, reg2.text)
        first = self.client.get(
            f"/api/wms/workstations/{ws['id']}",
            params={"tenant_id": 1},
        ).json()
        second = self.client.get(
            f"/api/wms/workstations/{ws2['id']}",
            params={"tenant_id": 1},
        ).json()
        self.assertEqual(first["connection_status"], "unpaired")
        self.assertEqual(second["computer_name"], "MAGAZYN-PC-01")

        disc = self.client.post(
            f"/api/wms/workstations/{ws2['id']}/disconnect",
            params={"tenant_id": 1},
        )
        self.assertEqual(disc.status_code, 200, disc.text)
        self.assertEqual(disc.json()["connection_status"], "unpaired")

    def test_printer_mapping_only_own_agent_printers(self):
        ws = self._create_ws()
        pair = self.client.post(
            f"/api/wms/workstations/{ws['id']}/pair",
            params={"tenant_id": 1},
        ).json()
        self.client.post(
            "/api/printing/agents/register",
            headers={"Authorization": f"Bearer {pair['pairing_code']}"},
            json={
                "machine_id": "WIN-MAP-1",
                "name": "PC-MAP",
                "version": "1.0.0",
                "warehouse_id": 1,
                "printers": [
                    {
                        "name": "Zebra",
                        "system_name": "ZDesigner",
                        "printer_type": "label",
                        "is_default": True,
                    }
                ],
            },
        )
        printers = self.client.get(
            f"/api/wms/workstations/{ws['id']}/printers",
            params={"tenant_id": 1},
        )
        self.assertEqual(printers.status_code, 200)
        available = printers.json()["available_printers"]
        self.assertEqual(len(available), 1)
        pid = available[0]["id"]

        ok = self.client.put(
            f"/api/wms/workstations/{ws['id']}/printer-mapping",
            params={"tenant_id": 1},
            json={"mappings": [{"print_type": "labels", "agent_printer_id": pid}]},
        )
        self.assertEqual(ok.status_code, 200, ok.text)
        self.assertEqual(ok.json()["mappings"][2]["agent_printer_id"], pid)  # labels index

        bad = self.client.put(
            f"/api/wms/workstations/{ws['id']}/printer-mapping",
            params={"tenant_id": 1},
            json={"mappings": [{"print_type": "labels", "agent_printer_id": 99999}]},
        )
        self.assertEqual(bad.status_code, 400)

    def test_migration_from_existing_agent(self):
        with self.SessionLocal() as db:
            agent = PrinterAgent(
                tenant_id=1,
                warehouse_id=1,
                machine_id="LEGACY-PC",
                name="LEGACY-PC-NAME",
                token_hash="abc",
                version="1.1.0",
                is_online=True,
            )
            db.add(agent)
            db.flush()
            db.add(
                AgentPrinter(
                    agent_id=agent.id,
                    name="HP",
                    system_name="HP LaserJet",
                    printer_type="a4",
                    is_default=True,
                    is_active=True,
                )
            )
            db.commit()
            agent_id = agent.id

            result = migrate_agents_to_workstations(db, force=True)
            db.commit()
            self.assertGreaterEqual(result["created"], 1)
            self.assertFalse(result.get("skipped"))

            ws = (
                db.query(WmsWorkstation)
                .filter(WmsWorkstation.printer_agent_id == agent_id)
                .first()
            )
            self.assertIsNotNone(ws)
            assert ws is not None
            self.assertEqual(ws.station_type, "other")

            # One-shot: second call skips entirely
            again = migrate_agents_to_workstations(db)
            db.commit()
            self.assertTrue(again.get("skipped"))
            self.assertEqual(again["created"], 0)

        listed = self.client.get("/api/wms/workstations", params={"tenant_id": 1})
        self.assertEqual(listed.status_code, 200)
        items = listed.json()["items"]
        self.assertTrue(any(i["computer_name"] == "LEGACY-PC-NAME" for i in items))
        match = next(i for i in items if i["computer_name"] == "LEGACY-PC-NAME")
        self.assertIn(match["connection_status"], ("connected", "offline"))

    def test_migration_does_not_hijack_empty_workstation(self):
        from backend.services.api_keys.api_key_service import create_key

        with self.SessionLocal() as db:
            empty = WmsWorkstation(
                tenant_id=1,
                warehouse_id=1,
                name="Pakowanie 1",
                station_type="packing",
                is_active=True,
                is_default=False,
            )
            db.add(empty)
            db.flush()
            empty_id = empty.id
            key, _plain = create_key(
                db,
                tenant_id=1,
                name="Orphan key",
                key_type="printer_agent",
                warehouse_id=1,
                created_by=1,
            )
            db.commit()
            key_id = key.id

            migrate_agents_to_workstations(db, force=True)
            db.commit()

            empty = db.query(WmsWorkstation).filter(WmsWorkstation.id == empty_id).first()
            self.assertIsNotNone(empty)
            assert empty is not None
            self.assertIsNone(empty.integration_api_key_id)

            dedicated = (
                db.query(WmsWorkstation)
                .filter(WmsWorkstation.integration_api_key_id == key_id)
                .first()
            )
            self.assertIsNotNone(dedicated)
            assert dedicated is not None
            self.assertNotEqual(dedicated.id, empty_id)


class TestWorkstationPrinterResolution(WorkstationsTestCase):
    def test_queue_uses_workstation_mapping_over_warehouse_default(self):
        from backend.models.printing.constants import PRINTER_TYPE_LABEL
        from backend.models.printing.printing_default import PrintingDefault
        from backend.services.printing.queue_service import resolve_queue_printer_id

        ws = self._create_ws("Pack Map")
        pair = self.client.post(
            f"/api/wms/workstations/{ws['id']}/pair",
            params={"tenant_id": 1},
        ).json()
        reg = self.client.post(
            "/api/printing/agents/register",
            headers={"Authorization": f"Bearer {pair['pairing_code']}"},
            json={
                "machine_id": "WIN-RES-1",
                "name": "PC-RES",
                "version": "1.0.0",
                "warehouse_id": 1,
                "printers": [
                    {
                        "name": "Zebra WS",
                        "system_name": "Zebra-WS",
                        "printer_type": "label",
                        "is_default": True,
                    },
                    {
                        "name": "Zebra WH",
                        "system_name": "Zebra-WH",
                        "printer_type": "label",
                        "is_default": False,
                    },
                ],
            },
        )
        self.assertEqual(reg.status_code, 200, reg.text)

        with self.SessionLocal() as db:
            printers = (
                db.query(AgentPrinter)
                .join(PrinterAgent)
                .filter(PrinterAgent.machine_id == "WIN-RES-1")
                .order_by(AgentPrinter.system_name.asc())
                .all()
            )
            self.assertEqual(len(printers), 2)
            wh_printer = next(p for p in printers if p.system_name == "Zebra-WH")
            ws_printer = next(p for p in printers if p.system_name == "Zebra-WS")
            db.add(
                PrintingDefault(
                    tenant_id=1,
                    warehouse_id=1,
                    printer_type=PRINTER_TYPE_LABEL,
                    agent_printer_id=wh_printer.id,
                )
            )
            db.add(
                WorkstationPrinterMapping(
                    workstation_id=ws["id"],
                    print_type="labels",
                    agent_printer_id=ws_printer.id,
                )
            )
            db.commit()

            resolution = resolve_queue_printer_id(
                db,
                tenant_id=1,
                warehouse_id=1,
                document_type="label",
                requested_printer_id=None,
                requested_profile_id=None,
                workstation_id=ws["id"],
            )
            self.assertEqual(resolution.source, "workstation")
            self.assertEqual(resolution.printer_id, ws_printer.id)

            # After clearing mapping → warehouse PrintingDefault
            db.query(WorkstationPrinterMapping).delete()
            db.commit()
            fallback = resolve_queue_printer_id(
                db,
                tenant_id=1,
                warehouse_id=1,
                document_type="label",
                requested_printer_id=None,
                requested_profile_id=None,
                workstation_id=ws["id"],
            )
            self.assertEqual(fallback.source, "default")
            self.assertEqual(fallback.printer_id, wh_printer.id)


class TestWorkstationHighPriority(WorkstationsTestCase):
    def test_pairing_code_is_single_use(self):
        ws = self._create_ws("Pair Once")
        pair = self.client.post(
            f"/api/wms/workstations/{ws['id']}/pair",
            params={"tenant_id": 1},
        ).json()
        code = pair["pairing_code"]
        first = self.client.post(
            "/api/printing/agents/register",
            headers={"Authorization": f"Bearer {code}"},
            json={
                "machine_id": "WIN-ONCE-1",
                "name": "PC-ONCE",
                "version": "1.0.0",
                "warehouse_id": 1,
                "printers": [],
            },
        )
        self.assertEqual(first.status_code, 200, first.text)
        replay = self.client.post(
            "/api/printing/agents/register",
            headers={"Authorization": f"Bearer {code}"},
            json={
                "machine_id": "WIN-ONCE-2",
                "name": "PC-REPLAY",
                "version": "1.0.0",
                "warehouse_id": 1,
                "printers": [],
            },
        )
        self.assertEqual(replay.status_code, 401, replay.text)

    def test_workstation_system_key_hidden_from_api_keys(self):
        ws = self._create_ws("Hidden Key")
        self.client.post(
            f"/api/wms/workstations/{ws['id']}/pair",
            params={"tenant_id": 1},
        )
        keys = self.client.get("/api/settings/api-keys", params={"tenant_id": 1})
        self.assertEqual(keys.status_code, 200, keys.text)
        for item in keys.json()["items"]:
            self.assertNotIn("Stanowisko", item.get("name") or "")
            desc = (item.get("description") or "").lower()
            self.assertNotIn("stanowiska", desc)

    def test_restart_agent_does_not_write_history(self):
        ws = self._create_ws("Restart Hist")
        pair = self.client.post(
            f"/api/wms/workstations/{ws['id']}/pair",
            params={"tenant_id": 1},
        ).json()
        self.client.post(
            "/api/printing/agents/register",
            headers={"Authorization": f"Bearer {pair['pairing_code']}"},
            json={
                "machine_id": "WIN-RST-1",
                "name": "PC-RST",
                "version": "1.0.0",
                "warehouse_id": 1,
                "printers": [],
            },
        )
        before = self.client.get(
            f"/api/wms/workstations/{ws['id']}/history",
            params={"tenant_id": 1},
        ).json()["items"]
        restart = self.client.post(
            f"/api/wms/workstations/{ws['id']}/restart-agent",
            params={"tenant_id": 1},
        )
        self.assertEqual(restart.status_code, 501)
        after = self.client.get(
            f"/api/wms/workstations/{ws['id']}/history",
            params={"tenant_id": 1},
        ).json()["items"]
        self.assertEqual(len(after), len(before))
        self.assertFalse(
            any(e["event_type"] == "agent_restart_requested" for e in after)
        )

    def test_repair_after_disconnect_keeps_assignment(self):
        ws = self._create_ws("Re-pair")
        pair1 = self.client.post(
            f"/api/wms/workstations/{ws['id']}/pair",
            params={"tenant_id": 1},
        ).json()
        self.client.post(
            "/api/printing/agents/register",
            headers={"Authorization": f"Bearer {pair1['pairing_code']}"},
            json={
                "machine_id": "WIN-REPAIR-1",
                "name": "PC-REPAIR",
                "version": "1.0.0",
                "warehouse_id": 1,
                "printers": [],
            },
        )
        disc = self.client.post(
            f"/api/wms/workstations/{ws['id']}/disconnect",
            params={"tenant_id": 1},
        )
        self.assertEqual(disc.status_code, 200)
        self.assertEqual(disc.json()["connection_status"], "unpaired")

        pair2 = self.client.post(
            f"/api/wms/workstations/{ws['id']}/pair",
            params={"tenant_id": 1},
        ).json()
        self.assertTrue(pair2["pairing_code"])
        detail_waiting = self.client.get(
            f"/api/wms/workstations/{ws['id']}",
            params={"tenant_id": 1},
        ).json()
        self.assertTrue(detail_waiting["pairing_active"])
        self.assertIsNone(detail_waiting["agent"])

        reg = self.client.post(
            "/api/printing/agents/register",
            headers={"Authorization": f"Bearer {pair2['pairing_code']}"},
            json={
                "machine_id": "WIN-REPAIR-1",
                "name": "PC-REPAIR",
                "version": "1.1.0",
                "warehouse_id": 1,
                "printers": [],
            },
        )
        self.assertEqual(reg.status_code, 200, reg.text)
        detail = self.client.get(
            f"/api/wms/workstations/{ws['id']}",
            params={"tenant_id": 1},
        ).json()
        self.assertEqual(detail["computer_name"], "PC-REPAIR")
        self.assertFalse(detail["pairing_active"])
        self.assertIsNotNone(detail["agent"])

    def test_create_rejects_foreign_warehouse(self):
        res = self.client.post(
            "/api/wms/workstations",
            params={"tenant_id": 1},
            json={
                "name": "Bad WH",
                "warehouse_id": 99999,
                "station_type": "packing",
            },
        )
        self.assertIn(res.status_code, (400, 404))

    def test_pairing_status_endpoint_and_history_offset(self):
        ws = self._create_ws("Status Poll")
        pair = self.client.post(
            f"/api/wms/workstations/{ws['id']}/pair",
            params={"tenant_id": 1},
        )
        self.assertEqual(pair.status_code, 200)
        status = self.client.get(
            f"/api/wms/workstations/{ws['id']}/pairing-status",
            params={"tenant_id": 1},
        )
        self.assertEqual(status.status_code, 200, status.text)
        body = status.json()
        self.assertTrue(body["pairing_active"])
        self.assertEqual(body["connection_status"], "unpaired")

        hist = self.client.get(
            f"/api/wms/workstations/{ws['id']}/history",
            params={"tenant_id": 1, "limit": 1, "offset": 0},
        )
        self.assertEqual(hist.status_code, 200)
        self.assertEqual(len(hist.json()["items"]), 1)
        hist2 = self.client.get(
            f"/api/wms/workstations/{ws['id']}/history",
            params={"tenant_id": 1, "limit": 1, "offset": 50},
        )
        self.assertEqual(hist2.status_code, 200)
        self.assertEqual(hist2.json()["items"], [])


class TestFeJargonBan(unittest.TestCase):
    """Smoke: workstation FE sources must not contain forbidden API jargon."""

    FORBIDDEN = re.compile(
        r"\b(API Key|Bearer|Token|Endpoint|Printer Agent|Scope|Integration)\b",
        re.IGNORECASE,
    )

    def test_workstation_pages_have_no_forbidden_jargon(self):
        from pathlib import Path

        root = (
            Path(__file__).resolve().parents[3]
            / "frontend"
            / "src"
            / "pages"
            / "Settings"
            / "wmsWorkstations"
        )
        self.assertTrue(root.is_dir(), str(root))
        offenders: list[str] = []
        for path in root.rglob("*.tsx"):
            text_content = path.read_text(encoding="utf-8")
            if self.FORBIDDEN.search(text_content):
                offenders.append(path.name)
        self.assertEqual(offenders, [], f"Forbidden jargon in: {offenders}")


if __name__ == "__main__":
    unittest.main()
