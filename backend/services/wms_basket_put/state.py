"""Session metadata helpers for pending basket put + active series + source_lock."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.wms_operation_session import WmsOperationSession

logger = logging.getLogger(__name__)

META_KEY = "basket_put"


def _load_meta(raw: str | None) -> dict[str, Any]:
    if not raw or not str(raw).strip():
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _dump_meta(data: dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False)


def _block_is_empty(block: dict[str, Any]) -> bool:
    return not (
        block.get("pending")
        or block.get("active_series")
        or block.get("source_lock")
    )


def read_basket_put_block(sess: WmsOperationSession) -> dict[str, Any]:
    meta = _load_meta(getattr(sess, "metadata_json", None))
    block = meta.get(META_KEY)
    return block if isinstance(block, dict) else {}


def write_basket_put_block(db: Session, sess: WmsOperationSession, block: dict[str, Any] | None) -> None:
    meta = _load_meta(getattr(sess, "metadata_json", None))
    if block is None or _block_is_empty(block):
        meta.pop(META_KEY, None)
    else:
        meta[META_KEY] = block
    sess.metadata_json = _dump_meta(meta)
    sess.last_activity_at = datetime.utcnow()
    db.add(sess)
    db.flush()


def get_pending(sess: WmsOperationSession) -> dict[str, Any] | None:
    block = read_basket_put_block(sess)
    pending = block.get("pending")
    return pending if isinstance(pending, dict) else None


def get_active_series(sess: WmsOperationSession) -> dict[str, Any] | None:
    block = read_basket_put_block(sess)
    series = block.get("active_series")
    return series if isinstance(series, dict) else None


def get_source_lock(sess: WmsOperationSession) -> dict[str, Any] | None:
    block = read_basket_put_block(sess)
    lock = block.get("source_lock")
    return lock if isinstance(lock, dict) else None


def set_pending(db: Session, sess: WmsOperationSession, pending: dict[str, Any] | None) -> None:
    block = read_basket_put_block(sess)
    if pending is None:
        block.pop("pending", None)
    else:
        block["pending"] = pending
    write_basket_put_block(db, sess, block if block else None)


def set_active_series(db: Session, sess: WmsOperationSession, series: dict[str, Any] | None) -> None:
    block = read_basket_put_block(sess)
    if series is None:
        block.pop("active_series", None)
    else:
        block["active_series"] = series
    write_basket_put_block(db, sess, block if block else None)


def set_source_lock(db: Session, sess: WmsOperationSession, lock: dict[str, Any] | None) -> None:
    block = read_basket_put_block(sess)
    if lock is None:
        block.pop("source_lock", None)
    else:
        block["source_lock"] = lock
    write_basket_put_block(db, sess, block if block else None)


def clear_all(db: Session, sess: WmsOperationSession, *, reason: str) -> None:
    had = bool(read_basket_put_block(sess))
    write_basket_put_block(db, sess, None)
    if had:
        logger.info(
            "BASKET_SERIES_CLEARED session_id=%s reason=%s",
            getattr(sess, "id", None),
            reason,
        )


def utc_now_iso() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"
