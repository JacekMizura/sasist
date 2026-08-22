"""Parse RFC822 into structured inbound fields."""

from __future__ import annotations

import email
import json
import re
from dataclasses import dataclass
from datetime import datetime
from email.utils import getaddresses, parsedate_to_datetime, parseaddr
from typing import Optional


@dataclass(frozen=True)
class ParsedInboundEmail:
    sender_email: str
    to_addresses: list[str]
    cc_addresses: list[str]
    subject: str
    text_body: str
    html_body_raw: str | None
    message_id_header: str | None
    in_reply_to: str | None
    references_header: str | None
    received_at: datetime


_MSG_ID_RE = re.compile(r"<[^>]+>")


def normalize_message_id(value: str | None) -> str | None:
    if not value or not str(value).strip():
        return None
    text = str(value).strip()
    match = _MSG_ID_RE.search(text)
    if match:
        return match.group(0)
    if text.startswith("<") and text.endswith(">"):
        return text
    return f"<{text.strip('<>')}>"


def extract_reference_ids(references: str | None, in_reply_to: str | None) -> list[str]:
    ids: list[str] = []
    for source in (in_reply_to, references):
        if not source:
            continue
        for token in _MSG_ID_RE.findall(str(source)):
            norm = normalize_message_id(token)
            if norm and norm not in ids:
                ids.append(norm)
    return ids


def _decode_part(part: email.message.Message) -> str:
    payload = part.get_payload(decode=True)
    if payload is None:
        return ""
    charset = part.get_content_charset() or "utf-8"
    try:
        return payload.decode(charset, errors="replace")
    except LookupError:
        return payload.decode("utf-8", errors="replace")


def _extract_bodies(msg: email.message.Message) -> tuple[str, str | None]:
    text_parts: list[str] = []
    html_parts: list[str] = []
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            disp = str(part.get("Content-Disposition") or "").lower()
            if "attachment" in disp:
                continue
            if ctype == "text/plain":
                text_parts.append(_decode_part(part))
            elif ctype == "text/html":
                html_parts.append(_decode_part(part))
    else:
        ctype = msg.get_content_type()
        body = _decode_part(msg)
        if ctype == "text/html":
            html_parts.append(body)
        else:
            text_parts.append(body)
    text = "\n".join(p.strip() for p in text_parts if p.strip()).strip()
    html = "\n".join(p.strip() for p in html_parts if p.strip()).strip() or None
    return text, html


def parse_inbound_email(raw_bytes: bytes) -> ParsedInboundEmail:
    msg = email.message_from_bytes(raw_bytes)
    sender_name, sender_addr = parseaddr(str(msg.get("From") or ""))
    del sender_name
    sender = (sender_addr or "").strip().lower()
    to_addrs = [addr.strip().lower() for _, addr in getaddresses(msg.get_all("To", [])) if addr]
    cc_addrs = [addr.strip().lower() for _, addr in getaddresses(msg.get_all("Cc", [])) if addr]
    subject = str(msg.get("Subject") or "").strip()
    text_body, html_body_raw = _extract_bodies(msg)
    message_id_header = normalize_message_id(str(msg.get("Message-ID") or ""))
    in_reply_to = normalize_message_id(str(msg.get("In-Reply-To") or ""))
    refs = str(msg.get("References") or "").strip() or None
    received_at = datetime.utcnow()
    date_hdr = msg.get("Date")
    if date_hdr:
        try:
            received_at = parsedate_to_datetime(date_hdr)
            if received_at.tzinfo is not None:
                received_at = received_at.replace(tzinfo=None)
        except Exception:
            pass
    return ParsedInboundEmail(
        sender_email=sender,
        to_addresses=to_addrs,
        cc_addresses=cc_addrs,
        subject=subject,
        text_body=text_body,
        html_body_raw=html_body_raw,
        message_id_header=message_id_header,
        in_reply_to=in_reply_to,
        references_header=refs,
        received_at=received_at,
    )


def addresses_to_json(addresses: list[str]) -> str:
    return json.dumps(addresses, ensure_ascii=False)
