"""Legacy CSV-import junk locations: hide from product API payloads."""

from backend.services.legacy_import_inventory_display_filter import (
    should_hide_legacy_csv_import_inventory_location,
)


def test_hides_import_default_unknown():
    assert should_hide_legacy_csv_import_inventory_location(loc_name="Import", loc_type="pick")
    assert should_hide_legacy_csv_import_inventory_location(loc_name="DEFAULT", loc_type="pick")


def test_hides_numeric_szt_garbage():
    assert should_hide_legacy_csv_import_inventory_location(loc_name="179 szt.", loc_type="pick")
    assert should_hide_legacy_csv_import_inventory_location(loc_name="53 szt", loc_type="pick")


def test_shows_when_location_uuid_set():
    assert not should_hide_legacy_csv_import_inventory_location(
        loc_name="PRZYJĘCIE",
        loc_type="floor",
        location_type="NORMAL",
        location_uuid="abc-123",
    )


def test_hides_przyjecie_floor_stub_without_uuid():
    assert should_hide_legacy_csv_import_inventory_location(
        loc_name="PRZYJĘCIE",
        loc_type="floor",
        location_type="NORMAL",
        location_uuid=None,
    )


def test_shows_real_pick_without_uuid():
    assert not should_hide_legacy_csv_import_inventory_location(
        loc_name="A-01-02",
        loc_type="pick",
        location_type="NORMAL",
        location_uuid=None,
    )
