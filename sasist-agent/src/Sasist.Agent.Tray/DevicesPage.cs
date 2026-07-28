using Sasist.Agent.Core.Config;
using Sasist.Agent.Tray.Mvp;

namespace Sasist.Agent.Tray;

internal sealed class DevicesPage : UserControl, IPageView
{
    private readonly FlowLayoutPanel _flow;
    private readonly Label _summary;
    private readonly Dictionary<string, PrinterCard> _cards = new(StringComparer.OrdinalIgnoreCase);
    private PageShell? _shell;
    private string? _membershipKey;

    public event Action? ForceSyncRequested;

    public DevicesPage()
    {
        Dock = DockStyle.Fill;
        UiBuffering.Enable(this);
        _shell = new PageShell("Urządzenia", "Drukarki wykryte na tym komputerze i gotowe do pracy z Sasist");

        var bar = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            WrapContents = true,
            BackColor = Color.Transparent,
            Padding = new Padding(0, 0, 0, 8),
        };
        var refresh = new SasistButton { Text = "Odśwież" };
        refresh.Click += (_, _) => ForceSyncRequested?.Invoke();
        bar.Controls.Add(refresh);

        _summary = new Label
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            Font = Theme.FontBody,
            ForeColor = Theme.TextMuted,
            BackColor = Color.Transparent,
            Padding = new Padding(0, 0, 0, 12),
        };

        _flow = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            WrapContents = true,
            FlowDirection = FlowDirection.LeftToRight,
            BackColor = Color.Transparent,
        };

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

        _flow.SuspendLayout();
        foreach (var p in printers)
        {
            if (_cards.TryGetValue(p.Name, out var existing))
            {
                existing.Update(p);
                continue;
            }
            var card = new PrinterCard(p);
            _cards[p.Name] = card;
            _flow.Controls.Add(card);
        }
        // Keep visual order matching printers list
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
        var avail = Math.Max(280, _flow.ClientSize.Width - 8);
        var cardW = avail >= 720 ? (avail - Theme.Gap) / 2 : avail - 8;
        cardW = Math.Max(280, cardW);
        foreach (Control c in _flow.Controls)
        {
            c.MaximumSize = new Size(cardW, 0);
            c.MinimumSize = new Size(Math.Min(280, cardW), 0);
            if (c is PrinterCard pc) pc.ApplyContentWidth(cardW);
        }
        _summary.MaximumSize = new Size(avail, 0);
    }

    private sealed class PrinterCard : SasistCard
    {
        private readonly Label _name;
        private readonly Label _status;
        private readonly Label _def;
        private readonly string _printerName;

        public PrinterCard(PrinterRow p)
        {
            _printerName = p.Name;
            AutoSize = true;
            AutoSizeMode = AutoSizeMode.GrowAndShrink;
            MinimumSize = new Size(280, 120);
            Margin = new Padding(0, 0, Theme.Gap, Theme.Gap);

            var stack = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                BackColor = Color.Transparent,
            };

            var titleRow = new FlowLayoutPanel
            {
                AutoSize = true,
                WrapContents = true,
                BackColor = Color.Transparent,
                Margin = new Padding(0, 0, 0, 8),
            };
            titleRow.Controls.Add(LayoutHelpers.Icon(AppIcons.Print, Theme.Accent, 18f));
            _name = LayoutHelpers.Wrap(p.Name, Theme.FontBodySemibold, Theme.TextPrimary, 300);
            titleRow.Controls.Add(_name);
            stack.Controls.Add(titleRow);
            stack.Controls.Add(LayoutHelpers.Muted("Drukarka systemowa Windows"));

            _status = LayoutHelpers.Text("", Theme.FontBodySemibold, Theme.Success);
            _status.Margin = new Padding(0, 8, 0, 4);
            stack.Controls.Add(_status);

            _def = LayoutHelpers.Text("Domyślna", Theme.FontCaptionBold, Theme.AccentText);
            _def.Margin = new Padding(0, 0, 0, 8);
            stack.Controls.Add(_def);

            var actions = new FlowLayoutPanel
            {
                AutoSize = true,
                WrapContents = true, // buttons wrap — never overflow card
                BackColor = Color.Transparent,
                Margin = new Padding(0, 12, 0, 0),
            };
            var test = new SasistButton { Text = "Druk testowy", Primary = true, Margin = new Padding(0, 0, 8, 4) };
            test.Click += (_, _) => RunTest(_printerName);
            var details = new SasistButton { Text = "Szczegóły", Margin = new Padding(0, 0, 0, 4) };
            details.Click += (_, _) => MessageBox.Show(
                $"Drukarka: {_printerName}\nStatus: {_status.Text}",
                "Szczegóły", MessageBoxButtons.OK, MessageBoxIcon.Information);
            actions.Controls.Add(test);
            actions.Controls.Add(details);
            stack.Controls.Add(actions);
            Controls.Add(stack);
            Update(p);
        }

        public void ApplyContentWidth(int cardW)
        {
            LayoutHelpers.SetMaxWidth(_name, cardW - 56);
            MaximumSize = new Size(cardW, 0);
        }

        public void Update(PrinterRow p)
        {
            UiBuffering.SetTextIfChanged(_name, p.Name);
            var ready = p.Status == "Gotowa";
            UiBuffering.SetTextIfChanged(_status, ready ? "●  Gotowa" : "●  Niedostępna");
            UiBuffering.SetColorIfChanged(_status, ready ? Theme.Success : Theme.Danger);
            _def.Visible = p.IsDefault;
        }

        private static void RunTest(string name)
        {
            try
            {
                LocalPrinters.PrintTestPage(name);
                JobHistoryStore.Append($"test-{DateTime.Now:HHmmss}", name, "Wydrukowano");
                MessageBox.Show("Wysłano wydruk testowy.", "Druk testowy", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                JobHistoryStore.Append($"test-{DateTime.Now:HHmmss}", name, "Błąd", ex.Message);
                MessageBox.Show(UserMessages.PrintFailed, "Druk testowy", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
    }
}
