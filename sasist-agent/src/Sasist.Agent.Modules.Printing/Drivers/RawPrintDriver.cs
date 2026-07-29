using System.Diagnostics;
using System.Runtime.Versioning;

namespace Sasist.Agent.Modules.Printing.Drivers;

/// <summary>
/// Sends native printer-language bytes (ZPL/EPL/ESC-POS/PCL/PostScript/raw) via Win32 RAW spooler.
/// Must not be used for PDF or images.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class RawPrintDriver : IPrintDriver
{
    public string DriverId { get; }
    public PrintJobFormat Format { get; }
    public TimeSpan DefaultTimeout { get; init; } = TimeSpan.FromSeconds(60);

    public RawPrintDriver(PrintJobFormat format = PrintJobFormat.Raw, string? driverId = null)
    {
        Format = format;
        DriverId = driverId ?? PrintJobFormatParser.ToToken(format);
    }

    public Task<PrintResult> PrintAsync(PrintJobRequest job)
    {
        var sw = Stopwatch.StartNew();
        var copies = Math.Max(1, job.Copies);
        try
        {
            job.CancellationToken.ThrowIfCancellationRequested();
            var timeout = ResolveTimeout(job);
            var payload = NormalizePayload(job.Payload);
            for (var i = 0; i < copies; i++)
            {
                job.CancellationToken.ThrowIfCancellationRequested();
                WindowsRawSpooler.Send(
                    job.PrinterName,
                    payload,
                    $"Sasist {DriverId} job {job.JobId} copy {i + 1}",
                    timeout);
            }

            sw.Stop();
            return Task.FromResult(PrintResult.Printed(DriverId, job.PrinterName, copies, sw.Elapsed));
        }
        catch (OperationCanceledException)
        {
            sw.Stop();
            return Task.FromResult(PrintResult.Cancelled(DriverId, job.PrinterName, copies, sw.Elapsed));
        }
        catch (Exception ex)
        {
            sw.Stop();
            return Task.FromResult(
                PrintResult.Failed(DriverId, job.PrinterName, copies, sw.Elapsed, "RAW_PRINT_FAILED", ex.Message));
        }
    }

    private static byte[] NormalizePayload(byte[] payload)
    {
        // Strip UTF-8 BOM when present (common for text ZPL/EPL pasted into jobs).
        if (payload.Length >= 3 && payload[0] == 0xEF && payload[1] == 0xBB && payload[2] == 0xBF)
            return payload.AsSpan(3).ToArray();
        return payload;
    }

    private TimeSpan ResolveTimeout(PrintJobRequest job)
    {
        if (job.Options is not null &&
            job.Options.TryGetValue("timeout_sec", out var v) &&
            v is not null &&
            int.TryParse(v.ToString(), out var sec) &&
            sec > 0)
        {
            return TimeSpan.FromSeconds(Math.Min(sec, 300));
        }

        return DefaultTimeout;
    }
}

/// <summary>
/// Architecture placeholder — HTML→print pipeline lands in a later increment.
/// </summary>
public sealed class HtmlPrintDriver : IPrintDriver
{
    public string DriverId => "html";
    public PrintJobFormat Format => PrintJobFormat.Html;

    public Task<PrintResult> PrintAsync(PrintJobRequest job)
    {
        var sw = Stopwatch.StartNew();
        sw.Stop();
        return Task.FromResult(PrintResult.Failed(
            DriverId,
            job.PrinterName,
            Math.Max(1, job.Copies),
            sw.Elapsed,
            "HTML_NOT_IMPLEMENTED",
            "HtmlPrintDriver is scaffolded; HTML rendering/print pipeline is not implemented yet."));
    }
}
