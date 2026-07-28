# current-context

## Active

**WMS Stanowiska — RC1 Ready**

- Red Team blockers RC1-1 / RC1-2 / RC1-3 closed
- Print: explicit `workstation_id` → mapping → AgentPrinter; PrintingDefault only if no mapping
- Restart Agent CTA removed (Windows Agent unsupported / 501)
- Tenant: `WMS_WORKSTATIONS_TENANT_ID` = `DAMAGE_TENANT_ID` (`panelTenant`) — same panel SSOT as rest of settings

## Deferred (non-blocking)

- Postgres partial UNIQUE on `is_default`
- Dedicated `warehouse.admin` permission (platform)
- PrintingAgentsPage kept for ops diagnostics (pairing deprecated)

## Agent release

Ship ONLY via `.\scripts\publish-release.ps1` → `dist\SasistAgentSetup.exe`
