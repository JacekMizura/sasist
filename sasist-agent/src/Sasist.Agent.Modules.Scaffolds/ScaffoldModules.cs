using Sasist.Agent.Sdk;
using Sasist.Agent.Sdk.Devices;

namespace Sasist.Agent.Modules.Scaffolds;

/// <summary>Scaffold only — not registered in Host. No cross-module references.</summary>
public sealed class ScannerModule : ScaffoldModuleBase
{
    public override string ModuleId => "scanner";
    public override IReadOnlyList<string> Capabilities => ["scan.barcode", "scan.qr"];
    protected override IDeviceProvider CreateProvider() => new EmptyDeviceProvider(ModuleId);
}

/// <summary>Scaffold only — not registered in Host.</summary>
public sealed class ScaleModule : ScaffoldModuleBase
{
    public override string ModuleId => "scale";
    public override IReadOnlyList<string> Capabilities => ["scale.weight_kg"];
    protected override IDeviceProvider CreateProvider() => new EmptyDeviceProvider(ModuleId);
}

/// <summary>Scaffold only — not registered in Host.</summary>
public sealed class CameraModule : ScaffoldModuleBase
{
    public override string ModuleId => "camera";
    public override IReadOnlyList<string> Capabilities => ["camera.still"];
    protected override IDeviceProvider CreateProvider() => new EmptyDeviceProvider(ModuleId);
}

/// <summary>Scaffold only — not registered in Host.</summary>
public sealed class RfidModule : ScaffoldModuleBase
{
    public override string ModuleId => "rfid";
    public override IReadOnlyList<string> Capabilities => ["rfid.epc"];
    protected override IDeviceProvider CreateProvider() => new EmptyDeviceProvider(ModuleId);
}

public abstract class ScaffoldModuleBase : IAgentModule
{
    private IModuleContext? _ctx;

    public abstract string ModuleId { get; }
    public string ModuleVersion => "0.0.0-scaffold";
    public abstract IReadOnlyList<string> Capabilities { get; }
    protected abstract IDeviceProvider CreateProvider();

    public Task InitializeAsync(IModuleContext context, CancellationToken cancellationToken)
    {
        _ctx = context;
        context.DeviceManager.RegisterProvider(CreateProvider());
        context.DeviceEvents.Subscribe(null, _ => Task.CompletedTask);
        context.Logger.Info($"{ModuleId} scaffold initialized (not production)");
        return Task.CompletedTask;
    }

    public Task StartAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    public Task<ModuleHeartbeatSlice> HeartbeatAsync(CancellationToken cancellationToken)
    {
        var devices = _ctx?.DeviceManager.List(moduleId: ModuleId).Select(DeviceSnapshot.FromEdgeDevice).ToList()
                      ?? [];
        return Task.FromResult(new ModuleHeartbeatSlice(ModuleId, ModuleStates.Stopped, devices));
    }

    public Task<ModuleCommandResult> HandleCommandAsync(ModuleCommand command, CancellationToken cancellationToken) =>
        Task.FromResult(new ModuleCommandResult(false, "NOT_IMPLEMENTED", $"{ModuleId} scaffold"));

    public Task<IReadOnlyList<DiagnosticCheckResult>> CollectDiagnosticsAsync(
        DiagnosticsRequest request, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<DiagnosticCheckResult>>(
        [
            new($"{ModuleId}.scaffold", $"{ModuleId} scaffold", DiagnosticSeverities.Info, DiagnosticStatuses.Skip, "Not implemented"),
        ]);

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}

internal sealed class EmptyDeviceProvider(string moduleId) : IDeviceProvider
{
    public string ModuleId { get; } = moduleId;

    public Task<IReadOnlyList<EdgeDevice>> DiscoverAsync(CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<EdgeDevice>>([]);

    public Task OnConfigurationChangedAsync(
        string deviceId, DeviceConfiguration configuration, CancellationToken cancellationToken) =>
        Task.CompletedTask;
}
