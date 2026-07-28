using Sasist.Agent.Tray.Mvp;

namespace Sasist.Agent.Tray;

internal sealed class DevicesPage : UserControl, IPageView
{
    private readonly FlowLayoutPanel _flow;
    private readonly SasistCaption _summary;
    private readonly SasistEmptyState _empty;
    private readonly Dictionary<string, SasistPrinterCard> _cards = new(StringComparer.OrdinalIgnoreCase);
    private PageShell? _shell;
    private string? _membershipKey;

    public event Action? ForceSyncRequested;

    public DevicesPage()
    {
        Dock = DockStyle.Fill;
        UiBuffering.Enable(this);
        _shell = new PageShell("Urządzenia", "Drukarki wykryte na tym komputerze i gotowe do pracy z Sasist");

        var bar = new SasistToolbar();
        bar.AddButton("Odśwież", SasistButtonKind.Secondary, (_, _) => ForceSyncRequested?.Invoke());

        _summary = new SasistCaption { Dock = DockStyle.Top, Padding = new Padding(0, 0, 0, Theme.Space.Md) };
        _empty = new SasistEmptyState(
            "Brak drukarek",
            "Podłącz drukarkę w systemie Windows — pojawi się tutaj automatycznie.",
            AppIcons.Print)
        { Visible = false };

        _flow = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            WrapContents = true,
            FlowDirection = FlowDirection.LeftToRight,
            BackColor = Color.Transparent,
        };
        _flow.Controls.Add(_empty);

        _shell.Body.Controls.Add(_flow);
        _shell.Body.Controls.Add(bar);
        _shell.Body.Controls.Add(_summary);
        Controls.Add(_shell);
        _shell.Body.Resize += (_, _) => FitCardWidths();
        UiBuffering.Enable(_shell);
    }

    public void ApplyValues(UiState state)
    {
        UiBuffering.SetTextIfChanged(_summary, state.DevicesSummary);
        var key = string.Join("|", state.Printers.Select(p => p.Name));
        if (key != _membershipKey)
        {
            RebuildMembership(state.Printers);
            _membershipKey = key;
        }
        else
        {
            foreach (var p in state.Printers)
            {
                if (_cards.TryGetValue(p.Name, out var card))
                    card.Update(p);
            }
        }
    }

    public void ForceSync(UiState state) => ApplyValues(state);

    private void RebuildMembership(IReadOnlyList<PrinterRow> printers)
    {
        UiMetrics.NoteRebuild("DevicesPage.membership");
        var keep = printers.Select(p => p.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var name in _cards.Keys.Where(k => !keep.Contains(k)).ToList())
        {
            _flow.Controls.Remove(_cards[name]);
            _cards[name].Dispose();
            _cards.Remove(name);
        }

        _empty.Visible = printers.Count == 0;
        _flow.SuspendLayout();
        foreach (var p in printers)
        {
            if (_cards.TryGetValue(p.Name, out var existing))
            {
                existing.Update(p);
                continue;
            }
            var card = new SasistPrinterCard(p);
            _cards[p.Name] = card;
            _flow.Controls.Add(card);
        }
        for (var i = 0; i < printers.Count; i++)
        {
            if (_cards.TryGetValue(printers[i].Name, out var c))
                _flow.Controls.SetChildIndex(c, i);
        }
        _flow.ResumeLayout(true);
        FitCardWidths();
    }

    private void FitCardWidths()
    {
        if (_shell is null) return;
        var avail = Math.Max(280, _flow.ClientSize.Width - Theme.Space.Sm);
        var cardW = avail >= 720 ? (avail - Theme.Gap) / 2 : avail - Theme.Space.Sm;
        cardW = Math.Max(280, cardW);
        foreach (Control c in _flow.Controls)
        {
            if (c is SasistPrinterCard pc)
            {
                pc.MaximumSize = new Size(cardW, 0);
                pc.MinimumSize = new Size(Math.Min(280, cardW), 0);
                pc.ApplyContentWidth(cardW);
            }
            else if (c is SasistEmptyState)
            {
                c.MaximumSize = new Size(avail - Theme.Space.Sm, 0);
            }
        }
        _summary.MaximumSize = new Size(avail, 0);
    }
}
