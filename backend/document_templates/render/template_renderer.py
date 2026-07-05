"""Public Twig template renderer — single entry point for all template rendering."""

from __future__ import annotations

from typing import Any

from ..dto.resolved_document_template import ResolvedDocumentTemplate
from ._engine_backend import render_with_backend


def render(resolved: ResolvedDocumentTemplate | str, context: dict[str, Any]) -> str:
    """
    Render Twig with a print context mapping.

    `resolved` — ResolvedDocumentTemplate (pinned DOCUMENT + BASE + PARTIALS)
    or legacy plain Twig string for backward compatibility.
    """
    return render_with_backend(resolved, context)
