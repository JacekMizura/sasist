using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Sasist.Agent.Core.Transport;
using Sasist.Agent.Sdk;
using Sasist.Agent.Sdk.Devices;
using Sasist.Agent.Sdk.Remote;

namespace Sasist.Agent.Host.Transport;

/// <summary>
/// Compatibility transport: device sync via /api/agent + jobs/register via /api/printing.
/// Lives in Host (composition root) — Core never references this type.
/// Single HeartbeatAsync: edge sync is source of truth; printing heartbeat is adapter-only.
/// </summary>
public sealed class CompatPrintingTransport : IAgentTransport
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly HttpClient _printingHttp;
    private readonly EdgeDeviceApiClient _edge;
    private readonly ILogger<CompatPrintingTransport> _logger;
    private AgentTransportConfig _config = new();

    public CompatPrintingTransport(
        IHttpClientFactory httpClientFactory,
        EdgeDeviceApiClient edge,
        ILogger<CompatPrintingTransport> logger)
    {
        _printingHttp = httpClientFactory.CreateClient("sasist-printing-compat");
        _edge = edge;
        _logger = logger;
    }

    public void ApplyConfig(AgentTransportConfig config)
    {
        _config = config;
        var baseUri = new Uri(config.ServerUrl.TrimEnd('/') + "/api/printing/");
        // HttpClient.BaseAddress cannot change after the first request.
        if (_printingHttp.BaseAddress is null)
        {
            _printingHttp.BaseAddress = baseUri;
            _printingHttp.Timeout = TimeSpan.FromSeconds(30);
        }
        _edge.ApplyConfig(config);
    }

    public async Task<AgentRegistrationResult> EnsureRegisteredAsync(
        AgentRegistrationRequest request,
        CancellationToken cancellationToken)
    {
        // Compat: map printer-typed devices to legacy register payload.
        var printers = request.Devices
            .Where(d => d.Type.Equals(DeviceKinds.Printer, StringComparison.OrdinalIgnoreCase))
            .Select(d => new
            {
                name = d.DisplayName,
                system_name = d.Id,
                printer_type = InferLegacyPrinterType(d),
                is_default = d.IsDefault,
            })
            .ToList();

        var body = new
        {
            machine_id = request.MachineId,
            name = request.Name,
            version = request.AgentVersion,
            printers,
        };

        using var req = new HttpRequestMessage(HttpMethod.Post, "agents/register");
        // Durable spa_/sasist_ key only — never a spent pairing code (cleared in AgentRuntime).
        var authKind = string.IsNullOrWhiteSpace(_config.ApiKey)
            ? "empty"
            : (_config.ApiKey.StartsWith("spa_", StringComparison.Ordinal) ||
               _config.ApiKey.StartsWith("sasist_", StringComparison.Ordinal)
                ? "api_key"
                : "other");
        _logger.LogInformation(
            "register_request machine_id={MachineId} auth_kind={AuthKind} api_key_len={Len}",
            request.MachineId,
            authKind,
            _config.ApiKey?.Length ?? 0);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _config.ApiKey);
        AgentRequestSecurity.ApplyReplayHeaders(req);
        req.Content = JsonContent.Create(body, options: JsonOptions);

        using var res = await _printingHttp.SendAsync(req, cancellationToken);
        _logger.LogInformation("register_response status={Status}", (int)res.StatusCode);
        var payload = await ReadJsonAsync<RegisterResponse>(res, cancellationToken);
        if (payload is null || string.IsNullOrWhiteSpace(payload.Token))
            throw new ApiException("Invalid register response");
        _logger.LogInformation("register_ok agent_id={AgentId} warehouse_id={WarehouseId}", payload.AgentId, payload.WarehouseId);
        return new AgentRegistrationResult(payload.AgentId, payload.Token, payload.MachineId, payload.WarehouseId);
    }

    public async Task<AgentHeartbeatResult> HeartbeatAsync(
        AgentHeartbeatRequest request,
        CancellationToken cancellationToken)
    {
        // Source of truth: edge device sync.
        var sync = await _edge.SyncDevicesAsync(request.DeviceDelta, cancellationToken);

        // Compat adapter: keep printing agent online for job queue (derived device count, not Core logic).
        try
        {
            var formats = request.Modules
                .SelectMany(m => m.Capabilities)
                .Where(c => c.StartsWith("print.", StringComparison.OrdinalIgnoreCase))
                .Select(c => c["print.".Length..])
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var body = new Dictionary<string, object?>
            {
                ["version"] = _config.AgentVersion,
                ["name"] = _config.ComputerName,
                ["printer_count"] = request.DeviceCount,
                ["protocol_version"] = _config.ProtocolVersion,
                ["device_count"] = request.DeviceCount,
            };
            if (request.LastError is not null)
                body["last_error"] = request.LastError;
            if (formats.Count > 0)
                body["supported_formats"] = formats;

            using var req = CreatePrintingAuth(HttpMethod.Post, "agents/heartbeat");
            req.Content = JsonContent.Create(body, options: JsonOptions);
            using var res = await _printingHttp.SendAsync(req, cancellationToken);
            await EnsureSuccessAsync(res, cancellationToken);
            _logger.LogInformation(
                "heartbeat_ok agent_id={AgentId} device_count={Count} status={Status}",
                _config.AgentId,
                request.DeviceCount,
                (int)res.StatusCode);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Compat printing heartbeat adapter failed (edge sync already succeeded)");
        }

        return new AgentHeartbeatResult(sync, DateTimeOffset.UtcNow);
    }

    public Task ReportActionResultAsync(
        string correlationId,
        RemoteActionResult result,
        CancellationToken cancellationToken) =>
        _edge.ReportActionResultAsync(correlationId, result, cancellationToken);

    public async Task<IReadOnlyList<PendingModuleJob>> PollJobsAsync(CancellationToken cancellationToken)
    {
        using var req = CreatePrintingAuth(HttpMethod.Get, "jobs/pending");
        using var res = await _printingHttp.SendAsync(req, cancellationToken);
        var payload = await ReadJsonAsync<PendingJobsResponse>(res, cancellationToken);
        var jobs = payload?.Jobs ?? [];
        return jobs.Select(j =>
        {
            var format = j.ResolveFormat();
            var commandPayload = j.ToCommandPayload();
            commandPayload["job_id"] = j.Id.ToString();
            return new PendingModuleJob(
                JobId: j.Id.ToString(),
                TargetModuleId: null,
                RequiredCapability: $"print.{format}",
                CommandType: CommandTypes.JobExecute,
                Payload: commandPayload);
        }).ToList();
    }

    public Task ReportJobProcessingAsync(string jobId, CancellationToken cancellationToken) =>
        PostEmptyAsync($"jobs/{ParseJobId(jobId)}/processing", cancellationToken);

    public Task ReportJobCompletedAsync(string jobId, CancellationToken cancellationToken) =>
        PostEmptyAsync($"jobs/{ParseJobId(jobId)}/complete", cancellationToken);

    public async Task ReportJobFailedAsync(string jobId, string errorMessage, CancellationToken cancellationToken)
    {
        using var req = CreatePrintingAuth(HttpMethod.Post, $"jobs/{ParseJobId(jobId)}/failed");
        req.Content = JsonContent.Create(new { error_message = errorMessage }, options: JsonOptions);
        using var res = await _printingHttp.SendAsync(req, cancellationToken);
        await EnsureSuccessAsync(res, cancellationToken);
    }

    public async Task<byte[]> DownloadAsync(string urlOrPath, CancellationToken cancellationToken)
    {
        var url = urlOrPath.StartsWith("http", StringComparison.OrdinalIgnoreCase)
            ? urlOrPath
            : new Uri(new Uri(_config.ServerUrl.TrimEnd('/') + "/"), urlOrPath.TrimStart('/')).ToString();

        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        if (!string.IsNullOrWhiteSpace(_config.Token) &&
            url.StartsWith(_config.ServerUrl, StringComparison.OrdinalIgnoreCase))
        {
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _config.Token);
            AgentRequestSecurity.ApplyReplayHeaders(req);
        }

        using var res = await _printingHttp.SendAsync(req, cancellationToken);
        if (!res.IsSuccessStatusCode)
            throw new ApiException($"Download HTTP {(int)res.StatusCode}", (int)res.StatusCode);
        return await res.Content.ReadAsByteArrayAsync(cancellationToken);
    }

    private static string InferLegacyPrinterType(EdgeDevice d)
    {
        var ops = d.Capabilities?.SelectMany(c => c.SupportedOperations) ?? Array.Empty<string>();
        if (ops.Any(c => c.Contains("zpl", StringComparison.OrdinalIgnoreCase) || c.Contains("label", StringComparison.OrdinalIgnoreCase)))
            return "label";
        if (ops.Any(c => c.Contains("receipt", StringComparison.OrdinalIgnoreCase) || c.Contains("escpos", StringComparison.OrdinalIgnoreCase)))
            return "receipt";
        if (ops.Any(c => c.Contains("a4", StringComparison.OrdinalIgnoreCase)))
            return "a4";
        return "other";
    }

    private static int ParseJobId(string jobId) =>
        int.TryParse(jobId, out var id) ? id : throw new ApiException($"Invalid job id '{jobId}'");

    private async Task PostEmptyAsync(string path, CancellationToken ct)
    {
        using var req = CreatePrintingAuth(HttpMethod.Post, path);
        req.Content = JsonContent.Create(new { }, options: JsonOptions);
        using var res = await _printingHttp.SendAsync(req, ct);
        await EnsureSuccessAsync(res, ct);
    }

    private HttpRequestMessage CreatePrintingAuth(HttpMethod method, string path)
    {
        var req = new HttpRequestMessage(method, path);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _config.Token);
        AgentRequestSecurity.ApplyReplayHeaders(req);
        return req;
    }

    private static async Task EnsureSuccessAsync(HttpResponseMessage res, CancellationToken ct)
    {
        if (res.IsSuccessStatusCode)
            return;
        var body = await res.Content.ReadAsStringAsync(ct);
        throw new ApiException($"HTTP {(int)res.StatusCode}: {body}", (int)res.StatusCode);
    }

    private async Task<T?> ReadJsonAsync<T>(HttpResponseMessage res, CancellationToken ct)
    {
        await EnsureSuccessAsync(res, ct);
        await using var stream = await res.Content.ReadAsStreamAsync(ct);
        return await JsonSerializer.DeserializeAsync<T>(stream, JsonOptions, ct);
    }

    private sealed class RegisterResponse
    {
        public int AgentId { get; set; }
        public string Token { get; set; } = "";
        public string MachineId { get; set; } = "";
        public int? WarehouseId { get; set; }
    }

    private sealed class PendingJobsResponse
    {
        public List<PendingJobDto> Jobs { get; set; } = new();
    }

    private sealed class PendingJobDto
    {
        public int Id { get; set; }
        public string SystemName { get; set; } = "";
        public string DocumentType { get; set; } = "";
        public string? JobType { get; set; }
        public string? Format { get; set; }
        public Dictionary<string, JsonElement>? Payload { get; set; }

        public string ResolveFormat()
        {
            var fromField = Format ?? GetString("format");
            if (!string.IsNullOrWhiteSpace(fromField))
                return fromField!;
            var jt = (JobType ?? "").ToLowerInvariant();
            if (jt is "raw_zpl" or "label")
                return PayloadHas("zpl") ? "zpl" : "pdf";
            if (jt == "receipt" || PayloadHas("raw"))
                return PayloadHas("zpl") ? "zpl" : "raw";
            if (PayloadHas("html"))
                return "html";
            return "pdf";
        }

        public Dictionary<string, object?> ToCommandPayload()
        {
            var dict = new Dictionary<string, object?>
            {
                ["job_id"] = Id,
                ["device_local_id"] = SystemName,
                ["format"] = ResolveFormat(),
                ["copies"] = Copies,
                ["document_type"] = DocumentType,
                ["job_type"] = JobType,
            };
            var uri = GetString("pdf_url") ?? GetString("payload_uri") ?? GetString("content_uri");
            if (!string.IsNullOrWhiteSpace(uri))
                dict["payload_uri"] = uri;
            foreach (var key in new[] { "zpl", "raw", "html", "content", "content_inline", "content_base64", "pdf_url" })
            {
                var v = GetString(key);
                if (!string.IsNullOrEmpty(v))
                    dict[key] = v;
            }
            return dict;
        }

        private int Copies
        {
            get
            {
                if (Payload is null) return 1;
                if (Payload.TryGetValue("copies", out var el) && el.TryGetInt32(out var n))
                    return Math.Max(1, n);
                return 1;
            }
        }

        private bool PayloadHas(string key) =>
            Payload is not null &&
            Payload.TryGetValue(key, out var el) &&
            el.ValueKind is JsonValueKind.String or JsonValueKind.Object or JsonValueKind.Array;

        private string? GetString(string key)
        {
            if (Payload is null || !Payload.TryGetValue(key, out var el))
                return null;
            return el.ValueKind == JsonValueKind.String ? el.GetString() : null;
        }
    }
}

/// <summary>Planned: native /api/agent protocol without printing compat.</summary>
public sealed class FutureAgentTransport : IAgentTransport
{
    public void ApplyConfig(AgentTransportConfig config) { }

    public Task<AgentRegistrationResult> EnsureRegisteredAsync(AgentRegistrationRequest request, CancellationToken cancellationToken) =>
        throw new NotSupportedException("FutureAgentTransport is Planned — use CompatPrintingTransport for RC");

    public Task<AgentHeartbeatResult> HeartbeatAsync(AgentHeartbeatRequest request, CancellationToken cancellationToken) =>
        throw new NotSupportedException("FutureAgentTransport is Planned");

    public Task ReportActionResultAsync(string correlationId, RemoteActionResult result, CancellationToken cancellationToken) =>
        throw new NotSupportedException("FutureAgentTransport is Planned");

    public Task<IReadOnlyList<PendingModuleJob>> PollJobsAsync(CancellationToken cancellationToken) =>
        throw new NotSupportedException("FutureAgentTransport is Planned");

    public Task ReportJobProcessingAsync(string jobId, CancellationToken cancellationToken) =>
        throw new NotSupportedException("FutureAgentTransport is Planned");

    public Task ReportJobCompletedAsync(string jobId, CancellationToken cancellationToken) =>
        throw new NotSupportedException("FutureAgentTransport is Planned");

    public Task ReportJobFailedAsync(string jobId, string errorMessage, CancellationToken cancellationToken) =>
        throw new NotSupportedException("FutureAgentTransport is Planned");

    public Task<byte[]> DownloadAsync(string urlOrPath, CancellationToken cancellationToken) =>
        throw new NotSupportedException("FutureAgentTransport is Planned");
}

/// <summary>Planned: WebSocket primary transport.</summary>
public sealed class WebSocketTransport : IAgentTransport
{
    public void ApplyConfig(AgentTransportConfig config) { }

    public Task<AgentRegistrationResult> EnsureRegisteredAsync(AgentRegistrationRequest request, CancellationToken cancellationToken) =>
        throw new NotSupportedException("WebSocketTransport is Planned");

    public Task<AgentHeartbeatResult> HeartbeatAsync(AgentHeartbeatRequest request, CancellationToken cancellationToken) =>
        throw new NotSupportedException("WebSocketTransport is Planned");

    public Task ReportActionResultAsync(string correlationId, RemoteActionResult result, CancellationToken cancellationToken) =>
        throw new NotSupportedException("WebSocketTransport is Planned");

    public Task<IReadOnlyList<PendingModuleJob>> PollJobsAsync(CancellationToken cancellationToken) =>
        throw new NotSupportedException("WebSocketTransport is Planned");

    public Task ReportJobProcessingAsync(string jobId, CancellationToken cancellationToken) =>
        throw new NotSupportedException("WebSocketTransport is Planned");

    public Task ReportJobCompletedAsync(string jobId, CancellationToken cancellationToken) =>
        throw new NotSupportedException("WebSocketTransport is Planned");

    public Task ReportJobFailedAsync(string jobId, string errorMessage, CancellationToken cancellationToken) =>
        throw new NotSupportedException("WebSocketTransport is Planned");

    public Task<byte[]> DownloadAsync(string urlOrPath, CancellationToken cancellationToken) =>
        throw new NotSupportedException("WebSocketTransport is Planned");
}
