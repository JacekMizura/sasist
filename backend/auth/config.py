"""Auth secrets — override in production via environment."""

from __future__ import annotations

import os

# HS256 signing key — MUST set AUTH_SECRET_KEY in production.
AUTH_SECRET_KEY = os.environ.get("AUTH_SECRET_KEY", "dev-only-change-me-auth-secret-key-min-32-chars!!")

ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.environ.get("REFRESH_TOKEN_EXPIRE_DAYS", "14"))

# Bootstrap superadmin (seed only when no users exist). Override in production.
INITIAL_ADMIN_LOGIN = os.environ.get("INITIAL_ADMIN_LOGIN", "admin")
INITIAL_ADMIN_PASSWORD = os.environ.get("INITIAL_ADMIN_PASSWORD", "admin")
INITIAL_ADMIN_EMAIL = os.environ.get("INITIAL_ADMIN_EMAIL", "admin@local")

# When not "production", MeResponse may flag default seeded credentials for UI warnings.
APP_ENV = os.environ.get("APP_ENV", "development")
