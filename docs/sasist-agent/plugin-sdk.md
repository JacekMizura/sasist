# Sasist Agent — Plugin SDK

**Assembly / package (planned):** `Sasist.Agent.Sdk`  
**Host:** .NET 8  
**Contract version:** aligned with `protocol_version = 1`

See also: [ARCHITECTURE.md](./ARCHITECTURE.md), [device.md](./device.md), [diagnostics.md](./diagnostics.md)

---

## 1. Interface `IAgentModule`

```csharp
public interface IAgentModule : IAsyncDisposable
{
    /// <summary>Stable id: "printing", "scanner", …</summary>
    string ModuleId { get; }

    /// <summary>SemVer of this module implementation.</summary>
    string ModuleVersion { get; }

    /// <summary>Capability tokens advertised to ERP.</summary>
    IReadOnlyList<string> Capabilities { get; }

    /// <summary>
    /// Called once after construction. Validate config, allocate non-OS resources.
    /// Must not touch hardware yet if Start is required for that.
    /// </summary>
    Task InitializeAsync(IModuleContext context, CancellationToken cancellationToken);

    /// <summary>
    /// Begin device discovery, queues, background workers.
    /// </summary>
    Task StartAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Stop workers gracefully. Flush in-flight work where safe.
    /// </summary>
    Task StopAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Contribute module slice to agent heartbeat (devices, health, metrics).
    /// Called by Core on schedule; must be fast (&lt; 100ms ideal).
    /// </summary>
    Task<ModuleHeartbeatSlice> HeartbeatAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Handle a command routed by Core (jobs, cancel, module-specific ops).
    /// </summary>
    Task<ModuleCommandResult> HandleCommandAsync(
        ModuleCommand command,
        CancellationToken cancellationToken);

    /// <summary>
    /// Run module-owned diagnostic checks.
    /// </summary>
    Task<IReadOnlyList<DiagnosticCheckResult>> CollectDiagnosticsAsync(
        DiagnosticsRequest request,
        CancellationToken cancellationToken);

    /// <summary>
    /// Release OS handles. Prefer DisposeAsync via IAsyncDisposable.
    /// </summary>
    ValueTask DisposeAsync();
}
```

Synchronous names in product docs map as:

| Doc name | .NET method |
|----------|-------------|
| `Initialize()` | `InitializeAsync` |
| `Start()` | `StartAsync` |
| `Stop()` | `StopAsync` |
| `Heartbeat()` | `HeartbeatAsync` |
| `HandleCommand()` | `HandleCommandAsync` |
| `CollectDiagnostics()` | `CollectDiagnosticsAsync` |
| `Dispose()` | `DisposeAsync` |

---

## 2. Supporting types

```csharp
public interface IModuleContext
{
    IAgentLogger Logger { get; }
    IModuleConfig Config { get; }          // modules.{moduleId}.*
    IModuleBus Bus { get; }
    IAgentClock Clock { get; }
    IModuleFileStore TempStore { get; }
    IAgentTransport Transport { get; }     // report job status, emit WS events via Core
    IDeviceRegistry Writer { get; }        // publish device snapshots to Core registry
}

public sealed record ModuleHeartbeatSlice(
    string ModuleId,
    string State,                          // running | degraded | stopped | failed
    IReadOnlyList<DeviceSnapshot> Devices,
    IReadOnlyDictionary<string, object?>? Metrics = null,
    string? LastError = null);

public sealed record ModuleCommand(
    string CommandType,                    // e.g. "job.execute", "job.cancel"
    string? CorrelationId,
    IReadOnlyDictionary<string, object?> Payload);

public sealed record ModuleCommandResult(
    bool Ok,
    string? ErrorCode = null,
    string? ErrorMessage = null,
    IReadOnlyDictionary<string, object?>? Data = null);

public sealed record DiagnosticsRequest(
    Guid RunId,
    bool RunDestructiveTests,              // e.g. real test page
    IReadOnlyList<string>? OnlyCheckIds = null);
```

---

## 3. Lifecycle

```
construct
   │
   ▼
InitializeAsync ──fail──► failed (Host keeps running; module skipped)
   │
   ▼
StartAsync ──fail──► failed / degraded (policy: failed)
   │
   ▼
running ◄──► degraded     HeartbeatAsync / HandleCommandAsync / CollectDiagnosticsAsync
   │
   ▼
StopAsync
   │
   ▼
stopped ──► (optional StartAsync again)
   │
   ▼
DisposeAsync
```

### Guarantees

| Rule | Detail |
|------|--------|
| Order | `Initialize` → `Start` → (`Heartbeat`\|`HandleCommand`\|`CollectDiagnostics`)* → `Stop` → `Dispose` |
| Re-entrancy | `HandleCommand` may run concurrently per Core policy; Printing serializes per `device_local_id` |
| Cancel | All methods honor `CancellationToken` |
| Exceptions | Unhandled exceptions → Core marks module `degraded`/`failed`, logs, continues Host |
| Idempotent Stop/Dispose | Safe to call twice |

### Host startup sequence

1. Discover modules  
2. `InitializeAsync` each (independent; failures isolated)  
3. Wait for Core `AuthSession` ready  
4. `StartAsync` each initialized module  
5. Publish `core.session.ready` on Module Bus  
6. Begin heartbeat scheduler  

### Host shutdown sequence

1. Publish `core.shutdown`  
2. `StopAsync` modules (reverse dependency order if declared; else parallel with timeout)  
3. `DisposeAsync`  
4. Close WS / flush logs  

---

## 4. Commands (Printing v1 examples)

| `CommandType` | Payload keys | Behavior |
|---------------|--------------|----------|
| `job.execute` | `job_id`, `format`, `device_local_id`, `payload_uri`… | Print |
| `job.cancel` | `job_id` | Cancel if not finished |
| `devices.refresh` | — | Re-enumerate printers |
| `printing.test_page` | `device_local_id` | Optional destructive diag |

Unknown `CommandType` → `Ok=false`, `ErrorCode=UNSUPPORTED_COMMAND`.

---

## 5. Manifest

```csharp
[assembly: AgentModule(
    ModuleId = "printing",
    MinProtocolVersion = 1,
    MaxProtocolVersion = 1)]
```

External modules (v2+): load from `%ProgramFiles%\Sasist\Agent\modules\*.dll` with strong-name / catalog check ([security.md](./security.md)).

---

## 6. Dependency rules (SDK)

- SDK package must not reference ERP backend or UI projects.
- Modules may reference OS libraries (Win32 print, SerialPort, HID).
- Modules must not open ERP URLs except via `IAgentTransport` or URIs explicitly provided in a job payload for content download (still preferred through Core helper).
