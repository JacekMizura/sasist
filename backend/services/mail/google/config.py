"""Google OAuth environment configuration."""

from __future__ import annotations

import os


def google_oauth_client_id() -> str:
    return (os.environ.get("GOOGLE_OAUTH_CLIENT_ID") or "").strip()


def google_oauth_client_secret() -> str:
    return (os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET") or "").strip()


def google_oauth_redirect_uri() -> str:
    return (os.environ.get("GOOGLE_OAUTH_REDIRECT_URI") or "").strip()


def frontend_base_url() -> str:
    raw = (
        os.environ.get("FRONTEND_BASE_URL")
        or os.environ.get("FRONTEND_URL")
        or os.environ.get("PUBLIC_FRONTEND_URL")
        or "http://localhost:5173"
    ).strip()
    return raw.rstrip("/")


def google_oauth_configured() -> bool:
    return bool(google_oauth_client_id() and google_oauth_client_secret() and google_oauth_redirect_uri())
