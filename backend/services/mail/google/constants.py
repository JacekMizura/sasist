"""Google OAuth / Gmail API constants."""

from __future__ import annotations

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1"

# Minimal scopes: read inbox, send, identify user email.
GOOGLE_OAUTH_SCOPES = (
    "openid email profile "
    "https://www.googleapis.com/auth/gmail.readonly "
    "https://www.googleapis.com/auth/gmail.send"
)

OAUTH_STATE_TTL_SEC = 600
