using System.Drawing.Printing;

namespace Sasist.Agent.Tray;

internal static class LocalPrinters
{
    public static IReadOnlyList<LocalPrinterInfo> List()
    {
        var list = new List<LocalPrinterInfo>();
        string? defaultName = null;
        try
        {
            defaultName = new PrinterSettings().PrinterName;
        }
        catch
        {
            // ignore
        }

        try
        {
            foreach (string name in PrinterSettings.InstalledPrinters)
            {
                var ok = false;
                try
                {
                    var ps = new PrinterSettings { PrinterName = name };
                    ok = ps.IsValid;
                }
                catch
                {
                    ok = false;
                }

                list.Add(new LocalPrinterInfo(
                    name,
                    ok ? "Gotowa" : "Niedostępna",
                    string.Equals(name, defaultName, StringComparison.OrdinalIgnoreCase)));
            }
        }
        catch
        {
            // ignore
        }

        return list;
    }

    public static void PrintTestPage(string printerName)
    {
        if (string.IsNullOrWhiteSpace(printerName))
            throw new InvalidOperationException("Wybierz drukarkę.");

        using var doc = new PrintDocument();
        doc.PrinterSettings.PrinterName = printerName;
        if (!doc.PrinterSettings.IsValid)
            throw new InvalidOperationException("Wybrana drukarka jest niedostępna.");

        doc.DocumentName = "Sasist — wydruk testowy";
        doc.PrintPage += (_, e) =>
        {
            var g = e.Graphics!;
            using var title = new Font("Segoe UI", 16f, FontStyle.Bold);
            using var body = new Font("Segoe UI", 11f);
            using var brush = new SolidBrush(Color.Black);
            var y = e.MarginBounds.Top;
            g.DrawString("Sasist Agent", title, brush, e.MarginBounds.Left, y);
            y += 36;
            g.DrawString("Wydruk testowy", body, brush, e.MarginBounds.Left, y);
            y += 28;
            g.DrawString($"Drukarka: {printerName}", body, brush, e.MarginBounds.Left, y);
            y += 24;
            g.DrawString($"Data: {DateTime.Now:dd.MM.yyyy HH:mm:ss}", body, brush, e.MarginBounds.Left, y);
            y += 24;
            g.DrawString($"Komputer: {Environment.MachineName}", body, brush, e.MarginBounds.Left, y);
            y += 36;
            g.DrawString("Jeśli widzisz tę stronę, drukowanie działa.", body, brush, e.MarginBounds.Left, y);
            e.HasMorePages = false;
        };
        doc.Print();
    }
}

internal readonly record struct LocalPrinterInfo(string Name, string Status, bool IsDefault);
