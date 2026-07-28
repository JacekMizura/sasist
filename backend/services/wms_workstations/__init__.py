"""WMS workstations service package."""

from .errors import WorkstationError, WorkstationNotFoundError
from .migration import migrate_agents_to_workstations
from .service import (
    attach_agent_to_workstation,
    claim_pairing_code,
    create_workstation,
    delete_workstation,
    disconnect_computer,
    get_printers_config,
    get_workstation_or_404,
    issue_pairing_code,
    list_devices_grouped,
    list_history,
    list_workstations,
    looks_like_pairing_code,
    put_printer_mapping,
    try_attach_agent_after_register,
    update_workstation,
)

__all__ = [
    "WorkstationError",
    "WorkstationNotFoundError",
    "attach_agent_to_workstation",
    "claim_pairing_code",
    "create_workstation",
    "delete_workstation",
    "disconnect_computer",
    "get_printers_config",
    "get_workstation_or_404",
    "issue_pairing_code",
    "list_devices_grouped",
    "list_history",
    "list_workstations",
    "looks_like_pairing_code",
    "migrate_agents_to_workstations",
    "put_printer_mapping",
    "try_attach_agent_after_register",
    "update_workstation",
]
