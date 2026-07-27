using System.Collections.Concurrent;
using Sasist.Agent.Sdk;
using Sasist.Agent.Sdk.Devices;
using Sasist.Agent.Sdk.Remote;

namespace Sasist.Agent.Core.Devices;

/// <summary>
/// Core device registry + discovery + config + differential sync.
/// Type-agnostic — modules register <see cref="IDeviceProvider"/>.
/// </summary>
public sealed class DeviceManager : IDeviceManager, IDeviceRegistry
{
    private readonly ConcurrentDictionary<string, IDeviceProvider> _providers = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, EdgeDevice> _devices = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, string> _syncedFingerprints = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, byte> _pendingRemoves = new(StringComparer.OrdinalIgnoreCase);
    private readonly IAgentClock _clock;
    private readonly IModuleBus? _bus;
    private readonly IDeviceEventBus _events;
    private readonly DeviceConfigurationStore _configs;
    private string? _lastSyncCursor;

    public DeviceManager(
        IAgentClock clock,
        IDeviceEventBus events,
        DeviceConfigurationStore? configs = null,
        IModuleBus? bus = null)
    {
        _clock = clock;
        _events = events;
        _configs = configs ?? new DeviceConfigurationStore();
        _bus = bus;
    }

    public string? LastSyncCursor => _lastSyncCursor;

    public void RegisterProvider(IDeviceProvider provider) =>
        _providers[provider.ModuleId] = provider;

    public async Task RefreshAsync(string? moduleId = null, CancellationToken cancellationToken = default)
    {
        IEnumerable<IDeviceProvider> providers = moduleId is null
            ? _providers.Values
            : _providers.TryGetValue(moduleId, out var one) ? [one] : Array.Empty<IDeviceProvider>();

        foreach (var provider in providers)
        {
            IReadOnlyList<EdgeDevice> discovered;
            try
            {
                discovered = await provider.DiscoverAsync(cancellationToken);
            }
            catch
            {
                continue;
            }

            var keep = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var device in discovered)
            {
                var merged = MergeLocalState(device with { LastSeen = device.LastSeen ?? _clock.UtcNow });
                var previous = _devices.TryGetValue(merged.Id, out var old) ? old : null;
                _devices[merged.Id] = merged;
                keep.Add(merged.Id);
                _pendingRemoves.TryRemove(merged.Id, out _);
                EmitChange(previous, merged, provider.ModuleId);
            }

            foreach (var existing in _devices.Values.Where(d =>
                         d.ModuleId.Equals(provider.ModuleId, StringComparison.OrdinalIgnoreCase) &&
                         !keep.Contains(d.Id)).ToList())
            {
                if (_devices.TryRemove(existing.Id, out _))
                {
                    _pendingRemoves[existing.Id] = 1;
                    _events.Publish(new DeviceEvent(
                        DeviceEventNames.DeviceDisconnected,
                        existing.Id,
                        existing.ModuleId,
                        existing.Type,
                        _clock.UtcNow));
                }
            }
        }
    }

    public IReadOnlyList<EdgeDevice> List(string? type = null, string? moduleId = null)
    {
        IEnumerable<EdgeDevice> q = _devices.Values;
        if (!string.IsNullOrWhiteSpace(type))
            q = q.Where(d => d.Type.Equals(type, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(moduleId))
            q = q.Where(d => d.ModuleId.Equals(moduleId, StringComparison.OrdinalIgnoreCase));
        return q.OrderBy(d => d.DisplayName, StringComparer.OrdinalIgnoreCase).ToList();
    }

    public EdgeDevice? Get(string deviceId) =>
        _devices.TryGetValue(deviceId, out var d) ? d : null;

    public void Upsert(EdgeDevice device)
    {
        var merged = MergeLocalState(device with { LastSeen = device.LastSeen ?? _clock.UtcNow });
        var previous = _devices.TryGetValue(merged.Id, out var old) ? old : null;
        _devices[merged.Id] = merged;
        EmitChange(previous, merged, merged.ModuleId);
    }

    public void Remove(string deviceId)
    {
        if (_devices.TryRemove(deviceId, out var existing))
        {
            _pendingRemoves[deviceId] = 1;
            _events.Publish(new DeviceEvent(
                DeviceEventNames.DeviceDisconnected,
                deviceId,
                existing.ModuleId,
                existing.Type,
                _clock.UtcNow));
        }
    }

    public DeviceConfiguration? GetConfiguration(string deviceId) =>
        _configs.Get(deviceId) ?? Get(deviceId)?.Configuration;

    public async Task ApplyConfigurationAsync(
        string deviceId,
        DeviceConfiguration configuration,
        CancellationToken cancellationToken = default)
    {
        _configs.Set(deviceId, configuration);
        if (_devices.TryGetValue(deviceId, out var device))
        {
            var updated = device with
            {
                Configuration = configuration,
                SyncRevision = null,
                LastSeen = _clock.UtcNow,
            };
            _devices[deviceId] = updated;
            _events.Publish(new DeviceEvent(
                DeviceEventNames.ConfigurationChanged,
                deviceId,
                device.ModuleId,
                device.Type,
                _clock.UtcNow,
                new Dictionary<string, object?>
                {
                    ["configuration_version"] = configuration.ConfigurationVersion,
                }));

            if (_providers.TryGetValue(device.ModuleId, out var provider))
                await provider.OnConfigurationChangedAsync(deviceId, configuration, cancellationToken);
        }
        else if (_providers.Count > 0)
        {
            // Device not in inventory yet — still notify all providers by device id (module may own it).
            foreach (var provider in _providers.Values)
                await provider.OnConfigurationChangedAsync(deviceId, configuration, cancellationToken);
        }
    }

    public DeviceSyncDelta BuildSyncDelta()
    {
        var upserts = new List<EdgeDevice>();
        foreach (var device in _devices.Values)
        {
            var fp = DeviceFingerprint.Compute(device);
            if (_syncedFingerprints.TryGetValue(device.Id, out var prev) && prev == fp)
                continue;
            upserts.Add(device with { SyncRevision = fp, Health = device.Health ?? DeviceHealthReport.FromStatus(device.Status) });
        }

        var removes = _pendingRemoves.Keys.ToList();
        return new DeviceSyncDelta(
            ClientCursor: _lastSyncCursor,
            Upserts: upserts,
            Removes: removes,
            HeartbeatAt: _clock.UtcNow,
            Events: _events.Recent(20));
    }

    public void MarkSynced(DeviceSyncDelta delta, string? serverCursor)
    {
        foreach (var device in delta.Upserts)
        {
            var fp = device.SyncRevision ?? DeviceFingerprint.Compute(device);
            _syncedFingerprints[device.Id] = fp;
        }
        foreach (var id in delta.Removes)
        {
            _pendingRemoves.TryRemove(id, out _);
            _syncedFingerprints.TryRemove(id, out _);
        }
        if (!string.IsNullOrWhiteSpace(serverCursor))
            _lastSyncCursor = serverCursor;
    }

    private EdgeDevice MergeLocalState(EdgeDevice device)
    {
        var cfg = _configs.Get(device.Id) ?? device.Configuration;
        var health = device.Health ?? DeviceHealthReport.FromStatus(device.Status);
        return device with { Configuration = cfg, Health = health };
    }

    private void EmitChange(EdgeDevice? previous, EdgeDevice current, string moduleId)
    {
        if (previous is null)
        {
            _events.Publish(new DeviceEvent(
                DeviceEventNames.DeviceConnected,
                current.Id,
                moduleId,
                current.Type,
                _clock.UtcNow));
        }
        else
        {
            _events.Publish(new DeviceEvent(
                DeviceEventNames.DeviceChanged,
                current.Id,
                moduleId,
                current.Type,
                _clock.UtcNow));

            var prevCaps = JsonCaps(previous);
            var nextCaps = JsonCaps(current);
            if (!string.Equals(prevCaps, nextCaps, StringComparison.Ordinal))
            {
                _events.Publish(new DeviceEvent(
                    DeviceEventNames.CapabilityChanged,
                    current.Id,
                    moduleId,
                    current.Type,
                    _clock.UtcNow));
            }
        }

        _bus?.Publish(new BusMessage(
            1,
            "module.device.changed",
            moduleId,
            null,
            new Dictionary<string, object?>
            {
                ["change"] = previous is null ? "connected" : "updated",
                ["device_id"] = current.Id,
                ["type"] = current.Type,
            }));
    }

    private static string JsonCaps(EdgeDevice d) =>
        System.Text.Json.JsonSerializer.Serialize(d.Capabilities);

    // --- IDeviceRegistry compat ---

    public void Upsert(DeviceSnapshot device)
    {
        var caps = (device.Capabilities ?? Array.Empty<string>())
            .Select(c => new CapabilityDescriptor(c, "1", [c]))
            .ToList();
        var status = device.Health?.Status ??
                     (device.Health?.Online == true ? DeviceOperationalStatus.Online : DeviceOperationalStatus.Offline);
        Upsert(new EdgeDevice(
            Id: device.LocalId,
            Type: device.DeviceKind,
            DisplayName: device.DisplayName,
            ModuleId: device.ModuleId,
            Status: status,
            Capabilities: caps,
            LastSeen: device.Health?.CheckedAt ?? _clock.UtcNow,
            IsActive: device.IsActive,
            IsDefault: device.IsDefault,
            Metadata: device.Metadata));
    }

    void IDeviceRegistry.Remove(string moduleId, string localId)
    {
        if (_devices.TryGetValue(localId, out var d) &&
            d.ModuleId.Equals(moduleId, StringComparison.OrdinalIgnoreCase))
            Remove(localId);
    }

    IReadOnlyList<DeviceSnapshot> IDeviceRegistry.List(string? moduleId) =>
        List(moduleId: moduleId).Select(DeviceSnapshot.FromEdgeDevice).ToList();
}
