"""Verify SasistAgentSetup.exe exists (Stage 5). Python agent EXE checks retired."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify Sasist Agent installer (Stage 5).")
    parser.add_argument(
        "exe",
        type=Path,
        nargs="?",
        default=None,
        help="Optional path to SasistAgentSetup.exe",
    )
    args = parser.parse_args()

    repo = Path(__file__).resolve().parents[1]
    candidates = [
        args.exe,
        repo / "Output" / "SasistAgentSetup.exe",
        repo / "sasist-agent" / "dist" / "SasistAgentSetup.exe",
    ]
    for path in candidates:
        if path and path.is_file():
            print(f"OK: {path} ({path.stat().st_size} bytes)")
            return 0

    print("FAIL: SasistAgentSetup.exe not found", file=sys.stderr)
    print("Build via: powershell -File installer\\build.ps1", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
