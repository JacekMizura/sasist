using Sasist.Agent.Core.Config;
using Sasist.Agent.Sdk;

namespace Sasist.Agent.Tests;

public class SdkAndConfigTests
{
    [Fact]
    public void AgentConfig_NeedsSetup_WhenEmpty()
    {
        var cfg = new AgentConfig();
        Assert.True(cfg.NeedsSetup);
        Assert.False(cfg.IsReadyToRun());
    }

    [Fact]
    public void AgentConfig_Ready_WithServerAndToken()
    {
        var cfg = new AgentConfig
        {
            ServerUrl = "https://example.test",
            Token = "spt_test",
        };
        Assert.True(cfg.IsReadyToRun());
    }

    [Fact]
    public void DeviceSnapshot_Defaults()
    {
        var d = new DeviceSnapshot(
            "Zebra",
            "Zebra",
            DeviceKinds.Printer,
            "printing",
            Capabilities: new[] { "print.zpl" });
        Assert.Equal(DeviceKinds.Printer, d.DeviceKind);
        Assert.Contains("print.zpl", d.Capabilities!);
    }

    [Fact]
    public void ProtocolVersion_IsFrozenV1()
    {
        Assert.Equal(1, AgentConfig.ProtocolVersion);
    }

    [Fact]
    public void ConnectionState_Online_RequiresPairingServiceAndHostSnapshot()
    {
        var cfg = new AgentConfig
        {
            ServerUrl = "https://example.test",
            Token = "spt_test",
            AgentId = 42,
            OrganizationName = "Acme",
        };
        var snap = new AgentStatusSnapshot
        {
            Online = true,
            DeviceCount = 3,
            OrganizationName = "Acme",
            UpdatedAt = DateTimeOffset.UtcNow,
        };

        var online = ConnectionState.Capture(cfg, serviceRunning: true, snapshot: snap);
        Assert.True(online.Online);
        Assert.Equal(42, online.AgentId);
        Assert.Equal("https://example.test", online.Endpoint);

        var offlineHost = ConnectionState.Capture(cfg, serviceRunning: true, snapshot: new AgentStatusSnapshot { Online = false });
        Assert.False(offlineHost.Online);

        var stopped = ConnectionState.Capture(cfg, serviceRunning: false, snapshot: snap);
        Assert.False(stopped.Online);

        var unpaired = ConnectionState.Capture(new AgentConfig(), serviceRunning: true, snapshot: snap);
        Assert.False(unpaired.Online);
        Assert.True(unpaired.NeedsSetup);
    }
}
