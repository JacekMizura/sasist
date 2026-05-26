"""Filtr lokalizacji technicznych dla widoku stanu magazynowego."""

from backend.models.location import Location
from backend.services.inventory_operational_location_filter import (
    exclude_location_from_operational_inventory_list,
    is_technical_staging_location_name,
)


def test_technical_names_polish_and_en():
    assert is_technical_staging_location_name("PRZYJĘCIE")
    assert is_technical_staging_location_name("przyjecie")
    assert is_technical_staging_location_name("Strefa PRZYJĘCIE")
    assert is_technical_staging_location_name("RECEIVING-1")
    assert is_technical_staging_location_name("BUFFER")
    assert is_technical_staging_location_name("BUFOR")
    assert is_technical_staging_location_name("TMP")
    assert is_technical_staging_location_name("SYSTEM")


def test_non_technical_pick_location():
    assert not is_technical_staging_location_name("A-01-02")
    assert not is_technical_staging_location_name("Regał B / poziom 3")


def test_exclude_combines_legacy_and_technical():
    loc = Location(warehouse_id=1, name="PRZYJĘCIE", type="floor", location_type="NORMAL", location_uuid="real-uuid")
    assert exclude_location_from_operational_inventory_list(loc)

    real = Location(warehouse_id=1, name="R-01-A", type="pick", location_type="NORMAL", location_uuid=None)
    assert not exclude_location_from_operational_inventory_list(real)
