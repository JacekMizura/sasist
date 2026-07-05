"""Supported output formats for the same Twig template."""

from __future__ import annotations

from enum import Enum


class DocumentOutputFormat(str, Enum):
    HTML = "html"
    PDF = "pdf"
    EMAIL_HTML = "email_html"
    ERP_PREVIEW = "erp_preview"
    PORTAL_HTML = "portal_html"
    API_EXPORT = "api_export"
