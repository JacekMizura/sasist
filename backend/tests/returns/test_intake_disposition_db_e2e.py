"""FULL DB E2E: intake_disposition_json → warehouse commit → Z-PZ → inventory.

No heuristics. Exercises real rmz_return_receipt_service + StockDocument + Inventory.
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker

from backend.database import Base
from backend.models.activity_event import ActivityEvent, ActivityEventLink
from backend.models.app_user import AuditLog
from backend.models.document_series import DocumentSeries
from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.models.product_composition import ProductComposition, ProductCompositionLine
from backend.models.return_line_bundle_component import ReturnLineBundleComponent
from backend.models.return_status import ReturnStatus
from backend.models.rmz_line_component_recovery import RmzLineComponentRecovery
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.stock_document_return_link import StockDocumentReturnLink
from backend.models.stock_operation import StockOperation
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.warehouse_inventory_movement import WarehouseInventoryMovement
from backend.models.wms_order_return import WmsOrderReturn
from backend.models.wms_rmz_line import RMZLine
from backend.models.wms_settings import WmsSettings
from backend.schemas.wms_return import WmsReturnFinalizeLineIn
from backend.services.returns.errors import RmzFinalizeError
from backend.services.returns.manufactured_component_recovery_service import (
    apply_manufacturing_recovery_to_line,
    assert_manufacturing_recovery_ready_for_warehouse_commit,
    product_qualifies_for_manufacturing_recovery,
)
from backend.services.returns.rmz_finalize_service import (
    warehouse_commit_rmz_existing_lines,
    warehouse_commit_rmz_return,
)
from backend.services.returns.rmz_workflow_config_service import (
    ensure_rmz_workflow_snapshot,
    read_rmz_workflow_snapshot,
    stamp_rmz_snapshot_on_create,
)
from backend.services.rmz_return_receipt_service import ensure_rmz_return_receipt_document
from backend.services.stock_disposition import (
    STOCK_DISPOSITION_OUTLET_B,
    STOCK_DISPOSITION_SALEABLE,
    STOCK_DISPOSITION_SERVICE_C,
)


FG_ID = 100
COMP_ID = 200
BOM_COEF = 2.0  # components per disassembled FG


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    tables = [
        Tenant.__table__,
        Warehouse.__table__,
        Product.__table__,
        Location.__table__,
        Order.__table__,
        OrderItem.__table__,
        ReturnStatus.__table__,
        WmsSettings.__table__,
        WmsOrderReturn.__table__,
        RMZLine.__table__,
        ReturnLineBundleComponent.__table__,
        ProductComposition.__table__,
        ProductCompositionLine.__table__,
        RmzLineComponentRecovery.__table__,
        DocumentSeries.__table__,
        StockDocument.__table__,
        StockDocumentItem.__table__,
        StockDocumentReturnLink.__table__,
        StockOperation.__table__,
        WarehouseInventoryMovement.__table__,
        Inventory.__table__,
        AuditLog.__table__,
        ActivityEvent.__table__,
        ActivityEventLink.__table__,
    ]
    Base.metadata.create_all(bind=engine, tables=tables)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH", requires_putaway=True))
    session.add(Warehouse(id=2, tenant_id=1, name="WH2", requires_putaway=True))
    session.flush()
    session.add(
        Location(
            id=1,
            warehouse_id=1,
            name="DOCK-IN",
            type="floor",
            location_type="DOCK",
            is_active=True,
        )
    )
    session.add(
        Location(
            id=10,
            warehouse_id=1,
            name="RECOVERY-A",
            type="pick",
            location_type="NORMAL",
            is_active=True,
        )
    )
    session.add(
        Location(
            id=11,
            warehouse_id=1,
            name="RECOVERY-INACTIVE",
            type="pick",
            location_type="NORMAL",
            is_active=False,
        )
    )
    session.add(
        Location(
            id=20,
            warehouse_id=2,
            name="OTHER-WH",
            type="pick",
            location_type="NORMAL",
            is_active=True,
        )
    )
    session.add(Product(id=FG_ID, tenant_id=1, name="FG", sku="FG-1"))
    session.add(Product(id=COMP_ID, tenant_id=1, name="COMP", sku="C-1"))
    session.flush()
    comp = ProductComposition(
        id=1,
        tenant_id=1,
        product_id=FG_ID,
        composition_mode="manufacturing",
        name="BOM v1",
        version="1",
        is_active=True,
    )
    session.add(comp)
    session.flush()
    session.add(
        ProductCompositionLine(
            id=5,
            composition_id=1,
            component_product_id=COMP_ID,
            quantity=BOM_COEF,
            sort_order=0,
        )
    )
    session.add(
        DocumentSeries(
            id="z-pz-1",
            tenant_id=1,
            warehouse_id=1,
            name="Z-PZ",
            prefix="ZPZ",
            series_type="WAREHOUSE",
            subtype="Z_PZ",
            is_active=True,
            is_default=True,
            collective_return_receipt=False,
        )
    )
    for key, typ in (
        ("start", "in_progress"),
        ("success", "done_success"),
        ("rejected", "done_rejected"),
        ("office_pending", "in_progress"),
    ):
        session.add(
            ReturnStatus(
                tenant_id=1,
                warehouse_id=1,
                name=key,
                color="blue",
                type=typ,
                transition_key=key,
            )
        )
    session.add(
        WmsSettings(
            tenant_id=1,
            warehouse_id=1,
            returns_mode="simple",
            refund_processing="disabled",
            manufactured_component_recovery_mode="OPTIONAL",
            manufactured_recovery_receipt_mode="STANDARD_PUTAWAY",
            manufactured_recovery_location_id=None,
        )
    )
    session.add(Order(id=1, tenant_id=1, warehouse_id=1, number="O-1"))
    session.flush()
    session.add(
        OrderItem(
            id=10,
            order_id=1,
            product_id=FG_ID,
            quantity=10,
            is_bundle_parent=False,
        )
    )
    session.commit()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _settings(db, **over) -> WmsSettings:
    row = db.query(WmsSettings).filter(WmsSettings.tenant_id == 1, WmsSettings.warehouse_id == 1).one()
    for k, v in over.items():
        setattr(row, k, v)
    db.flush()
    return row


def _alloc(*, a_fg=0, a_dq=0, b_fg=0, b_dq=0, c_fg=0, c_dq=0):
    return [
        {"disposition": "SALEABLE", "fg_qty": a_fg, "disassembly_qty": a_dq},
        {"disposition": "OUTLET_B", "fg_qty": b_fg, "disassembly_qty": b_dq},
        {"disposition": "SERVICE_C", "fg_qty": c_fg, "disassembly_qty": c_dq},
    ]


def _seed_rmz(
    db,
    *,
    accepted=0,
    b=0,
    c=0,
    rejected=0,
    mode="OPTIONAL",
    receipt="STANDARD_PUTAWAY",
    loc=None,
    rmz_number="RMZ-1",
    oi_id=10,
    qty=None,
):
    settings = _settings(
        db,
        manufactured_component_recovery_mode=mode,
        manufactured_recovery_receipt_mode=receipt,
        manufactured_recovery_location_id=loc,
    )
    start = (
        db.query(ReturnStatus)
        .filter(
            ReturnStatus.tenant_id == 1,
            ReturnStatus.warehouse_id == 1,
            ReturnStatus.transition_key == "start",
        )
        .one()
    )
    total = qty if qty is not None else accepted + b + c + rejected
    rmz = WmsOrderReturn(
        tenant_id=1,
        warehouse_id=1,
        order_id=1,
        rmz_number=rmz_number,
        return_type="RMA",
        status_id=int(start.id),
        lines_json="[]",
    )
    stamp_rmz_snapshot_on_create(rmz, settings)
    db.add(rmz)
    db.flush()
    decision = "REJECTED" if rejected == total and total > 0 else ("DAMAGED" if b + c > 0 else "OK")
    ln = RMZLine(
        rmz_id=int(rmz.id),
        order_item_id=int(oi_id),
        product_id=FG_ID,
        quantity=float(total),
        accepted_qty=int(accepted),
        damaged_b_qty=int(b),
        damaged_c_qty=int(c),
        rejected_qty=int(rejected),
        decision=decision,
    )
    db.add(ln)
    db.flush()
    return rmz, ln, settings


def _apply_intake(db, ln, settings, rows, *, recovery_mode="OPTIONAL", require_decision=True):
    dq = sum(int(r["disassembly_qty"]) for r in rows)
    recoveries = None
    if dq > 0:
        expected = BOM_COEF * dq
        recoveries = [
            {
                "composition_line_id": 5,
                "component_product_id": COMP_ID,
                "accepted_qty": expected,
                "scrap_qty": 0,
                "expected_qty": expected,
            }
        ]
    apply_manufacturing_recovery_to_line(
        db,
        tenant_id=1,
        rmz_line=ln,
        settings=settings,
        is_bundle_line=False,
        intake_disposition=rows,
        component_recoveries=recoveries,
        recovery_mode=recovery_mode,
        require_decision=require_decision,
    )
    db.flush()


def _zpz_items(db, doc_id: int):
    return (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == int(doc_id))
        .order_by(StockDocumentItem.id.asc())
        .all()
    )


def _inv_qty(db, product_id: int, location_id: int | None = None) -> float:
    q = db.query(func.coalesce(func.sum(Inventory.quantity), 0.0)).filter(
        Inventory.tenant_id == 1,
        Inventory.product_id == int(product_id),
    )
    if location_id is not None:
        q = q.filter(Inventory.location_id == int(location_id))
    return float(q.scalar() or 0.0)


def _fg_by_disp(items):
    out = {STOCK_DISPOSITION_SALEABLE: 0.0, STOCK_DISPOSITION_OUTLET_B: 0.0, STOCK_DISPOSITION_SERVICE_C: 0.0}
    for it in items:
        if int(it.product_id) != FG_ID:
            continue
        disp = str(getattr(it, "stock_disposition", None) or getattr(it, "return_disposition", None) or "")
        out[disp] = out.get(disp, 0.0) + float(it.received_quantity or 0)
    return out


def _comp_qty(items) -> float:
    return sum(float(it.received_quantity or 0) for it in items if int(it.product_id) == COMP_ID)


# ---------------------------------------------------------------------------
# Case A / B / C — full Z-PZ + inventory via receipt service
# ---------------------------------------------------------------------------


class TestZpzDbE2eAllocation:
    def test_case_a_mixed_a_b_rejected_zero(self, db):
        rmz, ln, settings = _seed_rmz(db, accepted=4, b=2, rejected=4, qty=10, mode="OPTIONAL")
        rows = _alloc(a_fg=2, a_dq=2, b_fg=0, b_dq=2)
        _apply_intake(db, ln, settings, rows, recovery_mode="OPTIONAL")
        snap = ensure_rmz_workflow_snapshot(db, rmz)
        warehouse_commit_rmz_existing_lines(db, rmz, settings=settings, snapshot=snap)
        db.flush()

        doc = db.query(StockDocument).filter(StockDocument.rmz_id == int(rmz.id)).one()
        items = _zpz_items(db, doc.id)
        fg = _fg_by_disp(items)
        assert fg[STOCK_DISPOSITION_SALEABLE] == 2.0
        assert fg[STOCK_DISPOSITION_OUTLET_B] == 0.0
        assert _comp_qty(items) == pytest.approx(BOM_COEF * 4)
        assert all(int(it.product_id) != FG_ID or float(it.received_quantity or 0) > 0 for it in items)
        # REJECTED never on Z-PZ / inventory
        assert _inv_qty(db, FG_ID) == pytest.approx(2.0)  # only SALEABLE FG on dock
        assert _inv_qty(db, COMP_ID) == pytest.approx(BOM_COEF * 4)

    def test_case_b_outlet_partial_no_double(self, db):
        rmz, ln, settings = _seed_rmz(db, accepted=0, b=2, rejected=0, qty=2, mode="OPTIONAL")
        rows = _alloc(b_fg=1, b_dq=1)
        _apply_intake(db, ln, settings, rows, recovery_mode="OPTIONAL")
        snap = ensure_rmz_workflow_snapshot(db, rmz)
        warehouse_commit_rmz_existing_lines(db, rmz, settings=settings, snapshot=snap)
        db.flush()

        doc = db.query(StockDocument).filter(StockDocument.rmz_id == int(rmz.id)).one()
        items = _zpz_items(db, doc.id)
        fg = _fg_by_disp(items)
        assert fg[STOCK_DISPOSITION_OUTLET_B] == 1.0
        assert fg[STOCK_DISPOSITION_SALEABLE] == 0.0
        assert _comp_qty(items) == pytest.approx(BOM_COEF * 1)
        assert _inv_qty(db, FG_ID) == pytest.approx(1.0)
        assert _inv_qty(db, COMP_ID) == pytest.approx(BOM_COEF * 1)

        # retry idempotent — no second inventory
        ensure_rmz_return_receipt_document(db, rmz)
        db.flush()
        assert _inv_qty(db, FG_ID) == pytest.approx(1.0)
        assert _inv_qty(db, COMP_ID) == pytest.approx(BOM_COEF * 1)
        assert len(_zpz_items(db, doc.id)) == len(items)

    def test_case_c_required_all_dq_components_only(self, db):
        rmz, ln, settings = _seed_rmz(
            db, accepted=2, b=2, rejected=0, qty=4, mode="REQUIRED", rmz_number="RMZ-REQ"
        )
        rows = _alloc(a_dq=2, b_dq=2)
        _apply_intake(db, ln, settings, rows, recovery_mode="REQUIRED")
        snap = ensure_rmz_workflow_snapshot(db, rmz)
        warehouse_commit_rmz_existing_lines(db, rmz, settings=settings, snapshot=snap)
        db.flush()

        doc = db.query(StockDocument).filter(StockDocument.rmz_id == int(rmz.id)).one()
        items = _zpz_items(db, doc.id)
        fg = _fg_by_disp(items)
        assert fg[STOCK_DISPOSITION_SALEABLE] == 0.0
        assert fg[STOCK_DISPOSITION_OUTLET_B] == 0.0
        assert _comp_qty(items) == pytest.approx(BOM_COEF * 4)
        assert _inv_qty(db, FG_ID) == pytest.approx(0.0)
        assert _inv_qty(db, COMP_ID) == pytest.approx(BOM_COEF * 4)


class TestRejectedHardInvariantDb:
    def test_rejected_only_no_zpz_no_inventory(self, db):
        rmz, ln, settings = _seed_rmz(db, accepted=0, b=0, c=0, rejected=1, qty=1, mode="REQUIRED")
        # receivable=0 — apply clears; commit must not invent stock
        apply_manufacturing_recovery_to_line(
            db,
            tenant_id=1,
            rmz_line=ln,
            settings=settings,
            is_bundle_line=False,
            intake_disposition=_alloc(),
            recovery_mode="REQUIRED",
            require_decision=True,
        )
        db.flush()
        snap = ensure_rmz_workflow_snapshot(db, rmz)
        warehouse_commit_rmz_existing_lines(db, rmz, settings=settings, snapshot=snap)
        db.flush()
        assert db.query(StockDocument).filter(StockDocument.rmz_id == int(rmz.id)).count() == 0
        assert _inv_qty(db, FG_ID) == 0.0
        assert _inv_qty(db, COMP_ID) == 0.0
        assert db.query(RmzLineComponentRecovery).filter_by(rmz_line_id=int(ln.id)).count() == 0


class TestRequiredBypassDb:
    def test_commit_existing_without_intake_fails_before_zpz(self, db):
        rmz, ln, settings = _seed_rmz(db, accepted=2, b=0, qty=2, mode="REQUIRED", rmz_number="RMZ-BYPASS")
        # No intake_disposition_json
        ln.intake_disposition_json = None
        ln.fg_intake_qty = None
        ln.disassembly_qty = None
        ln.stock_intake_mode = None
        db.flush()
        snap = ensure_rmz_workflow_snapshot(db, rmz)
        with pytest.raises(RmzFinalizeError):
            warehouse_commit_rmz_existing_lines(db, rmz, settings=settings, snapshot=snap)
        assert db.query(StockDocument).count() == 0
        assert _inv_qty(db, FG_ID) == 0.0

    def test_finalize_payload_without_intake_required_fails(self, db):
        rmz, ln, settings = _seed_rmz(db, accepted=0, b=0, qty=2, mode="REQUIRED", rmz_number="RMZ-FIN")
        # Line still unresolved commercially — finalize will set accepted=2 without intake
        ln.accepted_qty = 0
        ln.decision = None
        db.flush()
        snap = ensure_rmz_workflow_snapshot(db, rmz)
        payload = WmsReturnFinalizeLineIn(
            order_item_id=10,
            product_id=FG_ID,
            accepted_qty=2,
            damaged_qty=0,
            damaged_b_qty=0,
            damaged_c_qty=0,
            rejected_qty=0,
            # no intake_disposition
        )
        with pytest.raises(RmzFinalizeError):
            warehouse_commit_rmz_return(
                db, rmz, line_payloads=[payload], settings=settings, snapshot=snap
            )
        assert db.query(StockDocument).count() == 0
        assert _inv_qty(db, FG_ID) == 0.0


class TestSnapshotIsolationDb:
    def test_existing_rmz_keeps_stamped_settings(self, db):
        rmz, ln, settings = _seed_rmz(
            db,
            accepted=1,
            qty=1,
            mode="OPTIONAL",
            receipt="STANDARD_PUTAWAY",
            loc=None,
            rmz_number="RMZ-SNAP",
        )
        before = read_rmz_workflow_snapshot(rmz)
        assert before is not None
        assert before.manufactured_component_recovery_mode == "OPTIONAL"
        assert before.manufactured_recovery_receipt_mode == "STANDARD_PUTAWAY"

        # Admin changes live settings
        _settings(
            db,
            manufactured_component_recovery_mode="REQUIRED",
            manufactured_recovery_receipt_mode="DEFAULT_LOCATION",
            manufactured_recovery_location_id=10,
        )
        again = ensure_rmz_workflow_snapshot(db, rmz)
        assert again.manufactured_component_recovery_mode == "OPTIONAL"
        assert again.manufactured_recovery_receipt_mode == "STANDARD_PUTAWAY"
        assert again.manufactured_recovery_location_id is None

        # New RMZ picks up live
        rmz2, _, _ = _seed_rmz(
            db,
            accepted=1,
            qty=1,
            mode="REQUIRED",
            receipt="DEFAULT_LOCATION",
            loc=10,
            rmz_number="RMZ-NEW",
            oi_id=10,
        )
        # Force unique order_item for second line constraint — reuse oi ok across rmz
        snap2 = read_rmz_workflow_snapshot(rmz2)
        assert snap2 is not None
        assert snap2.manufactured_component_recovery_mode == "REQUIRED"
        assert snap2.manufactured_recovery_receipt_mode == "DEFAULT_LOCATION"
        assert snap2.manufactured_recovery_location_id == 10


class TestLegacyAmbiguousDb:
    def test_multi_bucket_legacy_blocks_commit(self, db):
        rmz, ln, settings = _seed_rmz(db, accepted=4, b=2, qty=6, mode="OPTIONAL", rmz_number="RMZ-LEG")
        ln.intake_disposition_json = None
        ln.disassembly_qty = 4
        ln.fg_intake_qty = 0
        ln.stock_intake_mode = "DISASSEMBLE"
        db.flush()
        snap = ensure_rmz_workflow_snapshot(db, rmz)
        with pytest.raises(RmzFinalizeError):
            warehouse_commit_rmz_existing_lines(db, rmz, settings=settings, snapshot=snap)
        assert db.query(StockDocument).count() == 0

    def test_single_bucket_legacy_deterministic(self, db):
        from backend.services.returns.intake_disposition import try_deterministic_legacy_conversion

        rmz, ln, settings = _seed_rmz(db, accepted=4, b=0, qty=4, mode="OPTIONAL", rmz_number="RMZ-LEG2")
        ln.intake_disposition_json = None
        ln.disassembly_qty = 4
        ln.fg_intake_qty = 0
        ln.stock_intake_mode = "DISASSEMBLE"
        db.flush()
        rows = try_deterministic_legacy_conversion(ln, recovery_mode="OPTIONAL")
        assert rows is not None
        assert rows[0]["disassembly_qty"] == 4
        assert rows[0]["fg_qty"] == 0
        # Persist via apply then commit
        _apply_intake(db, ln, settings, rows, recovery_mode="OPTIONAL")
        snap = ensure_rmz_workflow_snapshot(db, rmz)
        warehouse_commit_rmz_existing_lines(db, rmz, settings=settings, snapshot=snap)
        db.flush()
        doc = db.query(StockDocument).filter(StockDocument.rmz_id == int(rmz.id)).one()
        assert _fg_by_disp(_zpz_items(db, doc.id))[STOCK_DISPOSITION_SALEABLE] == 0.0
        assert _comp_qty(_zpz_items(db, doc.id)) == pytest.approx(BOM_COEF * 4)


class TestBomFreezeDb:
    def test_reopen_keeps_old_coef_after_bom_edit(self, db):
        rmz, ln, settings = _seed_rmz(db, accepted=2, qty=2, mode="OPTIONAL", rmz_number="RMZ-BOM")
        rows = _alloc(a_dq=2)
        _apply_intake(db, ln, settings, rows, recovery_mode="OPTIONAL")
        rec = db.query(RmzLineComponentRecovery).filter_by(rmz_line_id=int(ln.id)).one()
        assert float(rec.expected_qty) == pytest.approx(BOM_COEF * 2)

        # Admin changes live BOM coef to 5
        cl = db.query(ProductCompositionLine).filter_by(id=5).one()
        cl.quantity = 5.0
        db.flush()

        # Re-apply with empty matrix — must keep frozen expected (reuse_existing)
        apply_manufacturing_recovery_to_line(
            db,
            tenant_id=1,
            rmz_line=ln,
            settings=settings,
            is_bundle_line=False,
            intake_disposition=rows,
            component_recoveries=None,
            recovery_mode="OPTIONAL",
            require_decision=True,
        )
        db.flush()
        rec2 = db.query(RmzLineComponentRecovery).filter_by(rmz_line_id=int(ln.id)).one()
        assert float(rec2.expected_qty) == pytest.approx(BOM_COEF * 2)

        # New RMZ uses live ×5
        rmz2, ln2, settings2 = _seed_rmz(db, accepted=1, qty=1, mode="OPTIONAL", rmz_number="RMZ-BOM2")
        rows_new = _alloc(a_dq=1)
        apply_manufacturing_recovery_to_line(
            db,
            tenant_id=1,
            rmz_line=ln2,
            settings=settings2,
            is_bundle_line=False,
            intake_disposition=rows_new,
            component_recoveries=[
                {
                    "composition_line_id": 5,
                    "component_product_id": COMP_ID,
                    "accepted_qty": 5.0,
                    "scrap_qty": 0,
                    "expected_qty": 5.0,
                }
            ],
            recovery_mode="OPTIONAL",
            require_decision=True,
        )
        db.flush()
        rec_new = db.query(RmzLineComponentRecovery).filter_by(rmz_line_id=int(ln2.id)).one()
        assert float(rec_new.expected_qty) == pytest.approx(5.0)


class TestDefaultLocationDb:
    def test_a_active_loc_direct_putaway_components(self, db):
        rmz, ln, settings = _seed_rmz(
            db,
            accepted=1,
            qty=1,
            mode="OPTIONAL",
            receipt="DEFAULT_LOCATION",
            loc=10,
            rmz_number="RMZ-DL-OK",
        )
        _apply_intake(db, ln, settings, _alloc(a_dq=1), recovery_mode="OPTIONAL")
        snap = ensure_rmz_workflow_snapshot(db, rmz)
        warehouse_commit_rmz_existing_lines(db, rmz, settings=settings, snapshot=snap)
        db.flush()
        assert _inv_qty(db, COMP_ID, location_id=10) == pytest.approx(BOM_COEF * 1)
        doc = db.query(StockDocument).filter(StockDocument.rmz_id == int(rmz.id)).one()
        for it in _zpz_items(db, doc.id):
            if int(it.product_id) == COMP_ID:
                assert float(it.quantity_putaway or 0) == pytest.approx(float(it.received_quantity or 0))

    def test_b_inactive_loc_fails(self, db):
        rmz, ln, settings = _seed_rmz(
            db,
            accepted=1,
            qty=1,
            mode="OPTIONAL",
            receipt="DEFAULT_LOCATION",
            loc=11,
            rmz_number="RMZ-DL-INACT",
        )
        _apply_intake(db, ln, settings, _alloc(a_dq=1), recovery_mode="OPTIONAL")
        snap = ensure_rmz_workflow_snapshot(db, rmz)
        with pytest.raises(RmzFinalizeError):
            warehouse_commit_rmz_existing_lines(db, rmz, settings=settings, snapshot=snap)
        assert db.query(StockDocument).count() == 0
        assert _inv_qty(db, COMP_ID) == 0.0

    def test_c_other_warehouse_fails(self, db):
        rmz, ln, settings = _seed_rmz(
            db,
            accepted=1,
            qty=1,
            mode="OPTIONAL",
            receipt="DEFAULT_LOCATION",
            loc=20,
            rmz_number="RMZ-DL-WH",
        )
        _apply_intake(db, ln, settings, _alloc(a_dq=1), recovery_mode="OPTIONAL")
        snap = ensure_rmz_workflow_snapshot(db, rmz)
        with pytest.raises(RmzFinalizeError):
            warehouse_commit_rmz_existing_lines(db, rmz, settings=settings, snapshot=snap)
        assert db.query(StockDocument).count() == 0

    def test_d_missing_loc_fails(self, db):
        rmz, ln, settings = _seed_rmz(
            db,
            accepted=1,
            qty=1,
            mode="OPTIONAL",
            receipt="DEFAULT_LOCATION",
            loc=999,
            rmz_number="RMZ-DL-MISS",
        )
        _apply_intake(db, ln, settings, _alloc(a_dq=1), recovery_mode="OPTIONAL")
        snap = ensure_rmz_workflow_snapshot(db, rmz)
        with pytest.raises(RmzFinalizeError):
            warehouse_commit_rmz_existing_lines(db, rmz, settings=settings, snapshot=snap)
        assert db.query(StockDocument).count() == 0

    def test_e_retry_idempotent(self, db):
        rmz, ln, settings = _seed_rmz(
            db,
            accepted=1,
            qty=1,
            mode="OPTIONAL",
            receipt="DEFAULT_LOCATION",
            loc=10,
            rmz_number="RMZ-DL-RET",
        )
        _apply_intake(db, ln, settings, _alloc(a_dq=1), recovery_mode="OPTIONAL")
        snap = ensure_rmz_workflow_snapshot(db, rmz)
        warehouse_commit_rmz_existing_lines(db, rmz, settings=settings, snapshot=snap)
        db.flush()
        q1 = _inv_qty(db, COMP_ID, location_id=10)
        ensure_rmz_return_receipt_document(db, rmz)
        db.flush()
        assert _inv_qty(db, COMP_ID, location_id=10) == pytest.approx(q1)


class TestStandardPutawayDb:
    def test_components_land_on_dock_not_full_putaway(self, db):
        rmz, ln, settings = _seed_rmz(
            db, accepted=1, qty=1, mode="OPTIONAL", receipt="STANDARD_PUTAWAY", rmz_number="RMZ-STD"
        )
        _apply_intake(db, ln, settings, _alloc(a_dq=1), recovery_mode="OPTIONAL")
        snap = ensure_rmz_workflow_snapshot(db, rmz)
        warehouse_commit_rmz_existing_lines(db, rmz, settings=settings, snapshot=snap)
        db.flush()
        doc = db.query(StockDocument).filter(StockDocument.rmz_id == int(rmz.id)).one()
        assert doc.location_id is not None
        dock_id = int(doc.location_id)
        for it in _zpz_items(db, doc.id):
            if int(it.product_id) == COMP_ID:
                assert float(it.quantity_putaway or 0) == pytest.approx(0.0)
        assert _inv_qty(db, COMP_ID, location_id=dock_id) == pytest.approx(BOM_COEF * 1)
        # Putaway queue signal: relocation/putaway not DONE for open dock stock
        assert str(getattr(doc, "putaway_status", "") or "").upper() != "DONE"


class TestBundlePrecedenceDb:
    def test_bundle_parent_skips_manufactured_recovery(self, db):
        oi = db.query(OrderItem).filter(OrderItem.id == 10).one()
        oi.is_bundle_parent = True
        db.flush()
        assert product_qualifies_for_manufacturing_recovery(
            db, 1, FG_ID, is_bundle_line=True
        ) is False
        rmz, ln, settings = _seed_rmz(db, accepted=2, qty=2, mode="REQUIRED", rmz_number="RMZ-BND")
        # Bundle line: apply is no-op for mfg; commit gate skips bundles
        apply_manufacturing_recovery_to_line(
            db,
            tenant_id=1,
            rmz_line=ln,
            settings=settings,
            is_bundle_line=True,
            intake_disposition=_alloc(a_dq=2),
            recovery_mode="REQUIRED",
            require_decision=True,
        )
        db.flush()
        assert db.query(RmzLineComponentRecovery).filter_by(rmz_line_id=int(ln.id)).count() == 0
        assert_manufacturing_recovery_ready_for_warehouse_commit(
            db,
            tenant_id=1,
            rmz_line=ln,
            recovery_mode="REQUIRED",
            is_bundle_line=True,
        )
