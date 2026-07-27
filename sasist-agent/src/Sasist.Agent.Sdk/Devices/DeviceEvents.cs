namespace Sasist.Agent.Sdk.Devices;

/// <summary>Device Event Bus — typed device lifecycle events (separate from ModuleBus).</summary>
public static class DeviceEventNames
{
    public const string DeviceConnected = "DeviceConnected";
    public const string DeviceDisconnected = "DeviceDisconnected";
    public const string DeviceChanged = "DeviceChanged";
    public const string CapabilityChanged = "CapabilityChanged";
    public const string ConfigurationChanged = "ConfigurationChanged";
    public const string HeartbeatTimeout = "HeartbeatTimeout";
}

public sealed record DeviceEvent(
    string EventType,
    string DeviceId,
    string? ModuleId,
    string? DeviceType,
    DateTimeOffset OccurredAt,
    IReadOnlyDictionary<string, object?>? Payload = null);

public interface IDeviceEventBus
{
    void Publish(DeviceEvent deviceEvent);
    IDisposable Subscribe(string? eventType, Func<DeviceEvent, Task> handler);
    IReadOnlyList<DeviceEvent> Recent(int limit = 50);
}

/// <summary>Differential device sync between Agent and Backend.</summary>
public sealed record DeviceSyncDelta(
    string? ClientCursor,
    IReadOnlyList<EdgeDevice> Upserts,
    IReadOnlyList<string> Removes,
    DateTimeOffset HeartbeatAt,
    IReadOnlyList<DeviceEvent>? Events = null);

public sealed record DeviceSyncResult(
    string ServerCursor,
    IReadOnlyList<DeviceConfigurationUpdate>? ConfigurationUpdates = null,
    IReadOnlyList<Remote.RemoteActionRequest>? PendingActions = null);

public sealed record DeviceConfigurationUpdate(
    string DeviceId,
    DeviceConfiguration Configuration);
