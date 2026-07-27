using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

internal sealed class StatusPage : UserControl
{
    private readonly ConfigStore _store;
    private readonly Label _connection;
    private readonly Label _company;
    private readonly Label _computer;
    private readonly Label _devices;
    private readonly Label _ready;
    private readonly Label _sync;

    public StatusPage(ConfigStore store, Action openDevices)
    {
        _store = store;
        Dock = DockStyle.Fill;
        BackColor = Color.FromArgb(245, 246, 248);

        var title = new Label
        {
            Text = "Status",
            Left = 0,
            Top = 0,
            Width = 600,
            Height = 36,
            Font = new Font("Segoe UI Semibold", 18f),
            ForeColor = Color.FromArgb(28, 28, 30),
        };

        var card = TrayUi.CreateCard(0, 52, 640, 360);

        _connection = BigValue(card, 24, 24, 580, 32, 12f);
        AddRow(card, "Firma", out _company, 80);
        AddRow(card, "Komputer", out _computer, 140);
        AddRow(card, "Urządzenia", out _devices, 200, openDevices);
        AddRow(card, "Status", out _ready, 260);
        AddRow(card, "Ostatnia synchronizacja", out _sync, 320);

        Controls.Add(title);
        Controls.Add(card);
    }

    private static Label BigValue(Panel card, int x, int y, int w, int h, float size)
    {
        var l = new Label
        {
            Left = x,
            Top = y,
            Width = w,
            Height = h,
            Font = new Font("Segoe UI Semibold", size),
            ForeColor = Color.FromArgb(30, 140, 60),
        };
        card.Controls.Add(l);
        return l;
    }

    private static void AddRow(Panel card, string caption, out Label value, int top, Action? click = null)
    {
        var c = new Label
        {
            Text = caption,
            Left = 24,
            Top = top,
            Width = 580,
            Height = 18,
            Font = new Font("Segoe UI", 8.5f),
            ForeColor = Color.FromArgb(120, 120, 128),
            Cursor = click is null ? Cursors.Default : Cursors.Hand,
        };
        value = new Label
        {
            Left = 24,
            Top = top + 18,
            Width = 580,
            Height = 24,
            Font = new Font("Segoe UI Semibold", 12f),
            ForeColor = click is null ? Color.FromArgb(28, 28, 30) : Color.FromArgb(249, 115, 22),
            Cursor = click is null ? Cursors.Default : Cursors.Hand,
        };
        if (click is not null)
        {
            c.Click += (_, _) => click();
            value.Click += (_, _) => click();
        }
        card.Controls.Add(c);
        card.Controls.Add(value);
    }

    public void RefreshData()
    {
        var cfg = _store.Load();
        var snap = AgentStatusStore.Read();
        var serviceRunning = ServiceHelper.IsRunning(TrayApplicationContext.ServiceName);
        var connected = serviceRunning && (snap?.Online ?? false);
        var devices = snap?.DeviceCount ?? LocalPrinters.List().Count;

        _connection.Text = UiCopy.ConnectionHeadline(connected);
        _connection.ForeColor = connected ? Color.FromArgb(30, 140, 60) : Color.FromArgb(160, 60, 60);
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
}
