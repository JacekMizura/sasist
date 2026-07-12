"""Smoke tests for PyInstaller-compatible entrypoints."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _load_script_like_pyinstaller(relative_path: str) -> None:
    script_path = PROJECT_ROOT / relative_path
    project_root = str(PROJECT_ROOT)
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    spec = importlib.util.spec_from_file_location("_pyinstaller_entry_smoke", script_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)


def test_main_py_smoke_no_import_error():
    _load_script_like_pyinstaller("agent/__main__.py")


def test_service_main_py_smoke_no_import_error():
    _load_script_like_pyinstaller("agent/service_main.py")


def test_main_module_via_package():
    import agent.__main__ as main_module

    assert callable(main_module.main)
