"""Operational loop tick — sync inbound mail for active accounts."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from ..models.mail import MailAccount
from ..services.mail.constants import SYNC_BATCH_SIZE
from ..services.mail.inbound.imap_connector import build_imap_connector_for_account
from ..services.mail.inbound.sync_service import sync_account_inbound

logger = logging.getLogger(__name__)


def run_mail_inbound_sync_worker(db: Session, *, limit_accounts: int = 5) -> dict[str, Any]:
    rows = (
        db.query(MailAccount)
        .filter(MailAccount.is_active.is_(True), MailAccount.is_send_only.is_(False))
        .order_by(MailAccount.last_sync_at.asc().nullsfirst(), MailAccount.id.asc())
        .limit(max(1, int(limit_accounts)))
        .all()
    )
    results: list[dict[str, Any]] = []
    for account in rows:
        connector = None
        try:
            connector = build_imap_connector_for_account(account)
            result = sync_account_inbound(db, account, connector, batch_size=SYNC_BATCH_SIZE)
            results.append(result)
        except Exception as exc:
            logger.exception("mail_inbound_sync account_id=%s failed", account.id)
            account.last_sync_error = str(exc)[:500]
            db.add(account)
            results.append({"account_id": account.id, "error": str(exc)[:500]})
        finally:
            if connector is not None:
                try:
                    connector.close()
                except Exception:
                    pass
    return {"accounts": len(rows), "results": results}
