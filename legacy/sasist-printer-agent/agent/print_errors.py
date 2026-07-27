"""Windows print error mapping and diagnostics for Sasist Printer Agent."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any

from .printers import get_printer_diagnostics, list_windows_printers

logger = logging.getLogger(__name__)

# Win32 error codes (winerror)
ERROR_ACCESS_DENIED = 5
ERROR_GEN_FAILURE = 31
ERROR_INVALID_PRINTER_NAME = 1801
ERROR_PRINTER_OFFLINE = 3007

# ShellExecute SE_ERR_* return codes (when returned as int <= 32)
SE_ERR_ACCESSDENIED = 5
SE_ERR_NOASSOC = 31


@dataclass(frozen=True)
class PrintJobErrorInfo:
    technical: str
    friendly: str
    suggestion: str

    def to_api_message(self) -> str:
        payload = {
            "technical": self.technical,
            "friendly": self.friendly,
            "suggestion": self.suggestion,
        }
        return json.dumps(payload, ensure_ascii=False)

    def to_log_summary(self) -> str:
        return f"{self.friendly} | {self.technical}"


def _lookup_winerror(code: int, *, technical: str = "") -> PrintJobErrorInfo | None:
    lower = technical.lower()
    if code in (ERROR_GEN_FAILURE, SE_ERR_NOASSOC):
        if "shellexecute failed with code 31" in lower:
            return PrintJobErrorInfo(
                technical=technical or f"WinError {code}",
                friendly="System nie może wysłać pliku PDF do drukarki.",
                suggestion="Zainstaluj aplikację do odczytu PDF (np. Adobe Reader) lub ustaw domyślny program dla plików PDF.",
            )
        return PrintJobErrorInfo(
            technical=technical or f"WinError {code}",
            friendly="Drukarka jest niedostępna lub odłączona.",
            suggestion="Sprawdź kabel USB / sieć, włącz drukarkę i upewnij się, że jest widoczna w Windows (Ustawienia → Drukarki).",
        )

    mapping: dict[int, tuple[str, str]] = {
        ERROR_ACCESS_DENIED: (
            "Brak uprawnień do drukarki.",
            "Uruchom agenta jako użytkownik z dostępem do drukarki lub skontaktuj się z administratorem IT.",
        ),
        ERROR_INVALID_PRINTER_NAME: (
            "Nie znaleziono drukarki o wskazanej nazwie.",
            "Zsynchronizuj drukarki w agencie (menu tray) i wybierz poprawną drukarkę w panelu Sasist.",
        ),
        ERROR_PRINTER_OFFLINE: (
            "Drukarka jest w trybie offline.",
            "W ustawieniach drukarki w Windows odznacz „Praca offline” i upewnij się, że urządzenie jest gotowe.",
        ),
        SE_ERR_ACCESSDENIED: (
            "Brak uprawnień do drukarki.",
            "Uruchom agenta jako użytkownik z dostępem do drukarki lub skontaktuj się z administratorem IT.",
        ),
    }
    item = mapping.get(code)
    if not item:
        return None
    friendly, suggestion = item
    return PrintJobErrorInfo(
        technical=technical or f"WinError {code}",
        friendly=friendly,
        suggestion=suggestion,
    )


def _extract_winerror(exc: BaseException) -> int | None:
    winerror = getattr(exc, "winerror", None)
    if isinstance(winerror, int):
        return winerror
    if hasattr(exc, "args") and exc.args:
        first = exc.args[0]
        if isinstance(first, int):
            return first
    match = re.search(r"\((\d+),\s*['\"]?", str(exc))
    if match:
        return int(match.group(1))
    match = re.search(r"WinError\s+(\d+)", str(exc), re.IGNORECASE)
    if match:
        return int(match.group(1))
    match = re.search(r"code\s+(\d+)", str(exc), re.IGNORECASE)
    if match:
        return int(match.group(1))
    return None


def _message_hints(text: str) -> PrintJobErrorInfo | None:
    lower = text.lower()
    if "urządzenie dołączone do komputera nie działa" in lower or "device attached to the system is not functioning" in lower:
        return PrintJobErrorInfo(
            technical=text,
            friendly="Drukarka jest niedostępna lub odłączona.",
            suggestion="Sprawdź kabel USB / sieć, włącz drukarkę i upewnij się, że jest widoczna w Windows.",
        )
    if "invalid printer" in lower or ("nieprawidłow" in lower and "drukark" in lower):
        return PrintJobErrorInfo(
            technical=text,
            friendly="Nie znaleziono drukarki o wskazanej nazwie.",
            suggestion="Zsynchronizuj drukarki w agencie i wybierz poprawną drukarkę w panelu Sasist.",
        )
    if "offline" in lower or "off-line" in lower:
        return PrintJobErrorInfo(
            technical=text,
            friendly="Drukarka jest w trybie offline.",
            suggestion="W ustawieniach drukarki w Windows odznacz „Praca offline”.",
        )
    if "access is denied" in lower or "odmowa dostępu" in lower or "access denied" in lower:
        return PrintJobErrorInfo(
            technical=text,
            friendly="Brak uprawnień do drukarki.",
            suggestion="Uruchom agenta jako użytkownik z dostępem do drukarki lub skontaktuj się z administratorem IT.",
        )
    return None


def map_print_error(exc: BaseException, *, printer_name: str | None = None) -> PrintJobErrorInfo:
    technical = str(exc).strip() or exc.__class__.__name__
    if printer_name:
        technical = f"{technical} (drukarka: {printer_name})"

    hinted = _message_hints(technical)
    if hinted:
        return PrintJobErrorInfo(
            technical=technical,
            friendly=hinted.friendly,
            suggestion=hinted.suggestion,
        )

    winerror = _extract_winerror(exc)
    if winerror is not None:
        mapped = _lookup_winerror(winerror, technical=technical)
        if mapped:
            return PrintJobErrorInfo(
                technical=technical,
                friendly=mapped.friendly,
                suggestion=mapped.suggestion,
            )

    return PrintJobErrorInfo(
        technical=technical,
        friendly="Nie udało się wysłać dokumentu do drukarki.",
        suggestion="Sprawdź połączenie z drukarką, logi agenta i spróbuj ponowić wydruk z panelu Sasist.",
    )


def log_print_failure_context(printer_name: str | None, exc: BaseException) -> None:
    """Log printer diagnostics without changing print workflow."""
    logger.error("Print failure%s: %s", f" printer={printer_name!r}" if printer_name else "", exc)

    if printer_name:
        diag = get_printer_diagnostics(printer_name)
        logger.error(
            "Printer diagnostics for %r: status=%s work_offline=%s detail=%s",
            printer_name,
            diag.get("status_label", diag.get("status_code")),
            diag.get("work_offline"),
            diag,
        )

    try:
        available = list_windows_printers()
        names = [p.get("system_name") or p.get("name") for p in available]
        logger.error("Detected Windows printers (%s): %s", len(names), names)
    except Exception as list_exc:
        logger.error("Could not list Windows printers for diagnostics: %s", list_exc)


def build_job_error_message(exc: BaseException, printer_name: str | None = None) -> str:
    """Build structured JSON error payload for API + friendly local state."""
    existing = str(exc)
    if existing.startswith("{") and "friendly" in existing:
        try:
            json.loads(existing)
            return existing
        except json.JSONDecodeError:
            pass

    try:
        log_print_failure_context(printer_name, exc)
        info = map_print_error(exc, printer_name=printer_name)
        return info.to_api_message()
    except Exception:
        logger.exception("Failed to map print error")
        return str(exc)


def parse_job_error_message(raw: str | None) -> dict[str, Any] | None:
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if isinstance(parsed, dict) and "friendly" in parsed:
        return parsed
    return None
