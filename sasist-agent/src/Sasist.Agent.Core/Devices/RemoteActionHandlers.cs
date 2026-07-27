using System.IO.Compression;
using System.Text;
using System.Text.Json;
using Sasist.Agent.Core.Config;
using Sasist.Agent.Core.Host;
using Sasist.Agent.Sdk;
using Sasist.Agent.Sdk.Devices;
using Sasist.Agent.Sdk.Remote;

namespace Sasist.Agent.Core.Devices;

public sealed class RefreshDevicesActionHandler : IRemoteActionHandler
{
    private readonly IDeviceManager _devices;

    public RefreshDevicesActionHandler(IDeviceManager devices) => _devices = devices;

    public string Action => RemoteActionNames.RefreshDevices;

    public async Task<RemoteActionResult> HandleAsync(RemoteActionRequest request, CancellationToken cancellationToken)
    {
        await _devices.RefreshAsync(request.ModuleId, cancellationToken);
        var list = _devices.List(moduleId: request.ModuleId);
        return new RemoteActionResult(
            Accepted: true,
            Completed: true,
            Action: Action,
            Data: new Dictionary<string, object?> { ["count"] = list.Count });
    }
}

public sealed class UpdateDeviceConfigurationActionHandler : IRemoteActionHandler
{
    private readonly IDeviceManager _devices;

    public UpdateDeviceConfigurationActionHandler(IDeviceManager devices) => _devices = devices;

    public string Action => RemoteActionNames.UpdateDeviceConfiguration;

    public async Task<RemoteActionResult> HandleAsync(RemoteActionRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.DeviceId))
            return new RemoteActionResult(false, false, Action, "INVALID_PAYLOAD", "device_id required");

        var values = new Dictionary<string, object?>();
        var version = Guid.NewGuid().ToString("N")[..12];
        if (request.Parameters is not null)
        {
            if (request.Parameters.TryGetValue("configuration", out var cfgObj) && cfgObj is JsonElement el &&
                el.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in el.EnumerateObject())
                    values[prop.Name] = JsonElementToObject(prop.Value);
            }
            else if (request.Parameters.TryGetValue("values", out var vals) && vals is IReadOnlyDictionary<string, object?> dict)
            {
                foreach (var kv in dict)
                    values[kv.Key] = kv.Value;
            }
            else
            {
                foreach (var kv in request.Parameters)
                {
                    if (kv.Key is "configuration_version" or "configurationVersion")
                    {
                        version = kv.Value?.ToString() ?? version;
                        continue;
                    }
                    values[kv.Key] = kv.Value;
                }
            }

            if (request.Parameters.TryGetValue("configuration_version", out var ver) && ver is not null)
                version = ver.ToString() ?? version;
        }

        var configuration = new DeviceConfiguration(values, version, DateTimeOffset.UtcNow);
        await _devices.ApplyConfigurationAsync(request.DeviceId, configuration, cancellationToken);
        return new RemoteActionResult(
            Accepted: true,
            Completed: true,
            Action: Action,
            Data: new Dictionary<string, object?>
            {
                ["device_id"] = request.DeviceId,
                ["configuration_version"] = version,
            });
    }

    private static object? JsonElementToObject(JsonElement el) =>
        el.ValueKind switch
        {
            JsonValueKind.String => el.GetString(),
            JsonValueKind.Number => el.TryGetInt64(out var l) ? l : el.GetDouble(),
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Null => null,
            _ => el.GetRawText(),
        };
}

public sealed class RunDiagnosticsActionHandler : IRemoteActionHandler
{
    private readonly Func<bool, CancellationToken, Task<IReadOnlyList<DiagnosticCheckResult>>> _run;

    public RunDiagnosticsActionHandler(
        Func<bool, CancellationToken, Task<IReadOnlyList<DiagnosticCheckResult>>> run) =>
        _run = run;

    public string Action => RemoteActionNames.RunDiagnostics;

    public async Task<RemoteActionResult> HandleAsync(RemoteActionRequest request, CancellationToken cancellationToken)
    {
        var destructive = false;
        if (request.Parameters?.TryGetValue("destructive", out var d) == true)
            destructive = d is true || string.Equals(d?.ToString(), "true", StringComparison.OrdinalIgnoreCase);

        var checks = await _run(destructive, cancellationToken);
        return new RemoteActionResult(
            Accepted: true,
            Completed: true,
            Action: Action,
            Data: new Dictionary<string, object?>
            {
                ["checks"] = checks.Select(c => new Dictionary<string, object?>
                {
                    ["id"] = c.Id,
                    ["title"] = c.Title,
                    ["severity"] = c.Severity,
                    ["status"] = c.Status,
                    ["message"] = c.Message,
                    ["duration_ms"] = c.DurationMs,
                }).ToList(),
            });
    }
}

public sealed class DownloadLogsActionHandler : IRemoteActionHandler
{
    public const long MaxLogArchiveBytes = 5 * 1024 * 1024; // 5 MiB RC limit

    public string Action => RemoteActionNames.DownloadLogs;

    public Task<RemoteActionResult> HandleAsync(RemoteActionRequest request, CancellationToken cancellationToken)
    {
        AgentPaths.EnsureDirectories();
        var stamp = DateTimeOffset.UtcNow.ToString("yyyyMMdd_HHmmss");
        var zipName = $"agent-logs-{stamp}.zip";
        var zipPath = Path.Combine(AgentPaths.TempDir, zipName);

        if (File.Exists(zipPath))
            File.Delete(zipPath);

        using (var zip = ZipFile.Open(zipPath, ZipArchiveMode.Create))
        {
            if (Directory.Exists(AgentPaths.LogsDir))
            {
                foreach (var file in Directory.EnumerateFiles(AgentPaths.LogsDir))
                {
                    try
                    {
                        zip.CreateEntryFromFile(file, Path.GetFileName(file));
                    }
                    catch
                    {
                        // skip locked files
                    }
                }
            }

            var meta = zip.CreateEntry("_agent_meta.txt");
            using var writer = new StreamWriter(meta.Open(), Encoding.UTF8);
            writer.WriteLine($"generated_at={DateTimeOffset.UtcNow:O}");
            writer.WriteLine($"agent_version={AgentConfig.AgentVersion}");
            writer.WriteLine($"logs_dir={AgentPaths.LogsDir}");
        }

        var bytes = File.ReadAllBytes(zipPath);
        if (bytes.LongLength > MaxLogArchiveBytes)
        {
            return Task.FromResult(new RemoteActionResult(
                Accepted: false,
                Completed: false,
                Action: Action,
                ErrorCode: "LOGS_TOO_LARGE",
                ErrorMessage: $"Log archive exceeds {MaxLogArchiveBytes} bytes ({bytes.Length})"));
        }

        var b64 = Convert.ToBase64String(bytes);
        return Task.FromResult(new RemoteActionResult(
            Accepted: true,
            Completed: true,
            Action: Action,
            Data: new Dictionary<string, object?>
            {
                ["filename"] = zipName,
                ["content_base64"] = b64,
                ["size_bytes"] = bytes.Length,
                ["content_type"] = "application/zip",
            }));
    }
}
