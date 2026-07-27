using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Sasist.Agent.Core.Config;
using Sasist.Agent.Sdk.Devices;

namespace Sasist.Agent.Core.Devices;

public sealed class DeviceEventBus : IDeviceEventBus
{
    private readonly ConcurrentQueue<DeviceEvent> _recent = new();
    private readonly List<(string? EventType, Func<DeviceEvent, Task> Handler)> _handlers = new();
    private readonly object _gate = new();
    private const int MaxRecent = 200;

    public void Publish(DeviceEvent deviceEvent)
    {
        _recent.Enqueue(deviceEvent);
        while (_recent.Count > MaxRecent && _recent.TryDequeue(out _)) { }

        (string? EventType, Func<DeviceEvent, Task> Handler)[] snapshot;
        lock (_gate)
            snapshot = _handlers.ToArray();

        foreach (var (eventType, handler) in snapshot)
        {
            if (eventType is not null &&
                !eventType.Equals(deviceEvent.EventType, StringComparison.OrdinalIgnoreCase))
                continue;
            _ = Task.Run(async () =>
            {
                try { await handler(deviceEvent); }
                catch { /* isolated */ }
            });
        }
    }

    public IDisposable Subscribe(string? eventType, Func<DeviceEvent, Task> handler)
    {
        lock (_gate)
            _handlers.Add((eventType, handler));
        return new Unsub(() =>
        {
            lock (_gate)
                _handlers.RemoveAll(h => ReferenceEquals(h.Handler, handler));
        });
    }

    public IReadOnlyList<DeviceEvent> Recent(int limit = 50) =>
        _recent.Reverse().Take(Math.Max(1, limit)).ToList();

    private sealed class Unsub(Action action) : IDisposable
    {
        public void Dispose() => action();
    }
}

/// <summary>Local opaque device configuration persistence (ProgramData).</summary>
public sealed class DeviceConfigurationStore
{
    private readonly string _path;
    private readonly object _gate = new();
    private Dictionary<string, DeviceConfiguration> _byDevice = new(StringComparer.OrdinalIgnoreCase);

    public DeviceConfigurationStore(string? path = null)
    {
        _path = path ?? Path.Combine(AgentPaths.ProgramDataRoot, "device-config.json");
        Load();
    }

    public DeviceConfiguration? Get(string deviceId)
    {
        lock (_gate)
            return _byDevice.TryGetValue(deviceId, out var c) ? c : null;
    }

    public void Set(string deviceId, DeviceConfiguration configuration)
    {
        lock (_gate)
        {
            _byDevice[deviceId] = configuration;
            SaveUnlocked();
        }
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path))
                return;
            var json = File.ReadAllText(_path);
            var doc = JsonSerializer.Deserialize<Dictionary<string, ConfigRow>>(json);
            if (doc is null) return;
            var map = new Dictionary<string, DeviceConfiguration>(StringComparer.OrdinalIgnoreCase);
            foreach (var (id, row) in doc)
            {
                map[id] = new DeviceConfiguration(
                    row.Values ?? new Dictionary<string, object?>(),
                    row.ConfigurationVersion ?? "0",
                    row.UpdatedAt);
            }
            _byDevice = map;
        }
        catch
        {
            _byDevice = new Dictionary<string, DeviceConfiguration>(StringComparer.OrdinalIgnoreCase);
        }
    }

    private void SaveUnlocked()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        var rows = _byDevice.ToDictionary(
            kv => kv.Key,
            kv => new ConfigRow
            {
                Values = kv.Value.Values.ToDictionary(x => x.Key, x => x.Value),
                ConfigurationVersion = kv.Value.ConfigurationVersion,
                UpdatedAt = kv.Value.UpdatedAt,
            },
            StringComparer.OrdinalIgnoreCase);
        File.WriteAllText(_path, JsonSerializer.Serialize(rows, new JsonSerializerOptions { WriteIndented = true }));
    }

    private sealed class ConfigRow
    {
        public Dictionary<string, object?>? Values { get; set; }
        public string? ConfigurationVersion { get; set; }
        public DateTimeOffset? UpdatedAt { get; set; }
    }
}

public static class DeviceFingerprint
{
    public static string Compute(EdgeDevice d)
    {
        var payload = JsonSerializer.Serialize(new
        {
            d.Id,
            d.Type,
            d.DisplayName,
            d.Manufacturer,
            d.Model,
            d.SerialNumber,
            d.Driver,
            d.Firmware,
            d.Status,
            d.IsActive,
            d.IsDefault,
            Caps = d.Capabilities,
            Meta = d.Metadata,
            CfgVer = d.Configuration?.ConfigurationVersion,
            Health = d.Health,
        });
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(payload));
        return Convert.ToHexString(hash)[..16];
    }
}
