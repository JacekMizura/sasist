"""Sasist Printer Agent MVP — service layer."""

from .agent_auth_service import generate_agent_token, get_current_agent, hash_agent_token, verify_agent_token
from .agent_service import is_agent_online, list_agents, record_agent_heartbeat, register_agent
from .errors import (
    AgentAuthError,
    AgentNotFoundError,
    JobTransitionConflictError,
    PrinterNotFoundError,
    PrintJobNotFoundError,
    PrintingError,
    TenantScopeError,
)
from .job_service import (
    claim_print_job,
    complete_print_job,
    create_print_job,
    fail_print_job,
    list_pending_jobs_for_agent,
    serialize_print_job,
)
from .printer_service import (
    get_printing_defaults,
    list_agent_printers,
    patch_agent_printer,
    upsert_printing_defaults,
)

__all__ = [
    "AgentAuthError",
    "AgentNotFoundError",
    "JobTransitionConflictError",
    "PrintJobNotFoundError",
    "PrinterNotFoundError",
    "PrintingError",
    "TenantScopeError",
    "claim_print_job",
    "complete_print_job",
    "create_print_job",
    "fail_print_job",
    "generate_agent_token",
    "get_current_agent",
    "get_printing_defaults",
    "hash_agent_token",
    "is_agent_online",
    "list_agent_printers",
    "list_agents",
    "list_pending_jobs_for_agent",
    "patch_agent_printer",
    "record_agent_heartbeat",
    "register_agent",
    "serialize_print_job",
    "upsert_printing_defaults",
    "verify_agent_token",
]
