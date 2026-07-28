using Sasist.Agent.Core.Config;
using Sasist.Agent.Tray.Mvp;

namespace Sasist.Agent.Tray;

/// <summary>
/// Shell view (MVP). Polling updates values only — never rebuilds page trees.
/// Visual chrome comes exclusively from the Design System.
/// </summary>
internal sealed class MainForm : Form, IShellView
{
    private readonly ConfigStore _store;
    private readonly ShellPresenter _presenter;
    private readonly SasistSidebar _sidebar;
    private readonly Panel _content;
    private readonly Panel _pairingOverlay;
    private readonly SasistStatusBadge _connPill;
    private readonly SasistHint _versionLabel;
    private readonly Dictionary<string, Control> _pages = new();
    private readonly NotifyIcon _tray;
    private readonly ContextMenuStrip _trayMenu;
    private readonly System.Windows.Forms.Timer _timer;
    private readonly bool _smokeMode;
    private string _pageId = "status";
    private bool _exit;
    private bool _sidebarFitted;

    private StatusPage? _status;
    private DevicesPage? _devices;
    private JobsPage? _jobs;
    private LogsPage? _logs;
    private DiagnosticsPage? _diag;
    private TestPage? _test;
    private SettingsPage? _settings;
    private UpdatesPage? _updates;
    private PairingPage? _pairing;

    private static readonly (string Id, string Label, string Icon)[] NavItems =
    [
        ("status", "Status", AppIcons.Status),
        ("devices", "Urządzenia", AppIcons.Devices),
        ("jobs", "Historia", AppIcons.History),
        ("logs", "Logi", AppIcons.Logs),
        ("diagnostics", "Diagnostyka", AppIcons.Diagnostics),
        ("test", "Test", AppIcons.Test),
        ("settings", "Ustawienia", AppIcons.Settings),
        ("updates", "Aktualizacje", AppIcons.Updates),
    ];

    public MainForm(ConfigStore store, bool smokeMode = false)
    {
        _store = store;
        _smokeMode = smokeMode;
        _presenter = new ShellPresenter(store, this);
        UiPreferences.Load();

        Text = "Sasist Agent";
        Font = Theme.Body;
        BackColor = Theme.Background;
        Icon = Branding.AppIcon;
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.None;
        DoubleBuffered = true;
        MinimumSize = new Size(1000, 640);
        ClientSize = new Size(1200, 780);

        var topBar = BuildTopBar(out _connPill, out _versionLabel);
        _sidebar = new SasistSidebar(NavItems);
        _sidebar.Navigated += Navigate;
        _content = new Panel { Dock = DockStyle.Fill, BackColor = Theme.Background };
        _pairingOverlay = new Panel { Dock = DockStyle.Fill, Visible = false, BackColor = Theme.Background };

        var body = new Panel { Dock = DockStyle.Fill };
        body.Controls.Add(_content);
        body.Controls.Add(_pairingOverlay);
        body.Controls.Add(_sidebar);

        Controls.Add(body);
        Controls.Add(topBar);
        UiBuffering.Enable(this);

        _trayMenu = new ContextMenuStrip();
        _trayMenu.Items.Add("Otwórz Sasist Agent", null, (_, _) => Reveal());
        _trayMenu.Items.Add("Aktualizacje", null, (_, _) => { Reveal(); Navigate("updates"); });
        _trayMenu.Items.Add("Odłącz urządzenie", null, (_, _) => Unpair());
        _trayMenu.Items.Add(new ToolStripSeparator());
        _trayMenu.Items.Add("Zamknij", null, (_, _) => { _exit = true; Close(); });
        _tray = new NotifyIcon
        {
            Text = "Sasist Agent",
            Icon = Branding.AppIcon,
            Visible = !_smokeMode,
            ContextMenuStrip = _trayMenu,
        };
        _tray.DoubleClick += (_, _) => Reveal();

        _timer = new System.Windows.Forms.Timer { Interval = 2000 };
        _timer.Tick += (_, _) =>
        {
            PollNavigateRequest();
            _presenter.Tick();
        };

        Load += (_, _) => FitSidebarWidth();
        Shown += (_, _) =>
        {
            FitSidebarWidth();
            EnsurePages();
            Navigate("status");
            _presenter.SyncCurrentPage();
            if (!_smokeMode) _timer.Start();
        };
        FormClosing += (_, e) =>
        {
            if (_smokeMode) return;
            if (_exit || e.CloseReason != CloseReason.UserClosing) return;
            if (!UiPreferences.Current.RunInBackground) return;
            e.Cancel = true;
            Hide();
            SasistNotification.Balloon(_tray, "Sasist Agent", "Działa w tle.");
        };
    }

    public IPageView? CurrentPage =>
        _pages.TryGetValue(_pageId, out var c) && c is IPageView v ? v : null;

    public void SetChrome(UiState state)
    {
        if (state.NeedsSetup)
            _connPill.SetPairing();
        else
            _connPill.SetOnline(state.Online);
        _sidebar.SetFooter(state.Company, state.Version);
        if (_versionLabel.Text != state.Version)
            _versionLabel.Text = state.Version;
        if (_tray.Text != state.TrayTip)
            _tray.Text = state.TrayTip;
        _sidebar.SetEnabled(!state.NeedsSetup);
    }

    public void SetPairingVisible(bool visible)
    {
        if (_pairingOverlay.Visible == visible) return;
        _pairingOverlay.Visible = visible;
        // Full-screen onboarding — hide shell chrome so it does not look like nested WinForms panels.
        _sidebar.Visible = !visible;
        if (visible)
        {
            _pairingOverlay.BringToFront();
            _connPill.SetPairing();
        }
    }

    protected override void OnDpiChanged(DpiChangedEventArgs e)
    {
        base.OnDpiChanged(e);
        _sidebarFitted = false;
        FitSidebarWidth();
        PerformLayout();
    }

    private void FitSidebarWidth()
    {
        _sidebar.FitWidth(NavItems);
        _sidebarFitted = true;
    }

    private Panel BuildTopBar(out SasistStatusBadge connPill, out SasistHint versionLabel)
    {
        var bar = new Panel
        {
            Dock = DockStyle.Top,
            MinimumSize = new Size(0, Theme.TopBarHeight),
            Height = Theme.TopBarHeight,
            BackColor = Theme.Surface,
            Padding = new Padding(Theme.Space.Xl, 0, Theme.Space.Xl, 0),
        };
        // Hairline only — no heavy chrome bar.
        bar.Paint += (_, e) =>
        {
            using var pen = new Pen(Theme.Border);
            e.Graphics.DrawLine(pen, 0, bar.Height - 1, bar.Width, bar.Height - 1);
        };

        var grid = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 4,
            RowCount = 1,
            BackColor = Color.Transparent,
        };
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        grid.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));

        var logo = new PictureBox
        {
            Image = Branding.MarkImage,
            SizeMode = PictureBoxSizeMode.Zoom,
            MinimumSize = new Size(26, 26),
            MaximumSize = new Size(26, 26),
            Anchor = AnchorStyles.None,
            Margin = new Padding(0, 0, Theme.Space.Md, 0),
        };
        var title = new SasistBody
        {
            Text = "Sasist Agent",
            Font = Theme.BodySemibold,
            ForeColor = Theme.Text,
            AutoSize = true,
            Anchor = AnchorStyles.Left,
            Margin = new Padding(0, 0, Theme.Space.Lg, 0),
            AutoEllipsis = true,
        };
        connPill = new SasistStatusBadge();
        connPill.SetPairing();
        connPill.Anchor = AnchorStyles.None;
        connPill.Margin = new Padding(Theme.Space.Md, 0, Theme.Space.Md, 0);

        versionLabel = new SasistHint
        {
            Text = $"v{AgentConfig.AgentVersion}",
            Anchor = AnchorStyles.None,
            Margin = new Padding(0),
        };

        var right = new FlowLayoutPanel
        {
            AutoSize = true,
            WrapContents = false,
            FlowDirection = FlowDirection.LeftToRight,
            BackColor = Color.Transparent,
            Anchor = AnchorStyles.Right,
            Margin = Padding.Empty,
        };
        right.Controls.Add(connPill);
        right.Controls.Add(versionLabel);

        grid.Controls.Add(logo, 0, 0);
        grid.Controls.Add(title, 1, 0);
        grid.Controls.Add(new Panel { Dock = DockStyle.Fill, BackColor = Color.Transparent }, 2, 0);
        grid.Controls.Add(right, 3, 0);
        bar.Controls.Add(grid);
        return bar;
    }

    private void EnsurePages()
    {
        if (_pages.Count > 0) return;

        _status = new StatusPage(() => Navigate("devices"));
        _devices = new DevicesPage();
        _devices.ForceSyncRequested += () => _presenter.SyncCurrentPage();
        _jobs = new JobsPage(_store);
        _logs = new LogsPage();
        _diag = new DiagnosticsPage(_store);
        _test = new TestPage(_store);
        _settings = new SettingsPage(_store, Unpair);
        _updates = new UpdatesPage();
        _pairing = new PairingPage(_store, OnPaired);

        void add(string id, Control page)
        {
            page.Dock = DockStyle.Fill;
            page.Visible = false;
            _content.Controls.Add(page);
            _pages[id] = page;
            UiBuffering.Enable(page);
        }

        add("status", _status);
        add("devices", _devices);
        add("jobs", _jobs);
        add("logs", _logs);
        add("diagnostics", _diag);
        add("test", _test);
        add("settings", _settings);
        add("updates", _updates);

        _pairing.Dock = DockStyle.Fill;
        _pairingOverlay.Controls.Add(_pairing);
    }

    internal void Navigate(string id)
    {
        EnsurePages();
        if (!_smokeMode) Reveal();
        if (!_pages.ContainsKey(id)) id = "status";
        _pageId = id;
        _sidebar.SetActive(id);

        foreach (var (k, page) in _pages)
            page.Visible = k == id;
        _pages[id].BringToFront();

        if (id == "logs")
            _logs!.ForceSync(_presenter.Current);
        else
            _presenter.SyncCurrentPage();

        if (!_sidebarFitted) FitSidebarWidth();
    }

    private void PollNavigateRequest()
    {
        try
        {
            AgentPaths.EnsureDirectories();
            var path = Path.Combine(AgentPaths.ProgramDataRoot, "ui-navigate.request");
            if (!File.Exists(path)) return;
            var id = File.ReadAllText(path).Trim();
            File.Delete(path);
            if (_sidebar.Items.ContainsKey(id)) Navigate(id);
        }
        catch { }
    }

    private void OnPaired()
    {
        SetPairingVisible(false);
        _sidebar.SetEnabled(true);
        Navigate("status");
    }

    private void Reveal()
    {
        Show();
        WindowState = FormWindowState.Normal;
        Activate();
        BringToFront();
    }

    private void Unpair()
    {
        if (SasistDialog.Confirm(this, UserMessages.UnpairConfirm) != DialogResult.Yes)
            return;
        try
        {
            try
            {
                using var sc = new System.ServiceProcess.ServiceController(TrayApplicationContext.ServiceName);
                if (sc.Status is System.ServiceProcess.ServiceControllerStatus.Running or System.ServiceProcess.ServiceControllerStatus.StartPending)
                {
                    sc.Stop();
                    sc.WaitForStatus(System.ServiceProcess.ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(20));
                }
            }
            catch { }
            _store.ClearPairing();
            Reveal();
            _presenter.SyncCurrentPage();
        }
        catch (Exception ex)
        {
            SasistDialog.Warn(this, UserMessages.FromException(ex));
        }
    }

    internal List<LayoutAuditor.Issue> AuditCurrentPage() => LayoutAuditor.Audit(this);
    internal long RebuildCount => UiMetrics.Rebuilds;
    internal long ValueUpdateCount => UiMetrics.ValueUpdates;

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _timer.Stop();
            _timer.Dispose();
            _tray.Visible = false;
            _tray.Dispose();
            _trayMenu.Dispose();
        }
        base.Dispose(disposing);
    }
}
