"""Inventory count RBAC permission keys — stable dot-keys for require_permission."""

from __future__ import annotations

# View / export
PERM_VIEW = "inventory.view"
PERM_EXPORT = "inventory.export"
PERM_AUDIT_PACKAGE = "inventory.audit_package"

# Counting
PERM_EXECUTE = "inventory.execute"
PERM_RECOUNT = "inventory.recount"
PERM_OVERRIDE = "inventory.override"

# Approvals
PERM_SUBMIT = "inventory.submit"
PERM_APPROVE = "inventory.approve"
PERM_REJECT = "inventory.reject"
PERM_POST = "inventory.post"

# Admin
PERM_FORCE_UNLOCK = "inventory.force_unlock"
PERM_CANCEL = "inventory.cancel"
PERM_DELETE = "inventory.delete"

ALL_INVENTORY_PERMISSIONS: tuple[str, ...] = (
    PERM_VIEW,
    PERM_EXPORT,
    PERM_AUDIT_PACKAGE,
    PERM_EXECUTE,
    PERM_RECOUNT,
    PERM_OVERRIDE,
    PERM_SUBMIT,
    PERM_APPROVE,
    PERM_REJECT,
    PERM_POST,
    PERM_FORCE_UNLOCK,
    PERM_CANCEL,
    PERM_DELETE,
)

# Legacy warehouse keys that satisfy newer inventory permissions (backward compat).
LEGACY_PERMISSION_ALIASES: dict[str, tuple[str, ...]] = {
    PERM_VIEW: ("warehouse.inventory", "warehouse.stock"),
    PERM_EXPORT: ("warehouse.inventory",),
    PERM_AUDIT_PACKAGE: ("warehouse.inventory", "audit.view"),
    PERM_EXECUTE: ("warehouse.inventory", "warehouse.operations"),
    PERM_RECOUNT: ("warehouse.inventory", "warehouse.adjustments"),
    PERM_OVERRIDE: ("warehouse.picking.override", "warehouse.adjustments"),
    PERM_SUBMIT: ("warehouse.inventory", "warehouse.adjustments"),
    PERM_APPROVE: ("warehouse.inventory", "warehouse.adjustments"),
    PERM_REJECT: ("warehouse.inventory", "warehouse.adjustments"),
    PERM_POST: ("warehouse.inventory", "warehouse.adjustments"),
    PERM_FORCE_UNLOCK: ("warehouse.adjustments",),
    PERM_CANCEL: ("warehouse.inventory",),
    PERM_DELETE: ("warehouse.adjustments",),
}

INVENTORY_ROLE_PRESETS: dict[str, tuple[str, ...]] = {
    "inventory_viewer": (PERM_VIEW,),
    "inventory_operator": (PERM_VIEW, PERM_EXECUTE),
    "inventory_supervisor": (
        PERM_VIEW,
        PERM_EXPORT,
        PERM_EXECUTE,
        PERM_RECOUNT,
        PERM_SUBMIT,
        PERM_APPROVE,
        PERM_REJECT,
    ),
    "inventory_manager": (
        PERM_VIEW,
        PERM_EXPORT,
        PERM_AUDIT_PACKAGE,
        PERM_EXECUTE,
        PERM_RECOUNT,
        PERM_OVERRIDE,
        PERM_SUBMIT,
        PERM_APPROVE,
        PERM_REJECT,
        PERM_POST,
        PERM_CANCEL,
    ),
    "inventory_auditor": (PERM_VIEW, PERM_EXPORT, PERM_AUDIT_PACKAGE),
    "inventory_admin": ALL_INVENTORY_PERMISSIONS,
}
