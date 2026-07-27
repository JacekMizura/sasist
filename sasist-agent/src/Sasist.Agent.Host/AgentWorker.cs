using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Sasist.Agent.Core.Config;
using Sasist.Agent.Core.Host;

namespace Sasist.Agent.Host;

public sealed class AgentWorker : BackgroundService
{
    private readonly AgentRuntime _runtime;
    private readonly ILogger<AgentWorker> _logger;

    public AgentWorker(AgentRuntime runtime, ILogger<AgentWorker> logger)
    {
        _runtime = runtime;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        foreach (var module in Program.DiscoverModules())
        {
            _runtime.RegisterModule(module);
            _logger.LogInformation("Discovered module {ModuleId} v{Version}", module.ModuleId, module.ModuleVersion);
        }

        if (_runtime.Modules.All.Count == 0)
            _logger.LogWarning("No modules discovered — place Sasist.Agent.Modules.*.dll in plugins/");

        try
        {
            // Wait for Tray / first-run setup to write server_url + DPAPI secrets.
            while (!stoppingToken.IsCancellationRequested)
            {
                var cfg = new ConfigStore().Load();
                if (cfg.IsReadyToRun())
                    break;
                _logger.LogInformation("Waiting for configuration (Tray setup)…");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }

            if (stoppingToken.IsCancellationRequested)
                return;

            await _runtime.StartAsync(stoppingToken);
            await Task.Delay(Timeout.Infinite, stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // shutdown
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Agent runtime crashed");
            throw;
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        await _runtime.StopAsync(cancellationToken);
        await base.StopAsync(cancellationToken);
    }
}
