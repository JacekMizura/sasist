using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Sasist.Agent.Core.Config;
using Sasist.Agent.Core.Host;
using Sasist.Agent.Core.Transport;
using Sasist.Agent.Host.Transport;
using Sasist.Agent.Sdk;

namespace Sasist.Agent.Host;

public static class Program
{
    public static async Task Main(string[] args)
    {
        if (args.Any(a => string.Equals(a, "diagnostics", StringComparison.OrdinalIgnoreCase)))
        {
            await RunDiagnosticsCliAsync();
            return;
        }

        var builder = Microsoft.Extensions.Hosting.Host.CreateApplicationBuilder(args);
        builder.Services.AddWindowsService(options => options.ServiceName = "SasistAgent");
        RegisterAgentServices(builder.Services);

        var host = builder.Build();
        await host.RunAsync();
    }

    internal static void RegisterAgentServices(IServiceCollection services)
    {
        services.AddHttpClient("sasist-edge");
        services.AddHttpClient("sasist-printing-compat");
        services.AddSingleton<ConfigStore>();
        services.AddSingleton<IUpdateSignatureVerifier, FilePresenceUpdateSignatureVerifier>();
        services.AddSingleton(sp =>
        {
            var factory = sp.GetRequiredService<IHttpClientFactory>();
            var http = factory.CreateClient("sasist-edge");
            var logger = sp.GetRequiredService<ILogger<EdgeDeviceApiClient>>();
            return new EdgeDeviceApiClient(http, logger);
        });
        // Host selects transport — Core never knows which.
        services.AddSingleton<IAgentTransport, CompatPrintingTransport>();
        services.AddSingleton<AgentRuntime>();
        services.AddHostedService<AgentWorker>();
    }

    private static async Task RunDiagnosticsCliAsync()
    {
        var services = new ServiceCollection();
        services.AddLogging(b => b.AddSimpleConsole(o => o.SingleLine = true));
        RegisterAgentServices(services);
        await using var sp = services.BuildServiceProvider();

        var runtime = sp.GetRequiredService<AgentRuntime>();
        foreach (var module in DiscoverModules())
            runtime.RegisterModule(module);

        var cfg = sp.GetRequiredService<ConfigStore>().Load();
        Console.WriteLine($"Sasist Agent diagnostics ({AgentConfig.AgentVersion})");
        Console.WriteLine($"Config: {AgentPaths.ConfigPath}");
        Console.WriteLine($"Secrets: {AgentPaths.SecretsDir} (DPAPI)");
        Console.WriteLine($"Plugins: {AgentPaths.PluginsDir}");
        Console.WriteLine($"Ready: {cfg.IsReadyToRun()}");
        Console.WriteLine($"Modules discovered: {runtime.Modules.All.Count}");

        if (!cfg.IsReadyToRun())
        {
            Console.WriteLine("FAIL agent.config — set server_url; store api_key via DPAPI secret agent_api_key");
            Environment.ExitCode = 2;
            return;
        }

        await runtime.StartAsync(CancellationToken.None);
        var checks = await runtime.RunDiagnosticsAsync(destructive: false, CancellationToken.None);
        foreach (var c in checks)
            Console.WriteLine($"[{c.Status}] {c.Id} ({c.Severity}): {c.Title} — {c.Message}");
        await runtime.StopAsync(CancellationToken.None);
    }

    internal static IReadOnlyList<IAgentModule> DiscoverModules()
    {
        var baseDir = AppContext.BaseDirectory;
        var plugins = new[]
        {
            Path.Combine(baseDir, "plugins"),
            AgentPaths.PluginsDir,
        };
        foreach (var dir in plugins)
        {
            if (Directory.Exists(dir))
            {
                var found = ModulePluginLoader.DiscoverFromPlugins(dir);
                if (found.Count > 0)
                    return found;
            }
        }

        return ModulePluginLoader.DiscoverFromPlugins(null);
    }
}
