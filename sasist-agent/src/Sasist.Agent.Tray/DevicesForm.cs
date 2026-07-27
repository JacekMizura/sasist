using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

/// <summary>Device categories — printers today, future classes ready.</summary>
internal sealed class DevicesForm : Form
{
    private readonly Label _summary;
    private readonly Label _printersValue;
    private readonly System.Windows.Forms.Timer _timer;

    public DevicesForm(ConfigStore store)
    {
        _ = store;

        Text = "Urządzenia — Sasist Agent";
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        MinimizeBox = true;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(420, 380);
        BackColor = Color.FromArgb(250, 250, 252);
        Font = new Font("Segoe UI", 10f);
        Icon = Branding.AppIcon;

        var card = TrayUi.CreateCard(18, 18, 384, 344);

        var title = new Label
        {
            Text = "Urządzenia",
            Left = 20,
            Top = 18,
            Width = 340,
            Height = 28,
            Font = new Font("Segoe UI Semibold", 15f),
            ForeColor = Color.FromArgb(28, 28, 30),
        };

        _summary = new Label
        {
            Left = 20,
            Top = 52,
            Width = 340,
            Height = 24,
            Font = new Font("Segoe UI", 10.5f),
            ForeColor = Color.FromArgb(90, 90, 98),
        };

        var y = 100;
        AddRow(card, "Drukarki", out _printersValue, ref y);
        AddRow(card, "Skanery", out var scanners, ref y, fixedValue: "W przyszłości");
        AddRow(card, "Wagi", out var scales, ref y, fixedValue: "W przyszłości");
        AddRow(card, "Kamery", out var cameras, ref y, fixedValue: "W przyszłości");
        _ = scanners;
        _ = scales;
        _ = cameras;

        var hint = new Label
        {
            Left = 20,
            Top = 300,
            Width = 340,
            Height = 28,
            Font = new Font("Segoe UI", 8.5f),
            ForeColor = Color.FromArgb(130, 130, 138),
            Text = "Drukarki są wykrywane i synchronizowane automatycznie.",
        };

        card.Controls.AddRange([title, _summary, hint]);
        Controls.Add(card);

        _timer = new System.Windows.Forms.Timer { Interval = 4000 };
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

    private static void AddRow(Panel card, string name, out Label value, ref int y, string? fixedValue = null)
    {
        var label = new Label
        {
            Text = name,
            Left = 20,
            Top = y,
            Width = 160,
            Height = 28,
            Font = new Font("Segoe UI Semibold", 11f),
            ForeColor = Color.FromArgb(28, 28, 30),
        };
        value = new Label
        {
            Text = fixedValue ?? "—",
            Left = 180,
            Top = y,
            Width = 180,
            Height = 28,
            Font = new Font("Segoe UI", 11f),
            ForeColor = Color.FromArgb(90, 90, 98),
            TextAlign = ContentAlignment.MiddleRight,
        };
        card.Controls.Add(label);
        card.Controls.Add(value);
        y += 44;
    }

    private void RefreshView()
    {
        var count = AgentStatusStore.Read()?.DeviceCount ?? 0;
        _summary.Text = UiCopy.DevicesReadySummary(count);
        _printersValue.Text = UiCopy.PrintersReady(count);
    }
}
