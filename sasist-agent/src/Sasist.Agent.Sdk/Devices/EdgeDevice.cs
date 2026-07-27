namespace Sasist.Agent.Sdk.Devices;

/// <summary>Operational monitoring status — type-agnostic.</summary>
public static class DeviceOperationalStatus
{
    public const string Online = "online";
    public const string Offline = "offline";
    public const string Error = "error";
    public const string Warning = "warning";
    public const string Busy = "busy";
    public const string Idle = "idle";
    public const string Unknown = "unknown";
}

/// <summary>Structured capability published by a device (not a bare string list).</summary>
public sealed record CapabilityDescriptor(
    string Name,
    string Version,
    IReadOnlyList<string> SupportedOperations,
    IReadOnlyDictionary<string, object?>? Limits = null);

/// <summary>
/// Opaque typed configuration — Core stores JSON blob + version; modules interpret fields.
/// </summary>
public sealed record DeviceConfiguration(
    IReadOnlyDictionary<string, object?> Values,
    string ConfigurationVersion,
    DateTimeOffset? UpdatedAt = null);

/// <summary>Type-agnostic health report for ERP display.</summary>
public sealed record DeviceHealthReport(
    int HealthScore,
    IReadOnlyList<string>? Warnings = null,
    IReadOnlyList<string>? Errors = null,
    IReadOnlyList<string>? RecommendedActions = null)
{
    public static DeviceHealthReport FromStatus(string status) =>
        status switch
        {
            DeviceOperationalStatus.Online or DeviceOperationalStatus.Idle =>
                new(100),
            DeviceOperationalStatus.Busy =>
                new(90),
            DeviceOperationalStatus.Warning =>
                new(60, Warnings: ["Device reporting warning"]),
            DeviceOperationalStatus.Error =>
                new(20, Errors: ["Device reporting error"], RecommendedActions: ["Run diagnostics"]),
            DeviceOperationalStatus.Offline =>
                new(0, Errors: ["Offline"], RecommendedActions: ["Check connection", "RefreshDevices"]),
            _ => new(50, Warnings: ["Unknown health"]),
        };
}

/// <summary>Universal edge device — Agent → Devices hierarchy.</summary>
public sealed record EdgeDevice(
    string Id,
    string Type,
    string DisplayName,
    string ModuleId,
    string? Manufacturer = null,
    string? Model = null,
    string? SerialNumber = null,
    string? Driver = null,
    string? Firmware = null,
    string Status = DeviceOperationalStatus.Unknown,
    IReadOnlyList<CapabilityDescriptor>? Capabilities = null,
    DateTimeOffset? LastSeen = null,
    bool IsActive = true,
    bool IsDefault = false,
    IReadOnlyDictionary<string, object?>? Metadata = null,
    DeviceConfiguration? Configuration = null,
    DeviceHealthReport? Health = null,
    string? SyncRevision = null);

/// <summary>
/// Module-owned discovery. Core DeviceManager aggregates providers —
/// adding scanner/scale does not change Core.
/// </summary>
public interface IDeviceProvider
{
    string ModuleId { get; }
    Task<IReadOnlyList<EdgeDevice>> DiscoverAsync(CancellationToken cancellationToken);

    /// <summary>Called when ERP pushes configuration — no agent restart.</summary>
    Task OnConfigurationChangedAsync(
        string deviceId,
        DeviceConfiguration configuration,
        CancellationToken cancellationToken) =>
        Task.CompletedTask;
}

public interface IDeviceManager
{
    void RegisterProvider(IDeviceProvider provider);
    Task RefreshAsync(string? moduleId = null, CancellationToken cancellationToken = default);
    IReadOnlyList<EdgeDevice> List(string? type = null, string? moduleId = null);
    EdgeDevice? Get(string deviceId);
    void Upsert(EdgeDevice device);
    void Remove(string deviceId);

    DeviceConfiguration? GetConfiguration(string deviceId);
    Task ApplyConfigurationAsync(
        string deviceId,
        DeviceConfiguration configuration,
        CancellationToken cancellationToken = default);

    /// <summary>Build differential sync payload since last successful sync.</summary>
    DeviceSyncDelta BuildSyncDelta();
    void MarkSynced(DeviceSyncDelta delta, string? serverCursor);
    string? LastSyncCursor { get; }
}
