using Sasist.Agent.Core.Config;
using Sasist.Agent.Tray.Mvp;

namespace Sasist.Agent.Tray;

internal sealed class UpdatesPage : UserControl, IPageView
{
    private readonly Label _version;
    private readonly Label _status;
    private readonly Label _changelog;
    private readonly SasistButton _btn;
    private readonly ProgressBar _bar;
    private readonly Label _barLbl;
    private readonly SasistCard _card;
    private PageShell? _shell;

    public UpdatesPage()
    {
        Dock = DockStyle.Fill;
        UiBuffering.Enable(this);
        _shell = new PageShell("Aktualizacje", "Utrzymuj Sasist Agent w najnowszej wersji");

        _card = new SasistCard
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Margin = Padding.Empty,
            MinimumSize = new Size(320, 160),
        };

        var stack = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Color.Transparent,
        };

        stack.Controls.Add(LayoutHelpers.Muted("Aktualna wersja"));
        _version = LayoutHelpers.Metric(AgentConfig.AgentVersion);
        _version.Margin = new Padding(0, 4, 0, 16);
        stack.Controls.Add(_version);

        stack.Controls.Add(LayoutHelpers.Muted("Status"));
        _status = LayoutHelpers.Wrap(UserMessages.UpToDate, Theme.FontSection, Theme.Success, 640);
        _status.Margin = new Padding(0, 4, 0, 16);
        stack.Controls.Add(_status);

        stack.Controls.Add(LayoutHelpers.Muted("Historia zmian"));
        _changelog = LayoutHelpers.Wrap(
            "• Nowoczesny interfejs zgodny z Sasist\n• Karty urządzeń i historii wydruków\n• Test gotowości systemu",
            Theme.FontBody, Theme.TextSecondary, 640);
        _changelog.Margin = new Padding(0, 6, 0, 16);
        stack.Controls.Add(_changelog);

        _btn = new SasistButton { Text = "Sprawdź aktualizacje", Primary = true, Margin = new Padding(0, 4, 0, 8) };
        _btn.Click += async (_, _) => await CheckAsync();
        stack.Controls.Add(_btn);

        _bar = new ProgressBar
        {
            MinimumSize = new Size(160, 10),
            MaximumSize = new Size(420, 10),
            Visible = false,
            Margin = new Padding(0, 8, 0, 4),
        };
        _barLbl = LayoutHelpers.Muted("");
        _barLbl.Visible = false;
        stack.Controls.Add(_bar);
        stack.Controls.Add(_barLbl);

        _card.Controls.Add(stack);
        _shell.Body.Controls.Add(_card);
        Controls.Add(_shell);
        _shell.Body.Resize += (_, _) => Relayout();
    }

    private void Relayout()
    {
        if (_shell is null) return;
        var w = Math.Max(320, _shell.Body.ClientSize.Width - 16);
        _card.MaximumSize = new Size(w, 0);
        _card.MinimumSize = new Size(Math.Min(320, w), 160);
        LayoutHelpers.SetMaxWidth(_status, w - 56);
        LayoutHelpers.SetMaxWidth(_changelog, w - 56);
        LayoutHelpers.SetMaxWidth(_version, w - 56);
        var barW = Math.Min(420, Math.Max(160, w - 56));
        _bar.MaximumSize = new Size(barW, 10);
        _bar.MinimumSize = new Size(Math.Min(160, barW), 10);
    }

    private async Task CheckAsync()
    {
        _btn.Enabled = false;
        _bar.Visible = true;
        _barLbl.Visible = true;
        _bar.Value = 0;
        _barLbl.Text = "Sprawdzanie aktualizacji…";
        for (var i = 0; i <= 100; i += 10)
        {
            _bar.Value = i;
            await Task.Delay(35);
        }
        _status.Text = UserMessages.UpToDate;
        _status.ForeColor = Theme.Success;
        _barLbl.Text = "Gotowe";
        await Task.Delay(350);
        _bar.Visible = false;
        _barLbl.Visible = false;
        _btn.Enabled = true;
        Relayout();
    }

    public void ApplyValues(UiState state)
    {
        UiBuffering.SetTextIfChanged(_version, AgentConfig.AgentVersion);
    }

    public void ForceSync(UiState state)
    {
        ApplyValues(state);
        UiBuffering.SetTextIfChanged(_status, UserMessages.UpToDate);
        _status.ForeColor = Theme.Success;
        Relayout();
    }

    public void RefreshData() => ForceSync(UiState.Capture(new ConfigStore()));
}
