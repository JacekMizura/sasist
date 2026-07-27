using Sasist.Agent.Sdk.Devices;

namespace Sasist.Agent.Sdk;

public interface IModuleContext
{
    IAgentLogger Logger { get; }
    IModuleConfig Config { get; }
    IModuleBus Bus { get; }
    IAgentClock Clock { get; }
    IModuleFileStore TempStore { get; }
    /// <summary>Job status + download — module-facing; not ERP session APIs.</summary>
    IModuleJobSink Jobs { get; }
    /// <summary>Legacy registry view — prefer <see cref="DeviceManager"/>.</summary>
    IDeviceRegistry Devices { get; }
    IDeviceManager DeviceManager { get; }
    IDeviceEventBus DeviceEvents { get; }
}

public interface IAgentLogger
{
    void Debug(string message);
    void Info(string message);
    void Warning(string message);
    void Error(string message, Exception? exception = null);
}

public interface IModuleConfig
{
    string? GetString(string key);
    int GetInt(string key, int defaultValue);
    bool GetBool(string key, bool defaultValue);
}

public interface IAgentClock
{
    DateTimeOffset UtcNow { get; }
}

public interface IModuleFileStore
{
    string RootPath { get; }
    Task<string> WriteTempFileAsync(string fileName, byte[] content, CancellationToken cancellationToken);
    void TryDelete(string path);
}

public interface IDeviceRegistry
{
    void Upsert(DeviceSnapshot device);
    void Remove(string moduleId, string localId);
    IReadOnlyList<DeviceSnapshot> List(string? moduleId = null);
}

public interface IModuleBus
{
    void Publish(BusMessage message);
    IDisposable Subscribe(string topic, Func<BusMessage, Task> handler);
}

public sealed record BusMessage(
    int BusVersion,
    string Topic,
    string SourceModule,
    string? CorrelationId,
    IReadOnlyDictionary<string, object?> Payload);

public sealed record ModuleHeartbeatSlice(
    string ModuleId,
    string State,
    IReadOnlyList<DeviceSnapshot> Devices,
    IReadOnlyDictionary<string, object?>? Metrics = null,
    string? LastError = null);

public sealed record ModuleCommand(
    string CommandType,
    string? CorrelationId,
    IReadOnlyDictionary<string, object?> Payload);

public sealed record ModuleCommandResult(
    bool Ok,
    string? ErrorCode = null,
    string? ErrorMessage = null,
    IReadOnlyDictionary<string, object?>? Data = null);

public sealed record DiagnosticsRequest(
    Guid RunId,
    bool RunDestructiveTests,
    IReadOnlyList<string>? OnlyCheckIds = null);

public sealed record DiagnosticCheckResult(
    string Id,
    string Title,
    string Severity,
    string Status,
    string? Message = null,
    int? DurationMs = null);
