"""Resend HTTP API email transport — implements EmailProvider."""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from .providers import EmailProviderError, EmailSendRequest, EmailSendResult

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"
_DEFAULT_TIMEOUT = httpx.Timeout(10.0, connect=10.0, read=30.0)


def _build_resend_payload(request: EmailSendRequest, default_from: str) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "from": (request.from_address or default_from).strip(),
        "to": [str(request.to_address).strip()],
        "subject": str(request.subject or ""),
        "text": str(request.body_text or ""),
    }
    custom_headers: dict[str, str] = {}
    if request.message_id:
        custom_headers["Message-ID"] = str(request.message_id)
    if request.in_reply_to:
        custom_headers["In-Reply-To"] = str(request.in_reply_to)
    if request.references:
        custom_headers["References"] = str(request.references)
    if custom_headers:
        payload["headers"] = custom_headers
    return payload


def _parse_error_message(response: httpx.Response) -> str:
    try:
        data = response.json()
        if isinstance(data, dict):
            msg = data.get("message") or data.get("error") or data.get("name")
            if msg:
                return str(msg)
    except (json.JSONDecodeError, ValueError):
        pass
    text = (response.text or "").strip()
    if text and len(text) <= 500:
        return text
    return f"HTTP {response.status_code}"


def _raise_for_resend_response(response: httpx.Response) -> None:
    status = int(response.status_code)
    message = _parse_error_message(response)
    if status == 429:
        raise EmailProviderError(message, code="rate_limit", transient=True)
    if status >= 500:
        raise EmailProviderError(message, code="resend_server_error", transient=True)
    if status in (401, 403):
        raise EmailProviderError(message, code="authentication_error", transient=False)
    if status == 422:
        raise EmailProviderError(message, code="validation_error", transient=False)
    if 400 <= status < 500:
        raise EmailProviderError(message, code="client_error", transient=False)
    raise EmailProviderError(message, code="provider_error", transient=False)


def _post_resend_email(
    *,
    api_key: str,
    payload: dict[str, Any],
    idempotency_key: str,
    timeout: httpx.Timeout = _DEFAULT_TIMEOUT,
) -> str:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Idempotency-Key": str(idempotency_key),
    }
    try:
        with httpx.Client(timeout=timeout) as client:
            response = client.post(RESEND_API_URL, headers=headers, json=payload)
    except httpx.TimeoutException as exc:
        raise EmailProviderError("Resend request timed out", code="timeout", transient=True) from exc
    except httpx.NetworkError as exc:
        raise EmailProviderError(str(exc), code="network_error", transient=True) from exc
    except httpx.HTTPError as exc:
        raise EmailProviderError(str(exc), code="http_error", transient=True) from exc

    if response.status_code >= 400:
        logger.warning(
            "resend send failed status=%s idempotency_key=%s",
            response.status_code,
            idempotency_key,
        )
        _raise_for_resend_response(response)

    try:
        data = response.json()
    except (json.JSONDecodeError, ValueError) as exc:
        raise EmailProviderError(
            "Resend returned invalid JSON",
            code="invalid_response",
            transient=True,
        ) from exc

    message_id = data.get("id") if isinstance(data, dict) else None
    if not message_id:
        raise EmailProviderError(
            "Resend response missing message id",
            code="invalid_response",
            transient=True,
        )
    return str(message_id)


class ResendEmailProvider:
    """Resend REST API transport — HTTPS only (Railway Hobby compatible)."""

    name = "resend"

    def __init__(
        self,
        *,
        api_key: str,
        from_address: str,
        timeout: httpx.Timeout | None = None,
    ) -> None:
        self.api_key = api_key
        self.from_address = from_address
        self.timeout = timeout or _DEFAULT_TIMEOUT

    def is_configured(self) -> bool:
        return bool(self.api_key and self.from_address)

    def send(self, request: EmailSendRequest) -> EmailSendResult:
        if not self.is_configured():
            raise EmailProviderError(
                "Resend provider not configured (set RESEND_API_KEY and EMAIL_FROM)",
                code="configuration_error",
                transient=False,
            )
        payload = _build_resend_payload(request, self.from_address)
        provider_message_id = _post_resend_email(
            api_key=self.api_key,
            payload=payload,
            idempotency_key=str(request.idempotency_key),
            timeout=self.timeout,
        )
        return EmailSendResult(provider=self.name, provider_message_id=provider_message_id)
