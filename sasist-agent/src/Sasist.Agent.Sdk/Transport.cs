using Sasist.Agent.Sdk.Devices;
using Sasist.Agent.Sdk.Remote;

namespace Sasist.Agent.Sdk;

/// <summary>
/// Generic ERP ↔ Agent transport. Core never chooses an implementation —
/// Host injects CompatPrintingTransport / FutureAgentTransport / WebSocketTransport.
/// </summary>
public interface IAgentTransport
{
    void ApplyConfig(AgentTransportConfig config);

    Task<AgentRegistrationResult> EnsureRegisteredAsync(
        AgentRegistrationRequest request,
        CancellationToken cancellationToken);

    /// <summary>Single heartbeat source of truth (device sync + optional compat adapters inside transport).</summary>
    Task<AgentHeartbeatResult> HeartbeatAsync(
        AgentHeartbeatRequest request,
        CancellationToken cancellationToken);

    Task ReportActionResultAsync(
        string correlationId,
        RemoteActionResult result,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<PendingModuleJob>> PollJobsAsync(CancellationToken cancellationToken);

    Task ReportJobProcessingAsync(string jobId, CancellationToken cancellationToken);
    Task ReportJobCompletedAsync(string jobId, CancellationToken cancellationToken);
    Task ReportJobFailedAsync(string jobId, string errorMessage, CancellationToken cancellationToken);

    Task<byte[]> DownloadAsync(string urlOrPath, CancellationToken cancellationToken);
}

/// <summary>Transport-facing config snapshot (no secrets persistence here).</summary>
public sealed class AgentTransportConfig
{
    public string ServerUrl { get; init; } = "";
    public string ApiKey { get; init; } = "";
    public string Token { get; init; } = "";
    public string MachineId { get; init; } = "";
    public string ComputerName { get; init; } = "";
    public int AgentId { get; init; }
    public int? WarehouseId { get; init; }
    public string AgentVersion { get; init; } = "1.0.0";
    public int ProtocolVersion { get; init; } = 1;
}

public sealed record AgentRegistrationRequest(
    string MachineId,
    string Name,
    string AgentVersion,
    IReadOnlyList<EdgeDevice> Devices,
    IReadOnlyList<ModuleDescriptor> Modules);

public sealed record ModuleDescriptor(string ModuleId, string ModuleVersion, IReadOnlyList<string> Capabilities);

public sealed record AgentRegistrationResult(
    int AgentId,
    string Token,
    string MachineId,
    int? WarehouseId);

public sealed record AgentHeartbeatRequest(
    DeviceSyncDelta DeviceDelta,
    string? LastError,
    IReadOnlyList<ModuleDescriptor> Modules,
    int DeviceCount = 0);

public sealed record AgentHeartbeatResult(
    DeviceSyncResult Sync,
    DateTimeOffset ServerTime);

/// <summary>Generic pending work item — routed by ModuleId or RequiredCapability.</summary>
public sealed record PendingModuleJob(
    string JobId,
    string? TargetModuleId,
    string? RequiredCapability,
    string CommandType,
    IReadOnlyDictionary<string, object?> Payload);

/// <summary>
/// Narrow job status callbacks used by modules (e.g. Printing) —
/// wraps <see cref="IAgentTransport"/> without print-specific naming in Core.
/// </summary>
public interface IModuleJobSink
{
    Task ReportProcessingAsync(string jobId, CancellationToken cancellationToken);
    Task ReportCompletedAsync(string jobId, CancellationToken cancellationToken);
    Task ReportFailedAsync(string jobId, string errorMessage, CancellationToken cancellationToken);
    Task<byte[]> DownloadAsync(string urlOrPath, CancellationToken cancellationToken);
}

public sealed class TransportJobSink(IAgentTransport transport) : IModuleJobSink
{
    public Task ReportProcessingAsync(string jobId, CancellationToken cancellationToken) =>
        transport.ReportJobProcessingAsync(jobId, cancellationToken);

    public Task ReportCompletedAsync(string jobId, CancellationToken cancellationToken) =>
        transport.ReportJobCompletedAsync(jobId, cancellationToken);

    public Task ReportFailedAsync(string jobId, string errorMessage, CancellationToken cancellationToken) =>
        transport.ReportJobFailedAsync(jobId, errorMessage, cancellationToken);

    public Task<byte[]> DownloadAsync(string urlOrPath, CancellationToken cancellationToken) =>
        transport.DownloadAsync(urlOrPath, cancellationToken);
}
