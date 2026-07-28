using Sasist.Agent.Tray.Mvp;

namespace Sasist.Agent.Tray;

internal sealed class StatusPage : UserControl, IPageView
{
    private readonly TableLayoutPanel _grid;
    private readonly Dictionary<string, SasistMetricCard> _cards = new();
    private string? _lastFingerprint;

    public StatusPage(Action openDevices)
    {
        Dock = DockStyle.Fill;
        UiBuffering.Enable(this);
        var shell = new PageShell("Status", "Stan połączenia tego komputera z Sasist");

        _grid = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            ColumnCount = 2,
            RowCount = 3,
            BackColor = Color.Transparent,
        };
        _grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
        _grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
        for (var i = 0; i < 3; i++)
            _grid.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        Add(0, 0, "connection", AppIcons.Connected, "Połączenie");
        Add(0, 1, "company", AppIcons.Company, "Firma");
        Add(1, 0, "computer", AppIcons.Computer, "Komputer");
        Add(1, 1, "devices", AppIcons.Devices, "Urządzenia", openDevices);
        Add(2, 0, "lastPrint", AppIcons.Print, "Ostatni wydruk");
        Add(2, 1, "sync", AppIcons.Sync, "Synchronizacja");

        shell.Body.Controls.Add(_grid);
        Controls.Add(shell);
        shell.Body.Resize += (_, _) =>
        {
            _grid.MaximumSize = new Size(Math.Max(400, shell.Body.ClientSize.Width - Theme.Space.Sm), 0);
            foreach (var card in _cards.Values)
                card.FitText(Math.Max(120, card.ClientSize.Width - card.Padding.Horizontal - Theme.Space.Sm));
        };
        UiBuffering.Enable(shell);
    }

    private void Add(int row, int col, string key, string icon, string title, Action? open = null)
    {
        var card = new SasistMetricCard(icon, title, open)
        {
            Margin = new Padding(0, 0, col == 0 ? Theme.Gap : 0, Theme.Gap),
        };
        _grid.Controls.Add(card, col, row);
        _cards[key] = card;
    }

    public void ApplyValues(UiState state) => Apply(state, force: false);
    public void ForceSync(UiState state) => Apply(state, force: true);

    private void Apply(UiState state, bool force)
    {
        var fp = $"{state.Online}|{state.Company}|{state.Computer}|{state.DevicesSummary}|{state.LastPrintValue}|{state.LastPrintHint}|{state.SyncValue}";
        if (!force && fp == _lastFingerprint) return;
        _lastFingerprint = fp;

        Set("connection",
            state.Online ? "Połączono" : "Brak połączenia",
            state.Online ? "Gotowe do pracy z Sasist" : "Sprawdź sieć lub usługę",
            state.Online ? Theme.Success : Theme.Danger);
        Set("company", state.Company, "Konto w Sasist", Theme.Text);
        Set("computer", state.Computer, "Ten komputer", Theme.Text);
        Set("devices", state.DevicesSummary, "Otwórz listę drukarek", Theme.PrimaryText);
        Set("lastPrint", state.LastPrintValue, state.LastPrintHint, Theme.Text);
        Set("sync", state.SyncValue, "Ostatnia synchronizacja", Theme.Text);
    }

    private void Set(string key, string value, string hint, Color color)
    {
        if (!_cards.TryGetValue(key, out var c)) return;
        UiBuffering.SetTextIfChanged(c.ValueLabel, value);
        UiBuffering.SetColorIfChanged(c.ValueLabel, color);
        UiBuffering.SetTextIfChanged(c.HintLabel, hint);
    }
}
