using Microsoft.Win32;
using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

internal sealed class SettingsPage : UserControl, IRefreshablePage
{
    private readonly ConfigStore _store;
    private readonly Action _unpair;
    private readonly Action _showMain;
    private CheckBox _startWin = null!;
    private CheckBox _background = null!;
    private CheckBox _notify = null!;
    private CheckBox _autoUpdate = null!;

    public SettingsPage(ConfigStore store, Action unpair, Action showMain)
    {
        _store = store;
        _unpair = unpair;
        _showMain = showMain;
        Dock = DockStyle.Fill;
        BackColor = Color.Transparent;
        Controls.Add(new PageHeader("Ustawienia", "Zachowanie aplikacji na tym komputerze"));

        var scroll = new Panel { Dock = DockStyle.Fill, AutoScroll = true, BackColor = Color.Transparent };
        var card = new RoundedCard { Left = 0, Top = 8, Width = 640, Height = 420 };

        _startWin = Toggle(card, "Uruchamiaj z Windows", 24, UiPreferences.Current.StartWithWindows, v =>
        {
            UiPreferences.Current.StartWithWindows = v;
            UiPreferences.Save();
            SetRunKey(v);
        });
        _background = Toggle(card, "Uruchamiaj w tle (ikona przy zegarze)", 76, UiPreferences.Current.RunInBackground, v =>
        {
            UiPreferences.Current.RunInBackground = v;
            UiPreferences.Save();
        });
        _notify = Toggle(card, "Powiadomienia", 128, UiPreferences.Current.Notifications, v =>
        {
            UiPreferences.Current.Notifications = v;
            UiPreferences.Save();
        });
        _autoUpdate = Toggle(card, "Automatyczne aktualizacje", 180, UiPreferences.Current.AutoUpdates, v =>
        {
            UiPreferences.Current.AutoUpdates = v;
            UiPreferences.Save();
        });

        var logsBtn = new ModernButton { Text = "Otwórz folder logów", Left = 24, Top = 240, Width = 200 };
        logsBtn.Click += (_, _) =>
        {
            AgentPaths.EnsureDirectories();
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = "explorer.exe",
                Arguments = $"\"{AgentPaths.LogsDir}\"",
                UseShellExecute = true,
            });
        };

        var exportBtn = new ModernButton { Text = "Eksport diagnostyki", Left = 236, Top = 240, Width = 180 };
        exportBtn.Click += (_, _) => ExportDiagnostics();

        var resetBtn = new ModernButton { Text = "Reset połączenia", Danger = true, Left = 24, Top = 300, Width = 200 };
        resetBtn.Click += (_, _) =>
        {
            _showMain();
            _unpair();
        };

        var unpairBtn = new ModernButton { Text = "Odłącz urządzenie", Left = 236, Top = 300, Width = 180 };
        unpairBtn.Click += (_, _) =>
        {
            _showMain();
            _unpair();
        };

        var themeBtn = new ModernButton { Text = "Przełącz motyw jasny / ciemny", Left = 24, Top = 360, Width = 280 };
        themeBtn.Click += (_, _) => Theme.Toggle();

        card.Controls.AddRange([logsBtn, exportBtn, resetBtn, unpairBtn, themeBtn]);
        scroll.Controls.Add(card);
        Controls.Add(scroll);
        Theme.Changed += () => card.Invalidate();
        Resize += (_, _) => card.Width = Math.Max(520, ClientSize.Width - 8);
    }

    private static CheckBox Toggle(RoundedCard card, string text, int top, bool initial, Action<bool> onChange)
    {
        var cb = new CheckBox
        {
            Text = text,
            Left = 24,
            Top = top,
            Width = 560,
            Height = 28,
            Checked = initial,
            Font = Theme.FontUi,
            ForeColor = Theme.TextPrimary,
            BackColor = Color.Transparent,
            FlatStyle = FlatStyle.Flat,
            Cursor = Cursors.Hand,
        };
        cb.CheckedChanged += (_, _) => onChange(cb.Checked);
        card.Controls.Add(cb);
        Theme.Changed += () => cb.ForeColor = Theme.TextPrimary;
        return cb;
    }

    private static void SetRunKey(bool enable)
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true);
            if (key is null) return;
            const string name = "SasistAgentTray";
            if (enable)
            {
                var exe = Application.ExecutablePath;
                key.SetValue(name, $"\"{exe}\"");
            }
            else
            {
                key.DeleteValue(name, false);
            }
        }
        catch
        {
            // ignore
        }
    }

    private void ExportDiagnostics()
    {
        var cfg = _store.Load();
        var snap = AgentStatusStore.Read();
        using var dlg = new SaveFileDialog
        {
            Filter = "Plik tekstowy (*.txt)|*.txt",
            FileName = $"sasist-agent-diagnostyka-{DateTime.Now:yyyyMMdd-HHmm}.txt",
        };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        var text = string.Join(Environment.NewLine, new[]
        {
            "Sasist Agent — eksport diagnostyki",
            $"Wersja: {AgentConfig.AgentVersion}",
            $"Agent ID: {cfg.AgentId}",
            $"Machine ID: {cfg.MachineId}",
            $"Endpoint: {cfg.ServerUrl}",
            $"Firma: {UiCopy.CompanyName(cfg, snap)}",
            $"Online: {snap?.Online}",
            $"Sync: {UiCopy.RelativeSync(snap?.UpdatedAt)}",
            $"Logi: {AgentPaths.LogsDir}",
        });
        File.WriteAllText(dlg.FileName, text);
    }

    public void RefreshData()
    {
        _startWin.Checked = UiPreferences.Current.StartWithWindows;
        _background.Checked = UiPreferences.Current.RunInBackground;
        _notify.Checked = UiPreferences.Current.Notifications;
        _autoUpdate.Checked = UiPreferences.Current.AutoUpdates;
    }

    public override void Refresh()
    {
        base.Refresh();
        RefreshData();
    }
}
