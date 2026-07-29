namespace Sasist.Agent.Modules.Printing.Drivers;

/// <summary>
/// Resolves <see cref="IPrintDriver"/> by job format.
/// PDF/image/HTML → renderers; ZPL/EPL/ESC-POS/PCL/PostScript/raw → RAW spooler.
/// </summary>
public sealed class DriverFactory : IPrintDriverResolver
{
    private readonly Dictionary<PrintJobFormat, IPrintDriver> _drivers;

    public DriverFactory(IEnumerable<IPrintDriver>? drivers = null)
    {
        if (drivers is not null)
        {
            _drivers = drivers.ToDictionary(d => d.Format);
            return;
        }

        _drivers = new Dictionary<PrintJobFormat, IPrintDriver>
        {
            [PrintJobFormat.Pdf] = new PdfPrintDriver(),
            [PrintJobFormat.Zpl] = new RawPrintDriver(PrintJobFormat.Zpl, "zpl"),
            [PrintJobFormat.Epl] = new RawPrintDriver(PrintJobFormat.Epl, "epl"),
            [PrintJobFormat.EscPos] = new RawPrintDriver(PrintJobFormat.EscPos, "escpos"),
            [PrintJobFormat.Pcl] = new RawPrintDriver(PrintJobFormat.Pcl, "pcl"),
            [PrintJobFormat.PostScript] = new RawPrintDriver(PrintJobFormat.PostScript, "postscript"),
            [PrintJobFormat.Raw] = new RawPrintDriver(PrintJobFormat.Raw, "raw"),
            [PrintJobFormat.Html] = new HtmlPrintDriver(),
            [PrintJobFormat.Image] = new ImagePrintDriver(),
        };
    }

    public IReadOnlyList<string> SupportedFormatTokens { get; } =
    [
        "pdf",
        "zpl",
        "epl",
        "escpos",
        "pcl",
        "postscript",
        "raw",
        "html",
        "image",
    ];

    public IPrintDriver Resolve(PrintJobFormat format)
    {
        if (_drivers.TryGetValue(format, out var driver))
            return driver;
        throw new NotSupportedException($"No print driver for format {format}");
    }
}

/// <summary>Backward-compatible alias for <see cref="DriverFactory"/>.</summary>
public sealed class PrintDriverResolver : IPrintDriverResolver
{
    private readonly DriverFactory _inner;

    public PrintDriverResolver(IEnumerable<IPrintDriver>? drivers = null) =>
        _inner = new DriverFactory(drivers);

    public IReadOnlyList<string> SupportedFormatTokens => _inner.SupportedFormatTokens;

    public IPrintDriver Resolve(PrintJobFormat format) => _inner.Resolve(format);
}
