using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Sasist.Agent.Sdk;
using Sasist.Agent.Sdk.Devices;
using Sasist.Agent.Sdk.Remote;

namespace Sasist.Agent.Core.Transport;

/// <summary>Type-agnostic Edge Device sync client (/api/agent/*).</summary>
public sealed class EdgeDeviceApiClient
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly HttpClient _http;
    private readonly ILogger<EdgeDeviceApiClient> _logger;
    private AgentTransportConfig _config = new();

    public EdgeDeviceApiClient(HttpClient http, ILogger<EdgeDeviceApiClient> logger)
    {
        _http = http;
        _logger = logger;
    }

    public void ApplyConfig(AgentTransportConfig config)
    {
        _config = config;
        if (_http.BaseAddress is null)
        {
            _http.BaseAddress = new Uri(config.ServerUrl.TrimEnd('/') + "/api/agent/");
            _http.Timeout = TimeSpan.FromSeconds(60);
        }
    }

    public async Task<DeviceSyncResult> SyncDevicesAsync(DeviceSyncDelta delta, CancellationToken ct)
    {
        var body = new
        {
            client_cursor = delta.ClientCursor,
            heartbeat_at = delta.HeartbeatAt,
            upserts = delta.Upserts.Select(ToWire).ToList(),
            removes = delta.Removes,
            events = delta.Events?.Select(e => new
            {
                event_type = e.EventType,
                device_id = e.DeviceId,
                module_id = e.ModuleId,
                device_type = e.DeviceType,
                occurred_at = e.OccurredAt,
                payload = e.Payload,
            }),
        };

        using var req = CreateAuth(HttpMethod.Post, "devices/sync");
        req.Content = JsonContent.Create(body, options: JsonOptions);
        using var res = await _http.SendAsync(req, ct);
        var payload = await ReadJsonAsync<SyncResponseDto>(res, ct);
        if (payload is null)
            throw new ApiException("Invalid sync response");

        var cfgUpdates = payload.ConfigurationUpdates?
            .Select(u => new DeviceConfigurationUpdate(
                u.DeviceId,
                new DeviceConfiguration(
                    u.Values ?? new Dictionary<string, object?>(),
                    u.ConfigurationVersion ?? "0",
                    u.UpdatedAt)))
            .ToList();

        var actions = payload.PendingActions?
            .Select(a => new RemoteActionRequest(
                a.Action,
                a.ModuleId,
                a.DeviceId,
                a.CorrelationId,
                a.Parameters))
            .ToList();

        return new DeviceSyncResult(payload.ServerCursor ?? Guid.NewGuid().ToString("N"), cfgUpdates, actions);
    }

    public async Task ReportActionResultAsync(
        string correlationId,
        RemoteActionResult result,
        CancellationToken ct)
    {
        using var req = CreateAuth(HttpMethod.Post, "actions/result");
        req.Content = JsonContent.Create(new
        {
            correlation_id = correlationId,
            accepted = result.Accepted,
            completed = result.Completed,
            action = result.Action,
            error_code = result.ErrorCode,
            error_message = result.ErrorMessage,
            data = result.Data,
        }, options: JsonOptions);
        using var res = await _http.SendAsync(req, ct);
        if (!res.IsSuccessStatusCode)
            _logger.LogWarning("Action result report failed: HTTP {Code}", (int)res.StatusCode);
    }

    private static object ToWire(EdgeDevice d) => new
    {
        id = d.Id,
        type = d.Type,
        display_name = d.DisplayName,
        module_id = d.ModuleId,
        manufacturer = d.Manufacturer,
        model = d.Model,
        serial_number = d.SerialNumber,
        driver = d.Driver,
        firmware = d.Firmware,
        status = d.Status,
        capabilities = d.Capabilities?.Select(c => new
        {
            name = c.Name,
            version = c.Version,
            supported_operations = c.SupportedOperations,
            limits = c.Limits,
        }),
        last_seen = d.LastSeen,
        is_active = d.IsActive,
        is_default = d.IsDefault,
        metadata = d.Metadata,
        configuration = d.Configuration is null
            ? null
            : new
            {
                values = d.Configuration.Values,
                configuration_version = d.Configuration.ConfigurationVersion,
                updated_at = d.Configuration.UpdatedAt,
            },
        health = d.Health is null
            ? null
            : new
            {
                health_score = d.Health.HealthScore,
                warnings = d.Health.Warnings,
                errors = d.Health.Errors,
                recommended_actions = d.Health.RecommendedActions,
            },
        sync_revision = d.SyncRevision,
    };

    private HttpRequestMessage CreateAuth(HttpMethod method, string path)
    {
        var req = new HttpRequestMessage(method, path);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _config.Token);
        AgentRequestSecurity.ApplyReplayHeaders(req);
        return req;
    }

    private async Task<T?> ReadJsonAsync<T>(HttpResponseMessage res, CancellationToken ct)
    {
        if (!res.IsSuccessStatusCode)
        {
            var body = await res.Content.ReadAsStringAsync(ct);
            throw new ApiException($"HTTP {(int)res.StatusCode}: {body}", (int)res.StatusCode);
        }
        await using var stream = await res.Content.ReadAsStreamAsync(ct);
        return await JsonSerializer.DeserializeAsync<T>(stream, JsonOptions, ct);
    }

    private sealed class SyncResponseDto
    {
        public string? ServerCursor { get; set; }
        public List<ConfigUpdateDto>? ConfigurationUpdates { get; set; }
        public List<ActionDto>? PendingActions { get; set; }
    }

    private sealed class ConfigUpdateDto
    {
        public string DeviceId { get; set; } = "";
        public Dictionary<string, object?>? Values { get; set; }
        public string? ConfigurationVersion { get; set; }
        public DateTimeOffset? UpdatedAt { get; set; }
    }

    private sealed class ActionDto
    {
        public string Action { get; set; } = "";
        public string? ModuleId { get; set; }
        public string? DeviceId { get; set; }
        public string? CorrelationId { get; set; }
        public Dictionary<string, object?>? Parameters { get; set; }
    }
}
