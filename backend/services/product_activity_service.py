"""Product card Activity Log writes — same SSOT as order / cart panels."""

from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from .activity_log import ActivityLinkSpec, record_activity

logger = logging.getLogger(__name__)

EVENT_PRODUCT_CREATED = "product_created"
EVENT_PRODUCT_UPDATED = "product_updated"


def record_product_card_activity(
    db: Session,
    *,
    product_id: int,
    tenant_id: int,
    event_code: str,
    description: str,
    actor_user_id: Optional[int] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> None:
    """
    Persist one catalog event linked to ``object_type=product``.
    Never raises into the product save path (nested savepoint).
    """
    pid = int(product_id)
    if pid < 1:
        return
    uid = int(actor_user_id) if actor_user_id is not None and int(actor_user_id) > 0 else None
    code = str(event_code or "").strip()[:64] or EVENT_PRODUCT_UPDATED
    msg = str(description or "").strip()[:512] or "Zmiana na karcie produktu."
    try:
        nested = db.begin_nested()
        try:
            record_activity(
                db,
                event_code=code,
                description=msg,
                links=[
                    ActivityLinkSpec(
                        object_type="product",
                        object_id=pid,
                        role="primary",
                        object_label=f"Produkt #{pid}",
                    )
                ],
                severity="SUCCESS" if code == EVENT_PRODUCT_CREATED else "INFO",
                category="system",
                tenant_id=int(tenant_id),
                actor_user_id=uid,
                source_module="product_catalog",
                metadata=dict(metadata or {}),
            )
            nested.commit()
        except Exception:
            nested.rollback()
            raise
    except Exception:
        logger.exception(
            "product activity_log write failed product_id=%s event=%s",
            pid,
            code,
        )
