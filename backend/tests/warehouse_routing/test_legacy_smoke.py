"""Static + import smoke: legacy routing surfaces remain importable and unwired from new SSOT."""

from __future__ import annotations

import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_legacy_modules_import():
    from backend.services.warehouse_graph_service import WarehouseGraphService
    from backend.services.analytics_service import walking_cost, get_pick_route, get_pick_route_batch
    from backend.api import route as route_api
    from backend.api import analysis as analysis_api
    from backend.services import warehouse_layout_service as layout_svc

    assert WarehouseGraphService is not None
    assert callable(walking_cost)
    assert callable(get_pick_route)
    assert callable(get_pick_route_batch)
    assert hasattr(route_api, "router")
    assert hasattr(analysis_api, "router")
    assert hasattr(layout_svc, "WarehouseLayoutService")


def test_new_routing_package_does_not_import_legacy_graph():
    pkg = ROOT / "services" / "warehouse_routing"
    forbidden = (
        "warehouse_graph_service",
        "WarehouseGraphService",
        "models.warehouse_graph",
        "WarehouseNode",
        "WarehouseEdge",
        "LocationNode",
    )
    for path in pkg.rglob("*.py"):
        src = path.read_text(encoding="utf-8")
        tree = ast.parse(src)
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module:
                joined = node.module
                for bad in forbidden:
                    assert bad not in joined, f"{path} imports {joined}"
            if isinstance(node, ast.Import):
                for alias in node.names:
                    for bad in forbidden:
                        assert bad not in alias.name, f"{path} imports {alias.name}"
        for bad in ("from backend.services.warehouse_graph", "from backend.models.warehouse_graph"):
            assert bad not in src, f"{path} contains legacy import {bad}"


def test_layout_save_still_calls_legacy_build_graph_only():
    path = ROOT / "services" / "warehouse_layout_service.py"
    src = path.read_text(encoding="utf-8")
    assert "WarehouseGraphService" in src
    assert "build_graph" in src
    assert "warehouse_routing" not in src
    assert "replace_graph" not in src


def test_legacy_route_path_endpoint_still_defined():
    path = ROOT / "api" / "route.py"
    src = path.read_text(encoding="utf-8")
    assert "/path" in src
    assert "warehouse_routing" not in src


def test_analytics_walking_cost_and_pick_route_still_defined():
    path = ROOT / "services" / "analytics_service.py"
    src = path.read_text(encoding="utf-8")
    assert "def walking_cost" in src
    assert "def get_pick_route" in src
    assert "warehouse_routing" not in src


def test_main_wires_both_legacy_and_new_routing():
    path = ROOT / "main.py"
    src = path.read_text(encoding="utf-8")
    assert "warehouse_routing" in src
    assert "ensure_warehouse_routing_schema" in src
    assert "from .api.route import" in src or "api.route" in src
    assert "analysis_router" in src
