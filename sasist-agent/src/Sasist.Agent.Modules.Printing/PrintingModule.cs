using System.Collections.Concurrent;
using System.Runtime.Versioning;
using System.Text;
using System.Text.Json;
using Sasist.Agent.Modules.Printing.Drivers;
using Sasist.Agent.Sdk;
using Sasist.Agent.Sdk.Devices;

namespace Sasist.Agent.Modules.Printing;

[SupportedOSPlatform("windows")]
public sealed class PrintingModule : IAgentModule
{
    private IModuleContext? _ctx;
    private readonly IPrintDriverResolver _drivers;
    private readonly ConcurrentDictionary<int, byte> _cancelled = new();
    private WindowsPrinterDeviceProvider? _provider;
    private string _state = ModuleStates.Stopped;
    private string? _lastError;

    public PrintingModule() : this(null)
    {
    }

    public PrintingModule(IPrintDriverResolver? drivers)
    {
        _drivers = drivers ?? new PrintDriverResolver();
    }

    public string ModuleId => "printing";
    public string ModuleVersion => "1.3.0";

    public IReadOnlyList<string> Capabilities =>
        _drivers.SupportedFormatTokens
            .Select(f => $"print.{f}")
            .Concat(
            [
                "media.a4",
                "media.label",
                "media.receipt",
                "conn.usb",
                "conn.network",
            ])
            .ToList();

    public Task InitializeAsync(IModuleContext context, CancellationToken cancellationToken)
    {
        _ctx = context;
        _state = ModuleStates.Stopped;
        _provider = new WindowsPrinterDeviceProvider(_drivers, () => context.Clock.UtcNow);
        context.DeviceManager.RegisterProvider(_provider);
        // React to DeviceManager events — no parallel printer list.
        context.DeviceEvents.Subscribe(null, OnDeviceEventAsync);
        context.Logger.Info(
            $"Printing module initialized; drivers=[{string.Join(",", _drivers.SupportedFormatTokens)}]; DeviceManager + EventBus");
        return Task.CompletedTask;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await RefreshDevicesAsync(cancellationToken);
        _state = ModuleStates.Running;
        var count = _ctx?.DeviceManager.List(type: DeviceKinds.Printer, moduleId: ModuleId).Count ?? 0;
        _ctx?.Logger.Info($"Printing module started ({count} printers via DeviceManager)");
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _state = ModuleStates.Stopped;
        return Task.CompletedTask;
    }

    public async Task<ModuleHeartbeatSlice> HeartbeatAsync(CancellationToken cancellationToken)
    {
        // Discovery still runs through DeviceManager; EventBus carries change notifications.
        await RefreshDevicesAsync(cancellationToken);
        var edge = _ctx?.DeviceManager.List(moduleId: ModuleId) ?? Array.Empty<EdgeDevice>();
        var devices = edge.Select(DeviceSnapshot.FromEdgeDevice).ToList();
        return new ModuleHeartbeatSlice(
            ModuleId,
            _state,
            devices,
            Metrics: new Dictionary<string, object?>
            {
                ["device_count"] = devices.Count,
                ["supported_formats"] = _drivers.SupportedFormatTokens.ToArray(),
            },
            LastError: _lastError);
    }

    private Task OnDeviceEventAsync(DeviceEvent evt)
    {
        if (!string.Equals(evt.ModuleId, ModuleId, StringComparison.OrdinalIgnoreCase))
            return Task.CompletedTask;
        _ctx?.Logger.Debug($"printing.event {evt.EventType} device={evt.DeviceId}");
        return Task.CompletedTask;
    }

    public async Task<ModuleCommandResult> HandleCommandAsync(
        ModuleCommand command,
        CancellationToken cancellationToken)
    {
        if (_ctx is null)
            return new ModuleCommandResult(false, "NOT_INITIALIZED", "Module context missing");

        return command.CommandType switch
        {
            CommandTypes.DevicesRefresh => await RefreshCommandAsync(cancellationToken),
            CommandTypes.JobCancel => CancelCommand(command),
            CommandTypes.JobExecute => await ExecuteJobAsync(command, cancellationToken),
            _ => new ModuleCommandResult(false, "UNSUPPORTED_COMMAND", command.CommandType),
        };
    }

    public Task<IReadOnlyList<DiagnosticCheckResult>> CollectDiagnosticsAsync(
        DiagnosticsRequest request,
        CancellationToken cancellationToken)
    {
        var printers = _ctx?.DeviceManager.List(type: DeviceKinds.Printer, moduleId: ModuleId)
                       ?? Array.Empty<EdgeDevice>();
        var checks = new List<DiagnosticCheckResult>
        {
            new(
                "printing.devices",
                "Wykryte drukarki",
                printers.Count == 0 ? DiagnosticSeverities.Warning : DiagnosticSeverities.Info,
                printers.Count == 0 ? DiagnosticStatuses.Fail : DiagnosticStatuses.Pass,
                $"{printers.Count} urządzeń (DeviceManager)",
                0),
            new(
                "printing.spooler",
                "Spooler Windows",
                DiagnosticSeverities.Error,
                DiagnosticStatuses.Pass,
                "InstalledPrinters via IDeviceProvider",
                0),
            new(
                "printing.drivers",
                "Sterowniki wydruku",
                DiagnosticSeverities.Info,
                DiagnosticStatuses.Pass,
                string.Join(",", _drivers.SupportedFormatTokens),
                0),
            new(
                "printing.test_page",
                "Test wydruku",
                DiagnosticSeverities.Error,
                DiagnosticStatuses.Skip,
                request.RunDestructiveTests
                    ? "Test page via ERP queue not invoked in local-only mode"
                    : "Pominięto (brak zgody na test destrukcyjny)",
                0),
        };
        return Task.FromResult<IReadOnlyList<DiagnosticCheckResult>>(checks);
    }

    public ValueTask DisposeAsync()
    {
        _state = ModuleStates.Stopped;
        return ValueTask.CompletedTask;
    }

    private async Task<ModuleCommandResult> RefreshCommandAsync(CancellationToken cancellationToken)
    {
        await RefreshDevicesAsync(cancellationToken);
        return new ModuleCommandResult(true, Data: new Dictionary<string, object?>
        {
            ["count"] = _ctx!.DeviceManager.List(moduleId: ModuleId).Count,
        });
    }

    private ModuleCommandResult CancelCommand(ModuleCommand command)
    {
        if (!TryGetInt(command.Payload, "job_id", out var jobId))
            return new ModuleCommandResult(false, "INVALID_PAYLOAD", "job_id required");
        _cancelled[jobId] = 1;
        return new ModuleCommandResult(true);
    }

    private async Task<ModuleCommandResult> ExecuteJobAsync(ModuleCommand command, CancellationToken ct)
    {
        if (!TryGetInt(command.Payload, "job_id", out var jobId))
            return new ModuleCommandResult(false, "INVALID_PAYLOAD", "job_id required");

        var deviceLocalId = GetString(command.Payload, "device_local_id");
        var formatToken = GetString(command.Payload, "format") ?? "pdf";
        var copies = TryGetInt(command.Payload, "copies", out var c) ? Math.Max(1, c) : 1;

        if (string.IsNullOrWhiteSpace(deviceLocalId))
            return new ModuleCommandResult(false, "INVALID_PAYLOAD", "device_local_id required");

        if (!PrintJobFormatParser.TryParse(formatToken, out var format))
        {
            await FailAsync(jobId, $"Unsupported format '{formatToken}'", ct);
            return new ModuleCommandResult(false, "UNSUPPORTED_FORMAT", formatToken);
        }

        if (_cancelled.ContainsKey(jobId))
        {
            await FailAsync(jobId, "cancelled", ct);
            return new ModuleCommandResult(false, "CANCELLED", "Job cancelled");
        }

        byte[] payloadBytes;
        try
        {
            payloadBytes = await LoadPayloadBytesAsync(command.Payload, format, ct);
        }
        catch (Exception ex)
        {
            await FailAsync(jobId, ex.Message, ct);
            return new ModuleCommandResult(false, "PAYLOAD_LOAD_FAILED", ex.Message);
        }

        IPrintDriver driver;
        try
        {
            driver = _drivers.Resolve(format);
        }
        catch (Exception ex)
        {
            await FailAsync(jobId, ex.Message, ct);
            return new ModuleCommandResult(false, "NO_DRIVER", ex.Message);
        }

        _ctx!.Logger.Info(
            $"print.start job={jobId} driver={driver.DriverId} printer={deviceLocalId} copies={copies} format={formatToken} bytes={payloadBytes.Length}");

        try
        {
            await _ctx.Jobs.ReportProcessingAsync(jobId.ToString(), ct);
        }
        catch (Exception ex)
        {
            _ctx.Logger.Warning($"print.claim_failed job={jobId}: {ex.Message}");
        }

        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct);
        if (_cancelled.ContainsKey(jobId))
            linked.Cancel();

        var request = new PrintJobRequest
        {
            JobId = jobId,
            PrinterName = deviceLocalId!,
            Format = format,
            Payload = payloadBytes,
            Copies = copies,
            Options = command.Payload,
            CancellationToken = linked.Token,
        };

        PrintResult result;
        try
        {
            result = await driver.PrintAsync(request);
        }
        catch (Exception ex)
        {
            result = PrintResult.Failed(
                driver.DriverId,
                deviceLocalId!,
                copies,
                TimeSpan.Zero,
                "DRIVER_EXCEPTION",
                ex.Message);
            _ctx.Logger.Error($"print.exception job={jobId} driver={driver.DriverId}", ex);
        }

        LogResult(jobId, result);

        switch (result.Status)
        {
            case PrintStatus.Printed:
                await _ctx.Jobs.ReportCompletedAsync(jobId.ToString(), ct);
                _lastError = null;
                _state = ModuleStates.Running;
                return new ModuleCommandResult(true, Data: ResultData(result));
            case PrintStatus.Cancelled:
                await FailAsync(jobId, result.ErrorMessage ?? "cancelled", ct);
                return new ModuleCommandResult(false, "CANCELLED", result.ErrorMessage);
            default:
                _lastError = result.ErrorMessage;
                _state = ModuleStates.Degraded;
                await FailAsync(jobId, FormatError(result), ct);
                return new ModuleCommandResult(false, result.ErrorCode, result.ErrorMessage, ResultData(result));
        }
    }

    private async Task<byte[]> LoadPayloadBytesAsync(
        IReadOnlyDictionary<string, object?> payload,
        PrintJobFormat format,
        CancellationToken ct)
    {
        if (payload.TryGetValue("content_base64", out var b64Obj) && b64Obj is not null)
        {
            var b64 = b64Obj.ToString();
            if (!string.IsNullOrWhiteSpace(b64))
                return Convert.FromBase64String(b64);
        }

        if (payload.TryGetValue("content_inline", out var inlineObj) && inlineObj is not null)
        {
            var text = inlineObj.ToString() ?? "";
            return Encoding.UTF8.GetBytes(text);
        }

        // ZPL/RAW often arrive as `zpl` / `raw` string fields
        foreach (var key in new[] { "zpl", "raw", "html", "content" })
        {
            if (payload.TryGetValue(key, out var field) && field is not null)
            {
                var text = field.ToString();
                if (!string.IsNullOrEmpty(text))
                    return Encoding.UTF8.GetBytes(text);
            }
        }

        var uri = GetString(payload, "payload_uri")
                  ?? GetString(payload, "pdf_url")
                  ?? GetString(payload, "content_uri");
        if (!string.IsNullOrWhiteSpace(uri))
            return await _ctx!.Jobs.DownloadAsync(uri, ct);

        throw new InvalidOperationException(
            $"No payload for format {PrintJobFormatParser.ToToken(format)} (need content_inline/content_base64/zpl/raw/payload_uri)");
    }

    private async Task FailAsync(int jobId, string message, CancellationToken ct)
    {
        try
        {
            await _ctx!.Jobs.ReportFailedAsync(jobId.ToString(), message, ct);
        }
        catch (Exception ex)
        {
            _ctx?.Logger.Warning($"print.fail_report_error job={jobId}: {ex.Message}");
        }
    }

    private void LogResult(int jobId, PrintResult result)
    {
        _ctx?.Logger.Info(
            $"print.result job={jobId} driver={result.DriverId} printer={result.PrinterName} " +
            $"copies={result.Copies} status={result.Status} duration_ms={(int)result.Duration.TotalMilliseconds} " +
            $"errorCode={result.ErrorCode ?? "-"} errorMessage={result.ErrorMessage ?? "-"}");
    }

    private static string FormatError(PrintResult result) =>
        string.IsNullOrWhiteSpace(result.ErrorCode)
            ? (result.ErrorMessage ?? "print failed")
            : $"{result.ErrorCode}: {result.ErrorMessage}";

    private static IReadOnlyDictionary<string, object?> ResultData(PrintResult result) =>
        new Dictionary<string, object?>
        {
            ["status"] = result.Status.ToString().ToLowerInvariant(),
            ["error_code"] = result.ErrorCode,
            ["error_message"] = result.ErrorMessage,
            ["duration_ms"] = (int)result.Duration.TotalMilliseconds,
            ["copies"] = result.Copies,
            ["printer_name"] = result.PrinterName,
            ["driver"] = result.DriverId,
        };

    private async Task RefreshDevicesAsync(CancellationToken cancellationToken)
    {
        if (_ctx is null)
            return;
        await _ctx.DeviceManager.RefreshAsync(ModuleId, cancellationToken);
    }

    private static string? GetString(IReadOnlyDictionary<string, object?> payload, string key) =>
        payload.TryGetValue(key, out var v) ? v?.ToString() : null;

    private static bool TryGetInt(IReadOnlyDictionary<string, object?> payload, string key, out int value)
    {
        value = 0;
        if (!payload.TryGetValue(key, out var v) || v is null)
            return false;
        return v switch
        {
            int i => (value = i) == i,
            long l => (value = (int)l) == (int)l,
            JsonElement { ValueKind: JsonValueKind.Number } el => el.TryGetInt32(out value),
            _ => int.TryParse(v.ToString(), out value),
        };
    }
}
