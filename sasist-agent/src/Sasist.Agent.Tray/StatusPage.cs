using Sasist.Agent.Core.Config;
using Sasist.Agent.Tray.Mvp;

namespace Sasist.Agent.Tray;

internal sealed class StatusPage : UserControl, IPageView
{
    private readonly TableLayoutPanel _grid;
    private readonly Dictionary<string, (Label Value, Label Hint)> _cells = new();
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

        AddCard(0, 0, "connection", AppIcons.Connected, "Połączenie", null);
        AddCard(0, 1, "company", AppIcons.Company, "Firma", null);
        AddCard(1, 0, "computer", AppIcons.Computer, "Komputer", null);
        AddCard(1, 1, "devices", AppIcons.Devices, "Urządzenia", openDevices);
        AddCard(2, 0, "lastPrint", AppIcons.Print, "Ostatni wydruk", null);
        AddCard(2, 1, "sync", AppIcons.Sync, "Synchronizacja", null);

        shell.Body.Controls.Add(_grid);
        Controls.Add(shell);
        shell.Body.Resize += (_, _) =>
        {
            _grid.MaximumSize = new Size(Math.Max(400, shell.Body.ClientSize.Width - 8), 0);
            RelayoutCardText();
        };
        UiBuffering.Enable(shell);
    }

    private void RelayoutCardText()
    {
        foreach (Control c in _grid.Controls)
        {
            if (c is not SasistCard card) continue;
            var max = Math.Max(120, card.ClientSize.Width - card.Padding.Horizontal - 8);
            foreach (Control child in card.Controls)
            {
                if (child is FlowLayoutPanel flow)
                {
                    foreach (Control x in flow.Controls)
                        LayoutHelpers.SetMaxWidth(x, max);
                }
            }
        }
    }

    private void AddCard(int row, int col, string key, string icon, string title, Action? open)
    {
        var card = new SasistCard
        {
            Dock = DockStyle.Fill,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Margin = new Padding(0, 0, col == 0 ? Theme.Gap : 0, Theme.Gap),
            MinimumSize = new Size(200, 80),
        };

        var stack = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Color.Transparent,
        };

        var head = new FlowLayoutPanel
        {
            AutoSize = true,
            WrapContents = false,
            FlowDirection = FlowDirection.LeftToRight,
            BackColor = Color.Transparent,
            Margin = new Padding(0, 0, 0, 10),
        };
        head.Controls.Add(LayoutHelpers.Icon(icon, Theme.Accent, 16f));
        head.Controls.Add(LayoutHelpers.Text(title, Theme.FontCaptionBold, Theme.TextMuted));

        var value = LayoutHelpers.Wrap("—", Theme.FontMetric, Theme.TextPrimary, 280);
        value.Margin = new Padding(0, 0, 0, 6);
        var hint = LayoutHelpers.Wrap("", Theme.FontCaption, Theme.TextMuted, 280);

        if (open is not null)
        {
            card.Cursor = Cursors.Hand;
            void go(object? s, EventArgs e) => open();
            card.Click += go;
            value.Click += go;
            hint.Click += go;
            head.Click += go;
        }

        stack.Controls.Add(head);
        stack.Controls.Add(value);
        stack.Controls.Add(hint);
        card.Controls.Add(stack);
        _grid.Controls.Add(card, col, row);
        _cells[key] = (value, hint);
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
        Set("company", state.Company, "Konto w Sasist", Theme.TextPrimary);
        Set("computer", state.Computer, "Ten komputer", Theme.TextPrimary);
        Set("devices", state.DevicesSummary, "Otwórz listę drukarek", Theme.AccentText);
        Set("lastPrint", state.LastPrintValue, state.LastPrintHint, Theme.TextPrimary);
        Set("sync", state.SyncValue, "Ostatnia synchronizacja", Theme.TextPrimary);
    }

    private void Set(string key, string value, string hint, Color color)
    {
        if (!_cells.TryGetValue(key, out var c)) return;
        UiBuffering.SetTextIfChanged(c.Value, value);
        UiBuffering.SetColorIfChanged(c.Value, color);
        UiBuffering.SetTextIfChanged(c.Hint, hint);
    }
}
