"""Discover Windows printers via win32print."""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def list_windows_printers() -> list[dict[str, Any]]:
    try:
        import win32print
    except ImportError as exc:
        logger.error("pywin32 is required on Windows: %s", exc)
        return []

    flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
    raw = win32print.EnumPrinters(flags)
    printers: list[dict[str, Any]] = []
    seen: set[str] = set()

    for entry in raw:
        if len(entry) < 3:
            continue
        system_name = str(entry[2] or "").strip()
        if not system_name or system_name in seen:
            continue
        seen.add(system_name)
        display_name = str(entry[1] or system_name).strip() or system_name
        printers.append(
            {
                "name": display_name,
                "system_name": system_name,
                "printer_type": "other",
                "is_default": False,
            }
        )

    try:
        default_printer = win32print.GetDefaultPrinter()
        if default_printer:
            for item in printers:
                if item["system_name"] == default_printer:
                    item["is_default"] = True
                    break
    except Exception:
        logger.debug("Could not resolve default printer", exc_info=True)

    logger.info("Discovered %s Windows printer(s)", len(printers))
    return printers
