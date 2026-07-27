using System.Drawing.Printing;
using System.Runtime.Versioning;
using Sasist.Agent.Modules.Printing.Drivers;
using Sasist.Agent.Sdk;
using Sasist.Agent.Sdk.Devices;

namespace Sasist.Agent.Modules.Printing;

/// <summary>
/// Discovers Windows printers as universal <see cref="EdgeDevice"/> rows.
/// DeviceManager owns registry; this provider only enumerates hardware.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class WindowsPrinterDeviceProvider : IDeviceProvider
{
    private readonly IPrintDriverResolver _drivers;
    private readonly Func<DateTimeOffset> _utcNow;

    public WindowsPrinterDeviceProvider(IPrintDriverResolver drivers, Func<DateTimeOffset>? utcNow = null)
    {
        _drivers = drivers;
        _utcNow = utcNow ?? (() => DateTimeOffset.UtcNow);
    }

    public string ModuleId => "printing";

    public Task<IReadOnlyList<EdgeDevice>> DiscoverAsync(CancellationToken cancellationToken)
    {
        var defaultName = TryGetDefaultPrinter();
        var list = new List<EdgeDevice>();
        foreach (string name in PrinterSettings.InstalledPrinters)
        {
            cancellationToken.ThrowIfCancellationRequested();
            list.Add(BuildDevice(name, string.Equals(name, defaultName, StringComparison.OrdinalIgnoreCase)));
        }

        return Task.FromResult<IReadOnlyList<EdgeDevice>>(list);
    }

    private EdgeDevice BuildDevice(string name, bool isDefault)
    {
        var caps = BuildCapabilities(name);
        var n = name.ToLowerInvariant();
        string? manufacturer = null;
        if (n.Contains("zebra") || n.Contains("zdesigner")) manufacturer = "Zebra";
        else if (n.Contains("godex")) manufacturer = "Godex";
        else if (n.Contains("tsc")) manufacturer = "TSC";
        else if (n.Contains("brother")) manufacturer = "Brother";
        else if (n.Contains("epson")) manufacturer = "Epson";
        else if (n.Contains("hp")) manufacturer = "HP";

        return new EdgeDevice(
            Id: name,
            Type: DeviceKinds.Printer,
            DisplayName: name,
            ModuleId: ModuleId,
            Manufacturer: manufacturer,
            Model: name,
            Driver: "windows-spooler",
            Status: DeviceOperationalStatus.Online,
            Capabilities: caps,
            LastSeen: _utcNow(),
            IsActive: true,
            IsDefault: isDefault,
            Metadata: new Dictionary<string, object?>
            {
                ["discovery"] = "InstalledPrinters",
            });
    }

    private IReadOnlyList<CapabilityDescriptor> BuildCapabilities(string name)
    {
        var n = name.ToLowerInvariant();
        var printOps = _drivers.SupportedFormatTokens
            .Select(f => f switch
            {
                "pdf" => "print_pdf",
                "zpl" => "print_zpl",
                "raw" => "print_raw",
                "html" => "print_html",
                _ => $"print_{f}",
            })
            .ToList();

        var mediaOps = new List<string>();
        if (n.Contains("zebra") || n.Contains("zdesigner") || n.Contains("godex") || n.Contains("tsc") ||
            (n.Contains("brother") && (n.Contains("ql") || n.Contains("pt-"))))
            mediaOps.Add("media_label");
        else if (n.Contains("epson") && (n.Contains("tm-") || n.Contains("receipt")))
            mediaOps.Add("media_receipt");
        else
            mediaOps.Add("media_a4");

        return
        [
            new CapabilityDescriptor(
                Name: "Printer",
                Version: "1",
                SupportedOperations: printOps
                    .Concat(mediaOps)
                    .Concat(["copies", "PaperStatus", "QueueStatus", "Offline"])
                    .ToList(),
                Limits: new Dictionary<string, object?>
                {
                    ["max_copies"] = 99,
                    ["duplex"] = false,
                    ["color"] = false,
                }),
        ];
    }

    private static string? TryGetDefaultPrinter()
    {
        try { return new PrinterSettings().PrinterName; }
        catch { return null; }
    }

    public Task OnConfigurationChangedAsync(
        string deviceId,
        DeviceConfiguration configuration,
        CancellationToken cancellationToken)
    {
        // Opaque config applied by Core; Printing may read known keys at print time.
        _ = deviceId;
        _ = configuration;
        _ = cancellationToken;
        return Task.CompletedTask;
    }
}
