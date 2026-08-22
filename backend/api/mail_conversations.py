"""Mail conversation API — list, detail, reply (Phase 2)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user, require_permission
from ..database import get_db
from ..models.app_user import AppUser
from ..models.messaging import MessageTemplate
from ..schemas.mail_conversation import MailConversationPatch, MailConversationReplyBody
from ..services.mail.conversation_service import (
    ConversationListParams,
    get_conversation_detail,
    get_conversation_for_tenant,
    get_conversation_history,
    list_conversation_messages,
    list_conversations,
    mark_conversation_read,
    patch_conversation,
    send_conversation_reply,
    sidebar_counts,
)
from ..services.messaging.email_outbox import render_template_string

router = APIRouter(prefix="/conversations", tags=["Mail"])

_view_perm = require_permission("mail.view")
_reply_perm = require_permission("mail.reply")
_manage_perm = require_permission("mail.manage_conversations")


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00").replace("+00:00", ""))
    except ValueError:
        return None


@router.get("")
def get_mail_conversations(
    tenant_id: int = Query(..., ge=1),
    bucket: str | None = Query(None),
    q: str | None = Query(None),
    account_id: int | None = Query(None, ge=1),
    status: str | None = Query(None),
    assigned_user_id: int | None = Query(None, ge=1),
    unassigned: bool = Query(False),
    priority: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    sort: str = Query("last_message_at_desc"),
    db: Session = Depends(get_db),
    user: AppUser = Depends(_view_perm),
) -> dict[str, Any]:
    params = ConversationListParams(
        tenant_id=int(tenant_id),
        user_id=int(user.id),
        bucket=bucket,
        q=q,
        account_id=account_id,
        status=status,
        assigned_user_id=assigned_user_id,
        unassigned=unassigned,
        priority=priority,
        date_from=_parse_dt(date_from),
        date_to=_parse_dt(date_to),
        page=page,
        page_size=page_size,
        sort=sort,
    )
    items, total = list_conversations(db, params)
    return {
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
    }


@router.get("/sidebar-counts")
def get_mail_sidebar_counts(
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(_view_perm),
) -> dict[str, int]:
    return sidebar_counts(db, tenant_id=int(tenant_id), user_id=int(user.id))


@router.get("/{conversation_id}")
def get_mail_conversation_detail(
    conversation_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(_view_perm),
) -> dict[str, Any]:
    detail = get_conversation_detail(
        db,
        tenant_id=int(tenant_id),
        conversation_id=int(conversation_id),
        user_id=int(user.id),
    )
    if detail is None:
        raise HTTPException(status_code=404, detail="conversation_not_found")
    return detail


@router.patch("/{conversation_id}")
def patch_mail_conversation(
    conversation_id: int,
    body: MailConversationPatch,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(_manage_perm),
) -> dict[str, Any]:
    updated = patch_conversation(
        db,
        tenant_id=int(tenant_id),
        conversation_id=int(conversation_id),
        user_id=int(user.id),
        status=body.status,
        priority=body.priority,
        assigned_user_id=body.assigned_user_id,
        assign_user=body.assigned_user_id is not None,
        clear_assignment=body.clear_assignment,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="conversation_not_found")
    db.commit()
    return updated


@router.get("/{conversation_id}/messages")
def get_mail_conversation_messages(
    conversation_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_view_perm),
) -> list[dict[str, Any]]:
    messages = list_conversation_messages(
        db,
        tenant_id=int(tenant_id),
        conversation_id=int(conversation_id),
    )
    if messages is None:
        raise HTTPException(status_code=404, detail="conversation_not_found")
    return messages


@router.post("/{conversation_id}/mark-read")
def post_mail_conversation_mark_read(
    conversation_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(_view_perm),
) -> dict[str, bool]:
    ok = mark_conversation_read(
        db,
        tenant_id=int(tenant_id),
        conversation_id=int(conversation_id),
        user_id=int(user.id),
    )
    if not ok:
        raise HTTPException(status_code=404, detail="conversation_not_found")
    db.commit()
    return {"ok": True}


@router.get("/{conversation_id}/history")
def get_mail_conversation_history(
    conversation_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_view_perm),
) -> list[dict[str, Any]]:
    history = get_conversation_history(
        db,
        tenant_id=int(tenant_id),
        conversation_id=int(conversation_id),
    )
    if history is None:
        raise HTTPException(status_code=404, detail="conversation_not_found")
    return history


@router.post("/{conversation_id}/reply")
def post_mail_conversation_reply(
    conversation_id: int,
    body: MailConversationReplyBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(_reply_perm),
) -> dict[str, Any]:
    conv = get_conversation_for_tenant(db, tenant_id=int(tenant_id), conversation_id=int(conversation_id))
    if conv is None:
        raise HTTPException(status_code=404, detail="conversation_not_found")

    reply_body = body.body
    reply_subject = body.subject
    if body.template_id is not None:
        tpl = (
            db.query(MessageTemplate)
            .filter(
                MessageTemplate.id == int(body.template_id),
                MessageTemplate.tenant_id == int(tenant_id),
                MessageTemplate.channel == "email",
                MessageTemplate.is_active.is_(True),
            )
            .first()
        )
        if tpl is None:
            raise HTTPException(status_code=400, detail="template_not_found")
        ctx: dict[str, Any] = {}
        reply_body = render_template_string(tpl.body_template, ctx)
        if not reply_subject:
            reply_subject = render_template_string(tpl.subject_template, ctx)

    result, err = send_conversation_reply(
        db,
        tenant_id=int(tenant_id),
        conversation_id=int(conversation_id),
        user_id=int(user.id),
        body=reply_body,
        idempotency_key=body.idempotency_key,
        account_id=body.account_id,
        subject=reply_subject,
    )
    if err == "not_found":
        raise HTTPException(status_code=404, detail="conversation_not_found")
    if err == "no_inbound_for_reply":
        raise HTTPException(status_code=400, detail="no_inbound_for_reply")
    if err == "invalid_account":
        raise HTTPException(status_code=400, detail="invalid_account")
    if err == "missing_recipient":
        raise HTTPException(status_code=400, detail="missing_recipient")
    if result is None:
        raise HTTPException(status_code=400, detail="reply_failed")

    mark_conversation_read(
        db,
        tenant_id=int(tenant_id),
        conversation_id=int(conversation_id),
        user_id=int(user.id),
    )
    db.commit()
    return result
