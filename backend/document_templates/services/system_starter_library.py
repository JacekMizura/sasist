"""Filesystem system BASE + PARTIAL starters for DTE rendering."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from ..constants import SYSTEM_BASE_TEMPLATE_CODE, SYSTEM_PARTIAL_CODES

_STARTERS_DIR = Path(__file__).resolve().parents[1] / "starters"


@lru_cache(maxsize=1)
def load_system_starter_templates() -> dict[str, str]:
    """
    Map template code → Twig source for system BASE + PARTIALS on disk.

    Used when a DOCUMENT starter (or plain Twig) references ``{% extends %}`` /
    ``{% include_document %}`` without a tenant-published pin set.
    """
    templates: dict[str, str] = {}
    base_path = _STARTERS_DIR / f"{SYSTEM_BASE_TEMPLATE_CODE}.twig"
    if base_path.is_file():
        templates[SYSTEM_BASE_TEMPLATE_CODE] = base_path.read_text(encoding="utf-8")

    partials_dir = _STARTERS_DIR / "partials"
    if partials_dir.is_dir():
        for path in sorted(partials_dir.glob("*.twig")):
            templates[path.stem] = path.read_text(encoding="utf-8")

    # Ensure canonical partial codes are present even if renamed on disk later.
    for code in SYSTEM_PARTIAL_CODES:
        templates.setdefault(code, templates.get(code, ""))

    return templates


def clear_system_starter_templates_cache() -> None:
    load_system_starter_templates.cache_clear()
