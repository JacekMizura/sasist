# current-context

## Active

**WMS Stanowiska — onboarding E2E fix (no new features)**

Critical: pairing code vanished / “expired” immediately after generate.
Root cause: naive UTC `expires_at` parsed as local time + poll clearing code + refetch race.

## Agent release

Ship ONLY via `.\scripts\publish-release.ps1` → `dist\SasistAgentSetup.exe`
