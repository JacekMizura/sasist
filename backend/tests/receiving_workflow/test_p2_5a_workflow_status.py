"""P2.5A — receiving workflow status derivation."""

from __future__ import annotations

from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.services.receiving_workflow_status_service import (
    WH_CLOSED,
    WH_COUNTED,
    WH_COUNTING,
    WH_NEW,
    WH_PUTAWAY_COMPLETED,
    WH_PUTAWAY_IN_PROGRESS,
    PU_PENDING_INVOICE,
    derive_warehouse_workflow_status,
    normalize_purchase_workflow_status,
    sync_warehouse_workflow_status,
)


def _doc(**kwargs) -> StockDocument:
    base = dict(
        tenant_id=1,
        document_type="PZ",
        status="draft",
        receiving_status="NEW",
        putaway_status="NOT_STARTED",
        relocation_status="OPEN",
        warehouse_workflow_status=WH_NEW,
        purchase_workflow_status=PU_PENDING_INVOICE,
    )
    base.update(kwargs)
    return StockDocument(**base)


def _line(recv: float = 0.0, put: float = 0.0) -> StockDocumentItem:
    return StockDocumentItem(
        document_id=1,
        ordered_quantity=10.0,
        received_quantity=recv,
        quantity_putaway=put,
        quantity=recv,
        vat_rate=23.0,
    )


class TestDeriveWarehouseWorkflowStatus:
    def test_new_empty(self):
        doc = _doc()
        assert derive_warehouse_workflow_status(doc, []) == WH_NEW

    def test_counting_in_progress(self):
        doc = _doc(receiving_status="IN_PROGRESS")
        assert derive_warehouse_workflow_status(doc, [_line(recv=2.0)]) == WH_COUNTING

    def test_counted_receiving_done(self):
        doc = _doc(receiving_status="DONE")
        lines = [_line(recv=10.0)]
        assert derive_warehouse_workflow_status(doc, lines, full_recv=True, full_put=False) == WH_COUNTED

    def test_putaway_in_progress(self):
        doc = _doc(receiving_status="DONE", putaway_status="IN_PROGRESS")
        lines = [_line(recv=10.0, put=3.0)]
        assert derive_warehouse_workflow_status(doc, lines, full_recv=True, full_put=False) == WH_PUTAWAY_IN_PROGRESS

    def test_putaway_completed(self):
        doc = _doc(receiving_status="DONE", putaway_status="DONE", relocation_status="DONE")
        lines = [_line(recv=10.0, put=10.0)]
        assert derive_warehouse_workflow_status(doc, lines, full_recv=True, full_put=True) == WH_PUTAWAY_COMPLETED

    def test_closed_posted(self):
        doc = _doc(status="posted", receiving_status="DONE", putaway_status="DONE", relocation_status="DONE")
        lines = [_line(recv=10.0, put=10.0)]
        assert derive_warehouse_workflow_status(doc, lines, full_recv=True, full_put=True) == WH_CLOSED


class TestPurchaseStatusIndependent:
    def test_purchase_status_does_not_affect_warehouse_derivation(self):
        doc = _doc(purchase_workflow_status="COST_DISPUTE", receiving_status="IN_PROGRESS")
        assert derive_warehouse_workflow_status(doc, [_line(recv=1.0)]) == WH_COUNTING

    def test_normalize_purchase_default(self):
        assert normalize_purchase_workflow_status(None) == PU_PENDING_INVOICE

    def test_sync_persists_derived(self):
        doc = _doc(receiving_status="IN_PROGRESS")
        lines = [_line(recv=5.0)]
        changed = sync_warehouse_workflow_status(doc, lines, None, full_recv=False, full_put=False)
        assert changed is True
        assert doc.warehouse_workflow_status == WH_COUNTING
