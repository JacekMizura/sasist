"""Outbound email delivery worker — ticks via operational_loop."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from backend.services.messaging.delivery import process_pending_outbound_emails

logger = logging.getLogger(__name__)


def run_email_delivery_worker(db: Session, *, limit: int = 20) -> dict[str, Any]:
    try:
        return process_pending_outbound_emails(db, limit=limit)
    except Exception:
        logger.exception("email_delivery_worker failed")
        raise
