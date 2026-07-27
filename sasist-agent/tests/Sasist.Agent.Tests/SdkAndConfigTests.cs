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
}
