"""Sasist Printer Agent updater — stop service, replace files, restart service."""

from __future__ import annotations

import argparse
import logging
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

SERVICE_NAME = "SasistPrinterService"
DEFAULT_INSTALL_DIR = Path(r"C:\Program Files\Sasist\PrinterAgent")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("sasist.updater")


def run_sc(*args: str) -> int:
    cmd = ["sc", *args]
    logger.info("Running: %s", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.stdout:
        logger.info(result.stdout.strip())
    if result.stderr:
        logger.warning(result.stderr.strip())
    return result.returncode


def stop_service() -> None:
    run_sc("stop", SERVICE_NAME)
    for _ in range(30):
        query = subprocess.run(["sc", "query", SERVICE_NAME], capture_output=True, text=True)
        if "STOPPED" in (query.stdout or ""):
            return
        time.sleep(1)
    logger.warning("Service may still be running")


def start_service() -> None:
    run_sc("start", SERVICE_NAME)


def configure_service_recovery() -> None:
    # Restart on 1st, 2nd and 3rd failure (60s delay)
    run_sc("failure", SERVICE_NAME, "reset=", "86400", "actions=", "restart/60000/restart/60000/restart/60000")


def copy_tree(source: Path, target: Path) -> None:
    for item in source.iterdir():
        dest = target / item.name
        if item.is_dir():
            if dest.exists():
                copy_tree(item, dest)
            else:
                shutil.copytree(item, dest)
        else:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, dest)


def update_files(source_dir: Path, install_dir: Path) -> None:
    install_dir.mkdir(parents=True, exist_ok=True)
    copy_tree(source_dir, install_dir)


def cleanup(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path, ignore_errors=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Sasist Printer Agent updater")
    parser.add_argument("--source", required=True, help="Extracted update package directory")
    parser.add_argument("--install-dir", default=str(DEFAULT_INSTALL_DIR))
    parser.add_argument("--keep-temp", action="store_true")
    args = parser.parse_args()

    source = Path(args.source).resolve()
    install_dir = Path(args.install_dir).resolve()
    if not source.is_dir():
        logger.error("Source directory not found: %s", source)
        return 1

    temp_backup: Path | None = None
    try:
        stop_service()
        temp_backup = Path(tempfile.mkdtemp(prefix="sasist-agent-backup-"))
        logger.info("Updating %s from %s", install_dir, source)
        update_files(source, install_dir)
        configure_service_recovery()
        start_service()
        logger.info("Update completed successfully")
        return 0
    except Exception:
        logger.exception("Update failed")
        return 1
    finally:
        if temp_backup and temp_backup.exists() and not args.keep_temp:
            cleanup(temp_backup)
        if not args.keep_temp:
            cleanup(source.parent if source.name.startswith("extract-") else source)


if __name__ == "__main__":
    raise SystemExit(main())
