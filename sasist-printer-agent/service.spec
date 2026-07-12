# -*- mode: python ; coding: utf-8 -*-
# Windows Service — one-file EXE (no Python sources shipped to client).

from pathlib import Path

project_root = Path(SPECPATH)

a = Analysis(
    [str(project_root / "agent" / "service_main.py")],
    pathex=[str(project_root)],
    binaries=[],
    datas=[
        (str(project_root / "assets" / "icon.ico"), "assets"),
        (str(project_root / "config" / "config.example.json"), "config"),
    ],
    hiddenimports=[
        "win32print",
        "win32api",
        "win32service",
        "win32serviceutil",
        "win32event",
        "servicemanager",
        "pystray",
        "PIL",
        "requests",
        "agent",
        "agent.service",
        "agent.service_main",
        "agent.runtime",
        "agent.runtime.core",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="SasistPrinterService",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(project_root / "assets" / "icon.ico"),
)
