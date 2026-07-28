using System.Diagnostics;
using Sasist.Agent.Core.Config;
using Sasist.Agent.Tray.Mvp;

namespace Sasist.Agent.Tray;

internal sealed class DiagnosticsPage : UserControl, IPageView
{
    private readonly ConfigStore _store;
    private readonly FlowLayoutPanel _flow;
    private readonly Dictionary<string, Label> _values = new();
    private bool _built;

    public DiagnosticsPage(ConfigStore store)
    {
        _store = store;
        Dock = DockStyle.Fill;
        UiBuffering.Enable(this);
        var shell = new PageShell("Diagnostyka", "Informacje techniczne dla wsparcia Sasist — podzielone na sekcje");

        var bar = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            WrapContents = true,
            BackColor = Color.Transparent,
            Padding = new Padding(0, 0, 0, 12),
        };
        var refresh = new SasistButton { Text = "Odśwież", Margin = new Padding(0, 0, 8, 4) };
        refresh.Click += (_, _) => ForceSync(UiState.Capture(_store));
        var folder = new SasistButton { Text = "Folder logów", Margin = new Padding(0, 0, 0, 4) };
        folder.Click += (_, _) =>
        {
            AgentPaths.EnsureDirectories();
            Process.Start(new ProcessStartInfo { FileName = "explorer.exe", Arguments = $"\"{AgentPaths.LogsDir}\"", UseShellExecute = true });
        };
        bar.Controls.Add(refresh);
        bar.Controls.Add(folder);

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
        _flow.Controls.Add(Section("Połączenie", [
            ("conn.status", "Status"),
            ("conn.company", "Firma"),
            ("conn.sync", "Synchronizacja"),
            ("conn.endpoint", "Endpoint"),
        ]));
        _flow.Controls.Add(Section("Agent", [
            ("agent.id", "Agent ID"),
            ("agent.token", "Token"),
            ("agent.version", "Wersja"),
            ("agent.proto", "Protokół"),
            ("agent.hb", "Heartbeat"),
        ]));
        _flow.Controls.Add(Section("Komputer", [
            ("pc.name", "Nazwa"),
            ("pc.mid", "Machine ID"),
        ]));
        _flow.Controls.Add(Section("Usługa", [
            ("svc.name", "Nazwa"),
            ("svc.status", "Stan"),
        ]));
        _flow.Controls.Add(Section("System", [
            ("sys.poll", "Odpytywanie"),
            ("sys.channel", "Kanał"),
        ]));
        _flow.Controls.Add(Section("Logi", [
            ("logs.dir", "Folder"),
            ("logs.cfg", "Konfiguracja"),
        ]));
        _flow.ResumeLayout(true);
        FitWidths();
    }

    private Control Section(string title, (string Key, string Cap)[] rows)
    {
        var inner = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Color.Transparent,
        };
        inner.Controls.Add(LayoutHelpers.Title(title));
        foreach (var (key, cap) in rows)
        {
            var capLbl = LayoutHelpers.Muted(cap);
            capLbl.Margin = new Padding(0, 12, 0, 2);
            var val = LayoutHelpers.Wrap("—", Theme.FontBodySemibold, Theme.TextPrimary, 280);
            inner.Controls.Add(capLbl);
            inner.Controls.Add(val);
            _values[key] = val;
        }

        var card = new SasistCard
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Margin = new Padding(0, 0, Theme.Gap, Theme.Gap),
            MinimumSize = new Size(260, 80),
        };
        card.Controls.Add(inner);
        return card;
    }

    private void Set(string key, string value)
    {
        if (_values.TryGetValue(key, out var lbl))
            UiBuffering.SetTextIfChanged(lbl, value);
    }

    private void FitWidths()
    {
        var avail = Math.Max(280, _flow.ClientSize.Width - 8);
        var cardW = avail >= 700 ? Math.Max(280, (avail - Theme.Gap) / 2) : avail - 8;
        foreach (Control c in _flow.Controls)
        {
            c.MaximumSize = new Size(cardW, 0);
            c.MinimumSize = new Size(Math.Min(260, cardW), 0);
            foreach (Control inner in c.Controls)
            {
                if (inner is FlowLayoutPanel stack)
                {
                    foreach (Control x in stack.Controls)
                        LayoutHelpers.SetMaxWidth(x, cardW - 48);
                }
            }
        }
    }
}
