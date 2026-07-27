using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

/// <summary>Primary desktop window — management center for Sasist Agent.</summary>
internal sealed class MainForm : Form
{
    private readonly ConfigStore _store;
    private readonly Panel _content;
    private readonly Panel _pairingOverlay;
    private readonly Dictionary<string, Button> _nav = new();
    private readonly NotifyIcon _tray;
    private readonly ContextMenuStrip _trayMenu;
    private readonly ToolStripMenuItem _trayStatus;
    private readonly ToolStripMenuItem _trayOrg;
    private readonly System.Windows.Forms.Timer _timer;
    private string _currentPage = "status";
    private bool _exitRequested;

    private StatusPage? _statusPage;
    private DevicesPage? _devicesPage;
    private JobsPage? _jobsPage;
    private LogsPage? _logsPage;
    private DiagnosticsPage? _diagnosticsPage;
    private PairingPage? _pairingPage;

    public MainForm(ConfigStore store)
    {
        _store = store;

        Text = "Sasist Agent";
        Width = 920;
        Height = 640;
        MinimumSize = new Size(780, 520);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(245, 246, 248);
        Font = new Font("Segoe UI", 10f);
        Icon = Branding.AppIcon;
        ShowInTaskbar = true;

        var sidebar = new Panel
        {
            Dock = DockStyle.Left,
            Width = 200,
            BackColor = Color.FromArgb(28, 28, 32),
        };

        var brand = new Label
        {
            Text = "Sasist Agent",
            Left = 0,
            Top = 0,
            Width = 200,
            Height = 56,
            ForeColor = Color.White,
            Font = new Font("Segoe UI Semibold", 13f),
            TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(16, 0, 0, 0),
        };
        sidebar.Controls.Add(brand);

        var navItems = new[]
        {
            ("status", "Status"),
            ("devices", "Urządzenia"),
            ("jobs", "Zadania"),
            ("logs", "Logi"),
            ("diagnostics", "Diagnostyka"),
        };
        var y = 64;
        foreach (var (id, label) in navItems)
        {
            var btn = CreateNavButton(label, id);
            btn.Dock = DockStyle.None;
            btn.Left = 0;
            btn.Top = y;
            btn.Width = 200;
            btn.Height = 40;
            sidebar.Controls.Add(btn);
            _nav[id] = btn;
            y += 44;
        }

        _content = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.FromArgb(245, 246, 248),
            Padding = new Padding(20),
        };

        _pairingOverlay = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.FromArgb(245, 246, 248),
            Visible = false,
        };

        Controls.Add(_content);
        Controls.Add(_pairingOverlay);
        Controls.Add(sidebar);

        _trayStatus = new ToolStripMenuItem(UiCopy.TrayConnection(false)) { Enabled = false };
        _trayOrg = new ToolStripMenuItem("Połączono z: —") { Enabled = false };
        _trayMenu = new ContextMenuStrip();
        _trayMenu.Items.Add(new ToolStripMenuItem("Sasist Agent") { Enabled = false, Font = new Font("Segoe UI Semibold", 9f) });
        _trayMenu.Items.Add(_trayStatus);
        _trayMenu.Items.Add(_trayOrg);
        _trayMenu.Items.Add(new ToolStripSeparator());
        _trayMenu.Items.Add("Otwórz Sasist Agent", null, (_, _) => ShowMain());
        _trayMenu.Items.Add("Sprawdź aktualizacje", null, (_, _) =>
            MessageBox.Show(UserMessages.UpToDate, "Aktualizacje", MessageBoxButtons.OK, MessageBoxIcon.Information));
        _trayMenu.Items.Add("Odłącz urządzenie", null, (_, _) => Unpair());
        _trayMenu.Items.Add("Uruchom ponownie usługę", null, (_, _) => RestartService());
        _trayMenu.Items.Add(new ToolStripSeparator());
        _trayMenu.Items.Add("Zamknij", null, (_, _) =>
        {
            _exitRequested = true;
            Close();
        });

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

        Shown += (_, _) =>
        {
            EnsurePages();
            RefreshChrome();
            Navigate("status");
            _timer.Start();
        };

        FormClosing += OnFormClosing;
    }

    private Button CreateNavButton(string text, string id)
    {
        var btn = new Button
        {
            Text = text,
            FlatStyle = FlatStyle.Flat,
            ForeColor = Color.FromArgb(210, 210, 215),
            BackColor = Color.FromArgb(28, 28, 32),
            TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(16, 0, 0, 0),
            Cursor = Cursors.Hand,
            Tag = id,
        };
        btn.FlatAppearance.BorderSize = 0;
        btn.FlatAppearance.MouseOverBackColor = Color.FromArgb(45, 45, 52);
        btn.Click += (_, _) => Navigate(id);
        return btn;
    }

    private void EnsurePages()
    {
        _statusPage ??= new StatusPage(_store, () => Navigate("devices"));
        _devicesPage ??= new DevicesPage();
        _jobsPage ??= new JobsPage();
        _logsPage ??= new LogsPage();
        _diagnosticsPage ??= new DiagnosticsPage(_store);
        _pairingPage ??= new PairingPage(_store, OnPaired);
        if (_pairingOverlay.Controls.Count == 0)
        {
            _pairingPage.Dock = DockStyle.Fill;
            _pairingOverlay.Controls.Add(_pairingPage);
        }
    }

    private void Navigate(string id)
    {
        EnsurePages();
        _currentPage = id;
        foreach (var (key, btn) in _nav)
        {
            var active = key == id;
            btn.BackColor = active ? Color.FromArgb(249, 115, 22) : Color.FromArgb(28, 28, 32);
            btn.ForeColor = active ? Color.White : Color.FromArgb(210, 210, 215);
        }

        Control page = id switch
        {
            "devices" => _devicesPage!,
            "jobs" => _jobsPage!,
            "logs" => _logsPage!,
            "diagnostics" => _diagnosticsPage!,
            _ => _statusPage!,
        };

        _content.Controls.Clear();
        page.Dock = DockStyle.Fill;
        _content.Controls.Add(page);
        page.Refresh();
    }

    private void RefreshChrome()
    {
        var cfg = _store.Load();
        var needsSetup = cfg.NeedsSetup;
        _pairingOverlay.Visible = needsSetup;
        _pairingOverlay.BringToFront();
        foreach (Control c in Controls)
        {
            if (c != _pairingOverlay && c is Panel { Dock: DockStyle.Left } or Panel { Name: _ })
                continue;
        }

        // Disable nav while unpaired — only pairing overlay visible
        foreach (var btn in _nav.Values)
            btn.Enabled = !needsSetup;

        var snap = AgentStatusStore.Read();
        var serviceRunning = ServiceHelper.IsRunning(TrayApplicationContext.ServiceName);
        var connected = !needsSetup && serviceRunning && (snap?.Online ?? false);
        var org = UiCopy.CompanyName(cfg, snap);
        _trayStatus.Text = UiCopy.TrayConnection(connected);
        _trayStatus.ForeColor = connected ? Color.FromArgb(30, 140, 60) : Color.FromArgb(160, 60, 60);
        _trayOrg.Text = $"Połączono z: {org}";
        _tray.Text = connected ? "Sasist Agent — Połączono" : "Sasist Agent — Brak połączenia";

        if (!needsSetup)
        {
            _statusPage?.RefreshData();
            if (_currentPage == "devices") _devicesPage?.RefreshData();
            if (_currentPage == "jobs") _jobsPage?.RefreshData();
            if (_currentPage == "logs") _logsPage?.RefreshData();
            if (_currentPage == "diagnostics") _diagnosticsPage?.RefreshData();
        }
    }

    private void OnPaired()
    {
        _pairingOverlay.Visible = false;
        foreach (var btn in _nav.Values)
            btn.Enabled = true;
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

        // Hide to tray — product stays running
        e.Cancel = true;
        Hide();
        _tray.ShowBalloonTip(2500, "Sasist Agent", "Działa w tle. Kliknij dwukrotnie ikonę, aby otworzyć.", ToolTipIcon.Info);
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
        if (confirm != DialogResult.Yes)
            return;

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
            catch
            {
                // continue
            }

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
            _timer.Stop();
            _timer.Dispose();
            _tray.Visible = false;
            _tray.Dispose();
            _trayMenu.Dispose();
        }
        base.Dispose(disposing);
    }
}
