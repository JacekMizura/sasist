"""Launch external updater process."""

from __future__ import annotations

import logging
import subprocess
import sys
from pathlib import Path

logger = logging.getLogger(__name__)


def _updater_script() -> Path:
    root = Path(__file__).resolve().parent.parent
    return root / "updater" / "update.py"


def launch_updater(source_dir: str) -> None:
    script = _updater_script()
    if not script.is_file():
        logger.error("Updater script not found: %s", script)
        return

    python = sys.executable
    if getattr(sys, "frozen", False):
        # Bundled updater exe next to agent
        updater_exe = Path(sys.executable).parent / "SasistPrinterUpdater.exe"
        if updater_exe.is_file():
            cmd = [str(updater_exe), "--source", source_dir]
        else:
            cmd = [python, str(script), "--source", source_dir]
    else:
        cmd = [python, str(script), "--source", source_dir]

    logger.info("Launching updater: %s", " ".join(cmd))
    subprocess.Popen(cmd, close_fds=True)
