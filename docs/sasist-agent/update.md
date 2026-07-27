# Sasist Agent — Update Specification

Related: [security.md](./security.md), [ws-protocol-v1.md](./ws-protocol-v1.md), [openapi-v1.yaml](./openapi-v1.yaml)

---

## 1. Goals

- Update **without full reinstall** (in-place apply)
- Automatic background check
- Signed packages only
- Rollback on failed apply
- Channels: **stable** / **beta**

Technology target: **Velopack** (or equivalent signed differential updater) on .NET Host.

---

## 2. Channels

| Channel | Audience | Default |
|---------|----------|---------|
| `stable` | Production warehouses | yes |
| `beta` | Pilot machines | opt-in in config / ERP remote config |

Agent stores `channel` in local config and remote config (`GET /agents/config`). ERP may suggest channel; local admin can pin.

Switching channel: next check uses new channel; no downgrade unless package allows and policy permits.

---

## 3. Check flow

```
Timer / WS UPDATE_AVAILABLE / manual
        │
        ▼
GET /agents/updates/check?channel=&current_version=
        │
        ▼
update_available?
   no → idle
   yes → verify metadata (version, mandatory, package.url/sha256/signature)
        │
        ▼
(if mandatory or user/schedule policy) UPDATE_START → download → verify → apply
        │
        ▼
restart service/tray → UPDATE_FINISHED
```

HTTPS and WS are equivalent signals; download always over HTTPS.

---

## 4. Package verification (mandatory)

Before apply:

1. Download to `%ProgramData%\Sasist\Agent\updates\staging\`
2. Verify **SHA-256** matches metadata
3. Verify **detached signature** with embedded/public update key ([security.md](./security.md))
4. Reject on any mismatch; emit `UPDATE_FINISHED` with `ok: false`

No apply from unsigned or hash-mismatched packages.

---

## 5. Apply

1. Stop accepting new jobs (module pause)
2. Drain or fail in-flight jobs with clear error (`UPDATE_IN_PROGRESS`) — policy: wait up to N seconds then fail remaining
3. Stop Windows Service gracefully
4. Velopack apply / swap binaries
5. Start Service
6. Health gate: HTTPS authenticate + short diagnostics subset
7. On success → `UPDATE_FINISHED` ok  
   On failure → **rollback** then `UPDATE_FINISHED` with `rolled_back: true`

---

## 6. Rollback

| Trigger | Action |
|---------|--------|
| Apply throws | Restore previous version from updater reserve |
| Post-apply health gate fails | Automatic rollback once |
| Manual | Supported via updater CLI / tray “Przywróć poprzednią wersję” if previous package retained |

Retain at least **one** previous version on disk.

Config and `%ProgramData%` are never overwritten by package apply (preserve `config.json`, logs, tokens).

---

## 7. Mandatory updates

If `mandatory: true`:

- Agent must apply within configured grace (default 24h) or immediately if `force` remote policy
- After grace, refuse new print jobs until updated (Core gate) — optional hard mode via remote config

---

## 8. Messaging

| Event | Direction |
|-------|-----------|
| `UPDATE_AVAILABLE` | E→A |
| `UPDATE_START` | A→E (and optional E→A trigger) |
| `UPDATE_FINISHED` | A→E |

See [ws-protocol-v1.md](./ws-protocol-v1.md).

---

## 9. ERP UI

`GET /agents/updates/download-info` powers Settings → Sasist Agent download button (full installer for greenfield).  
Existing agents prefer in-place updates, not reinstall.
