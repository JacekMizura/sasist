using System.Diagnostics;
using System.ServiceProcess;
using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

internal sealed class DiagnosticsPage : UserControl
{
    private readonly ConfigStore _store;
    private readonly TextBox _box;

    public DiagnosticsPage(ConfigStore store)
    {
        _store = store;
        Dock = DockStyle.Fill;
        BackColor = Color.FromArgb(245, 246, 248);

        var title = new Label
        {
            Text = "Diagnostyka",
            Dock = DockStyle.Top,
            Height = 36,
            Font = new Font("Segoe UI Semibold", 18f),
        };
        var hint = new Label
        {
            Text = "Informacje techniczne dla pomocy Sasist. Nie są potrzebne do codziennej pracy.",
            Dock = DockStyle.Top,
            Height = 28,
            ForeColor = Color.FromArgb(90, 90, 98),
        };

        _box = new TextBox
        {
            Dock = DockStyle.Fill,
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            Font = new Font("Consolas", 9.5f),
            BackColor = Color.White,
        };

        var toolbar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 44, Padding = new Padding(0, 4, 0, 4) };
        var refresh = new Button { Text = "Odśwież", Width = 100, Height = 34, FlatStyle = FlatStyle.Flat, BackColor = Color.White };
        refresh.Click += (_, _) => RefreshData();
        var copy = new Button { Text = "Kopiuj", Width = 100, Height = 34, FlatStyle = FlatStyle.Flat, BackColor = Color.White };
        copy.Click += (_, _) =>
        {
            var text = _box.Text;
            if (!string.IsNullOrEmpty(text))
                Clipboard.SetText(text);
        };
        var openLogs = new Button { Text = "Folder logów", Width = 120, Height = 34, FlatStyle = FlatStyle.Flat, BackColor = Color.White };
        openLogs.Click += (_, _) =>
        {
            AgentPaths.EnsureDirectories();
            Process.Start(new ProcessStartInfo
            {
                FileName = "explorer.exe",
                Arguments = $"\"{AgentPaths.LogsDir}\"",
                UseShellExecute = true,
            });
        };
        toolbar.Controls.Add(refresh);
        toolbar.Controls.Add(copy);
        toolbar.Controls.Add(openLogs);

        Controls.Add(_box);
        Controls.Add(toolbar);
        Controls.Add(hint);
        Controls.Add(title);
    }

    public void RefreshData()
    {
        var cfg = _store.Load();
        var snap = AgentStatusStore.Read();
        string service;
        try
        {
            using var sc = new ServiceController(TrayApplicationContext.ServiceName);
            service = sc.Status.ToString();
        }
        catch
        {
            service = "niedostępna";
        }

        _box.Text = string.Join(Environment.NewLine, new[]
        {
            $"Machine ID:     {cfg.MachineId}",
            $"Agent ID:       {(cfg.AgentId > 0 ? cfg.AgentId.ToString() : "—")}",
            $"Endpoint:       {cfg.ServerUrl}",
            $"Token:          {UiCopy.MaskSecret(cfg.Token)}",
            $"Heartbeat:      co {cfg.HeartbeatIntervalSec} s",
            $"Polling:        co {cfg.PollIntervalSec} s",
            $"Wersja:         {AgentConfig.AgentVersion}",
            $"Protokół:       {AgentConfig.ProtocolVersion}",
            $"Usługa:         {service}",
            $"Online:         {(snap?.Online == true ? "tak" : "nie")}",
            $"Komputer:       {cfg.ComputerName}",
            $"Firma:          {UiCopy.CompanyName(cfg, snap)}",
            $"Konfiguracja:   {AgentPaths.ConfigPath}",
            $"Logi:           {AgentPaths.LogsDir}",
        });
    }

    public override void Refresh()
    {
        base.Refresh();
        RefreshData();
    }
}
