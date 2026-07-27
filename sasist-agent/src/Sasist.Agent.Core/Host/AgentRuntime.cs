using Microsoft.Extensions.Logging;
using Sasist.Agent.Core.Config;
using Sasist.Agent.Core.Devices;
using Sasist.Agent.Sdk;
using Sasist.Agent.Sdk.Devices;
using Sasist.Agent.Sdk.Remote;

namespace Sasist.Agent.Core.Host;

/// <summary>
/// Module-agnostic agent runtime. Knows DeviceManager, ModuleRegistry, EventBus, ModuleBus, IAgentTransport only.
/// </summary>
public sealed class AgentRuntime
{
    private readonly ILogger<AgentRuntime> _logger;
    private readonly ConfigStore _configStore;
    private readonly IAgentTransport _transport;
    private readonly InMemoryModuleBus _bus = new();
    private readonly DeviceEventBus _deviceEvents = new();
    private readonly SystemClock _clock = new();
    private readonly DeviceManager _devices;
    private readonly ModuleRegistry _modules = new();
    private readonly RemoteActionDispatcher _remoteActions = new();
    private AgentConfig _config = new();
    private CancellationTokenSource? _loopsCts;
    private Task? _heartbeatTask;
    private Task? _pollTask;
    private string? _lastError;

    public AgentRuntime(
        ILogger<AgentRuntime> logger,
        ConfigStore configStore,
        IAgentTransport transport)
    {
        _logger = logger;
        _configStore = configStore;
        _transport = transport;
        _devices = new DeviceManager(_clock, _deviceEvents, bus: _bus);
        _remoteActions.Register(new RefreshDevicesActionHandler(_devices));
        _remoteActions.Register(new UpdateDeviceConfigurationActionHandler(_devices));
        _remoteActions.Register(new DownloadLogsActionHandler());
        _remoteActions.Register(new RunDiagnosticsActionHandler(RunDiagnosticsAsync));
    }

    public AgentConfig Config => _config;
    public ModuleRegistry Modules => _modules;
    public IDeviceManager DeviceManager => _devices;
    public IDeviceEventBus DeviceEvents => _deviceEvents;
    public IRemoteActionDispatcher RemoteActions => _remoteActions;
    public bool IsRunning { get; private set; }

    public void RegisterModule(IAgentModule module) => _modules.Register(module);

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        AgentPaths.EnsureDirectories();
        _config = _configStore.Load();
        if (!_config.IsReadyToRun())
        {
            _logger.LogWarning(
                "Sasist Agent is not configured. Edit {Path} (server_url) and provide API key via secrets.",
                AgentPaths.ConfigPath);
            return;
        }

        ApplyTransportConfig();

        var jobSink = new TransportJobSink(_transport);
        foreach (var module in _modules.All)
        {
            var ctx = new ModuleContext(
                new MsLoggerAdapter(_logger),
                new ModuleConfigSlice(),
                _bus,
                _clock,
                new ModuleFileStore(module.ModuleId),
                jobSink,
                _devices,
                _deviceEvents);
            try
            {
                await module.InitializeAsync(ctx, cancellationToken);
                await module.StartAsync(cancellationToken);
                _logger.LogInformation("Module {ModuleId} started ({Version})", module.ModuleId, module.ModuleVersion);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Module {ModuleId} failed to start", module.ModuleId);
            }
        }

        await EnsureRegisteredAsync(cancellationToken);

        _loopsCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        _heartbeatTask = RunHeartbeatLoopAsync(_loopsCts.Token);
        _pollTask = RunJobPollLoopAsync(_loopsCts.Token);
        IsRunning = true;
        _logger.LogInformation(
            "Sasist Agent running (protocol={Protocol}, version={Version}, machine={MachineId}, modules={Count})",
            AgentConfig.ProtocolVersion,
            AgentConfig.AgentVersion,
            _config.MachineId,
            _modules.All.Count);
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        IsRunning = false;
        if (_loopsCts is not null)
        {
            await _loopsCts.CancelAsync();
            _loopsCts.Dispose();
            _loopsCts = null;
        }

        if (_heartbeatTask is not null)
            try { await _heartbeatTask; } catch (OperationCanceledException) { }
        if (_pollTask is not null)
            try { await _pollTask; } catch (OperationCanceledException) { }

        foreach (var module in _modules.All.Reverse())
        {
            try
            {
                await module.StopAsync(cancellationToken);
                await module.DisposeAsync();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error stopping module {ModuleId}", module.ModuleId);
            }
        }
    }

    public async Task<IReadOnlyList<DiagnosticCheckResult>> RunDiagnosticsAsync(
        bool destructive,
        CancellationToken cancellationToken)
    {
        var results = new List<DiagnosticCheckResult>
        {
            new(
                "agent.version",
                "Wersja agenta",
                DiagnosticSeverities.Info,
                DiagnosticStatuses.Pass,
                AgentConfig.AgentVersion,
                0),
            new(
                "agent.permissions",
                "Uprawnienia",
                DiagnosticSeverities.Error,
                CanWriteProgramData() ? DiagnosticStatuses.Pass : DiagnosticStatuses.Fail,
                AgentPaths.ProgramDataRoot,
                0),
            new(
                "agent.secrets",
                "DPAPI secrets",
                DiagnosticSeverities.Error,
                Directory.Exists(AgentPaths.SecretsDir) ? DiagnosticStatuses.Pass : DiagnosticStatuses.Fail,
                AgentPaths.SecretsDir,
                0),
            new(
                "devices.registry",
                "Device registry",
                DiagnosticSeverities.Info,
                DiagnosticStatuses.Pass,
                $"{_devices.List().Count} devices",
                0),
            new(
                "transport.mode",
                "Transport",
                DiagnosticSeverities.Info,
                DiagnosticStatuses.Pass,
                _transport.GetType().Name,
                0),
        };

        if (_config.HasToken)
        {
            try
            {
                var delta = _devices.BuildSyncDelta();
                await _transport.HeartbeatAsync(
                    new AgentHeartbeatRequest(delta, null, _modules.Descriptors(), _devices.List().Count),
                    cancellationToken);
                results.Add(new DiagnosticCheckResult(
                    "api.https",
                    "Połączenie z API",
                    DiagnosticSeverities.Info,
                    DiagnosticStatuses.Pass,
                    "Heartbeat OK",
                    0));
            }
            catch (Exception ex)
            {
                results.Add(new DiagnosticCheckResult(
                    "api.https",
                    "Połączenie z API",
                    DiagnosticSeverities.Error,
                    DiagnosticStatuses.Fail,
                    ex.Message,
                    0));
            }
        }
        else
        {
            results.Add(new DiagnosticCheckResult(
                "api.https",
                "Połączenie z API",
                DiagnosticSeverities.Error,
                DiagnosticStatuses.Fail,
                "Brak tokenu agenta",
                0));
        }

        var request = new DiagnosticsRequest(Guid.NewGuid(), destructive);
        foreach (var module in _modules.All)
        {
            try
            {
                results.AddRange(await module.CollectDiagnosticsAsync(request, cancellationToken));
            }
            catch (Exception ex)
            {
                results.Add(new DiagnosticCheckResult(
                    $"{module.ModuleId}.diagnostics",
                    $"Diagnostyka {module.ModuleId}",
                    DiagnosticSeverities.Error,
                    DiagnosticStatuses.Fail,
                    ex.Message,
                    0));
            }
        }

        return results;
    }

    private void ApplyTransportConfig()
    {
        _transport.ApplyConfig(new AgentTransportConfig
        {
            ServerUrl = _config.ServerUrl,
            ApiKey = _config.ApiKey,
            Token = _config.Token,
            MachineId = _config.MachineId,
            ComputerName = _config.ComputerName,
            AgentId = _config.AgentId,
            WarehouseId = _config.WarehouseId,
            AgentVersion = AgentConfig.AgentVersion,
            ProtocolVersion = AgentConfig.ProtocolVersion,
        });
    }

    private async Task EnsureRegisteredAsync(CancellationToken ct)
    {
        // With API key: (re)register so printer list syncs into ERP agent_printers (needed for test print / queue).
        // Token-only: keep existing identity.
        if (_config.HasToken && _config.AgentId > 0 && !_config.HasApiKey)
            return;
        if (!_config.HasApiKey)
            throw new InvalidOperationException("api_key required for first registration (DPAPI secret agent_api_key)");

        var result = await _transport.EnsureRegisteredAsync(
            new AgentRegistrationRequest(
                _config.MachineId,
                string.IsNullOrWhiteSpace(_config.ComputerName) ? _config.MachineId : _config.ComputerName,
                AgentConfig.AgentVersion,
                _devices.List(),
                _modules.Descriptors()),
            ct);

        _config.Token = result.Token;
        _config.AgentId = result.AgentId;
        if (result.WarehouseId is not null)
            _config.WarehouseId = result.WarehouseId;
        _configStore.Save(_config);
        ApplyTransportConfig();
        _logger.LogInformation("Registered as agent_id={AgentId}", _config.AgentId);
    }

    private async Task RunHeartbeatLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                foreach (var module in _modules.All)
                {
                    try { await module.HeartbeatAsync(ct); }
                    catch (Exception ex) { _logger.LogDebug(ex, "Heartbeat slice failed for {Module}", module.ModuleId); }
                }

                var delta = _devices.BuildSyncDelta();
                var hb = await _transport.HeartbeatAsync(
                    new AgentHeartbeatRequest(delta, _lastError, _modules.Descriptors(), _devices.List().Count),
                    ct);

                _devices.MarkSynced(delta, hb.Sync.ServerCursor);

                if (hb.Sync.ConfigurationUpdates is { Count: > 0 })
                {
                    foreach (var update in hb.Sync.ConfigurationUpdates)
                        await _devices.ApplyConfigurationAsync(update.DeviceId, update.Configuration, ct);
                }

                if (hb.Sync.PendingActions is { Count: > 0 })
                {
                    foreach (var action in hb.Sync.PendingActions)
                    {
                        var actionResult = await _remoteActions.DispatchAsync(action, ct);
                        if (!string.IsNullOrWhiteSpace(action.CorrelationId))
                            await _transport.ReportActionResultAsync(action.CorrelationId!, actionResult, ct);
                    }
                }

                _lastError = null;
                AgentStatusStore.Write(new AgentStatusSnapshot
                {
                    Online = true,
                    DeviceCount = _devices.List().Count,
                    OrganizationName = _config.OrganizationName,
                });
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _lastError = ex.Message;
                _logger.LogWarning(ex, "Heartbeat failed");
            }

            await Task.Delay(TimeSpan.FromSeconds(Math.Max(5, _config.HeartbeatIntervalSec)), ct);
        }
    }

    private async Task RunJobPollLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                var jobs = await _transport.PollJobsAsync(ct);
                foreach (var job in jobs)
                {
                    var module = _modules.ResolveForJob(job);
                    if (module is null)
                    {
                        await _transport.ReportJobFailedAsync(
                            job.JobId,
                            "No module resolved for job (module_id / capability)",
                            ct);
                        continue;
                    }

                    var command = new ModuleCommand(
                        job.CommandType,
                        job.JobId,
                        job.Payload);
                    var result = await module.HandleCommandAsync(command, ct);
                    var printer =
                        GetPayloadString(job.Payload, "printer_name")
                        ?? GetPayloadString(job.Payload, "device_local_id")
                        ?? GetPayloadString(job.Payload, "printer")
                        ?? "—";
                    JobHistoryStore.Append(
                        job.JobId,
                        printer,
                        result.Ok ? "Wydrukowano" : "Błąd",
                        result.Ok ? null : result.ErrorMessage);
                    if (!result.Ok)
                        _logger.LogWarning(
                            "Job {JobId} module={Module} failed: {Error}",
                            job.JobId, module.ModuleId, result.ErrorMessage);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _lastError = ex.Message;
                _logger.LogWarning(ex, "Job poll failed");
            }

            await Task.Delay(TimeSpan.FromSeconds(Math.Max(2, _config.PollIntervalSec)), ct);
        }
    }

    private static bool CanWriteProgramData()
    {
        try
        {
            AgentPaths.EnsureDirectories();
            var probe = Path.Combine(AgentPaths.ProgramDataRoot, ".write-probe");
            File.WriteAllText(probe, "ok");
            File.Delete(probe);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static string? GetPayloadString(IReadOnlyDictionary<string, object?> payload, string key)
    {
        if (!payload.TryGetValue(key, out var v) || v is null)
            return null;
        var s = v.ToString();
        return string.IsNullOrWhiteSpace(s) ? null : s;
    }
}
