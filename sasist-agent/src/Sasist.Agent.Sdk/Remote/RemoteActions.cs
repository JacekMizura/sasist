namespace Sasist.Agent.Sdk.Remote;

/// <summary>
/// Remote action contracts (protocol v1+). Implementations land incrementally —
/// contracts are frozen for ERP ↔ Agent negotiation.
/// </summary>
public static class RemoteActionNames
{
    public const string RefreshDevices = "RefreshDevices";
    public const string RestartModule = "RestartModule";
    public const string RestartAgent = "RestartAgent";
    public const string DownloadLogs = "DownloadLogs";
    public const string RunDiagnostics = "RunDiagnostics";
    public const string ReloadConfiguration = "ReloadConfiguration";
    public const string CheckUpdates = "CheckUpdates";
    public const string UpdateDeviceConfiguration = "UpdateDeviceConfiguration";
}

public sealed record RemoteActionRequest(
    string Action,
    string? ModuleId = null,
    string? DeviceId = null,
    string? CorrelationId = null,
    IReadOnlyDictionary<string, object?>? Parameters = null);

public sealed record RemoteActionResult(
    bool Accepted,
    bool Completed,
    string Action,
    string? ErrorCode = null,
    string? ErrorMessage = null,
    IReadOnlyDictionary<string, object?>? Data = null);

/// <summary>Core / modules may register handlers; unknown actions return Accepted=false.</summary>
public interface IRemoteActionDispatcher
{
    void Register(IRemoteActionHandler handler);
    Task<RemoteActionResult> DispatchAsync(RemoteActionRequest request, CancellationToken cancellationToken);
}

public interface IRemoteActionHandler
{
    string Action { get; }
    Task<RemoteActionResult> HandleAsync(RemoteActionRequest request, CancellationToken cancellationToken);
}
