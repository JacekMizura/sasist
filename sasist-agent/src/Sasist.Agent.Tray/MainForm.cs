using Sasist.Agent.Core.Config;
using Sasist.Agent.Tray.Mvp;

namespace Sasist.Agent.Tray;

/// <summary>
/// Shell view (MVP). Polling updates values only — never rebuilds page trees.
/// Navigation uses show/hide of pre-created pages (no Controls.Clear on tick).
/// </summary>
internal sealed class MainForm : Form, IShellView
{
    private readonly ConfigStore _store;
    private readonly ShellPresenter _presenter;
    private readonly Panel _sidebar;
    private readonly Panel _content;
    private readonly Panel _pairingOverlay;
    private readonly TableLayoutPanel _navHost;
    private readonly Label _connPill;
    private readonly Label _footerOrg;
    private readonly Label _footerVer;
    private readonly Dictionary<string, SasistNavItem> _nav = new();
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
        Font = Theme.FontBody;
        BackColor = Theme.Canvas;
        Icon = Branding.AppIcon;
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.None;
        DoubleBuffered = true;
        MinimumSize = new Size(1000, 640);
        ClientSize = new Size(1200, 780);

        var topBar = BuildTopBar(out _connPill);
        _sidebar = BuildSidebar(out _navHost, out _footerOrg, out _footerVer);
        _content = new Panel { Dock = DockStyle.Fill, BackColor = Theme.Canvas };
        _pairingOverlay = new Panel { Dock = DockStyle.Fill, Visible = false, BackColor = Theme.Canvas };

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

        // Polling: values only. Interval 2s — never tears down controls.
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
            if (UiPreferences.Current.Notifications)
                _tray.ShowBalloonTip(2000, "Sasist Agent", "Działa w tle.", ToolTipIcon.Info);
        };
    }

    public IPageView? CurrentPage =>
        _pages.TryGetValue(_pageId, out var c) && c is IPageView v ? v : null;

    public void SetChrome(UiState state)
    {
        UiBuffering.SetTextIfChanged(_connPill, state.ConnPill);
        UiBuffering.SetColorIfChanged(_connPill, state.ConnPillColor);
        UiBuffering.SetTextIfChanged(_footerOrg, state.Company);
        UiBuffering.SetTextIfChanged(_footerVer, state.Version);
        if (_tray.Text != state.TrayTip)
            _tray.Text = state.TrayTip;
        foreach (var n in _nav.Values)
            n.Enabled = !state.NeedsSetup;
    }

    public void SetPairingVisible(bool visible)
    {
        if (_pairingOverlay.Visible == visible) return;
        _pairingOverlay.Visible = visible;
        if (visible) _pairingOverlay.BringToFront();
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
        // Sidebar width = nav padding + longest item preferred width (icon + label).
        var maxLabel = 0;
        foreach (var it in NavItems)
            maxLabel = Math.Max(maxLabel, LayoutHelpers.MeasureTextWidth(it.Label, Theme.FontNav));
        var itemW = Math.Max(160, 16 + 28 + 12 + maxLabel + 16);
        var need = _navHost.Padding.Horizontal + itemW;
        if (_sidebar.Width != need)
            _sidebar.Width = Math.Max(Theme.SidebarMinWidth, need);
        _sidebarFitted = true;
    }

    private Panel BuildTopBar(out Label connPill)
    {
        var bar = new Panel
        {
            Dock = DockStyle.Top,
            MinimumSize = new Size(0, Theme.TopBarHeight),
            Height = Theme.TopBarHeight,
            BackColor = Theme.Surface,
            Padding = new Padding(16, 0, 16, 0),
        };
        bar.Paint += (_, e) =>
        {
            using var pen = new Pen(Theme.Border);
            e.Graphics.DrawLine(pen, 0, bar.Height - 1, bar.Width, bar.Height - 1);
        };

        var logo = new PictureBox
        {
            Image = Branding.MarkImage,
            SizeMode = PictureBoxSizeMode.Zoom,
            Dock = DockStyle.Left,
            MinimumSize = new Size(28, 28),
            MaximumSize = new Size(28, 56),
            Width = 28,
            Padding = new Padding(0, 14, 0, 14),
        };
        var title = new Label
        {
            Text = "Sasist Agent",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            Font = Theme.FontBodySemibold,
            ForeColor = Theme.TextPrimary,
            Padding = new Padding(12, 0, 12, 0),
            AutoEllipsis = true,
        };
        connPill = new Label
        {
            Text = "●  Połączono",
            AutoSize = true,
            TextAlign = ContentAlignment.MiddleRight,
            Font = Theme.FontCaptionBold,
            ForeColor = Theme.Success,
            Padding = new Padding(12, 0, 0, 0),
            Dock = DockStyle.Fill,
        };
        var pillHost = new Panel
        {
            Dock = DockStyle.Right,
            AutoSize = true,
            MinimumSize = new Size(140, Theme.TopBarHeight),
            Height = Theme.TopBarHeight,
            Padding = new Padding(8, 0, 0, 0),
        };
        pillHost.Controls.Add(connPill);

        bar.Controls.Add(title);
        bar.Controls.Add(pillHost);
        bar.Controls.Add(logo);
        return bar;
    }

    private Panel BuildSidebar(out TableLayoutPanel navHost, out Label footerOrg, out Label footerVer)
    {
        var side = new Panel
        {
            Dock = DockStyle.Left,
            Width = Theme.SidebarMinWidth, // initial; FitSidebarWidth sets from longest label
            MinimumSize = new Size(Theme.SidebarMinWidth, 0),
            BackColor = Theme.Surface,
        };
        side.Paint += (_, e) =>
        {
            using var pen = new Pen(Theme.Border);
            e.Graphics.DrawLine(pen, side.Width - 1, 0, side.Width - 1, side.Height);
        };

        var brand = new Panel { Dock = DockStyle.Top, AutoSize = true, Padding = new Padding(16, 16, 12, 12) };
        var brandRow = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            ColumnCount = 2,
            RowCount = 1,
            BackColor = Color.Transparent,
        };
        brandRow.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        brandRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        brandRow.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        var brandLogo = new PictureBox
        {
            Image = Branding.MarkImage,
            SizeMode = PictureBoxSizeMode.Zoom,
            Dock = DockStyle.Fill,
            Margin = new Padding(0, 2, 0, 2),
            MinimumSize = new Size(28, 28),
            MaximumSize = new Size(32, 32),
        };
        var brandStack = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoSize = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            Padding = new Padding(8, 0, 0, 0),
            BackColor = Color.Transparent,
        };
        brandStack.Controls.Add(new Label
        {
            Text = "Sasist",
            AutoSize = true,
            Font = Theme.FontSection,
            ForeColor = Theme.TextPrimary,
            BackColor = Color.Transparent,
            Margin = new Padding(0, 0, 0, 2),
        });
        brandStack.Controls.Add(new Label
        {
            Text = "Agent",
            AutoSize = true,
            Font = Theme.FontCaption,
            ForeColor = Theme.TextMuted,
            BackColor = Color.Transparent,
        });
        brandRow.Controls.Add(brandLogo, 0, 0);
        brandRow.Controls.Add(brandStack, 1, 0);
        brand.Controls.Add(brandRow);

        // TableLayoutPanel: one AutoSize row per nav item — no Flow stacking overlap.
        navHost = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            AutoScroll = true,
            Padding = new Padding(10, 4, 10, 8),
            BackColor = Color.Transparent,
            GrowStyle = TableLayoutPanelGrowStyle.FixedSize,
        };
        navHost.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        navHost.RowCount = NavItems.Length;
        for (var i = 0; i < NavItems.Length; i++)
        {
            var it = NavItems[i];
            navHost.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            var btn = new SasistNavItem
            {
                PageId = it.Id,
                Text = it.Label,
                IconGlyph = it.Icon,
                AccessibleName = it.Label,
                Dock = DockStyle.Fill,
                Margin = new Padding(0, 0, 0, 4),
            };
            btn.Click += (_, _) => Navigate(it.Id);
            navHost.Controls.Add(btn, 0, i);
            _nav[it.Id] = btn;
        }

        var footer = new Panel { Dock = DockStyle.Bottom, AutoSize = true, Padding = new Padding(16, 12, 12, 14) };
        footer.Paint += (_, e) =>
        {
            using var pen = new Pen(Theme.Border);
            e.Graphics.DrawLine(pen, 12, 0, Math.Max(12, footer.Width - 12), 0);
        };
        var footerStack = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Color.Transparent,
            Padding = new Padding(0, 8, 0, 0),
        };
        footerStack.Controls.Add(new Label
        {
            Text = "Połączono z:",
            AutoSize = true,
            Font = Theme.FontMeta,
            ForeColor = Theme.TextMuted,
            Margin = new Padding(0, 0, 0, 2),
        });
        footerOrg = new Label
        {
            Text = "—",
            AutoSize = true,
            Font = Theme.FontBodySemibold,
            ForeColor = Theme.TextPrimary,
            Margin = new Padding(0, 0, 0, 4),
        };
        footerVer = new Label
        {
            Text = $"v{AgentConfig.AgentVersion}",
            AutoSize = true,
            Font = Theme.FontMeta,
            ForeColor = Theme.TextFaint,
        };
        footerStack.Controls.Add(footerOrg);
        footerStack.Controls.Add(footerVer);
        footer.Controls.Add(footerStack);
        var footerOrgLabel = footerOrg;
        footer.Resize += (_, _) =>
        {
            footerOrgLabel.MaximumSize = new Size(Math.Max(80, footer.ClientSize.Width - footer.Padding.Horizontal), 0);
        };

        side.Controls.Add(navHost);
        side.Controls.Add(footer);
        side.Controls.Add(brand);
        return side;
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
        foreach (var (k, v) in _nav) v.Active = k == id;

        // Show/hide — never Clear() on navigation (avoids flicker & handle churn).
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
            if (_nav.ContainsKey(id)) Navigate(id);
        }
        catch { }
    }

    private void OnPaired()
    {
        SetPairingVisible(false);
        foreach (var n in _nav.Values) n.Enabled = true;
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
        if (MessageBox.Show(UserMessages.UnpairConfirm, "Sasist Agent", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) != DialogResult.Yes)
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
            MessageBox.Show(UserMessages.FromException(ex), "Sasist Agent", MessageBoxButtons.OK, MessageBoxIcon.Warning);
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
