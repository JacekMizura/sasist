using Sasist.Agent.Core.Devices;
using Sasist.Agent.Core.Host;
using Sasist.Agent.Sdk;
using Sasist.Agent.Sdk.Devices;
using Sasist.Agent.Sdk.Remote;

namespace Sasist.Agent.Tests;

public class DeviceManagerTests
{
    private sealed class StubProvider : IDeviceProvider
    {
        public required string ModuleId { get; init; }
        public required IReadOnlyList<EdgeDevice> Devices { get; init; }

        public Task<IReadOnlyList<EdgeDevice>> DiscoverAsync(CancellationToken cancellationToken) =>
            Task.FromResult(Devices);
    }

    private static DeviceManager CreateManager(out DeviceEventBus events)
    {
        events = new DeviceEventBus();
        return new DeviceManager(new SystemClock(), events);
    }

    [Fact]
    public async Task Refresh_AggregatesProviders_WithoutTypeBranching()
    {
        var mgr = CreateManager(out _);
        mgr.RegisterProvider(new StubProvider
        {
            ModuleId = "printing",
            Devices =
            [
                new EdgeDevice("p1", DeviceKinds.Printer, "P1", "printing",
                    Status: DeviceOperationalStatus.Online,
                    Capabilities:
                    [
                        new CapabilityDescriptor("Printer", "1", ["print_pdf", "print_zpl"]),
                    ]),
            ],
        });
        mgr.RegisterProvider(new StubProvider
        {
            ModuleId = "scanner",
            Devices =
            [
                new EdgeDevice("s1", DeviceKinds.Scanner, "S1", "scanner",
                    Status: DeviceOperationalStatus.Idle,
                    Capabilities:
                    [
                        new CapabilityDescriptor("Scanner", "1", ["scan_barcode"]),
                    ]),
            ],
        });

        await mgr.RefreshAsync();

        Assert.Equal(2, mgr.List().Count);
        Assert.Single(mgr.List(type: DeviceKinds.Printer));
        Assert.Single(mgr.List(type: DeviceKinds.Scanner));
        Assert.Equal(DeviceOperationalStatus.Online, mgr.Get("p1")!.Status);
    }

    [Fact]
    public async Task SyncDelta_IsDifferential()
    {
        var mgr = CreateManager(out _);
        mgr.RegisterProvider(new StubProvider
        {
            ModuleId = "printing",
            Devices = [new EdgeDevice("p1", DeviceKinds.Printer, "P1", "printing")],
        });
        await mgr.RefreshAsync();

        var first = mgr.BuildSyncDelta();
        Assert.Single(first.Upserts);
        mgr.MarkSynced(first, "cursor-1");

        var second = mgr.BuildSyncDelta();
        Assert.Empty(second.Upserts);
        Assert.Equal("cursor-1", mgr.LastSyncCursor);
    }

    [Fact]
    public async Task ConfigurationChanged_NotifiesProvider()
    {
        var notified = false;
        var mgr = CreateManager(out var events);
        mgr.RegisterProvider(new ConfigAwareProvider(() => notified = true));
        await mgr.RefreshAsync();
        await mgr.ApplyConfigurationAsync(
            "p1",
            new DeviceConfiguration(new Dictionary<string, object?> { ["defaultCopies"] = 2 }, "v2"),
            CancellationToken.None);
        Assert.True(notified);
        Assert.Contains(events.Recent(), e => e.EventType == DeviceEventNames.ConfigurationChanged);
    }

    [Fact]
    public async Task RefreshDevices_RemoteAction_Works()
    {
        var mgr = CreateManager(out _);
        mgr.RegisterProvider(new StubProvider
        {
            ModuleId = "printing",
            Devices = [new EdgeDevice("p1", DeviceKinds.Printer, "P1", "printing")],
        });
        var dispatcher = new RemoteActionDispatcher();
        dispatcher.Register(new RefreshDevicesActionHandler(mgr));

        var result = await dispatcher.DispatchAsync(
            new RemoteActionRequest(RemoteActionNames.RefreshDevices, ModuleId: "printing"),
            CancellationToken.None);

        Assert.True(result.Accepted);
        Assert.True(result.Completed);
        Assert.Single(mgr.List(moduleId: "printing"));
    }

    [Fact]
    public void DeviceSnapshot_FromEdgeDevice_FlattensCapabilities()
    {
        var edge = new EdgeDevice(
            "Zebra",
            DeviceKinds.Printer,
            "Zebra",
            "printing",
            Status: DeviceOperationalStatus.Busy,
            Capabilities:
            [
                new CapabilityDescriptor("Printer", "1", ["print_zpl", "copies"]),
            ],
            LastSeen: DateTimeOffset.UtcNow);

        var snap = DeviceSnapshot.FromEdgeDevice(edge);
        Assert.Equal(DeviceKinds.Printer, snap.DeviceKind);
        Assert.Contains("print_zpl", snap.Capabilities!);
        Assert.True(snap.Health!.Online);
        Assert.Equal(DeviceOperationalStatus.Busy, snap.Health.Status);
    }

    [Fact]
    public async Task Unsupported_RemoteAction_ReturnsAcceptedFalse()
    {
        var dispatcher = new RemoteActionDispatcher();
        var result = await dispatcher.DispatchAsync(
            new RemoteActionRequest(RemoteActionNames.RestartAgent),
            CancellationToken.None);
        Assert.False(result.Accepted);
        Assert.Equal("UNSUPPORTED_ACTION", result.ErrorCode);
    }

    [Fact]
    public async Task DownloadLogs_ProducesZipPayload()
    {
        var handler = new DownloadLogsActionHandler();
        var result = await handler.HandleAsync(
            new RemoteActionRequest(RemoteActionNames.DownloadLogs),
            CancellationToken.None);
        Assert.True(result.Accepted);
        Assert.True(result.Completed);
        Assert.NotNull(result.Data);
        Assert.True(result.Data!.ContainsKey("content_base64"));
    }

    private sealed class ConfigAwareProvider(Action onConfig) : IDeviceProvider
    {
        public string ModuleId => "printing";

        public Task<IReadOnlyList<EdgeDevice>> DiscoverAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<EdgeDevice>>(
            [
                new EdgeDevice("p1", DeviceKinds.Printer, "P1", "printing"),
            ]);

        public Task OnConfigurationChangedAsync(
            string deviceId,
            DeviceConfiguration configuration,
            CancellationToken cancellationToken)
        {
            onConfig();
            return Task.CompletedTask;
        }
    }
}
