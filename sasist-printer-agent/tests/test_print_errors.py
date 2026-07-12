"""Tests for Windows print error mapping."""

from __future__ import annotations

import json

import pytest

from agent.print_errors import (
    ERROR_GEN_FAILURE,
    ERROR_INVALID_PRINTER_NAME,
    ERROR_PRINTER_OFFLINE,
    ERROR_ACCESS_DENIED,
    build_job_error_message,
    map_print_error,
    parse_job_error_message,
)


class WinErrorStub(Exception):
    def __init__(self, winerror: int, msg: str) -> None:
        super().__init__(msg)
        self.winerror = winerror


def test_map_winerror_31_device_not_functioning() -> None:
    exc = WinErrorStub(ERROR_GEN_FAILURE, "Urządzenie dołączone do komputera nie działa.")
    info = map_print_error(exc, printer_name="Etykiety")
    assert "niedostępna" in info.friendly.lower()
    assert "Etykiety" in info.technical


def test_map_invalid_printer_name() -> None:
    exc = WinErrorStub(ERROR_INVALID_PRINTER_NAME, "Invalid printer name")
    info = map_print_error(exc)
    assert "Nie znaleziono drukarki" in info.friendly


def test_map_printer_offline() -> None:
    exc = WinErrorStub(ERROR_PRINTER_OFFLINE, "The printer is offline")
    info = map_print_error(exc)
    assert "offline" in info.friendly.lower()


def test_map_access_denied() -> None:
    exc = WinErrorStub(ERROR_ACCESS_DENIED, "Access is denied")
    info = map_print_error(exc)
    assert "uprawnień" in info.friendly.lower()


def test_map_tuple_style_shell_execute_message() -> None:
    exc = Exception("(31, 'ShellExecute', 'Urządzenie dołączone do komputera nie działa.')")
    info = map_print_error(exc, printer_name="HP")
    assert "niedostępna" in info.friendly.lower()


def test_build_job_error_message_json_roundtrip() -> None:
    exc = WinErrorStub(ERROR_GEN_FAILURE, "device error")
    raw = build_job_error_message(exc, printer_name="TestPrinter")
    parsed = parse_job_error_message(raw)
    assert parsed is not None
    assert parsed["friendly"]
    assert parsed["technical"]
    assert parsed["suggestion"]
    assert json.loads(raw)["friendly"] == parsed["friendly"]
