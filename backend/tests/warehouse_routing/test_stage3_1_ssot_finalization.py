"""Etap 3.1 — static guards: no routing surrogates in WMS runtime consumers."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_package_init_exports_only_reader_for_wms_distance():
    src = (ROOT / "services" / "warehouse_routing" / "__init__.py").read_text(encoding="utf-8")
    assert "runtime_chain_distance_m" in src
    assert "visit_index_map" in src
    assert "order_location_ids_by_graph" in src
    assert "chain_distance_through_location_ids" not in src
    assert "route_between_locations" not in src
    assert "route_between_points_cm" not in src


def test_simulation_init_no_euclidean_export():
    src = (ROOT / "domain" / "simulation" / "__init__.py").read_text(encoding="utf-8")
    assert "euclidean" not in src.lower()
    assert "compute_visit_order_euclidean" not in src


def test_analytics_walking_cost_uses_order_then_chain():
    src = (ROOT / "services" / "analytics_service.py").read_text(encoding="utf-8")
    assert "order_location_ids_by_graph" in src
    assert "runtime_chain_distance_m" in src or "chain_distance_m" in src
    wc = src.split("def walking_cost(", 1)[1].split("\ndef get_pick_route(", 1)[0]
    assert "Location.pick_sequence" not in wc
    assert "access_resolution" not in src


def test_product_list_route_sort_key_from_visit_index():
    src = (ROOT / "services" / "wms_picking_product_list_service.py").read_text(encoding="utf-8")
    assert "visit_index_map" in src
    assert 'route_sort_key=loc if loc' not in src
    assert '"route_sort_key": code' not in src


def test_inventory_allocation_uses_visit_index_not_pick_sequence_path():
    src = (ROOT / "services" / "inventory_allocation_service.py").read_text(encoding="utf-8")
    assert "visit_index_map" in src
    assert "current_pick_sequence" not in src
    assert "_effective_pick_sequence" not in src


def test_zone_strategy_zones_from_graph():
    src = (ROOT / "domain" / "picking_simulation" / "zone_strategy.py").read_text(encoding="utf-8")
    assert "order_location_ids_by_graph" in src
    assert "Location.pick_sequence" not in src


def test_pick_helpers_no_pick_sequence_sort():
    src = (ROOT / "domain" / "picking_simulation" / "_pick_helpers.py").read_text(encoding="utf-8")
    assert "visit_index_map" in src
    assert "order_location_ids_by_graph" in src
    assert "Location.pick_sequence" not in src
    assert 'p.get("pick_sequence")' not in src
