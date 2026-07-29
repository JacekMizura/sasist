"""Print profiles SSOT + workstation mapping migration."""

from __future__ import annotations

from backend.printing_profiles import (
    PRINT_PROFILE_DOCUMENTS,
    PRINT_PROFILE_LABELS,
    PRINT_PROFILE_SHIPPING_LABELS,
    document_type_to_print_profile,
    normalize_print_profile,
)


def test_document_type_to_print_profile_ssot():
    assert document_type_to_print_profile("production_batch_card") == PRINT_PROFILE_DOCUMENTS
    assert document_type_to_print_profile("invoice") == PRINT_PROFILE_DOCUMENTS
    assert document_type_to_print_profile("warehouse_wz") == PRINT_PROFILE_DOCUMENTS
    assert document_type_to_print_profile("shipping_label") == PRINT_PROFILE_SHIPPING_LABELS
    assert document_type_to_print_profile("location_label") == PRINT_PROFILE_LABELS
    assert document_type_to_print_profile("inventory_report") == "REPORTS"
    assert document_type_to_print_profile("unknown_thing") == PRINT_PROFILE_DOCUMENTS


def test_normalize_legacy_print_types():
    assert normalize_print_profile("labels") == PRINT_PROFILE_LABELS
    assert normalize_print_profile("shipping_label") == PRINT_PROFILE_SHIPPING_LABELS
    assert normalize_print_profile("invoice") == PRINT_PROFILE_DOCUMENTS
    assert normalize_print_profile("order") == PRINT_PROFILE_DOCUMENTS
    assert normalize_print_profile("other") == PRINT_PROFILE_DOCUMENTS
    assert normalize_print_profile("DOCUMENTS") == PRINT_PROFILE_DOCUMENTS


def test_migrate_collapses_documents_keeping_invoice_priority(tmp_path):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from backend.database import Base
    from backend.models.wms_workstations import WorkstationPrinterMapping
    from backend.services.wms_workstations.migration import (
        ensure_data_migrations_table,
        migrate_printer_mappings_to_profiles,
    )

    engine = create_engine(f"sqlite:///{tmp_path / 'pp.db'}")
    Base.metadata.create_all(bind=engine)
    ensure_data_migrations_table(engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        # Minimal FK-free insert may fail if FKs enforced — use raw values with ws id 1
        # Create stub workstation if required by FK
        from backend.models.wms_workstations import WmsWorkstation

        ws = WmsWorkstation(
            tenant_id=1,
            warehouse_id=1,
            name="T",
            station_type="other",
            is_active=True,
        )
        db.add(ws)
        db.flush()
        # agent_printer_id FK — may need a printer; skip if too heavy and use null? NOT NULL
        # Use a fake id and disable FK for sqlite
        db.execute(__import__("sqlalchemy").text("PRAGMA foreign_keys=OFF"))
        db.add(
            WorkstationPrinterMapping(
                workstation_id=ws.id, print_profile="invoice", agent_printer_id=1
            )
        )
        db.add(
            WorkstationPrinterMapping(
                workstation_id=ws.id, print_profile="order", agent_printer_id=2
            )
        )
        db.add(
            WorkstationPrinterMapping(
                workstation_id=ws.id, print_profile="labels", agent_printer_id=3
            )
        )
        db.commit()

        result = migrate_printer_mappings_to_profiles(db, force=True)
        db.commit()
        assert result["skipped"] is False
        rows = db.query(WorkstationPrinterMapping).order_by(WorkstationPrinterMapping.id).all()
        profiles = {r.print_profile: r.agent_printer_id for r in rows}
        assert profiles[PRINT_PROFILE_DOCUMENTS] == 1  # invoice kept
        assert profiles[PRINT_PROFILE_LABELS] == 3
        assert PRINT_PROFILE_SHIPPING_LABELS not in profiles
        assert len(rows) == 2
    finally:
        db.close()
