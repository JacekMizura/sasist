"""Messaging package — templates, recipients, context, email outbox."""

from .email_outbox import enqueue_or_get_outbound_email, render_template_string
from .recipients import resolve_customer_email, resolve_internal_user_email, RecipientResolution
from .templates import get_active_email_template, list_email_templates, template_to_dict
from .context import build_entity_email_context

__all__ = [
    "enqueue_or_get_outbound_email",
    "render_template_string",
    "resolve_customer_email",
    "RecipientResolution",
    "get_active_email_template",
    "list_email_templates",
    "template_to_dict",
    "build_entity_email_context",
]
