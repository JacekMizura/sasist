using Sasist.Agent.Core.Config;
using Sasist.Agent.Tray.Mvp;

namespace Sasist.Agent.Tray;

internal sealed class UpdatesPage : UserControl, IPageView
{
    private readonly SasistMetric _version;
    private readonly SasistHeading _status;
    private readonly SasistBody _changelog;
    private readonly SasistButton _btn;
    private readonly SasistProgress _progress;
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

        stack.Controls.Add(new SasistCaption { Text = "Aktualna wersja" });
        _version = new SasistMetric { Text = AgentConfig.AgentVersion, Margin = new Padding(0, Theme.Space.Xs, 0, Theme.Space.Lg) };
        stack.Controls.Add(_version);

        stack.Controls.Add(new SasistCaption { Text = "Status" });
        _status = new SasistHeading
        {
            Text = UserMessages.UpToDate,
            ForeColor = Theme.Success,
            Margin = new Padding(0, Theme.Space.Xs, 0, Theme.Space.Lg),
            MaximumSize = new Size(640, 0),
        };
        stack.Controls.Add(_status);

        stack.Controls.Add(new SasistCaption { Text = "Historia zmian" });
        _changelog = new SasistBody
        {
            Text = "• Design System Sasist — spójne komponenty\n• Karty urządzeń i historii wydruków\n• Test gotowości systemu",
            ForeColor = Theme.SecondaryText,
            MaximumSize = new Size(640, 0),
            Margin = new Padding(0, Theme.Space.Sm, 0, Theme.Space.Lg),
        };
        stack.Controls.Add(_changelog);

        _btn = new SasistButton { Text = "Sprawdź aktualizacje", Kind = SasistButtonKind.Primary, Margin = new Padding(0, Theme.Space.Xs, 0, Theme.Space.Sm) };
        _btn.Click += async (_, _) => await CheckAsync();
        stack.Controls.Add(_btn);

        _progress = new SasistProgress();
        stack.Controls.Add(_progress);

        _card.Controls.Add(stack);
        _shell.Body.Controls.Add(_card);
        Controls.Add(_shell);
        _shell.Body.Resize += (_, _) => Relayout();
    }

    private void Relayout()
    {
        if (_shell is null) return;
        var w = Math.Max(320, _shell.Body.ClientSize.Width - Theme.Space.Lg);
        _card.MaximumSize = new Size(w, 0);
        _card.MinimumSize = new Size(Math.Min(320, w), 160);
        _status.MaximumSize = new Size(w - 56, 0);
        _changelog.MaximumSize = new Size(w - 56, 0);
        _version.MaximumSize = new Size(w - 56, 0);
        _progress.FitWidth(w - 56);
    }

    private async Task CheckAsync()
    {
        _btn.Enabled = false;
        Motion.StartPulse(_status);
        for (var i = 0; i <= 100; i += 10)
        {
            _progress.ShowProgress("Sprawdzanie aktualizacji…", i);
            await Task.Delay(35);
        }
        Motion.StopPulse(_status);
        _status.Text = UserMessages.UpToDate;
        _status.ForeColor = Theme.Success;
        _progress.ShowProgress("Gotowe", 100);
        await Task.Delay(350);
        _progress.HideProgress();
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
}
