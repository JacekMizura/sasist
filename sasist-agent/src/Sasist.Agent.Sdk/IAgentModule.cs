namespace Sasist.Agent.Sdk;

/// <summary>Plugin contract — see docs/sasist-agent/plugin-sdk.md</summary>
public interface IAgentModule : IAsyncDisposable
{
    string ModuleId { get; }
    string ModuleVersion { get; }
    IReadOnlyList<string> Capabilities { get; }

    Task InitializeAsync(IModuleContext context, CancellationToken cancellationToken);
    Task StartAsync(CancellationToken cancellationToken);
    Task StopAsync(CancellationToken cancellationToken);
    Task<ModuleHeartbeatSlice> HeartbeatAsync(CancellationToken cancellationToken);
    Task<ModuleCommandResult> HandleCommandAsync(ModuleCommand command, CancellationToken cancellationToken);
    Task<IReadOnlyList<DiagnosticCheckResult>> CollectDiagnosticsAsync(
        DiagnosticsRequest request,
        CancellationToken cancellationToken);
}
