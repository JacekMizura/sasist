"""Static smoke after Stage 2: legacy auto-graph writers gone; adapters use authored SSOT."""

from __future__ import annotations

import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_legacy_graph_writers_deleted():
    assert not (ROOT / "services" / "warehouse_graph_service.py").exists()
    assert not (ROOT / "services" / "graph_location_service.py").exists()
    assert not (ROOT / "domain" / "simulation" / "warehouse_graph_service.py").exists()


def test_layout_save_has_no_graph_rebuild():
    src = (ROOT / "services" / "warehouse_layout_service.py").read_text(encoding="utf-8")
    assert "WarehouseGraphService" not in src
    assert "build_graph" not in src
    assert "assign_locations_to_graph_nodes" not in src


def test_route_path_is_compatibility_adapter():
    src = (ROOT / "api" / "route.py").read_text(encoding="utf-8")
    assert "Compatibility" in src or "compatibility" in src
    assert "route_between_points_cm" in src
    assert "from ..models.warehouse_graph" not in src


def test_warehouse_graph_api_projects_authored_graph():
    src = (ROOT / "api" / "warehouse_graph.py").read_text(encoding="utf-8")
    assert "get_graph" in src
    assert "WarehouseGraphService" not in src
    assert "LEGACY_GRAPH_GENERATE_REMOVED" in src


def test_new_routing_package_does_not_import_legacy_graph():
    pkg = ROOT / "services" / "warehouse_routing"
    for path in pkg.rglob("*.py"):
        src = path.read_text(encoding="utf-8")
        assert "warehouse_graph_service" not in src
        assert "models.warehouse_graph" not in src


def test_simulation_package_exports_without_legacy_graph():
    src = (ROOT / "domain" / "simulation" / "__init__.py").read_text(encoding="utf-8")
    assert "get_adjacency" not in src
    assert "simulate_single_order" in src


def test_analytics_imports_routing_access_resolution():
    src = (ROOT / "services" / "analytics_service.py").read_text(encoding="utf-8")
    assert "access_resolution" in src or "warehouse_routing" in src
    assert "LocationNode" not in src
    assert "get_adjacency" not in src
