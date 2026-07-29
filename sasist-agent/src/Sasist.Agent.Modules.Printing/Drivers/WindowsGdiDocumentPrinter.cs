using System.Drawing;
using System.Drawing.Printing;
using System.Runtime.Versioning;

namespace Sasist.Agent.Modules.Printing.Drivers;

/// <summary>
/// Prints already-rendered bitmaps through the Windows printer driver (GDI / PrintDocument).
/// Used by PDF and image drivers — never by RAW/ZPL.
/// </summary>
[SupportedOSPlatform("windows")]
internal static class WindowsGdiDocumentPrinter
{
    public static void PrintBitmaps(
        string printerName,
        IReadOnlyList<Image> pages,
        string documentName,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(printerName))
            throw new ArgumentException("Printer name required", nameof(printerName));
        if (pages.Count == 0)
            throw new ArgumentException("No pages to print", nameof(pages));

        StaRunner.Run(() =>
        {
            cancellationToken.ThrowIfCancellationRequested();
            using var doc = new PrintDocument();
            doc.PrinterSettings.PrinterName = printerName;
            if (!doc.PrinterSettings.IsValid)
                throw new InvalidOperationException($"Printer unavailable: {printerName}");

            doc.DocumentName = string.IsNullOrWhiteSpace(documentName) ? "Sasist" : documentName;
            doc.OriginAtMargins = false;
            doc.DefaultPageSettings.Margins = new Margins(0, 0, 0, 0);

            var index = 0;
            doc.PrintPage += (_, e) =>
            {
                cancellationToken.ThrowIfCancellationRequested();
                var page = pages[index];
                var bounds = e.PageBounds;
                var scale = Math.Min(
                    (float)bounds.Width / page.Width,
                    (float)bounds.Height / page.Height);
                var w = page.Width * scale;
                var h = page.Height * scale;
                var x = bounds.Left + (bounds.Width - w) / 2f;
                var y = bounds.Top + (bounds.Height - h) / 2f;
                e.Graphics!.DrawImage(page, x, y, w, h);
                index++;
                e.HasMorePages = index < pages.Count;
            };

            doc.Print();
        });
    }
}

internal static class StaRunner
{
    public static void Run(Action action)
    {
        if (Thread.CurrentThread.GetApartmentState() == ApartmentState.STA)
        {
            action();
            return;
        }

        Exception? error = null;
        var thread = new Thread(() =>
        {
            try
            {
                action();
            }
            catch (Exception ex)
            {
                error = ex;
            }
        })
        {
            IsBackground = true,
            Name = "Sasist-GdiPrint-STA",
        };
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();
        if (error is not null)
            throw error;
    }
}
