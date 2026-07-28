using System.Diagnostics;
using Sasist.Agent.Core.Config;
using Sasist.Agent.Tray.Mvp;

namespace Sasist.Agent.Tray;

internal sealed class DiagnosticsPage : UserControl, IPageView
{
    private readonly ConfigStore _store;
    private readonly FlowLayoutPanel _flow;
    private readonly List<SasistDiagnosticCard> _cards = new();
    private readonly Dictionary<string, Action<string>> _setters = new();
    private bool _built;

    public DiagnosticsPage(ConfigStore store)
    {
        _store = store;
        Dock = DockStyle.Fill;
        UiBuffering.Enable(this);
        var shell = new PageShell("Diagnostyka", "Informacje techniczne dla wsparcia Sasist — podzielone na sekcje");

        var bar = new SasistToolbar();
        bar.AddButton("Odśwież", SasistButtonKind.Secondary, (_, _) => ForceSync(UiState.Capture(_store)));
        bar.AddButton("Folder logów", SasistButtonKind.Ghost, (_, _) =>
        {
            AgentPaths.EnsureDirectories();
            Process.Start(new ProcessStartInfo { FileName = "explorer.exe", Arguments = $"\"{AgentPaths.LogsDir}\"", UseShellExecute = true });
        });

        _flow = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            WrapContents = true,
            BackColor = Color.Transparent,
        };

        shell.Body.Controls.Add(_flow);
        shell.Body.Controls.Add(bar);
        Controls.Add(shell);
        shell.Body.Resize += (_, _) => FitWidths();
        UiBuffering.Enable(shell);
    }

    public void ApplyValues(UiState state)
    {
        EnsureBuilt();
        Set("conn.status", state.Online ? "Połączono" : "Brak połączenia");
        Set("conn.company", state.Company);
        Set("conn.sync", state.SyncValue);
        Set("conn.endpoint", state.Endpoint);
        Set("agent.id", state.AgentId);
        Set("agent.token", state.TokenMasked);
        Set("agent.version", AgentConfig.AgentVersion);
        Set("agent.proto", AgentConfig.ProtocolVersion.ToString());
        Set("agent.hb", state.Heartbeat);
        Set("pc.name", state.Computer);
        Set("pc.mid", state.MachineId);
        Set("svc.name", TrayApplicationContext.ServiceName);
        Set("svc.status", state.ServiceStatus);
        Set("sys.poll", state.PollInterval);
        Set("sys.channel", state.UpdateChannel);
        Set("logs.dir", AgentPaths.LogsDir);
        Set("logs.cfg", AgentPaths.ConfigPath);
    }

    public void ForceSync(UiState state) => ApplyValues(state);

    private void EnsureBuilt()
    {
        if (_built) return;
        _built = true;
        UiMetrics.NoteRebuild("DiagnosticsPage.structure-once");
        _flow.SuspendLayout();
        AddCard("Połączenie", [
            ("conn.status", "Status"),
            ("conn.company", "Firma"),
            ("conn.sync", "Synchronizacja"),
            ("conn.endpoint", "Endpoint"),
        ]);
        AddCard("Agent", [
            ("agent.id", "Agent ID"),
            ("agent.token", "Token"),
            ("agent.version", "Wersja"),
            ("agent.proto", "Protokół"),
            ("agent.hb", "Heartbeat"),
        ]);
        AddCard("Komputer", [
            ("pc.name", "Nazwa"),
            ("pc.mid", "Machine ID"),
        ]);
        AddCard("Usługa", [
            ("svc.name", "Nazwa"),
            ("svc.status", "Status"),
        ]);
        AddCard("System", [
            ("sys.poll", "Polling"),
            ("sys.channel", "Kanał aktualizacji"),
        ]);
        AddCard("Ścieżki", [
            ("logs.dir", "Logi"),
            ("logs.cfg", "Konfiguracja"),
        ]);
        _flow.ResumeLayout(true);
        FitWidths();
    }

    private void AddCard(string title, (string Key, string Label)[] rows)
    {
        var card = new SasistDiagnosticCard(title, rows);
        foreach (var (key, _) in rows)
        {
            var k = key;
            _setters[k] = v => card.Set(k, v);
        }
        _cards.Add(card);
        _flow.Controls.Add(card);
    }

    private void Set(string key, string value)
    {
        if (_setters.TryGetValue(key, out var set)) set(value);
    }

    private void FitWidths()
    {
        var avail = Math.Max(280, _flow.ClientSize.Width - Theme.Space.Sm);
        var cardW = avail >= 720 ? (avail - Theme.Gap) / 2 : avail - Theme.Space.Sm;
        foreach (var c in _cards)
            c.FitWidth(Math.Max(260, cardW));
    }
}
