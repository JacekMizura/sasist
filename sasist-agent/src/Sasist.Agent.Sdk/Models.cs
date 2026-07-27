using Sasist.Agent.Sdk.Devices;

namespace Sasist.Agent.Sdk;

/// <summary>Legacy snapshot shape — prefer <see cref="EdgeDevice"/> via DeviceManager.</summary>
public static class DeviceKinds
{
    public const string Printer = "printer";
    public const string Scanner = "scanner";
    public const string Scale = "scale";
    public const string Camera = "camera";
    public const string Rfid = "rfid";
    public const string Usb = "usb";
    public const string Serial = "serial";
    public const string Custom = "custom";
}

public sealed record DeviceHealth(
    bool Online,
    string Status,
    string? Paper = null,
    string? Toner = null,
    int? QueueDepth = null,
    string? Message = null,
    DateTimeOffset? CheckedAt = null);

/// <summary>Compat projection of <see cref="EdgeDevice"/> for existing modules.</summary>
public sealed record DeviceSnapshot(
    string LocalId,
    string DisplayName,
    string DeviceKind,
    string ModuleId,
    bool IsActive = true,
    bool IsDefault = false,
    IReadOnlyList<string>? Capabilities = null,
    DeviceHealth? Health = null,
    IReadOnlyDictionary<string, object?>? Metadata = null)
{
    public static DeviceSnapshot FromEdgeDevice(EdgeDevice d)
    {
        var online = d.Status is DeviceOperationalStatus.Online
            or DeviceOperationalStatus.Idle
            or DeviceOperationalStatus.Busy
            or DeviceOperationalStatus.Warning;
        var caps = d.Capabilities?
            .SelectMany(c => c.SupportedOperations.DefaultIfEmpty(c.Name))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var meta = d.Metadata is null
            ? new Dictionary<string, object?>()
            : new Dictionary<string, object?>(d.Metadata);
        if (d.Manufacturer is not null) meta["manufacturer"] = d.Manufacturer;
        if (d.Model is not null) meta["model"] = d.Model;
        if (d.SerialNumber is not null) meta["serial_number"] = d.SerialNumber;
        if (d.Driver is not null) meta["driver"] = d.Driver;
        if (d.Firmware is not null) meta["firmware"] = d.Firmware;
        if (d.Configuration is not null)
        {
            meta["configuration_version"] = d.Configuration.ConfigurationVersion;
            meta["configuration"] = d.Configuration.Values;
        }
        if (d.Health is not null)
        {
            meta["health_score"] = d.Health.HealthScore;
            meta["health_warnings"] = d.Health.Warnings;
            meta["health_errors"] = d.Health.Errors;
            meta["recommended_actions"] = d.Health.RecommendedActions;
        }

        return new DeviceSnapshot(
            LocalId: d.Id,
            DisplayName: d.DisplayName,
            DeviceKind: d.Type,
            ModuleId: d.ModuleId,
            IsActive: d.IsActive,
            IsDefault: d.IsDefault,
            Capabilities: caps,
            Health: new DeviceHealth(
                Online: online,
                Status: d.Status,
                Message: d.Health?.Errors?.FirstOrDefault() ?? d.Health?.Warnings?.FirstOrDefault(),
                CheckedAt: d.LastSeen),
            Metadata: meta);
    }
}

[AttributeUsage(AttributeTargets.Assembly, AllowMultiple = true)]
public sealed class AgentModuleAttribute : Attribute
{
    public required string ModuleId { get; init; }
    public int MinProtocolVersion { get; init; } = 1;
    public int MaxProtocolVersion { get; init; } = 1;
}

public static class ModuleStates
{
    public const string Running = "running";
    public const string Degraded = "degraded";
    public const string Stopped = "stopped";
    public const string Failed = "failed";
}

public static class CommandTypes
{
    public const string JobExecute = "job.execute";
    public const string JobCancel = "job.cancel";
    public const string DevicesRefresh = "devices.refresh";
    public const string ModuleTest = "module.test";
}

public static class DiagnosticSeverities
{
    public const string Info = "INFO";
    public const string Warning = "WARNING";
    public const string Error = "ERROR";
}

public static class DiagnosticStatuses
{
    public const string Pass = "pass";
    public const string Fail = "fail";
    public const string Skip = "skip";
}
