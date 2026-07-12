#!/usr/bin/env python3
"""Verify SasistPrinterAgent.exe bundles required UI modules, assets, and VERSION."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path

REQUIRED_UI_MODULES = (
    "agent.ui.widgets",
    "agent.ui.log_viewer_window",
    "agent.ui.status_window",
    "agent.ui.config_dialog",
    "agent.ui.host",
    "agent.ui.dialogs",
    "agent.ui.window_registry",
)

UI_MISSING_MESSAGE = "Installer was built without the new UI modules."


def _import_pyinstaller_readers():
    try:
        from PyInstaller.archive.readers import CArchiveReader, ZlibArchiveReader
    except ImportError as exc:
        raise SystemExit(
            "PyInstaller is required for release validation. Install: pip install pyinstaller"
        ) from exc
    return CArchiveReader, ZlibArchiveReader


def list_pyz_modules(exe_path: Path) -> set[str]:
    CArchiveReader, ZlibArchiveReader = _import_pyinstaller_readers()
    arch = CArchiveReader(str(exe_path))
    pyz_key = next((key for key in arch.toc if "PYZ" in key and key.endswith(".pyz")), None)
    if not pyz_key:
        raise RuntimeError(f"PYZ archive not found in {exe_path}")

    pyz_data = arch.extract(pyz_key)
    fd, tmp_path = tempfile.mkstemp(suffix=".pyz")
    os.close(fd)
    try:
        Path(tmp_path).write_bytes(pyz_data)
        reader = ZlibArchiveReader(tmp_path)
        return set(reader.toc.keys())
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def read_bundled_file(exe_path: Path, needle: str) -> bytes | None:
    CArchiveReader, _ = _import_pyinstaller_readers()
    arch = CArchiveReader(str(exe_path))
    for key in arch.toc:
        normalized = key.replace("\\", "/").lstrip("./")
        if normalized == needle or normalized.endswith(f"/{needle}"):
            return arch.extract(key)
    return None


def read_bundled_version(exe_path: Path) -> str | None:
    raw = read_bundled_file(exe_path, "VERSION")
    if not raw:
        return None
    return raw.decode("utf-8-sig", errors="replace").strip()


def read_bundled_icon_sha256(exe_path: Path) -> str | None:
    raw = read_bundled_file(exe_path, "assets/icon.ico")
    if not raw:
        raw = read_bundled_file(exe_path, "icon.ico")
    if not raw:
        return None
    return hashlib.sha256(raw).hexdigest()


def verify_agent_exe(
    exe_path: Path,
    *,
    expected_version: str | None = None,
    expected_icon_sha256: str | None = None,
) -> dict:
    if not exe_path.is_file():
        raise RuntimeError(f"Agent EXE not found: {exe_path}")

    modules = list_pyz_modules(exe_path)
    missing = [name for name in REQUIRED_UI_MODULES if name not in modules]
    if missing:
        print(UI_MISSING_MESSAGE, file=sys.stderr)
        print(f"Missing modules: {', '.join(missing)}", file=sys.stderr)
        print(
            f"Found agent.ui modules: {sorted(name for name in modules if name.startswith('agent.ui'))}",
            file=sys.stderr,
        )
        raise SystemExit(1)

    bundled_version = read_bundled_version(exe_path)
    if expected_version:
        if not bundled_version:
            print(f"VERSION file missing inside EXE: {exe_path}", file=sys.stderr)
            raise SystemExit(1)
        if bundled_version != expected_version:
            print(
                f"Version mismatch: EXE bundles VERSION={bundled_version!r}, expected {expected_version!r}",
                file=sys.stderr,
            )
            raise SystemExit(1)

    icon_sha = read_bundled_icon_sha256(exe_path)
    if expected_icon_sha256:
        if not icon_sha:
            print("assets/icon.ico missing inside EXE", file=sys.stderr)
            raise SystemExit(1)
        if icon_sha != expected_icon_sha256.lower():
            print(
                f"Icon mismatch: bundled={icon_sha} expected={expected_icon_sha256.lower()}",
                file=sys.stderr,
            )
            raise SystemExit(1)

    result = {
        "exe": str(exe_path),
        "version": bundled_version,
        "icon_sha256": icon_sha,
        "ui_modules": list(REQUIRED_UI_MODULES),
    }
    print(f"[verify-agent-exe] OK {exe_path.name}")
    print(f"[verify-agent-exe] UI modules: {', '.join(REQUIRED_UI_MODULES)}")
    if bundled_version:
        print(f"[verify-agent-exe] Bundled VERSION: {bundled_version}")
    if icon_sha:
        print(f"[verify-agent-exe] Bundled icon SHA256: {icon_sha}")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify SasistPrinterAgent.exe release contents.")
    parser.add_argument("exe", type=Path, help="Path to SasistPrinterAgent.exe")
    parser.add_argument(
        "--expected-version",
        help="Expected semver from sasist-printer-agent/VERSION (bundled VERSION must match).",
    )
    parser.add_argument(
        "--expected-icon-sha256",
        help="Expected SHA256 of assets/icon.ico bundled inside the EXE.",
    )
    parser.add_argument("--json", action="store_true", help="Print verification summary as JSON.")
    args = parser.parse_args()
    result = verify_agent_exe(
        args.exe.resolve(),
        expected_version=args.expected_version,
        expected_icon_sha256=args.expected_icon_sha256,
    )
    if args.json:
        print(json.dumps(result))


if __name__ == "__main__":
    main()
