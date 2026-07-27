# Sasist Agent (.NET)

Windows edge agent — **Architecture v1.0 Release Candidate**.

See `docs/sasist-agent/RC-1.0.md` and `ARCHITECTURE.md`.

## Runtime (actual)

- Transport: `CompatPrintingTransport` (Host) — edge sync `/api/agent` + printing jobs `/api/printing`
- Secrets: DPAPI under `%ProgramData%\Sasist\Agent\secrets`
- Modules: auto-discovered `Sasist.Agent.Modules.*.dll` (base dir + `plugins/`)

## Solution layout

| Project | Role |
|---------|------|
| `Sasist.Agent.Sdk` | Contracts, ModuleRegistry, plugin loader, `IAgentTransport` |
| `Sasist.Agent.Core` | DeviceManager, AgentRuntime, EventBus — **module-agnostic** |
| `Sasist.Agent.Modules.Printing` | Printing plugin (Sdk only) |
| `Sasist.Agent.Modules.Scaffolds` | Scanner/Scale/Camera/RFID skeletons (not Host-wired) |
| `Sasist.Agent.Host` | Windows Service, transport selection, plugin discovery |
| `Sasist.Agent.Tray` | Tray: status, setup (URL/API key), diagnostyka |
| `Sasist.Agent.Tests` | Unit tests |

## Instalacja (Windows)

Zobacz **[INSTALACJA.md](INSTALACJA.md)**.

Klient: zainstaluj → wklej **kod parowania** z Sasist → Połącz.  
Adres API jest wbudowany (`https://api.sasist.pl`). Brak pola Server URL.

```powershell
.\scripts\publish-release.ps1
# → dist\SasistAgentSetup.exe
```

## Configure (developers)

```powershell
$dir = "$env:ProgramData\Sasist\Agent"
New-Item -ItemType Directory -Force -Path $dir, "$dir\secrets", "$dir\plugins" | Out-Null
# Non-secret:
@'{
  "server_url": "https://your-erp.example",
  "machine_id": "PACK-01",
  "computer_name": "PACK-01"
}'@ | Set-Content "$dir\config.json"
# Secrets (api_key / token) are written by the agent via DPAPI after first run,
# or set by provisioning tooling into secrets\*.dpapi
```

Legacy plaintext `api_key`/`token` in `config.json` are migrated once into DPAPI then stripped on save.

## Run

```powershell
dotnet run --project src/Sasist.Agent.Host --configuration Release
dotnet run --project src/Sasist.Agent.Host -- diagnostics
```

## Planned

WebSocket, native `/api/agent/v1` without printing compat, short-lived access tokens.
