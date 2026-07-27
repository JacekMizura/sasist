using System.Diagnostics;
using System.Runtime.Versioning;
using System.Text;

namespace Sasist.Agent.Modules.Printing.Drivers;

[SupportedOSPlatform("windows")]
public sealed class PdfPrintDriver : IPrintDriver
{
    public string DriverId => "pdf";
    public PrintJobFormat Format => PrintJobFormat.Pdf;

    public async Task<PrintResult> PrintAsync(PrintJobRequest job)
    {
        var sw = Stopwatch.StartNew();
        var copies = Math.Max(1, job.Copies);
        try
        {
            job.CancellationToken.ThrowIfCancellationRequested();
            var temp = Path.Combine(Path.GetTempPath(), $"sasist-pdf-{job.JobId}-{Guid.NewGuid():N}.pdf");
            await File.WriteAllBytesAsync(temp, job.Payload, job.CancellationToken);
            try
            {
                for (var i = 0; i < copies; i++)
                {
                    job.CancellationToken.ThrowIfCancellationRequested();
                    PdfShellPrint.PrintTo(temp, job.PrinterName);
                }
            }
            finally
            {
                try { File.Delete(temp); } catch { /* ignore */ }
            }

            sw.Stop();
            return PrintResult.Printed(DriverId, job.PrinterName, copies, sw.Elapsed);
        }
        catch (OperationCanceledException)
        {
            sw.Stop();
            return PrintResult.Cancelled(DriverId, job.PrinterName, copies, sw.Elapsed);
        }
        catch (Exception ex)
        {
            sw.Stop();
            return PrintResult.Failed(DriverId, job.PrinterName, copies, sw.Elapsed, "PDF_PRINT_FAILED", ex.Message);
        }
    }
}

[SupportedOSPlatform("windows")]
internal static class PdfShellPrint
{
    public static void PrintTo(string pdfPath, string printerName)
    {
        // LocalSystem (Windows Service) has no per-user PDF file associations — try known printers first via spooler.
        var bytes = File.ReadAllBytes(pdfPath);
        try
        {
            WindowsRawSpooler.Send(
                printerName,
                bytes,
                $"Sasist PDF {Path.GetFileName(pdfPath)}",
                TimeSpan.FromSeconds(60));
            return;
        }
        catch (Exception spoolEx)
        {
            // Fall back to shell printto for interactive / user sessions.
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = pdfPath,
                    Verb = "printto",
                    Arguments = $"\"{printerName}\"",
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    UseShellExecute = true,
                };
                using var process = Process.Start(psi)
                    ?? throw new InvalidOperationException($"Failed to start printto for {printerName}");
                process.WaitForExit(30_000);
            }
            catch (Exception shellEx)
            {
                throw new InvalidOperationException(
                    $"PDF print failed (spooler: {spoolEx.Message}; shell: {shellEx.Message})",
                    shellEx);
            }
        }
    }
}

[SupportedOSPlatform("windows")]
public sealed class RawPrintDriver : IPrintDriver
{
    public string DriverId => "raw";
    public PrintJobFormat Format => PrintJobFormat.Raw;
    public TimeSpan DefaultTimeout { get; init; } = TimeSpan.FromSeconds(60);

    public Task<PrintResult> PrintAsync(PrintJobRequest job)
    {
        var sw = Stopwatch.StartNew();
        var copies = Math.Max(1, job.Copies);
        try
        {
            job.CancellationToken.ThrowIfCancellationRequested();
            var timeout = ResolveTimeout(job);
            for (var i = 0; i < copies; i++)
            {
                job.CancellationToken.ThrowIfCancellationRequested();
                WindowsRawSpooler.Send(
                    job.PrinterName,
                    job.Payload,
                    $"Sasist RAW job {job.JobId} copy {i + 1}",
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

[SupportedOSPlatform("windows")]
public sealed class ZplPrintDriver : IPrintDriver
{
    private readonly RawPrintDriver _raw = new();

    public string DriverId => "zpl";
    public PrintJobFormat Format => PrintJobFormat.Zpl;

    public async Task<PrintResult> PrintAsync(PrintJobRequest job)
    {
        // ZPL = RAW bytes to spooler — no PDF conversion, no render.
        var payload = NormalizeZplPayload(job.Payload);
        var rawJob = new PrintJobRequest
        {
            JobId = job.JobId,
            PrinterName = job.PrinterName,
            Format = PrintJobFormat.Raw,
            Payload = payload,
            Copies = job.Copies,
            ContentType = "application/vnd.zebra-zpl",
            Options = job.Options,
            CancellationToken = job.CancellationToken,
        };

        var result = await _raw.PrintAsync(rawJob);
        if (result.Status == PrintStatus.Printed)
        {
            return PrintResult.Printed(DriverId, result.PrinterName, result.Copies, result.Duration);
        }

        if (result.Status == PrintStatus.Cancelled)
            return PrintResult.Cancelled(DriverId, result.PrinterName, result.Copies, result.Duration);

        return PrintResult.Failed(
            DriverId,
            result.PrinterName,
            result.Copies,
            result.Duration,
            result.ErrorCode ?? "ZPL_PRINT_FAILED",
            result.ErrorMessage ?? "ZPL print failed");
    }

    private static byte[] NormalizeZplPayload(byte[] payload)
    {
        // Accept UTF-8 ZPL text; strip UTF-8 BOM if present.
        if (payload.Length >= 3 && payload[0] == 0xEF && payload[1] == 0xBB && payload[2] == 0xBF)
            return payload.AsSpan(3).ToArray();
        return payload;
    }
}

/// <summary>
/// Architecture placeholder — HTML→print pipeline lands in a later increment.
/// Contract is frozen; execution returns a clear failure until implemented.
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

public static class PrintJobFormatParser
{
    public static bool TryParse(string? token, out PrintJobFormat format)
    {
        format = PrintJobFormat.Pdf;
        if (string.IsNullOrWhiteSpace(token))
            return false;
        switch (token.Trim().ToLowerInvariant())
        {
            case "pdf":
                format = PrintJobFormat.Pdf;
                return true;
            case "zpl":
            case "raw_zpl":
                format = PrintJobFormat.Zpl;
                return true;
            case "raw":
                format = PrintJobFormat.Raw;
                return true;
            case "html":
                format = PrintJobFormat.Html;
                return true;
            default:
                return false;
        }
    }

    public static string ToToken(PrintJobFormat format) => format switch
    {
        PrintJobFormat.Pdf => "pdf",
        PrintJobFormat.Zpl => "zpl",
        PrintJobFormat.Raw => "raw",
        PrintJobFormat.Html => "html",
        _ => "pdf",
    };
}

[SupportedOSPlatform("windows")]
public sealed class PrintDriverResolver : IPrintDriverResolver
{
    private readonly Dictionary<PrintJobFormat, IPrintDriver> _drivers;

    public PrintDriverResolver(IEnumerable<IPrintDriver>? drivers = null)
    {
        var list = drivers?.ToList() ??
        [
            new PdfPrintDriver(),
            new RawPrintDriver(),
            new ZplPrintDriver(),
            new HtmlPrintDriver(),
        ];
        _drivers = list.ToDictionary(d => d.Format);
    }

    public IReadOnlyList<string> SupportedFormatTokens { get; } =
    [
        "pdf",
        "zpl",
        "raw",
        "html",
    ];

    public IPrintDriver Resolve(PrintJobFormat format)
    {
        if (_drivers.TryGetValue(format, out var driver))
            return driver;
        throw new NotSupportedException($"No print driver for format {format}");
    }
}
