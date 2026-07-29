using Microsoft.Win32;
using Sasist.Agent.Core.Config;
using Sasist.Agent.Tray.Mvp;

namespace Sasist.Agent.Tray;

internal sealed class SettingsPage : UserControl, IPageView
{
    private readonly ConfigStore _store;
    private readonly Action _unpair;
    private readonly FlowLayoutPanel _stack;
    private PageShell? _shell;

    public SettingsPage(ConfigStore store, Action unpair)
    {
        _store = store;
        _unpair = unpair;
        Dock = DockStyle.Fill;
        UiBuffering.Enable(this);
        _shell = new PageShell("Ustawienia", "Zachowanie Sasist Agent na tym komputerze");

        _stack = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Color.Transparent,
        };

        _stack.Controls.Add(Section("Ogólne", p =>
        {
            p.Add(ToggleRow("Uruchamiaj z Windows", UiPreferences.Current.StartWithWindows, v =>
            {
                UiPreferences.Current.StartWithWindows = v; UiPreferences.Save(); SetRun(v);
            }));
            p.Add(ToggleRow("Uruchamiaj w tle", UiPreferences.Current.RunInBackground, v =>
            {
                UiPreferences.Current.RunInBackground = v; UiPreferences.Save();
            }));
        }));

        _stack.Controls.Add(Section("Powiadomienia", p =>
        {
            p.Add(ToggleRow("Pokazuj powiadomienia", UiPreferences.Current.Notifications, v =>
            {
                UiPreferences.Current.Notifications = v; UiPreferences.Save();
            }));
        }));

        _stack.Controls.Add(Section("Uruchamianie", p =>
        {
            p.Add(new SasistCaption
            {
                Text = "Agent może działać w tle po zamknięciu okna.",
                MaximumSize = new Size(640, 0),
            });
        }));

        _stack.Controls.Add(Section("Aktualizacje", p =>
        {
            p.Add(ToggleRow("Automatyczne aktualizacje", UiPreferences.Current.AutoUpdates, v =>
            {
                UiPreferences.Current.AutoUpdates = v; UiPreferences.Save();
            }));
        }));

        _stack.Controls.Add(Section("Diagnostyka", p =>
        {
            var row = new SasistToolbar { Dock = DockStyle.None, Padding = new Padding(0, Theme.Space.Sm, 0, 0) };
            row.AddButton("Otwórz folder logów", SasistButtonKind.Secondary, (_, _) =>
            {
                AgentPaths.EnsureDirectories();
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "explorer.exe",
                    Arguments = $"\"{AgentPaths.LogsDir}\"",
                    UseShellExecute = true,
                });
            });
            row.AddButton("Eksport diagnostyki", SasistButtonKind.Secondary, (_, _) => Export());
            row.AddButton("Reset połączenia", SasistButtonKind.Danger, (_, _) => _unpair());
            row.AddButton("Odłącz urządzenie", SasistButtonKind.Ghost, (_, _) => _unpair());
            p.Add(row);
        }));

        _shell.Body.Controls.Add(_stack);
        Controls.Add(_shell);
        _shell.Body.Resize += (_, _) => Relayout();
        Relayout();
    }

    private void Relayout()
    {
        if (_shell is null) return;
        var w = Math.Max(360, _shell.Body.ClientSize.Width - Theme.Space.Sm);
        foreach (Control c in _stack.Controls)
        {
            c.MaximumSize = new Size(w, 0);
            c.MinimumSize = new Size(Math.Min(320, w), 0);
        }
    }

    private static SasistSection Section(string title, Action<SasistSection> build)
    {
        var s = new SasistSection(title);
        build(s);
        return s;
    }

    private static Control ToggleRow(string label, bool on, Action<bool> change)
    {
        var grid = new TableLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            ColumnCount = 2,
            RowCount = 1,
            Margin = new Padding(0, Theme.Space.Sm, 0, Theme.Space.Sm),
            BackColor = Color.Transparent,
            MinimumSize = new Size(280, 44),
            Dock = DockStyle.Top,
        };
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        grid.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        var lbl = new SasistBody { Text = label, Margin = new Padding(0, Theme.Space.Sm, Theme.Space.Sm, Theme.Space.Sm) };
        var toggle = new SasistToggle { On = on, Margin = new Padding(Theme.Space.Sm, Theme.Space.Sm, 0, Theme.Space.Sm) };
        toggle.Toggled += (_, _) => change(toggle.On);

        grid.Controls.Add(lbl, 0, 0);
        grid.Controls.Add(toggle, 1, 0);
        return grid;
    }

    private static void SetRun(bool enable)
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true);
            if (key is null) return;
            const string name = "SasistAgentTray";
            if (enable) key.SetValue(name, $"\"{Application.ExecutablePath}\"");
            else key.DeleteValue(name, false);
        }
        catch { }
    }

    private void Export()
    {
        var cfg = _store.Load();
        var connection = ConnectionState.Capture(
            cfg,
            ServiceHelper.IsRunning(TrayApplicationContext.ServiceName));
        using var dlg = new SaveFileDialog { Filter = "Tekst (*.txt)|*.txt", FileName = $"sasist-diagnostyka-{DateTime.Now:yyyyMMdd-HHmm}.txt" };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        File.WriteAllText(dlg.FileName, string.Join(Environment.NewLine, new[]
        {
            "Sasist Agent — diagnostyka",
            $"Wersja: {AgentConfig.AgentVersion}",
            $"Agent ID: {cfg.AgentId}",
            $"Machine ID: {cfg.MachineId}",
            $"Endpoint: {connection.Endpoint}",
            $"Firma: {UiCopy.CompanyName(cfg, AgentStatusStore.Read())}",
            $"Online: {connection.Online}",
            $"Logi: {AgentPaths.LogsDir}",
        }));
    }

    public void ApplyValues(UiState state) { }
    public void ForceSync(UiState state) => Relayout();
}
