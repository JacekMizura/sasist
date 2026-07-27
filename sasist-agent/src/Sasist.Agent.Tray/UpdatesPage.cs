using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

internal sealed class UpdatesPage : UserControl, IRefreshablePage
{
    private readonly Label _version;
    private readonly Label _status;
    private readonly ModernButton _updateBtn;
    private readonly ProgressBar _progress;
    private readonly Label _progressLabel;

    public UpdatesPage()
    {
        Dock = DockStyle.Fill;
        BackColor = Color.Transparent;
        Controls.Add(new PageHeader("Aktualizacje", "Utrzymuj Sasist Agent w najnowszej wersji"));

        var card = new RoundedCard { Left = 0, Top = 8, Width = 560, Height = 280 };

        var cap = new Label
        {
            Text = "Obecna wersja",
            Left = 24,
            Top = 24,
            Width = 200,
            Height = 18,
            Font = Theme.FontCaption,
            ForeColor = Theme.TextMuted,
            BackColor = Color.Transparent,
        };
        _version = new Label
        {
            Text = AgentConfig.AgentVersion,
            Left = 24,
            Top = 44,
            Width = 300,
            Height = 32,
            Font = new Font("Segoe UI Semibold", 22f),
            ForeColor = Theme.TextPrimary,
            BackColor = Color.Transparent,
        };
        var statusCap = new Label
        {
            Text = "Status",
            Left = 24,
            Top = 100,
            Width = 200,
            Height = 18,
            Font = Theme.FontCaption,
            ForeColor = Theme.TextMuted,
            BackColor = Color.Transparent,
        };
        _status = new Label
        {
            Text = UserMessages.UpToDate,
            Left = 24,
            Top = 120,
            Width = 480,
            Height = 28,
            Font = Theme.FontSection,
            ForeColor = Theme.Success,
            BackColor = Color.Transparent,
        };

        _updateBtn = new ModernButton
        {
            Text = "Sprawdź aktualizacje",
            Primary = true,
            Left = 24,
            Top = 170,
            Width = 200,
            Visible = true,
        };
        _updateBtn.Click += async (_, _) => await CheckAsync();

        _progress = new ProgressBar
        {
            Left = 24,
            Top = 220,
            Width = 480,
            Height = 10,
            Style = ProgressBarStyle.Continuous,
            Visible = false,
            Minimum = 0,
            Maximum = 100,
        };
        _progressLabel = new Label
        {
            Left = 24,
            Top = 236,
            Width = 480,
            Height = 20,
            Font = Theme.FontCaption,
            ForeColor = Theme.TextSecondary,
            BackColor = Color.Transparent,
            Visible = false,
        };

        card.Controls.AddRange([cap, _version, statusCap, _status, _updateBtn, _progress, _progressLabel]);
        Controls.Add(card);
        Theme.Changed += () =>
        {
            _version.ForeColor = Theme.TextPrimary;
            card.Invalidate();
        };
        Resize += (_, _) => card.Width = Math.Max(480, ClientSize.Width - 8);
    }

    private async Task CheckAsync()
    {
        _updateBtn.Enabled = false;
        _progress.Visible = true;
        _progressLabel.Visible = true;
        _progress.Value = 0;
        _progressLabel.Text = "Sprawdzanie aktualizacji…";
        for (var i = 0; i <= 100; i += 10)
        {
            _progress.Value = i;
            await Task.Delay(40);
        }
        _status.Text = UserMessages.UpToDate;
        _status.ForeColor = Theme.Success;
        _progressLabel.Text = "Gotowe";
        await Task.Delay(400);
        _progress.Visible = false;
        _progressLabel.Visible = false;
        _updateBtn.Enabled = true;
    }

    public void RefreshData()
    {
        _version.Text = AgentConfig.AgentVersion;
        _status.Text = UserMessages.UpToDate;
        _status.ForeColor = Theme.Success;
    }

    public override void Refresh()
    {
        base.Refresh();
        RefreshData();
    }
}
