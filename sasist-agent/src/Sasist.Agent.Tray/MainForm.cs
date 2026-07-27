using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

internal sealed class MainForm : Form
{
    private readonly ConfigStore _store;
    private readonly Panel _sidebar;
    private readonly Panel _contentHost;
    private readonly Panel _content;
    private readonly Panel _pairingOverlay;
    private readonly Dictionary<string, NavItemButton> _nav = new();
    private readonly NotifyIcon _tray;
    private readonly ContextMenuStrip _trayMenu;
    private readonly ToolStripMenuItem _trayStatus;
    private readonly ToolStripMenuItem _trayOrg;
    private readonly System.Windows.Forms.Timer _timer;
    private readonly System.Windows.Forms.Timer _fadeTimer;
    private string _currentPage = "status";
    private bool _exitRequested;
    private int _fadeStep;

    private StatusPage? _statusPage;
    private DevicesPage? _devicesPage;
    private JobsPage? _jobsPage;
    private LogsPage? _logsPage;
    private DiagnosticsPage? _diagnosticsPage;
    private TestPage? _testPage;
    private SettingsPage? _settingsPage;
    private UpdatesPage? _updatesPage;
    private PairingPage? _pairingPage;

    public MainForm(ConfigStore store)
    {
        _store = store;
        UiPreferences.Load();
        Theme.LoadFromPreferences();

        Text = "Sasist Agent";
        Width = 1080;
        Height = 720;
        MinimumSize = new Size(900, 600);
        StartPosition = FormStartPosition.CenterScreen;
        Font = Theme.FontUi;
        Icon = Branding.AppIcon;
        ShowInTaskbar = true;
        DoubleBuffered = true;

        _sidebar = new Panel
        {
            Dock = DockStyle.Left,
            Width = 236,
        };
        _sidebar.Paint += PaintSidebar;

        BuildSidebar();

        _contentHost = new Panel { Dock = DockStyle.Fill };
        _content = new Panel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(28, 20, 28, 24),
        };
        _contentHost.Controls.Add(_content);

        _pairingOverlay = new Panel { Dock = DockStyle.Fill, Visible = false };

        Controls.Add(_contentHost);
        Controls.Add(_pairingOverlay);
        Controls.Add(_sidebar);

        _trayStatus = new ToolStripMenuItem(UiCopy.TrayConnection(false)) { Enabled = false };
        _trayOrg = new ToolStripMenuItem("Połączono z: —") { Enabled = false };
        _trayMenu = new ContextMenuStrip();
        _trayMenu.Items.Add(new ToolStripMenuItem("Sasist Agent") { Enabled = false, Font = Theme.FontUiSemibold });
        _trayMenu.Items.Add(_trayStatus);
        _trayMenu.Items.Add(_trayOrg);
        _trayMenu.Items.Add(new ToolStripSeparator());
        _trayMenu.Items.Add("Otwórz Sasist Agent", null, (_, _) => ShowMain());
        _trayMenu.Items.Add("Sprawdź aktualizacje", null, (_, _) => Navigate("updates"));
        _trayMenu.Items.Add("Odłącz urządzenie", null, (_, _) => Unpair());
        _trayMenu.Items.Add("Uruchom ponownie usługę", null, (_, _) => RestartService());
        _trayMenu.Items.Add(new ToolStripSeparator());
        _trayMenu.Items.Add("Zamknij", null, (_, _) => { _exitRequested = true; Close(); });

        _tray = new NotifyIcon
        {
            Text = "Sasist Agent",
            Icon = Branding.AppIcon,
            Visible = true,
            ContextMenuStrip = _trayMenu,
        };
        _tray.DoubleClick += (_, _) => ShowMain();

        _timer = new System.Windows.Forms.Timer { Interval = 2500 };
        _timer.Tick += (_, _) => RefreshChrome();

        _fadeTimer = new System.Windows.Forms.Timer { Interval = 16 };
        _fadeTimer.Tick += (_, _) => AnimateFade();

        Theme.Changed += ApplyTheme;
        ApplyTheme();

        Shown += (_, _) =>
        {
            EnsurePages();
            RefreshChrome();
            Navigate("status", animate: false);
            _timer.Start();
        };

        FormClosing += OnFormClosing;
    }

    private void BuildSidebar()
    {
        _sidebar.Controls.Clear();

        var brandWrap = new Panel { Left = 0, Top = 0, Width = 236, Height = 72, BackColor = Color.Transparent };
        var logo = new PictureBox
        {
            Image = Branding.MarkImage,
            SizeMode = PictureBoxSizeMode.Zoom,
            Left = 20,
            Top = 20,
            Width = 28,
            Height = 28,
        };
        var brand = new Label
        {
            Text = "Sasist Agent",
            Left = 56,
            Top = 22,
            Width = 160,
            Height = 24,
            Font = new Font("Segoe UI Semibold", 12.5f),
            ForeColor = Theme.TextPrimary,
            BackColor = Color.Transparent,
        };
        brandWrap.Controls.Add(logo);
        brandWrap.Controls.Add(brand);
        _sidebar.Controls.Add(brandWrap);

        var items = new (string Id, string Label, string Icon)[]
        {
            ("status", "Status", AppIcons.Status),
            ("devices", "Urządzenia", AppIcons.Devices),
            ("jobs", "Historia wydruków", AppIcons.History),
            ("logs", "Logi", AppIcons.Logs),
            ("diagnostics", "Diagnostyka", AppIcons.Diagnostics),
            ("test", "Test", AppIcons.Test),
            ("settings", "Ustawienia", AppIcons.Settings),
            ("updates", "Aktualizacje", AppIcons.Updates),
        };

        var y = 80;
        foreach (var item in items)
        {
            var btn = new NavItemButton
            {
                PageId = item.Id,
                Text = item.Label,
                IconGlyph = item.Icon,
                Left = 0,
                Top = y,
                Width = 236,
                Height = 40,
            };
            btn.Click += (_, _) => Navigate(item.Id);
            _sidebar.Controls.Add(btn);
            _nav[item.Id] = btn;
            y += 42;
        }

        var themeBtn = new ModernButton
        {
            Text = "  Motyw jasny / ciemny",
            Ghost = true,
            Left = 16,
            Width = 204,
            Height = 36,
            Anchor = AnchorStyles.Bottom | AnchorStyles.Left,
            Top = Height > 100 ? Height - 56 : 640,
        };
        themeBtn.Click += (_, _) => Theme.Toggle();
        _sidebar.Controls.Add(themeBtn);
        _sidebar.Resize += (_, _) =>
        {
            themeBtn.Top = _sidebar.Height - 52;
            brand.ForeColor = Theme.TextPrimary;
        };
        themeBtn.Top = _sidebar.Height - 52;
    }

    private void PaintSidebar(object? sender, PaintEventArgs e)
    {
        e.Graphics.Clear(Theme.SidebarBg);
        using var pen = new Pen(Theme.SidebarBorder);
        e.Graphics.DrawLine(pen, _sidebar.Width - 1, 0, _sidebar.Width - 1, _sidebar.Height);
    }

    private void ApplyTheme()
    {
        BackColor = Theme.WindowBg;
        _content.BackColor = Theme.WindowBg;
        _contentHost.BackColor = Theme.WindowBg;
        _pairingOverlay.BackColor = Theme.WindowBg;
        _sidebar.Invalidate();
        foreach (Control c in _sidebar.Controls)
        {
            if (c is Label l) l.ForeColor = Theme.TextPrimary;
            if (c is ModernButton b) b.ApplyColors();
        }
        Invalidate(true);
    }

    private void EnsurePages()
    {
        _statusPage ??= new StatusPage(_store, () => Navigate("devices"));
        _devicesPage ??= new DevicesPage();
        _jobsPage ??= new JobsPage();
        _logsPage ??= new LogsPage();
        _diagnosticsPage ??= new DiagnosticsPage(_store);
        _testPage ??= new TestPage(_store);
        _settingsPage ??= new SettingsPage(_store, Unpair, ShowMain);
        _updatesPage ??= new UpdatesPage();
        _pairingPage ??= new PairingPage(_store, OnPaired);
        if (_pairingOverlay.Controls.Count == 0)
        {
            _pairingPage.Dock = DockStyle.Fill;
            _pairingOverlay.Controls.Add(_pairingPage);
        }
    }

    private void Navigate(string id, bool animate = true)
    {
        EnsurePages();
        ShowMain();
        _currentPage = id;
        foreach (var (key, btn) in _nav)
            btn.Active = key == id;

        Control page = id switch
        {
            "devices" => _devicesPage!,
            "jobs" => _jobsPage!,
            "logs" => _logsPage!,
            "diagnostics" => _diagnosticsPage!,
            "test" => _testPage!,
            "settings" => _settingsPage!,
            "updates" => _updatesPage!,
            _ => _statusPage!,
        };

        _content.Controls.Clear();
        page.Dock = DockStyle.Fill;
        _content.Controls.Add(page);
        if (page is IRefreshablePage rp) rp.RefreshData();
        else page.Refresh();

        if (animate)
        {
            _content.OpacitySafeSet(0.35);
            _fadeStep = 0;
            _fadeTimer.Start();
        }
    }

    private void AnimateFade()
    {
        _fadeStep++;
        var t = Math.Min(1f, _fadeStep / 8f);
        _content.OpacitySafeSet(0.35 + 0.65 * t);
        if (t >= 1f) _fadeTimer.Stop();
    }

    private void RefreshChrome()
    {
        var cfg = _store.Load();
        var needsSetup = cfg.NeedsSetup;
        _pairingOverlay.Visible = needsSetup;
        if (needsSetup) _pairingOverlay.BringToFront();
        foreach (var btn in _nav.Values)
            btn.Enabled = !needsSetup;

        var snap = AgentStatusStore.Read();
        var serviceRunning = ServiceHelper.IsRunning(TrayApplicationContext.ServiceName);
        var connected = !needsSetup && serviceRunning && (snap?.Online ?? false);
        var org = UiCopy.CompanyName(cfg, snap);
        _trayStatus.Text = UiCopy.TrayConnection(connected);
        _trayOrg.Text = $"Połączono z: {org}";
        _tray.Text = connected ? "Sasist Agent — Połączono" : "Sasist Agent — Brak połączenia";

        if (!needsSetup && _content.Controls.Count > 0 && _content.Controls[0] is IRefreshablePage rp)
            rp.RefreshData();
    }

    private void OnPaired()
    {
        _pairingOverlay.Visible = false;
        foreach (var btn in _nav.Values) btn.Enabled = true;
        Navigate("status");
        RefreshChrome();
    }

    private void ShowMain()
    {
        Show();
        WindowState = FormWindowState.Normal;
        Activate();
        BringToFront();
    }

    private void OnFormClosing(object? sender, FormClosingEventArgs e)
    {
        if (_exitRequested || e.CloseReason != CloseReason.UserClosing)
            return;
        if (!UiPreferences.Current.RunInBackground)
            return;
        e.Cancel = true;
        Hide();
        if (UiPreferences.Current.Notifications)
            _tray.ShowBalloonTip(2200, "Sasist Agent", "Działa w tle. Kliknij ikonę, aby otworzyć.", ToolTipIcon.Info);
    }

    private void RestartService()
    {
        try
        {
            ServiceHelper.Restart(TrayApplicationContext.ServiceName);
            MessageBox.Show(UserMessages.ServiceRestarted, "Sasist Agent", MessageBoxButtons.OK, MessageBoxIcon.Information);
            RefreshChrome();
        }
        catch
        {
            MessageBox.Show(UserMessages.RestartFailed, "Sasist Agent", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void Unpair()
    {
        var confirm = MessageBox.Show(
            UserMessages.UnpairConfirm,
            "Sasist Agent",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Question,
            MessageBoxDefaultButton.Button2);
        if (confirm != DialogResult.Yes) return;

        try
        {
            try
            {
                using var sc = new System.ServiceProcess.ServiceController(TrayApplicationContext.ServiceName);
                if (sc.Status is System.ServiceProcess.ServiceControllerStatus.Running
                    or System.ServiceProcess.ServiceControllerStatus.StartPending)
                {
                    sc.Stop();
                    sc.WaitForStatus(System.ServiceProcess.ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(20));
                }
            }
            catch { /* continue */ }

            _store.ClearPairing();
            ShowMain();
            RefreshChrome();
        }
        catch (Exception ex)
        {
            MessageBox.Show(UserMessages.FromException(ex), "Sasist Agent", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            Theme.Changed -= ApplyTheme;
            _timer.Stop();
            _timer.Dispose();
            _fadeTimer.Stop();
            _fadeTimer.Dispose();
            _tray.Visible = false;
            _tray.Dispose();
            _trayMenu.Dispose();
        }
        base.Dispose(disposing);
    }
}

internal interface IRefreshablePage
{
    void RefreshData();
}

internal static class ControlOpacityExt
{
    /// <summary>WinForms has no Opacity on Panel — simulate with subtle BackColor blend.</summary>
    public static void OpacitySafeSet(this Panel panel, double opacity)
    {
        var bg = Theme.WindowBg;
        var mix = (int)(255 * Math.Clamp(opacity, 0, 1));
        panel.BackColor = Color.FromArgb(mix, bg.R, bg.G, bg.B);
    }
}
