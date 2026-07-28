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
            p.Controls.Add(Row("Uruchamiaj z Windows", UiPreferences.Current.StartWithWindows, v =>
            {
                UiPreferences.Current.StartWithWindows = v; UiPreferences.Save(); SetRun(v);
            }));
            p.Controls.Add(Row("Uruchamiaj w tle", UiPreferences.Current.RunInBackground, v =>
            {
                UiPreferences.Current.RunInBackground = v; UiPreferences.Save();
            }));
        }));

        _stack.Controls.Add(Section("Powiadomienia", p =>
        {
            p.Controls.Add(Row("Pokazuj powiadomienia", UiPreferences.Current.Notifications, v =>
            {
                UiPreferences.Current.Notifications = v; UiPreferences.Save();
            }));
        }));

        _stack.Controls.Add(Section("Uruchamianie", p =>
        {
            p.Controls.Add(LayoutHelpers.Wrap(
                "Agent może działać w tle po zamknięciu okna.",
                Theme.FontCaption, Theme.TextMuted, 640));
        }));

        _stack.Controls.Add(Section("Aktualizacje", p =>
        {
            p.Controls.Add(Row("Automatyczne aktualizacje", UiPreferences.Current.AutoUpdates, v =>
            {
                UiPreferences.Current.AutoUpdates = v; UiPreferences.Save();
            }));
        }));

        _stack.Controls.Add(Section("Diagnostyka", p =>
        {
            var row = new FlowLayoutPanel { AutoSize = true, WrapContents = true, BackColor = Color.Transparent };
            var logs = new SasistButton { Text = "Otwórz folder logów", Margin = new Padding(0, 8, 8, 4) };
            logs.Click += (_, _) =>
            {
                AgentPaths.EnsureDirectories();
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "explorer.exe",
                    Arguments = $"\"{AgentPaths.LogsDir}\"",
                    UseShellExecute = true,
                });
            };
            var export = new SasistButton { Text = "Eksport diagnostyki", Margin = new Padding(0, 8, 8, 4) };
            export.Click += (_, _) => Export();
            var reset = new SasistButton { Text = "Reset połączenia", Danger = true, Margin = new Padding(0, 8, 8, 4) };
            reset.Click += (_, _) => _unpair();
            var unpairBtn = new SasistButton { Text = "Odłącz urządzenie", Margin = new Padding(0, 8, 0, 4) };
            unpairBtn.Click += (_, _) => _unpair();
            row.Controls.AddRange([logs, export, reset, unpairBtn]);
            p.Controls.Add(row);
        }));

        _shell.Body.Controls.Add(_stack);
        Controls.Add(_shell);
        _shell.Body.Resize += (_, _) => Relayout();
        Relayout();
    }

    private void Relayout()
    {
        if (_shell is null) return;
        var w = Math.Max(360, _shell.Body.ClientSize.Width - 8);
        foreach (Control c in _stack.Controls)
        {
            c.MaximumSize = new Size(w, 0);
            c.MinimumSize = new Size(Math.Min(320, w), 0);
            foreach (Control inner in c.Controls)
            {
                if (inner is not FlowLayoutPanel flow) continue;
                foreach (Control child in flow.Controls)
                {
                    if (child is TableLayoutPanel row)
                    {
                        row.MaximumSize = new Size(Math.Max(280, w - 56), 0);
                        row.MinimumSize = new Size(Math.Min(280, w - 56), 44);
                    }
                    else
                        LayoutHelpers.SetMaxWidth(child, w - 56);
                }
            }
        }
    }

    private static Control Section(string title, Action<FlowLayoutPanel> build)
    {
        var inner = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Color.Transparent,
        };
        var h = LayoutHelpers.Title(title);
        h.Margin = new Padding(0, 0, 0, 12);
        inner.Controls.Add(h);
        build(inner);

        var card = new SasistCard
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            MinimumSize = new Size(320, 64),
            Margin = new Padding(0, 0, 0, Theme.SectionGap),
        };
        card.Controls.Add(inner);
        return card;
    }

    private static Control Row(string label, bool on, Action<bool> change)
    {
        var grid = new TableLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            ColumnCount = 2,
            RowCount = 1,
            Margin = new Padding(0, 6, 0, 6),
            BackColor = Color.Transparent,
            MinimumSize = new Size(280, 44),
            Dock = DockStyle.Top,
        };
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        grid.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        var lbl = LayoutHelpers.Text(label, Theme.FontBody, Theme.TextPrimary);
        lbl.AutoSize = true;
        lbl.Anchor = AnchorStyles.Left | AnchorStyles.Top;
        lbl.Margin = new Padding(0, 8, 8, 8);
        var toggle = new SasistToggle { On = on, Margin = new Padding(8, 6, 0, 6), Anchor = AnchorStyles.Right };
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
        var snap = AgentStatusStore.Read();
        using var dlg = new SaveFileDialog { Filter = "Tekst (*.txt)|*.txt", FileName = $"sasist-diagnostyka-{DateTime.Now:yyyyMMdd-HHmm}.txt" };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        File.WriteAllText(dlg.FileName, string.Join(Environment.NewLine, new[]
        {
            "Sasist Agent — diagnostyka",
            $"Wersja: {AgentConfig.AgentVersion}",
            $"Agent ID: {cfg.AgentId}",
            $"Machine ID: {cfg.MachineId}",
            $"Endpoint: {cfg.ServerUrl}",
            $"Firma: {UiCopy.CompanyName(cfg, snap)}",
            $"Online: {snap?.Online}",
            $"Logi: {AgentPaths.LogsDir}",
        }));
    }

    public void ApplyValues(UiState state) { /* settings are local prefs — no poll rebuild */ }
    public void ForceSync(UiState state) => Relayout();

    public void RefreshData() => Relayout(); // legacy alias unused
}
