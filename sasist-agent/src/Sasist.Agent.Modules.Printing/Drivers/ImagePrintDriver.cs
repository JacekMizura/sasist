using System.Diagnostics;
using System.Drawing;
using System.Runtime.Versioning;

namespace Sasist.Agent.Modules.Printing.Drivers;

/// <summary>
/// Prints raster images (PNG/JPEG/BMP/…) via GDI PrintDocument — not RAW spooler.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class ImagePrintDriver : IPrintDriver
{
    public string DriverId => "image";
    public PrintJobFormat Format => PrintJobFormat.Image;

    public Task<PrintResult> PrintAsync(PrintJobRequest job)
    {
        var sw = Stopwatch.StartNew();
        var copies = Math.Max(1, job.Copies);
        try
        {
            job.CancellationToken.ThrowIfCancellationRequested();
            using var image = LoadImage(job.Payload);
            var pages = new List<Image> { image };
            for (var i = 0; i < copies; i++)
            {
                job.CancellationToken.ThrowIfCancellationRequested();
                WindowsGdiDocumentPrinter.PrintBitmaps(
                    job.PrinterName,
                    pages,
                    $"Sasist image job {job.JobId}",
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
                DriverId, job.PrinterName, copies, sw.Elapsed, "IMAGE_PRINT_FAILED", ex.Message));
        }
    }

    private static Image LoadImage(byte[] payload)
    {
        using var ms = new MemoryStream(payload);
        using var tmp = Image.FromStream(ms);
        return new Bitmap(tmp);
    }
}
