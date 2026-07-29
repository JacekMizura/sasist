namespace Sasist.Agent.Core.Config;

/// <summary>
/// Single source of truth for Agent ↔ Sasist connectivity.
/// Written by Host heartbeats via <see cref="AgentStatusStore"/>; read by Tray Status, Test, Diagnostics, etc.
/// Do not invent parallel HTTP health probes in the UI.
/// </summary>
public sealed record ConnectionState(
    bool Online,
    bool NeedsSetup,
    bool ServiceRunning,
    bool HostReportsOnline,
    string Endpoint,
    string OrganizationName,
    DateTimeOffset? LastSyncAt,
    int DeviceCount,
    int AgentId)
{
    /// <summary>
    /// Resolve connection from paired config + Host status snapshot + Windows service.
    /// Online means: paired, Host service running, and Host reported a successful Sasist sync.
    /// </summary>
    public static ConnectionState Capture(
        AgentConfig config,
        bool serviceRunning,
        AgentStatusSnapshot? snapshot = null)
    {
        var snap = snapshot ?? AgentStatusStore.Read();
        var needs = config.NeedsSetup;
        var hostOnline = snap?.Online ?? false;
        var online = !needs && serviceRunning && hostOnline;
        return new ConnectionState(
            Online: online,
            NeedsSetup: needs,
            ServiceRunning: serviceRunning,
            HostReportsOnline: hostOnline,
            Endpoint: string.IsNullOrWhiteSpace(config.ServerUrl) ? "" : config.ServerUrl.Trim(),
            OrganizationName: snap?.OrganizationName?.Trim()
                ?? config.OrganizationName?.Trim()
                ?? "",
            LastSyncAt: snap?.UpdatedAt,
            DeviceCount: snap?.DeviceCount ?? 0,
            AgentId: config.AgentId);
    }

    public string OfflineReason
    {
        get
        {
            if (NeedsSetup) return "Agent nie jest sparowany — wpisz kod połączenia.";
            if (!ServiceRunning) return "Usługa Host nie działa.";
            if (!HostReportsOnline) return "Brak aktywnej synchronizacji z Sasist.";
            return "Brak połączenia.";
        }
    }
}
