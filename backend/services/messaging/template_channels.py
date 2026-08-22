"""Message template channel + attachment config helpers."""

from __future__ import annotations

import json
from typing import Any, Optional, Sequence

CHANNEL_EMAIL = "email"
CHANNEL_SMS = "sms"
CHANNEL_NOTE = "note"
ALLOWED_CHANNELS = frozenset({CHANNEL_EMAIL, CHANNEL_SMS, CHANNEL_NOTE})

#: Order custom field types that can yield file/document attachments.
ATTACHMENT_FIELD_TYPES = frozenset({"FILES", "SALES_DOCUMENT", "SHIPPING_LABEL"})


def normalize_channel(raw: Any, *, default: str = CHANNEL_EMAIL) -> str:
    s = str(raw or default).strip().lower()
    if s in ("e-mail", "mail"):
        s = CHANNEL_EMAIL
    if s in ("sms", "text"):
        s = CHANNEL_SMS
    if s in ("note", "notatka", "notes"):
        s = CHANNEL_NOTE
    if s not in ALLOWED_CHANNELS:
        raise ValueError(f"invalid_channel={raw}")
    return s


def channel_label(channel: str) -> str:
    c = normalize_channel(channel)
    if c == CHANNEL_SMS:
        return "SMS"
    if c == CHANNEL_NOTE:
        return "Notatka"
    return "E-mail"


def parse_attachments_json(raw: Any) -> list[dict[str, Any]]:
    if raw is None or raw == "":
        return []
    if isinstance(raw, list):
        items = raw
    else:
        try:
            items = json.loads(str(raw))
        except (json.JSONDecodeError, TypeError):
            return []
    if not isinstance(items, list):
        return []
    out: list[dict[str, Any]] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        source = str(it.get("source") or "").strip().lower()
        if source != "order_custom_field":
            continue
        field_id = it.get("field_id")
        try:
            fid = int(field_id)
        except (TypeError, ValueError):
            continue
        if fid < 1:
            continue
        entry: dict[str, Any] = {
            "source": "order_custom_field",
            "field_id": fid,
        }
        slug = it.get("field_slug")
        if isinstance(slug, str) and slug.strip():
            entry["field_slug"] = slug.strip()
        name = it.get("field_name")
        if isinstance(name, str) and name.strip():
            entry["field_name"] = name.strip()
        ftype = it.get("field_type")
        if isinstance(ftype, str) and ftype.strip():
            entry["field_type"] = ftype.strip().upper()
        out.append(entry)
    return out


def serialize_attachments(items: Optional[Sequence[dict[str, Any]]]) -> str:
    parsed = parse_attachments_json(list(items or []))
    return json.dumps(parsed, ensure_ascii=False)
