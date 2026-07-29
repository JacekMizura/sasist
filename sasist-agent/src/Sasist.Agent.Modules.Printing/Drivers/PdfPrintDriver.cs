using System.Diagnostics;
using System.Drawing;
using System.Runtime.Versioning;
using PDFtoImage;
using SkiaSharp;

namespace Sasist.Agent.Modules.Printing.Drivers;

/// <summary>
/// Renders PDF via PDFium, then prints pages through the Windows GDI printer driver.
/// Must never use <see cref="WindowsRawSpooler"/> — PDF is not a printer language.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class PdfPrintDriver : IPrintDriver
{
    public string DriverId => "pdf";
    public PrintJobFormat Format => PrintJobFormat.Pdf;

    /// <summary>Render DPI for PDFium → bitmap before GDI print.</summary>
    public int RenderDpi { get; init; } = 200;

    public Task<PrintResult> PrintAsync(PrintJobRequest job)
    {
        var sw = Stopwatch.StartNew();
        var copies = Math.Max(1, job.Copies);
        try
        {
            job.CancellationToken.ThrowIfCancellationRequested();
            if (job.Payload.Length < 5 ||
                job.Payload[0] != (byte)'%' ||
                job.Payload[1] != (byte)'P' ||
                job.Payload[2] != (byte)'D' ||
                job.Payload[3] != (byte)'F')
            {
                return Task.FromResult(PrintResult.Failed(
                    DriverId, job.PrinterName, copies, sw.Elapsed,
                    "PDF_INVALID", "Payload is not a PDF document"));
            }

            using var pages = RenderPages(job.Payload, job.CancellationToken);
            if (pages.Count == 0)
            {
                return Task.FromResult(PrintResult.Failed(
                    DriverId, job.PrinterName, copies, sw.Elapsed,
                    "PDF_EMPTY", "PDF has no pages"));
            }

            for (var i = 0; i < copies; i++)
            {
                job.CancellationToken.ThrowIfCancellationRequested();
                WindowsGdiDocumentPrinter.PrintBitmaps(
                    job.PrinterName,
                    pages,
                    $"Sasist PDF job {job.JobId}",
                    job.CancellationToken);
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
            return Task.FromResult(PrintResult.Failed(
                DriverId, job.PrinterName, copies, sw.Elapsed, "PDF_PRINT_FAILED", ex.Message));
        }
    }

    private PageList RenderPages(byte[] pdfBytes, CancellationToken ct)
    {
        var list = new PageList();
        var options = new RenderOptions { Dpi = RenderDpi };
        foreach (var skBitmap in Conversion.ToImages(pdfBytes, options: options))
        {
            ct.ThrowIfCancellationRequested();
            using (skBitmap)
            {
                list.Add(SkiaToGdiBitmap(skBitmap));
            }
        }

        return list;
    }

    private static Bitmap SkiaToGdiBitmap(SKBitmap skBitmap)
    {
        using var encoded = skBitmap.Encode(SKEncodedImageFormat.Png, 100)
            ?? throw new InvalidOperationException("Failed to encode PDF page");
        using var ms = new MemoryStream(encoded.ToArray());
        // Clone so the Bitmap owns its pixel buffer after the stream is disposed.
        using var tmp = new Bitmap(ms);
        return new Bitmap(tmp);
    }

    private sealed class PageList : List<Image>, IDisposable
    {
        public void Dispose()
        {
            foreach (var page in this)
                page.Dispose();
            Clear();
        }
    }
}
