"""Print execution tests."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from agent.api import ApiError
from agent.printing import print_pdf


def test_print_pdf_raises_api_error_when_mapper_fails(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    pdf_path = tmp_path / "job.pdf"
    pdf_path.write_bytes(b"%PDF-1.4")

    win32api = MagicMock()
    win32api.ShellExecute.return_value = 31

    def _broken(*_args, **_kwargs):
        raise RuntimeError("mapper crashed")

    monkeypatch.setattr("agent.print_errors.map_print_error", _broken)

    with patch.dict("sys.modules", {"win32api": win32api}):
        with pytest.raises(ApiError) as raised:
            print_pdf(pdf_path, "TestPrinter")

    assert "ShellExecute failed with code 31" in str(raised.value)
