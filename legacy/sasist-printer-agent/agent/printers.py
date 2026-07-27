"""Discover Windows printers via win32print."""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

_PRINTER_STATUS_LABELS: dict[int, str] = {
    0x00000000: "READY",
    0x00000001: "PAUSED",
    0x00000002: "ERROR",
    0x00000004: "PENDING_DELETION",
    0x00000008: "PAPER_JAM",
    0x00000010: "PAPER_OUT",
    0x00000020: "MANUAL_FEED",
    0x00000040: "PAPER_PROBLEM",
    0x00000080: "OFFLINE",
    0x00000100: "IO_ACTIVE",
    0x00000200: "BUSY",
    0x00000400: "PRINTING",
    0x00000800: "OUTPUT_BIN_FULL",
    0x00001000: "NOT_AVAILABLE",
    0x00002000: "WAITING",
    0x00004000: "PROCESSING",
    0x00008000: "INITIALIZING",
    0x00010000: "WARMING_UP",
    0x00020000: "TONER_LOW",
    0x00040000: "NO_TONER",
    0x00080000: "PAGE_PUNT",
    0x00100000: "USER_INTERVENTION",
    0x00200000: "OUT_OF_MEMORY",
    0x00400000: "DOOR_OPEN",
}


def _decode_printer_status(status_code: int) -> str:
    if status_code == 0:
        return "READY"
    flags = [label for bit, label in _PRINTER_STATUS_LABELS.items() if bit and (status_code & bit)]
    return "|".join(flags) if flags else f"UNKNOWN({status_code})"


def get_printer_diagnostics(printer_name: str) -> dict[str, Any]:
    """Read PrinterStatus / WorkOffline for logging (no workflow changes)."""
    try:
        import win32print
    except ImportError as exc:
        return {"printer_name": printer_name, "lookup_error": f"pywin32 unavailable: {exc}"}

    try:
        handle = win32print.OpenPrinter(printer_name)
    except Exception as exc:
        return {"printer_name": printer_name, "lookup_error": str(exc)}

    try:
        info = win32print.GetPrinter(handle, 2)
        status_code = int(info.get("Status") or 0)
        attributes = int(info.get("Attributes") or 0)
        work_offline = bool(attributes & win32print.PRINTER_ATTRIBUTE_WORK_OFFLINE)
        return {
            "printer_name": printer_name,
            "status_code": status_code,
            "status_label": _decode_printer_status(status_code),
            "work_offline": work_offline,
            "attributes": attributes,
        }
    except Exception as exc:
        return {"printer_name": printer_name, "lookup_error": str(exc)}
    finally:
        try:
            win32print.ClosePrinter(handle)
        except Exception:
            logger.debug("ClosePrinter failed", exc_info=True)


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
