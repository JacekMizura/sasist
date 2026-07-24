"""
Regression: production entrypoint must import cleanly.

Routing Graph unit tests can pass while backend.main still fails on a dangling
import pulled in by a single router (e.g. analysis → slotting_service).
This smoke test guards Railway /healthz 503 caused by import-time crash.
"""

from __future__ import annotations

import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent

# Symbols removed from domain.simulation in Stage 2 (commit 0ae9e47d).
_STAGE2_REMOVED_SIMULATION_EXPORTS = frozenset(
    {
        "get_location_to_node_map",
        "get_special_locations_xy",
        "get_node_nearest_to_point",
        "get_start_node_for_warehouse",
        "get_adjacency",
        "distance_point_to_point_cm",
        "shortest_path_dijkstra",
        "dijkstra_dist",
    }
)

_DELETED_IMPORT_NEEDLES = (
    "domain.simulation.warehouse_graph_service",
    "services.warehouse_graph_service",
    "services.graph_location_service",
    "backend.services.warehouse_graph_service",
    "backend.services.graph_location_service",
    "backend.domain.simulation.warehouse_graph_service",
)


def test_backend_main_imports_without_error():
    import backend.main as main_mod

    assert hasattr(main_mod, "app")


def test_slotting_uses_layout_geometry_helpers():
    """Exact Railway failure path must stay on neutral geometry helpers."""
    src = (ROOT / "services" / "slotting_service.py").read_text(encoding="utf-8")
    assert "layout_geometry" in src
    assert "get_special_locations_xy" in src
    assert "distance_point_to_point_cm" in src
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            if node.module.endswith("domain.simulation"):
                names = {a.name for a in node.names}
                bad = names & _STAGE2_REMOVED_SIMULATION_EXPORTS
                assert not bad, f"slotting_service imports removed simulation symbols: {bad}"


def test_no_imports_of_stage2_deleted_python_modules():
    offenders: list[str] = []
    for path in ROOT.rglob("*.py"):
        if "__pycache__" in path.parts or path.name == "test_backend_startup_import.py":
            continue
        for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            stripped = line.strip()
            if not (stripped.startswith("from ") or stripped.startswith("import ")):
                continue
            for needle in _DELETED_IMPORT_NEEDLES:
                if needle in stripped:
                    offenders.append(f"{path.relative_to(REPO)}:{i}: {stripped}")
    assert not offenders, "Dangling Stage 2 module imports:\n" + "\n".join(offenders)


def test_no_imports_of_removed_simulation_exports():
    offenders: list[str] = []
    for path in ROOT.rglob("*.py"):
        if "__pycache__" in path.parts or path.name == "test_backend_startup_import.py":
            continue
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.ImportFrom) or not node.module:
                continue
            mod = node.module
            if not mod.endswith("domain.simulation"):
                continue
            if mod.endswith("domain.simulation.warehouse_graph_service"):
                offenders.append(f"{path.relative_to(REPO)}: deleted warehouse_graph_service")
                continue
            for alias in node.names:
                if alias.name in _STAGE2_REMOVED_SIMULATION_EXPORTS:
                    offenders.append(
                        f"{path.relative_to(REPO)} imports {alias.name} from {mod}"
                    )
    assert not offenders, "Dangling Stage 2 simulation exports:\n" + "\n".join(offenders)


def test_layout_geometry_helpers_exist_and_are_graph_free():
    path = ROOT / "domain" / "layout_geometry.py"
    src = path.read_text(encoding="utf-8")
    assert "def get_special_locations_xy" in src
    assert "def distance_point_to_point_cm" in src
    tree = ast.parse(src)
    imported_modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            imported_modules.add(node.module)
        elif isinstance(node, ast.Import):
            for alias in node.names:
                imported_modules.add(alias.name)
    assert not any("warehouse_graph" in m for m in imported_modules)
    assert not any("warehouse_routing" in m for m in imported_modules)
    assert any(m.endswith("models.location") for m in imported_modules)
