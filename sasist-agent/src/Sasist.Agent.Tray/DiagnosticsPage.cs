using System.Diagnostics;
using System.ServiceProcess;
using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

internal sealed class DiagnosticsPage : UserControl, IRefreshablePage
{
    private readonly ConfigStore _store;
    private readonly FlowLayoutPanel _flow;

    public DiagnosticsPage(ConfigStore store)
    {
        _store = store;
        Dock = DockStyle.Fill;
        BackColor = Color.Transparent;
        Controls.Add(new PageHeader("Diagnostyka", "Informacje techniczne dla wsparcia Sasist"));

        var toolbar = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 48,
            Padding = new Padding(0, 4, 0, 8),
            BackColor = Color.Transparent,
        };
        var refresh = new ModernButton { Text = "Odśwież", Width = 110 };
        refresh.Click += (_, _) => RefreshData();
        var copy = new ModernButton { Text = "Kopiuj wszystko", Width = 140 };
        copy.Click += (_, _) => Clipboard.SetText(BuildPlainText());
        var folder = new ModernButton { Text = "Folder logów", Width = 130 };
        folder.Click += (_, _) =>
        {
            AgentPaths.EnsureDirectories();
            Process.Start(new ProcessStartInfo { FileName = "explorer.exe", Arguments = $"\"{AgentPaths.LogsDir}\"", UseShellExecute = true });
        };
        toolbar.Controls.Add(refresh);
        toolbar.Controls.Add(copy);
        toolbar.Controls.Add(folder);

        _flow = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            WrapContents = true,
            BackColor = Color.Transparent,
        };

        Controls.Add(_flow);
        Controls.Add(toolbar);
        Theme.Changed += () => RefreshData();
    }

    public void RefreshData()
    {
        var cfg = _store.Load();
        var snap = AgentStatusStore.Read();
        string service;
        try
        {
            using var sc = new ServiceController(TrayApplicationContext.ServiceName);
            service = sc.Status switch
            {
                ServiceControllerStatus.Running => "Uruchomiona",
                ServiceControllerStatus.Stopped => "Zatrzymana",
                _ => sc.Status.ToString(),
            };
        }
        catch { service = "Niedostępna"; }

        _flow.SuspendLayout();
        _flow.Controls.Clear();
        _flow.Controls.Add(Section("Połączenie", new Dictionary<string, string>
        {
            ["Status"] = snap?.Online == true ? "Połączono" : "Brak połączenia",
            ["Firma"] = UiCopy.CompanyName(cfg, snap),
            ["Synchronizacja"] = UiCopy.RelativeSync(snap?.UpdatedAt),
            ["Endpoint"] = cfg.ServerUrl,
        }));
        _flow.Controls.Add(Section("Agent", new Dictionary<string, string>
        {
            ["Agent ID"] = cfg.AgentId > 0 ? cfg.AgentId.ToString() : "—",
            ["Token"] = UiCopy.MaskSecret(cfg.Token),
            ["Wersja"] = AgentConfig.AgentVersion,
            ["Protokół"] = AgentConfig.ProtocolVersion.ToString(),
            ["Heartbeat"] = $"co {cfg.HeartbeatIntervalSec} s",
            ["Odpytywanie"] = $"co {cfg.PollIntervalSec} s",
        }));
        _flow.Controls.Add(Section("Komputer", new Dictionary<string, string>
        {
            ["Nazwa"] = cfg.ComputerName,
            ["Machine ID"] = cfg.MachineId,
        }));
        _flow.Controls.Add(Section("Usługa", new Dictionary<string, string>
        {
            ["Nazwa"] = TrayApplicationContext.ServiceName,
            ["Stan"] = service,
        }));
        _flow.Controls.Add(Section("Logi", new Dictionary<string, string>
        {
            ["Folder"] = AgentPaths.LogsDir,
            ["Konfiguracja"] = AgentPaths.ConfigPath,
        }));
        _flow.ResumeLayout();
    }

    private static Control Section(string title, Dictionary<string, string> rows)
    {
        var card = new RoundedCard
        {
            Width = 340,
            Height = 56 + rows.Count * 44,
            Margin = new Padding(0, 0, 16, 16),
        };
        var h = new Label
        {
            Text = title,
            Left = 20,
            Top = 16,
            Width = 280,
            Height = 24,
            Font = Theme.FontSection,
            ForeColor = Theme.TextPrimary,
            BackColor = Color.Transparent,
        };
        card.Controls.Add(h);
        var y = 48;
        foreach (var (k, v) in rows)
        {
            var cap = new Label
            {
                Text = k,
                Left = 20,
                Top = y,
                Width = 280,
                Height = 16,
                Font = Theme.FontCaption,
                ForeColor = Theme.TextMuted,
                BackColor = Color.Transparent,
            };
            var val = new Label
            {
                Text = v,
                Left = 20,
                Top = y + 16,
                Width = 290,
                Height = 22,
                Font = Theme.FontUiSemibold,
                ForeColor = Theme.TextPrimary,
                BackColor = Color.Transparent,
            };
            card.Controls.Add(cap);
            card.Controls.Add(val);
            y += 44;
        }
        return card;
    }

    private string BuildPlainText()
    {
        var parts = new List<string>();
        foreach (Control c in _flow.Controls)
        {
            if (c is not RoundedCard card) continue;
            foreach (Control x in card.Controls)
                if (x is Label l) parts.Add(l.Text);
            parts.Add("");
        }
        return string.Join(Environment.NewLine, parts);
    }

    public override void Refresh()
    {
        base.Refresh();
        RefreshData();
    }
}
