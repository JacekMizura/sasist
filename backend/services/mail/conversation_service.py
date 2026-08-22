"""Mail conversations — list, detail, read state, reply (Phase 2)."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import and_, desc, func, or_
from sqlalchemy.orm import Session, aliased

from ...models.app_user import AppUser
from ...models.complaint import Complaint
from ...models.customer import Customer
from ...models.mail import (
    CONV_PRIORITY_NONE,
    CONV_PRIORITY_NORMAL,
    CONV_STATUS_CLOSED,
    CONV_STATUS_SPAM,
    CONV_STATUS_TRASH,
    ENTITY_MAIL_CONVERSATION,
    MSG_DIRECTION_INBOUND,
    MSG_DIRECTION_OUTBOUND,
    OUTBOUND_SOURCE_MANUAL,
    RELATION_COMPLAINT,
    RELATION_ORDER,
    RELATION_RETURN,
    MailAccount,
    MailConversation,
    MailConversationAuditEvent,
    MailConversationReadState,
    MailConversationRelation,
    MailMessage,
)
from ...models.messaging import (
    EMAIL_FAILED,
    EMAIL_PENDING,
    EMAIL_SENDING,
    EMAIL_SENT,
    OutboundEmailMessage,
)
from ...models.order import Order
from ...models.wms_order_return import WmsOrderReturn
from ..messaging.email_outbox import enqueue_manual_reply_email
from .inbound.message_parser import addresses_to_json, extract_reference_ids, normalize_message_id


AUDIT_CREATED = "CONVERSATION_CREATED"
AUDIT_STATUS_CHANGED = "STATUS_CHANGED"
AUDIT_PRIORITY_CHANGED = "PRIORITY_CHANGED"
AUDIT_ASSIGNMENT_CHANGED = "ASSIGNMENT_CHANGED"
AUDIT_REPLY_SENT = "REPLY_SENT"

TERMINAL_STATUSES = frozenset({CONV_STATUS_CLOSED, CONV_STATUS_SPAM, CONV_STATUS_TRASH})

PREVIEW_MAX_LEN = 160


@dataclass(frozen=True)
class ConversationListParams:
    tenant_id: int
    user_id: int
    bucket: str | None = None
    q: str | None = None
    account_id: int | None = None
    status: str | None = None
    assigned_user_id: int | None = None
    unassigned: bool = False
    priority: str | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    page: int = 1
    page_size: int = 25
    sort: str = "last_message_at_desc"


def customer_display_name(customer: Customer | None) -> str | None:
    if customer is None:
        return None
    company = (customer.company_name or "").strip()
    if company:
        return company
    parts = [customer.first_name or "", customer.last_name or ""]
    name = " ".join(p for p in parts if p).strip()
    return name or None


def user_display_name(user: AppUser | None) -> str | None:
    if user is None:
        return None
    parts = [user.first_name or "", user.last_name or ""]
    name = " ".join(p for p in parts if p).strip()
    return name or user.login or f"User #{user.id}"


def requires_operator_response(conv: MailConversation) -> bool:
    if conv.status in TERMINAL_STATUSES:
        return False
    if conv.last_inbound_at is None:
        return False
    if conv.last_outbound_at is None:
        return True
    return conv.last_inbound_at > conv.last_outbound_at


def _preview(text: str | None) -> str:
    raw = (text or "").replace("\r\n", "\n").strip()
    if len(raw) <= PREVIEW_MAX_LEN:
        return raw
    return raw[: PREVIEW_MAX_LEN - 1].rstrip() + "…"


def get_conversation_for_tenant(
    db: Session,
    *,
    tenant_id: int,
    conversation_id: int,
) -> MailConversation | None:
    return (
        db.query(MailConversation)
        .filter(
            MailConversation.id == int(conversation_id),
            MailConversation.tenant_id == int(tenant_id),
        )
        .first()
    )


def _build_latest_msg_sq(db: Session):
    return (
        db.query(
            MailMessage.conversation_id.label("conversation_id"),
            func.max(MailMessage.id).label("latest_message_id"),
        )
        .group_by(MailMessage.conversation_id)
        .subquery()
    )


def _is_unread(latest_message_id: int | None, read_state: MailConversationReadState | None) -> bool:
    if latest_message_id is None:
        return False
    if read_state is None or read_state.last_read_message_id is None:
        return True
    return int(read_state.last_read_message_id) < int(latest_message_id)


def _apply_bucket_filter(query, bucket: str | None, user_id: int):
    if not bucket:
        return query
    b = bucket.strip().lower()
    if b == "awaiting_me":
        return query.filter(
            MailConversation.assigned_user_id == int(user_id),
            MailConversation.status.notin_(tuple(TERMINAL_STATUSES)),
            MailConversation.last_inbound_at.isnot(None),
            or_(
                MailConversation.last_outbound_at.is_(None),
                MailConversation.last_inbound_at > MailConversation.last_outbound_at,
            ),
        )
    if b == "assigned_to_me":
        return query.filter(MailConversation.assigned_user_id == int(user_id))
    if b == "unassigned":
        return query.filter(
            MailConversation.assigned_user_id.is_(None),
            MailConversation.status.notin_(tuple(TERMINAL_STATUSES)),
        )
    status_map = {
        "open": "OPEN",
        "in_progress": "IN_PROGRESS",
        "waiting_customer": "WAITING_CUSTOMER",
        "closed": "CLOSED",
        "spam": "SPAM",
        "trash": "TRASH",
    }
    if b in status_map:
        return query.filter(MailConversation.status == status_map[b])
    return query


def _apply_search_filter(db: Session, query, tenant_id: int, q: str | None):
    if not q or not str(q).strip():
        return query
    term = f"%{str(q).strip()}%"
    customer_match = (
        db.query(Customer.id)
        .filter(
            Customer.id == MailConversation.customer_id,
            Customer.tenant_id == int(tenant_id),
            or_(
                Customer.first_name.ilike(term),
                Customer.last_name.ilike(term),
                Customer.company_name.ilike(term),
                Customer.email.ilike(term),
            ),
        )
        .correlate(MailConversation)
        .exists()
    )
    msg_match = (
        db.query(MailMessage.id)
        .filter(
            MailMessage.conversation_id == MailConversation.id,
            MailMessage.tenant_id == int(tenant_id),
            or_(
                MailMessage.subject.ilike(term),
                MailMessage.sender_email.ilike(term),
                MailMessage.text_body.ilike(term),
                MailMessage.to_json.ilike(term),
            ),
        )
        .correlate(MailConversation)
        .exists()
    )
    order_match = (
        db.query(MailConversationRelation.id)
        .join(Order, Order.id == MailConversationRelation.relation_id)
        .filter(
            MailConversationRelation.conversation_id == MailConversation.id,
            MailConversationRelation.relation_type == RELATION_ORDER,
            MailConversationRelation.tenant_id == int(tenant_id),
            Order.number.ilike(term),
        )
        .correlate(MailConversation)
        .exists()
    )
    return_match = (
        db.query(MailConversationRelation.id)
        .join(WmsOrderReturn, WmsOrderReturn.id == MailConversationRelation.relation_id)
        .filter(
            MailConversationRelation.conversation_id == MailConversation.id,
            MailConversationRelation.relation_type == RELATION_RETURN,
            MailConversationRelation.tenant_id == int(tenant_id),
            WmsOrderReturn.rmz_number.ilike(term),
        )
        .correlate(MailConversation)
        .exists()
    )
    complaint_match = (
        db.query(MailConversationRelation.id)
        .join(Complaint, Complaint.id == MailConversationRelation.relation_id)
        .filter(
            MailConversationRelation.conversation_id == MailConversation.id,
            MailConversationRelation.relation_type == RELATION_COMPLAINT,
            MailConversationRelation.tenant_id == int(tenant_id),
            Complaint.reference_code.ilike(term),
        )
        .correlate(MailConversation)
        .exists()
    )
    return query.filter(
        or_(
            MailConversation.subject.ilike(term),
            customer_match,
            msg_match,
            order_match,
            return_match,
            complaint_match,
        )
    )


def _load_relations_map(
    db: Session,
    *,
    tenant_id: int,
    conversation_ids: list[int],
) -> dict[int, dict[str, Any]]:
    if not conversation_ids:
        return {}
    rels = (
        db.query(MailConversationRelation)
        .filter(
            MailConversationRelation.tenant_id == int(tenant_id),
            MailConversationRelation.conversation_id.in_(conversation_ids),
        )
        .all()
    )
    order_ids: set[int] = set()
    return_ids: set[int] = set()
    complaint_ids: set[int] = set()
    by_conv: dict[int, list[MailConversationRelation]] = {}
    for rel in rels:
        by_conv.setdefault(int(rel.conversation_id), []).append(rel)
        if rel.relation_type == RELATION_ORDER:
            order_ids.add(int(rel.relation_id))
        elif rel.relation_type == RELATION_RETURN:
            return_ids.add(int(rel.relation_id))
        elif rel.relation_type == RELATION_COMPLAINT:
            complaint_ids.add(int(rel.relation_id))

    orders = {
        int(o.id): o
        for o in db.query(Order).filter(Order.id.in_(order_ids)).all()
    } if order_ids else {}
    returns = {
        int(r.id): r
        for r in db.query(WmsOrderReturn).filter(WmsOrderReturn.id.in_(return_ids)).all()
    } if return_ids else {}
    complaints = {
        int(c.id): c
        for c in db.query(Complaint).filter(Complaint.id.in_(complaint_ids)).all()
    } if complaint_ids else {}

    out: dict[int, dict[str, Any]] = {}
    for conv_id in conversation_ids:
        summary: dict[str, Any] = {"order": None, "return": None, "complaint": None}
        for rel in by_conv.get(conv_id, []):
            if rel.relation_type == RELATION_ORDER:
                o = orders.get(int(rel.relation_id))
                if o:
                    summary["order"] = {"id": int(o.id), "label": f"Zamówienie #{o.number}"}
            elif rel.relation_type == RELATION_RETURN:
                r = returns.get(int(rel.relation_id))
                if r:
                    summary["return"] = {"id": int(r.id), "label": f"Zwrot {r.rmz_number}"}
            elif rel.relation_type == RELATION_COMPLAINT:
                c = complaints.get(int(rel.relation_id))
                if c:
                    label = c.reference_code or f"Reklamacja #{c.id}"
                    summary["complaint"] = {"id": int(c.id), "label": label}
        out[conv_id] = summary
    return out


def list_conversations(db: Session, params: ConversationListParams) -> tuple[list[dict[str, Any]], int]:
    latest_sq = _build_latest_msg_sq(db)
    LatestMsg = aliased(MailMessage)

    q = (
        db.query(
            MailConversation,
            LatestMsg,
            Customer,
            AppUser,
            MailConversationReadState,
        )
        .outerjoin(latest_sq, latest_sq.c.conversation_id == MailConversation.id)
        .outerjoin(LatestMsg, LatestMsg.id == latest_sq.c.latest_message_id)
        .outerjoin(Customer, Customer.id == MailConversation.customer_id)
        .outerjoin(AppUser, AppUser.id == MailConversation.assigned_user_id)
        .outerjoin(
            MailConversationReadState,
            and_(
                MailConversationReadState.conversation_id == MailConversation.id,
                MailConversationReadState.user_id == int(params.user_id),
            ),
        )
        .filter(MailConversation.tenant_id == int(params.tenant_id))
    )

    q = _apply_bucket_filter(q, params.bucket, params.user_id)
    q = _apply_search_filter(db, q, params.tenant_id, params.q)

    if params.account_id is not None:
        q = q.filter(
            db.query(MailMessage.id)
            .filter(
                MailMessage.conversation_id == MailConversation.id,
                MailMessage.account_id == int(params.account_id),
            )
            .correlate(MailConversation)
            .exists()
        )
    if params.status:
        q = q.filter(MailConversation.status == str(params.status).upper())
    if params.unassigned:
        q = q.filter(MailConversation.assigned_user_id.is_(None))
    elif params.assigned_user_id is not None:
        q = q.filter(MailConversation.assigned_user_id == int(params.assigned_user_id))
    if params.priority:
        q = q.filter(MailConversation.priority == str(params.priority).upper())
    if params.date_from is not None:
        q = q.filter(MailConversation.last_message_at >= params.date_from)
    if params.date_to is not None:
        q = q.filter(MailConversation.last_message_at <= params.date_to)

    total = q.count()

    if params.sort == "last_message_at_desc":
        q = q.order_by(desc(MailConversation.last_message_at), desc(MailConversation.id))
    else:
        q = q.order_by(desc(MailConversation.last_message_at), desc(MailConversation.id))

    page = max(1, int(params.page))
    page_size = min(100, max(1, int(params.page_size)))
    rows = q.offset((page - 1) * page_size).limit(page_size).all()

    conv_ids = [int(conv.id) for conv, *_ in rows]
    relations_map = _load_relations_map(db, tenant_id=params.tenant_id, conversation_ids=conv_ids)

    items: list[dict[str, Any]] = []
    for conv, latest_msg, customer, assigned, read_state in rows:
        latest_id = int(latest_msg.id) if latest_msg is not None else None
        unread = _is_unread(latest_id, read_state)
        items.append(
            {
                "conversation_id": int(conv.id),
                "subject": conv.subject or "",
                "customer": {
                    "id": int(customer.id) if customer else None,
                    "display_name": customer_display_name(customer),
                    "email": (customer.email if customer else None),
                }
                if customer
                else {"id": conv.customer_id, "display_name": None, "email": None},
                "latest_message": {
                    "direction": latest_msg.direction if latest_msg else None,
                    "preview": _preview(latest_msg.text_body if latest_msg else ""),
                    "created_at": (
                        (latest_msg.received_at or latest_msg.created_at).isoformat()
                        if latest_msg
                        else None
                    ),
                },
                "status": conv.status,
                "priority": conv.priority,
                "assigned_user": {
                    "id": int(assigned.id) if assigned else None,
                    "display_name": user_display_name(assigned),
                },
                "unread": unread,
                "relations": relations_map.get(int(conv.id), {"order": None, "return": None, "complaint": None}),
                "last_message_at": conv.last_message_at.isoformat() if conv.last_message_at else None,
                "last_inbound_at": conv.last_inbound_at.isoformat() if conv.last_inbound_at else None,
                "last_outbound_at": conv.last_outbound_at.isoformat() if conv.last_outbound_at else None,
            }
        )
    return items, total


def sidebar_counts(db: Session, *, tenant_id: int, user_id: int) -> dict[str, int]:
    base = db.query(MailConversation).filter(MailConversation.tenant_id == int(tenant_id))

    def _count(q):
        return int(q.count())

    awaiting_me = _count(
        _apply_bucket_filter(base, "awaiting_me", user_id)
    )
    assigned_to_me = _count(_apply_bucket_filter(base, "assigned_to_me", user_id))
    unassigned = _count(_apply_bucket_filter(base, "unassigned", user_id))
    open_c = _count(_apply_bucket_filter(base, "open", user_id))
    in_progress = _count(_apply_bucket_filter(base, "in_progress", user_id))
    waiting_customer = _count(_apply_bucket_filter(base, "waiting_customer", user_id))
    closed = _count(_apply_bucket_filter(base, "closed", user_id))
    spam = _count(_apply_bucket_filter(base, "spam", user_id))
    trash = _count(_apply_bucket_filter(base, "trash", user_id))

    return {
        "awaiting_me": awaiting_me,
        "assigned_to_me": assigned_to_me,
        "unassigned": unassigned,
        "open": open_c,
        "in_progress": in_progress,
        "waiting_customer": waiting_customer,
        "closed": closed,
        "spam": spam,
        "trash": trash,
    }


def _append_audit(
    db: Session,
    *,
    tenant_id: int,
    conversation_id: int,
    event_type: str,
    user_id: int | None,
    payload: dict[str, Any],
) -> None:
    db.add(
        MailConversationAuditEvent(
            tenant_id=int(tenant_id),
            conversation_id=int(conversation_id),
            event_type=event_type,
            user_id=user_id,
            payload_json=json.dumps(payload, ensure_ascii=False),
            created_at=datetime.utcnow(),
        )
    )


def get_conversation_detail(
    db: Session,
    *,
    tenant_id: int,
    conversation_id: int,
    user_id: int,
) -> dict[str, Any] | None:
    conv = get_conversation_for_tenant(db, tenant_id=tenant_id, conversation_id=conversation_id)
    if conv is None:
        return None

    customer = (
        db.query(Customer).filter(Customer.id == conv.customer_id).first() if conv.customer_id else None
    )
    assigned = (
        db.query(AppUser).filter(AppUser.id == conv.assigned_user_id).first()
        if conv.assigned_user_id
        else None
    )
    relations = _load_relations_map(db, tenant_id=tenant_id, conversation_ids=[int(conv.id)]).get(
        int(conv.id),
        {"order": None, "return": None, "complaint": None},
    )

    last_inbound = (
        db.query(MailMessage)
        .filter(
            MailMessage.conversation_id == int(conv.id),
            MailMessage.direction == MSG_DIRECTION_INBOUND,
        )
        .order_by(MailMessage.id.desc())
        .first()
    )
    default_account_id = int(last_inbound.account_id) if last_inbound else None
    default_recipient = last_inbound.sender_email if last_inbound else (customer.email if customer else "")

    read_state = (
        db.query(MailConversationReadState)
        .filter(
            MailConversationReadState.conversation_id == int(conv.id),
            MailConversationReadState.user_id == int(user_id),
        )
        .first()
    )
    latest_msg_id = (
        db.query(func.max(MailMessage.id))
        .filter(MailMessage.conversation_id == int(conv.id))
        .scalar()
    )

    return {
        "conversation_id": int(conv.id),
        "subject": conv.subject or "",
        "status": conv.status,
        "priority": conv.priority,
        "assigned_user": {
            "id": int(assigned.id) if assigned else None,
            "display_name": user_display_name(assigned),
        },
        "customer": {
            "id": int(customer.id) if customer else None,
            "display_name": customer_display_name(customer),
            "email": customer.email if customer else None,
            "phone": customer.phone if customer else None,
        },
        "relations": relations,
        "last_message_at": conv.last_message_at.isoformat() if conv.last_message_at else None,
        "created_at": conv.created_at.isoformat() if conv.created_at else None,
        "requires_response": requires_operator_response(conv),
        "unread": _is_unread(int(latest_msg_id) if latest_msg_id else None, read_state),
        "reply_defaults": {
            "account_id": default_account_id,
            "recipient_email": default_recipient or "",
        },
    }


def list_conversation_messages(
    db: Session,
    *,
    tenant_id: int,
    conversation_id: int,
) -> list[dict[str, Any]] | None:
    conv = get_conversation_for_tenant(db, tenant_id=tenant_id, conversation_id=conversation_id)
    if conv is None:
        return None

    rows = (
        db.query(MailMessage, OutboundEmailMessage, AppUser, MailAccount)
        .outerjoin(OutboundEmailMessage, OutboundEmailMessage.id == MailMessage.outbound_message_id)
        .outerjoin(AppUser, AppUser.id == MailMessage.sent_by_user_id)
        .outerjoin(MailAccount, MailAccount.id == MailMessage.account_id)
        .filter(
            MailMessage.conversation_id == int(conversation_id),
            MailMessage.tenant_id == int(tenant_id),
        )
        .order_by(MailMessage.id.asc())
        .all()
    )

    items: list[dict[str, Any]] = []
    for msg, outbound, user, account in rows:
        delivery_status = None
        if msg.direction == MSG_DIRECTION_OUTBOUND and outbound is not None:
            delivery_status = outbound.status
        elif msg.direction == MSG_DIRECTION_OUTBOUND and outbound is None:
            delivery_status = EMAIL_PENDING

        try:
            to_list = json.loads(msg.to_json or "[]")
        except json.JSONDecodeError:
            to_list = []
        try:
            cc_list = json.loads(msg.cc_json or "[]")
        except json.JSONDecodeError:
            cc_list = []

        items.append(
            {
                "id": int(msg.id),
                "direction": msg.direction,
                "sender": msg.sender_email,
                "to": to_list,
                "cc": cc_list,
                "subject": msg.subject or "",
                "text_body": msg.text_body or "",
                "created_at": (msg.received_at or msg.created_at).isoformat(),
                "sent_at": outbound.sent_at.isoformat() if outbound and outbound.sent_at else None,
                "received_at": msg.received_at.isoformat() if msg.received_at else None,
                "delivery_status": delivery_status,
                "user": {
                    "id": int(user.id) if user else None,
                    "display_name": user_display_name(user),
                },
                "from_account": {
                    "id": int(account.id) if account else None,
                    "email_address": account.email_address if account else None,
                    "name": account.name if account else None,
                },
                "attachments": [],
            }
        )
    return items


def mark_conversation_read(
    db: Session,
    *,
    tenant_id: int,
    conversation_id: int,
    user_id: int,
) -> bool:
    conv = get_conversation_for_tenant(db, tenant_id=tenant_id, conversation_id=conversation_id)
    if conv is None:
        return False

    latest_msg_id = (
        db.query(func.max(MailMessage.id))
        .filter(MailMessage.conversation_id == int(conversation_id))
        .scalar()
    )
    now = datetime.utcnow()
    state = (
        db.query(MailConversationReadState)
        .filter(
            MailConversationReadState.conversation_id == int(conversation_id),
            MailConversationReadState.user_id == int(user_id),
        )
        .first()
    )
    if state is None:
        state = MailConversationReadState(
            tenant_id=int(tenant_id),
            conversation_id=int(conversation_id),
            user_id=int(user_id),
            last_read_message_id=int(latest_msg_id) if latest_msg_id else None,
            last_read_at=now,
        )
        db.add(state)
    else:
        state.last_read_message_id = int(latest_msg_id) if latest_msg_id else state.last_read_message_id
        state.last_read_at = now
        state.updated_at = now
        db.add(state)
    db.flush()
    return True


def patch_conversation(
    db: Session,
    *,
    tenant_id: int,
    conversation_id: int,
    user_id: int,
    status: str | None = None,
    priority: str | None = None,
    assigned_user_id: int | None = None,
    assign_user: bool = False,
    clear_assignment: bool = False,
) -> dict[str, Any] | None:
    conv = get_conversation_for_tenant(db, tenant_id=tenant_id, conversation_id=conversation_id)
    if conv is None:
        return None

    if status is not None and status != conv.status:
        old = conv.status
        conv.status = str(status).upper()
        if conv.status == CONV_STATUS_CLOSED:
            conv.closed_at = datetime.utcnow()
        _append_audit(
            db,
            tenant_id=tenant_id,
            conversation_id=conversation_id,
            event_type=AUDIT_STATUS_CHANGED,
            user_id=user_id,
            payload={"from": old, "to": conv.status},
        )

    if priority is not None and priority != conv.priority:
        old = conv.priority
        conv.priority = str(priority).upper()
        _append_audit(
            db,
            tenant_id=tenant_id,
            conversation_id=conversation_id,
            event_type=AUDIT_PRIORITY_CHANGED,
            user_id=user_id,
            payload={"from": old, "to": conv.priority},
        )

    if clear_assignment and conv.assigned_user_id is not None:
        old = conv.assigned_user_id
        conv.assigned_user_id = None
        _append_audit(
            db,
            tenant_id=tenant_id,
            conversation_id=conversation_id,
            event_type=AUDIT_ASSIGNMENT_CHANGED,
            user_id=user_id,
            payload={"from_user_id": old, "to_user_id": None},
        )
    elif assign_user and assigned_user_id != conv.assigned_user_id:
        old = conv.assigned_user_id
        conv.assigned_user_id = int(assigned_user_id) if assigned_user_id is not None else None
        _append_audit(
            db,
            tenant_id=tenant_id,
            conversation_id=conversation_id,
            event_type=AUDIT_ASSIGNMENT_CHANGED,
            user_id=user_id,
            payload={"from_user_id": old, "to_user_id": conv.assigned_user_id},
        )

    db.add(conv)
    db.flush()
    return get_conversation_detail(db, tenant_id=tenant_id, conversation_id=conversation_id, user_id=user_id)


def get_conversation_history(
    db: Session,
    *,
    tenant_id: int,
    conversation_id: int,
) -> list[dict[str, Any]] | None:
    conv = get_conversation_for_tenant(db, tenant_id=tenant_id, conversation_id=conversation_id)
    if conv is None:
        return None

    events = (
        db.query(MailConversationAuditEvent, AppUser)
        .outerjoin(AppUser, AppUser.id == MailConversationAuditEvent.user_id)
        .filter(
            MailConversationAuditEvent.conversation_id == int(conversation_id),
            MailConversationAuditEvent.tenant_id == int(tenant_id),
        )
        .order_by(MailConversationAuditEvent.created_at.asc(), MailConversationAuditEvent.id.asc())
        .all()
    )

    history: list[dict[str, Any]] = [
        {
            "event_type": AUDIT_CREATED,
            "created_at": conv.created_at.isoformat() if conv.created_at else None,
            "user": None,
            "payload": {},
        }
    ]
    for ev, user in events:
        try:
            payload = json.loads(ev.payload_json or "{}")
        except json.JSONDecodeError:
            payload = {}
        history.append(
            {
                "event_type": ev.event_type,
                "created_at": ev.created_at.isoformat(),
                "user": {
                    "id": int(user.id) if user else None,
                    "display_name": user_display_name(user),
                },
                "payload": payload,
            }
        )
    return history


def _domain_from_email(email_addr: str) -> str:
    if "@" in email_addr:
        return email_addr.split("@", 1)[1].strip() or "localhost"
    return "localhost"


def _build_reply_rfc_headers(db: Session, *, conversation_id: int) -> tuple[str, str | None, str | None]:
    thread_msg = (
        db.query(MailMessage)
        .filter(
            MailMessage.conversation_id == int(conversation_id),
            MailMessage.message_id_header.isnot(None),
        )
        .order_by(MailMessage.id.desc())
        .first()
    )
    domain = "localhost"
    if thread_msg is not None:
        acct = db.query(MailAccount).filter(MailAccount.id == thread_msg.account_id).first()
        if acct:
            domain = _domain_from_email(acct.email_address)

    new_message_id = normalize_message_id(f"<{uuid.uuid4()}@{domain}>") or f"<{uuid.uuid4()}@{domain}>"
    if thread_msg is None or not thread_msg.message_id_header:
        return new_message_id, None, None

    in_reply_to = normalize_message_id(thread_msg.message_id_header)
    ref_ids = extract_reference_ids(thread_msg.references_header, thread_msg.in_reply_to)
    if in_reply_to and in_reply_to not in ref_ids:
        ref_ids.append(in_reply_to)
    references = " ".join(ref_ids) if ref_ids else in_reply_to
    return new_message_id, in_reply_to, references


def send_conversation_reply(
    db: Session,
    *,
    tenant_id: int,
    conversation_id: int,
    user_id: int,
    body: str,
    idempotency_key: str,
    account_id: int | None = None,
    subject: str | None = None,
) -> tuple[dict[str, Any] | None, str | None]:
    conv = get_conversation_for_tenant(db, tenant_id=tenant_id, conversation_id=conversation_id)
    if conv is None:
        return None, "not_found"

    existing_outbound = (
        db.query(OutboundEmailMessage)
        .filter(OutboundEmailMessage.idempotency_key == str(idempotency_key))
        .first()
    )
    if existing_outbound is not None:
        mail_msg = (
            db.query(MailMessage)
            .filter(MailMessage.outbound_message_id == int(existing_outbound.id))
            .first()
        )
        if mail_msg is not None:
            return {
                "mail_message_id": int(mail_msg.id),
                "outbound_message_id": int(existing_outbound.id),
                "delivery_status": existing_outbound.status,
                "idempotent_replay": True,
            }, None

    last_inbound = (
        db.query(MailMessage)
        .filter(
            MailMessage.conversation_id == int(conversation_id),
            MailMessage.direction == MSG_DIRECTION_INBOUND,
        )
        .order_by(MailMessage.id.desc())
        .first()
    )
    if last_inbound is None:
        return None, "no_inbound_for_reply"

    resolved_account_id = int(account_id) if account_id is not None else int(last_inbound.account_id)
    account = (
        db.query(MailAccount)
        .filter(
            MailAccount.id == resolved_account_id,
            MailAccount.tenant_id == int(tenant_id),
            MailAccount.is_active.is_(True),
        )
        .first()
    )
    if account is None:
        return None, "invalid_account"

    recipient = (last_inbound.sender_email or "").strip()
    if not recipient:
        return None, "missing_recipient"

    reply_subject = subject or conv.subject or ""
    if reply_subject and not reply_subject.lower().startswith("re:"):
        reply_subject = f"Re: {reply_subject}"

    message_id_header, in_reply_to, references_header = _build_reply_rfc_headers(
        db, conversation_id=conversation_id
    )
    now = datetime.utcnow()

    mail_msg = MailMessage(
        tenant_id=int(tenant_id),
        conversation_id=int(conversation_id),
        account_id=int(account.id),
        direction=MSG_DIRECTION_OUTBOUND,
        sender_email=account.email_address,
        to_json=addresses_to_json([recipient]),
        cc_json="[]",
        subject=reply_subject[:998],
        text_body=body or "",
        message_id_header=message_id_header,
        in_reply_to=in_reply_to,
        references_header=references_header,
        received_at=now,
        created_at=now,
        sent_by_user_id=int(user_id),
    )
    db.add(mail_msg)
    db.flush()

    outbound, _created = enqueue_manual_reply_email(
        db,
        tenant_id=int(tenant_id),
        conversation_id=int(conversation_id),
        mail_account_id=int(account.id),
        mail_message_id=int(mail_msg.id),
        entity_type=ENTITY_MAIL_CONVERSATION,
        entity_id=int(conversation_id),
        recipient_email=recipient,
        subject=reply_subject,
        body=body or "",
        sent_by_user_id=int(user_id),
        message_id_header=message_id_header,
        in_reply_to=in_reply_to,
        references_header=references_header,
        idempotency_key=str(idempotency_key),
    )
    mail_msg.outbound_message_id = int(outbound.id)
    db.add(mail_msg)

    conv.last_message_at = now
    conv.last_outbound_at = now
    db.add(conv)

    _append_audit(
        db,
        tenant_id=tenant_id,
        conversation_id=conversation_id,
        event_type=AUDIT_REPLY_SENT,
        user_id=user_id,
        payload={
            "mail_message_id": int(mail_msg.id),
            "outbound_message_id": int(outbound.id),
            "recipient_email": recipient,
        },
    )
    db.flush()

    return {
        "mail_message_id": int(mail_msg.id),
        "outbound_message_id": int(outbound.id),
        "delivery_status": outbound.status,
        "idempotent_replay": False,
    }, None


def delivery_status_label(status: str | None) -> str:
    s = (status or "").upper()
    return {
        EMAIL_PENDING: "Oczekuje",
        EMAIL_SENDING: "Wysyłanie",
        EMAIL_SENT: "Wysłano",
        EMAIL_FAILED: "Błąd",
    }.get(s, s or "—")
