# Sasist Agent — Security

**Status:** RC baseline implemented · advanced items **Planned**

## RC (shipped)

| Control | Implementation |
|---------|----------------|
| Agent token / API key at rest | DPAPI (`%ProgramData%\Sasist\Agent\secrets\*.dpapi`) |
| config.json | Non-secret fields only (`server_url`, `machine_id`, …) |
| Register | **API key required** — legacy `tenant_id` register removed |
| Replay protection | `X-Sasist-Timestamp` + `X-Sasist-Nonce` on agent → ERP calls |
| Rate limit | In-memory per agent+path (120/min) on sync / action result |
| Remote actions ACL | Permission `settings.users` or `settings.company`; allowlist; Restart* needs `settings.users` |
| DownloadLogs | Max archive 5 MiB |
| Configuration payload | Max 64 KiB JSON |
| Update packages | Companion `.sig` file required when verifying (`IUpdateSignatureVerifier`) |

## Planned (not shipped — do not assume present)

- Short-lived access tokens (`sat_`) + refresh rotation  
- DPAPI CurrentUser scope / per-user isolation  
- Persistent distributed rate limits  
- Full Ed25519 / Authenticode package signature crypto  
- WebSocket frame replay / privileged `ts` skew beyond HTTP headers  

## Auth flows (actual)

1. Onboarding: `POST /api/printing/agents/register` with Bearer integration API key (`printer_agent` + scope `printing.agent`) → long-lived `spt_` agent token (DPAPI-stored).  
2. Runtime: Bearer `spt_` on `/api/agent/devices/sync`, `/api/agent/actions/result`, `/api/printing/jobs/*`, `/api/printing/agents/heartbeat`.  
3. ERP UI: user JWT + permissions for `/api/agent/actions` enqueue.
