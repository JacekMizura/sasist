using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

internal sealed class StatusPage : UserControl, IRefreshablePage
{
    private readonly ConfigStore _store;
    private readonly Label _connIcon;
    private readonly Label _connText;
    private readonly Label _company;
    private readonly Label _computer;
    private readonly Label _devices;
    private readonly Label _ready;
    private readonly Label _sync;
    private readonly RoundedCard _hero;
    private readonly RoundedCard _grid;

    public StatusPage(ConfigStore store, Action openDevices)
    {
        _store = store;
        Dock = DockStyle.Fill;
        BackColor = Color.Transparent;

        var header = new PageHeader("Status", "Stan połączenia z Sasist na tym komputerze");
        Controls.Add(header);

        var scroll = new Panel { Dock = DockStyle.Fill, AutoScroll = true, BackColor = Color.Transparent };

        _hero = new RoundedCard { Left = 0, Top = 8, Width = 720, Height = 88 };
        _connIcon = new Label
        {
            Text = AppIcons.Connected,
            Font = Theme.Icon(22f),
            Left = 24,
            Top = 28,
            Width = 36,
            Height = 32,
            BackColor = Color.Transparent,
        };
        _connText = new Label
        {
            Left = 68,
            Top = 28,
            Width = 600,
            Height = 32,
            Font = new Font("Segoe UI Semibold", 16f),
            BackColor = Color.Transparent,
        };
        _hero.Controls.Add(_connIcon);
        _hero.Controls.Add(_connText);

        _grid = new RoundedCard { Left = 0, Top = 112, Width = 720, Height = 320 };
        AddMetric(_grid, AppIcons.Company, "Firma", out _company, 24);
        AddMetric(_grid, AppIcons.Computer, "Komputer", out _computer, 84);
        AddMetric(_grid, AppIcons.Devices, "Urządzenia", out _devices, 144, openDevices);
        AddMetric(_grid, AppIcons.Ready, "Status", out _ready, 204);
        AddMetric(_grid, AppIcons.Sync, "Ostatnia synchronizacja", out _sync, 264);

        scroll.Controls.Add(_hero);
        scroll.Controls.Add(_grid);
        Controls.Add(scroll);
        Controls.SetChildIndex(scroll, 0);

        Theme.Changed += ApplyTheme;
        ApplyTheme();
        Resize += (_, _) =>
        {
            var w = Math.Max(480, ClientSize.Width - 8);
            _hero.Width = w;
            _grid.Width = w;
        };
    }

    private static void AddMetric(RoundedCard card, string icon, string caption, out Label value, int top, Action? click = null)
    {
        var ic = new Label
        {
            Text = icon,
            Font = Theme.Icon(14f),
            Left = 24,
            Top = top + 8,
            Width = 28,
            Height = 24,
            ForeColor = Theme.Accent,
            BackColor = Color.Transparent,
        };
        var cap = new Label
        {
            Text = caption,
            Left = 56,
            Top = top,
            Width = 400,
            Height = 18,
            Font = Theme.FontCaption,
            ForeColor = Theme.TextMuted,
            BackColor = Color.Transparent,
            Cursor = click is null ? Cursors.Default : Cursors.Hand,
        };
        value = new Label
        {
            Left = 56,
            Top = top + 18,
            Width = 520,
            Height = 26,
            Font = new Font("Segoe UI Semibold", 13f),
            ForeColor = click is null ? Theme.TextPrimary : Theme.Accent,
            BackColor = Color.Transparent,
            Cursor = click is null ? Cursors.Default : Cursors.Hand,
        };
        if (click is not null)
        {
            cap.Click += (_, _) => click();
            value.Click += (_, _) => click();
        }
        card.Controls.Add(ic);
        card.Controls.Add(cap);
        card.Controls.Add(value);
    }

    private void ApplyTheme()
    {
        BackColor = Theme.WindowBg;
        _hero.Invalidate();
        _grid.Invalidate();
        _connText.ForeColor = Theme.TextPrimary;
        foreach (Control c in _grid.Controls)
        {
            if (c is Label l && l.Font.Size >= 12)
                l.ForeColor = Theme.TextPrimary;
        }
    }

    public void RefreshData()
    {
        var cfg = _store.Load();
        var snap = AgentStatusStore.Read();
        var serviceRunning = ServiceHelper.IsRunning(TrayApplicationContext.ServiceName);
        var connected = serviceRunning && (snap?.Online ?? false);
        var devices = snap?.DeviceCount ?? LocalPrinters.List().Count;

        _connIcon.Text = connected ? AppIcons.Check : AppIcons.Warn;
        _connIcon.ForeColor = connected ? Theme.Success : Theme.Danger;
        _connText.Text = UiCopy.ConnectionHeadline(connected).Replace("● ", "");
        _connText.ForeColor = connected ? Theme.Success : Theme.Danger;
        _company.Text = UiCopy.CompanyName(cfg, snap);
        _computer.Text = string.IsNullOrWhiteSpace(cfg.ComputerName) ? Environment.MachineName : cfg.ComputerName;
        _devices.Text = UiCopy.DevicesReadySummary(devices);
        _ready.Text = UiCopy.ReadyStatus(connected, serviceRunning, devices);
        _sync.Text = UiCopy.RelativeSync(snap?.UpdatedAt);
    }

    public override void Refresh()
    {
        base.Refresh();
        RefreshData();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) Theme.Changed -= ApplyTheme;
        base.Dispose(disposing);
    }
}
