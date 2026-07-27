using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

/// <summary>Main customer window — connection, company, computer, readiness.</summary>
internal sealed class StatusForm : Form
{
    private readonly ConfigStore _store;
    private readonly Label _connection;
    private readonly Label _companyValue;
    private readonly Label _computerValue;
    private readonly Label _devicesValue;
    private readonly Label _statusValue;
    private readonly Label _syncValue;
    private readonly System.Windows.Forms.Timer _timer;
    private readonly Action _openDevices;

    public StatusForm(ConfigStore store, Action openDevices)
    {
        _store = store;
        _openDevices = openDevices;

        Text = "Sasist Agent";
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        MinimizeBox = true;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(420, 460);
        BackColor = Color.FromArgb(250, 250, 252);
        Font = new Font("Segoe UI", 10f);
        Icon = Branding.AppIcon;
        ShowInTaskbar = true;

        var card = TrayUi.CreateCard(18, 18, 384, 424);

        var logo = new PictureBox
        {
            Image = Branding.MarkImage,
            SizeMode = PictureBoxSizeMode.Zoom,
            Left = 20,
            Top = 18,
            Width = 36,
            Height = 36,
        };

        var title = new Label
        {
            Text = "Sasist Agent",
            Left = 66,
            Top = 18,
            Width = 280,
            Height = 28,
            Font = new Font("Segoe UI Semibold", 15f),
            ForeColor = Color.FromArgb(28, 28, 30),
        };

        _connection = new Label
        {
            Left = 20,
            Top = 68,
            Width = 340,
            Height = 28,
            Font = new Font("Segoe UI Semibold", 11f),
            ForeColor = Color.FromArgb(30, 140, 60),
        };

        var y = 112;
        AddField(card, "Firma", out _companyValue, ref y);
        AddField(card, "Komputer", out _computerValue, ref y);
        AddField(card, "Urządzenia", out _devicesValue, ref y, clickable: true, onClick: (_, _) => _openDevices());
        AddField(card, "Status", out _statusValue, ref y);
        AddField(card, "Ostatnia synchronizacja", out _syncValue, ref y);

        card.Controls.AddRange([logo, title, _connection]);
        Controls.Add(card);

        _timer = new System.Windows.Forms.Timer { Interval = 3000 };
        _timer.Tick += (_, _) => RefreshView();
        Shown += (_, _) =>
        {
            RefreshView();
            _timer.Start();
        };
        FormClosed += (_, _) =>
        {
            _timer.Stop();
            _timer.Dispose();
        };
    }

    private static void AddField(
        Panel card,
        string label,
        out Label valueLabel,
        ref int y,
        bool clickable = false,
        EventHandler? onClick = null)
    {
        var caption = new Label
        {
            Text = label,
            Left = 20,
            Top = y,
            Width = 340,
            Height = 18,
            Font = new Font("Segoe UI", 8.5f),
            ForeColor = Color.FromArgb(120, 120, 128),
        };
        valueLabel = new Label
        {
            Left = 20,
            Top = y + 18,
            Width = 340,
            Height = 24,
            Font = new Font("Segoe UI Semibold", 11f),
            ForeColor = Color.FromArgb(28, 28, 30),
            Cursor = clickable ? Cursors.Hand : Cursors.Default,
        };
        if (clickable && onClick is not null)
        {
            valueLabel.ForeColor = Color.FromArgb(249, 115, 22);
            valueLabel.Click += onClick;
            caption.Click += onClick;
            caption.Cursor = Cursors.Hand;
        }

        card.Controls.Add(caption);
        card.Controls.Add(valueLabel);
        y += 58;
    }

    private void RefreshView()
    {
        var cfg = _store.Load();
        var snap = AgentStatusStore.Read();
        var serviceRunning = ServiceHelper.IsRunning(TrayApplicationContext.ServiceName);
        var connected = serviceRunning && (snap?.Online ?? false);
        var devices = snap?.DeviceCount ?? 0;
        _connection.Text = UiCopy.ConnectionHeadline(connected);
        _connection.ForeColor = connected
            ? Color.FromArgb(30, 140, 60)
            : Color.FromArgb(160, 60, 60);

        _companyValue.Text = UiCopy.CompanyName(cfg, snap);
        _computerValue.Text = string.IsNullOrWhiteSpace(cfg.ComputerName)
            ? Environment.MachineName
            : cfg.ComputerName;
        _devicesValue.Text = UiCopy.DevicesReadySummary(devices);
        _statusValue.Text = UiCopy.ReadyStatus(connected, serviceRunning, devices);
        _syncValue.Text = UiCopy.RelativeSync(snap?.UpdatedAt);
    }
}
