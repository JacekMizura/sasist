"""Inspect PyInstaller __main__ entry script inside a one-file EXE."""

from __future__ import annotations

import dis
import marshal
import sys
from pathlib import Path

from PyInstaller.archive.readers import CArchiveReader


def inspect_exe(path: Path) -> None:
    print(f"=== {path.name} ===")
    arch = CArchiveReader(str(path))
    if "__main__" not in arch.toc:
        print("No __main__ entry in archive")
        return
    blob = arch.extract("__main__")
    print("raw size:", len(blob))
    for marker in (b"from .app import main", b"from agent.app import main"):
        print(f"  bytes marker {marker!r}: {marker in blob}")

    code = None
    for skip in (0, 1, 8, 12, 16):
        try:
            code = marshal.loads(blob[skip:])
            print(f"marshal ok with skip={skip}")
            break
        except Exception:
            continue
    if code is None:
        print("could not unmarshal __main__")
        return
    print("co_names:", code.co_names)
    print("co_consts:", code.co_consts)
    dis.dis(code)


if __name__ == "__main__":
    targets = sys.argv[1:] or [
        str(Path(__file__).resolve().parents[1] / "dist" / "SasistPrinterAgent.exe"),
    ]
    for target in targets:
        inspect_exe(Path(target))
