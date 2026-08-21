"""
Default panel (office) sub-status for newly created returns.

Mirrors order_default_new_panel_status: NEW / "Nowe".
"""

from __future__ import annotations

import logging

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models.return_ui_status import ReturnUiStatus
from ..models.wms_order_return import WmsOrderReturn

logger = logging.getLogger(__name__)

MAIN_GROUP_NEW = "NEW"
DEFAULT_SUBSTATUS_NAME = "Nowe"


def get_or_create_default_new_return_ui_status_id(db: Session, tenant_id: int, warehouse_id: int) -> int:
    tid = int(tenant_id)
    wid = int(warehouse_id)
    row = (
        db.query(ReturnUiStatus)
        .filter(
            ReturnUiStatus.tenant_id == tid,
            ReturnUiStatus.warehouse_id == wid,
            ReturnUiStatus.main_group == MAIN_GROUP_NEW,
            ReturnUiStatus.name == DEFAULT_SUBSTATUS_NAME,
        )
        .first()
    )
    if row is not None:
        return int(row.id)

    top = (
        db.query(func.max(ReturnUiStatus.sort_status))
        .filter(
            ReturnUiStatus.tenant_id == tid,
            ReturnUiStatus.warehouse_id == wid,
            ReturnUiStatus.main_group == MAIN_GROUP_NEW,
        )
        .scalar()
    )
    next_sort = int(top or 0) + 1
    created = ReturnUiStatus(
        tenant_id=tid,
        warehouse_id=wid,
        main_group=MAIN_GROUP_NEW,
        name=DEFAULT_SUBSTATUS_NAME,
        color="#64748b",
        sort_order=next_sort,
        group_name=None,
        subgroup_name=None,
        sort_group=0,
        sort_subgroup=0,
        sort_status=next_sort,
        is_active=True,
    )
    try:
        with db.begin_nested():
            db.add(created)
            db.flush()
    except IntegrityError:
        db.expire_all()
        again = (
            db.query(ReturnUiStatus)
            .filter(
                ReturnUiStatus.tenant_id == tid,
                ReturnUiStatus.warehouse_id == wid,
                ReturnUiStatus.main_group == MAIN_GROUP_NEW,
                ReturnUiStatus.name == DEFAULT_SUBSTATUS_NAME,
            )
            .first()
        )
        if again is not None:
            return int(again.id)
        logger.exception("ensure_default_new_return_ui_status: integrity error without existing row")
        raise
    return int(created.id)


def assign_default_new_panel_status_to_return(db: Session, row: WmsOrderReturn) -> None:
    """Set ui_status_id to default NEW/Nowe when unset."""
    if getattr(row, "ui_status_id", None):
        return
    if row.tenant_id is None or row.warehouse_id is None:
        return
    row.ui_status_id = get_or_create_default_new_return_ui_status_id(
        db, int(row.tenant_id), int(row.warehouse_id)
    )
