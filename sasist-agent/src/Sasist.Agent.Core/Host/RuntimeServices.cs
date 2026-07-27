using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;
using Sasist.Agent.Sdk;
using Sasist.Agent.Sdk.Devices;

namespace Sasist.Agent.Core.Host;

public sealed class InMemoryModuleBus : IModuleBus
{
    private readonly ConcurrentDictionary<string, List<Func<BusMessage, Task>>> _handlers = new();

    public void Publish(BusMessage message)
    {
        if (!_handlers.TryGetValue(message.Topic, out var list))
            return;
        Func<BusMessage, Task>[] snapshot;
        lock (list)
            snapshot = list.ToArray();
        foreach (var h in snapshot)
        {
            _ = Task.Run(async () =>
            {
                try { await h(message); }
                catch { /* isolated */ }
            });
        }
    }

    public IDisposable Subscribe(string topic, Func<BusMessage, Task> handler)
    {
        var list = _handlers.GetOrAdd(topic, _ => new List<Func<BusMessage, Task>>());
        lock (list)
            list.Add(handler);
        return new Unsub(() =>
        {
            lock (list)
                list.Remove(handler);
        });
    }

    private sealed class Unsub(Action action) : IDisposable
    {
        public void Dispose() => action();
    }
}

public sealed class SystemClock : IAgentClock
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
}

public sealed class ModuleFileStore : IModuleFileStore
{
    public ModuleFileStore(string moduleId)
    {
        RootPath = Path.Combine(Config.AgentPaths.TempDir, moduleId);
        Directory.CreateDirectory(RootPath);
    }

    public string RootPath { get; }

    public async Task<string> WriteTempFileAsync(string fileName, byte[] content, CancellationToken cancellationToken)
    {
        var path = Path.Combine(RootPath, fileName);
        await File.WriteAllBytesAsync(path, content, cancellationToken);
        return path;
    }

    public void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path))
                File.Delete(path);
        }
        catch { /* best effort */ }
    }
}

public sealed class MsLoggerAdapter : IAgentLogger
{
    private readonly Microsoft.Extensions.Logging.ILogger _logger;

    public MsLoggerAdapter(Microsoft.Extensions.Logging.ILogger logger) => _logger = logger;

    public void Debug(string message) => _logger.LogDebug("{Message}", message);
    public void Info(string message) => _logger.LogInformation("{Message}", message);
    public void Warning(string message) => _logger.LogWarning("{Message}", message);
    public void Error(string message, Exception? exception = null)
    {
        if (exception is null)
            _logger.LogError("{Message}", message);
        else
            _logger.LogError(exception, "{Message}", message);
    }
}

public sealed class ModuleConfigSlice : IModuleConfig
{
    private readonly Dictionary<string, string> _values;

    public ModuleConfigSlice(IDictionary<string, string>? values = null)
    {
        _values = values is null
            ? new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            : new Dictionary<string, string>(values, StringComparer.OrdinalIgnoreCase);
    }

    public string? GetString(string key) =>
        _values.TryGetValue(key, out var v) ? v : null;

    public int GetInt(string key, int defaultValue) =>
        _values.TryGetValue(key, out var v) && int.TryParse(v, out var n) ? n : defaultValue;

    public bool GetBool(string key, bool defaultValue) =>
        _values.TryGetValue(key, out var v) && bool.TryParse(v, out var b) ? b : defaultValue;
}

public sealed class ModuleContext : IModuleContext
{
    public ModuleContext(
        IAgentLogger logger,
        IModuleConfig config,
        IModuleBus bus,
        IAgentClock clock,
        IModuleFileStore tempStore,
        IModuleJobSink jobs,
        IDeviceManager deviceManager,
        IDeviceEventBus deviceEvents)
    {
        Logger = logger;
        Config = config;
        Bus = bus;
        Clock = clock;
        TempStore = tempStore;
        Jobs = jobs;
        DeviceManager = deviceManager;
        DeviceEvents = deviceEvents;
        Devices = deviceManager as IDeviceRegistry
                  ?? throw new ArgumentException("DeviceManager must implement IDeviceRegistry", nameof(deviceManager));
    }

    public IAgentLogger Logger { get; }
    public IModuleConfig Config { get; }
    public IModuleBus Bus { get; }
    public IAgentClock Clock { get; }
    public IModuleFileStore TempStore { get; }
    public IModuleJobSink Jobs { get; }
    public IDeviceRegistry Devices { get; }
    public IDeviceManager DeviceManager { get; }
    public IDeviceEventBus DeviceEvents { get; }
}
