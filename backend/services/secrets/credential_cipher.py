"""
Encrypt/decrypt tenant mailbox credentials at rest.

Uses Fernet (cryptography). Key material:

1. ``MAIL_CREDENTIALS_ENCRYPTION_KEY`` — preferred in production; keep stable across deploys.
2. Fallback: ``AUTH_SECRET_KEY`` (dev only; rotating AUTH_SECRET_KEY invalidates stored passwords).

Never log plaintext passwords or ciphertext in application logs.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import os

from ...auth.config import AUTH_SECRET_KEY

logger = logging.getLogger(__name__)

_fernet = None
_key_source: str | None = None


def _raw_key_material() -> str:
    explicit = (os.environ.get("MAIL_CREDENTIALS_ENCRYPTION_KEY") or "").strip()
    if explicit:
        return explicit
    return AUTH_SECRET_KEY


def _fernet_key_bytes(raw: str) -> bytes:
    digest = hashlib.sha256(raw.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def get_credential_key_source() -> str:
    """Returns 'dedicated' or 'auth_secret_fallback' for diagnostics (never the key itself)."""
    explicit = (os.environ.get("MAIL_CREDENTIALS_ENCRYPTION_KEY") or "").strip()
    return "dedicated" if explicit else "auth_secret_fallback"


def _get_fernet():
    global _fernet, _key_source
    source = get_credential_key_source()
    if _fernet is not None and _key_source == source:
        return _fernet
    try:
        from cryptography.fernet import Fernet
    except ImportError as exc:
        raise RuntimeError(
            "cryptography package is required for mail credential encryption. "
            "Install with: pip install cryptography"
        ) from exc
    _key_source = source
    _fernet = Fernet(_fernet_key_bytes(_raw_key_material()))
    if source == "auth_secret_fallback":
        logger.warning(
            "mail_credentials: using AUTH_SECRET_KEY fallback; set MAIL_CREDENTIALS_ENCRYPTION_KEY in production"
        )
    return _fernet


def encrypt_secret(plaintext: str | None) -> str | None:
    if plaintext is None or plaintext == "":
        return None
    token = _get_fernet().encrypt(plaintext.encode("utf-8"))
    return token.decode("ascii")


def decrypt_secret(ciphertext: str | None) -> str | None:
    if ciphertext is None or ciphertext == "":
        return None
    try:
        return _get_fernet().decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except Exception:
        logger.warning("mail_credentials: decrypt failed (key rotation or corrupt ciphertext)")
        return None


def reset_cipher_cache_for_tests() -> None:
    global _fernet, _key_source
    _fernet = None
    _key_source = None
