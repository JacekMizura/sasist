using Sasist.Agent.Core.Config;
using Sasist.Agent.Tray.Mvp;

namespace Sasist.Agent.Tray;

internal sealed class JobsPage : UserControl, IPageView
{
    private readonly ConfigStore _store;
    private readonly FlowLayoutPanel _list;
    private readonly Dictionary<string, JobCard> _cards = new(StringComparer.Ordinal);
    private readonly Label _empty;
    private PageShell? _shell;
    private string? _membershipKey;

    public JobsPage(ConfigStore store)
    {
        _store = store;
        Dock = DockStyle.Fill;
        UiBuffering.Enable(this);
        _shell = new PageShell("Historia wydruków", "Ostatnie zadania wykonane na tym komputerze");

        var bar = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            WrapContents = true,
            BackColor = Color.Transparent,
            Padding = new Padding(0, 0, 0, 12),
        };
        var refresh = new SasistButton { Text = "Odśwież", Margin = new Padding(0, 0, 8, 4) };
        refresh.Click += (_, _) => ForceSync(UiState.Capture(_store));
        var clear = new SasistButton { Text = "Wyczyść", Margin = new Padding(0, 0, 0, 4) };
        clear.Click += (_, _) =>
        {
            JobHistoryStore.Clear();
            ForceSync(UiState.Capture(_store));
        };
        bar.Controls.Add(refresh);
        bar.Controls.Add(clear);

        _list = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Color.Transparent,
        };
        _empty = new Label
        {
            Text = "Brak historii wydruków.",
            AutoSize = true,
            Font = Theme.FontBody,
            ForeColor = Theme.TextMuted,
            Margin = new Padding(4, 12, 0, 0),
            Visible = false,
        };
        _list.Controls.Add(_empty);

        _shell.Body.Controls.Add(_list);
        _shell.Body.Controls.Add(bar);
        Controls.Add(_shell);
        _shell.Body.Resize += (_, _) => FitWidths();
        UiBuffering.Enable(_shell);
    }

    public void ApplyValues(UiState state)
    {
        // Membership key = identity only. Status/text changes update labels in place.
        var key = string.Join("|", state.Jobs.Select(CardKey));
        if (key != _membershipKey)
        {
            Rebuild(state.Jobs);
            _membershipKey = key;
            return;
        }
        foreach (var j in state.Jobs)
        {
            if (_cards.TryGetValue(CardKey(j), out var card))
                card.Update(j);
        }
    }

    public void ForceSync(UiState state) => ApplyValues(state);

    private static string CardKey(JobRow j) => $"{j.Id}|{j.At.ToUnixTimeSeconds()}";

    private void Rebuild(IReadOnlyList<JobRow> jobs)
    {
        UiMetrics.NoteRebuild("JobsPage.membership");
        foreach (var c in _cards.Values)
        {
            _list.Controls.Remove(c);
            c.Dispose();
        }
        _cards.Clear();

        _empty.Visible = jobs.Count == 0;
        _list.SuspendLayout();
        foreach (var j in jobs)
        {
            var card = new JobCard(j);
            _cards[CardKey(j)] = card;
            _list.Controls.Add(card);
        }
        _list.ResumeLayout(true);
        FitWidths();
    }

    private void FitWidths()
    {
        var w = Math.Max(320, _list.ClientSize.Width - 24);
        foreach (Control c in _list.Controls)
        {
            if (c is JobCard)
            {
                c.MaximumSize = new Size(w, 0);
                c.MinimumSize = new Size(Math.Min(320, w), 0);
            }
        }
    }

    private sealed class JobCard : SasistCard
    {
        private readonly Label _time;
        private readonly Label _doc;
        private readonly Label _printer;
        private readonly Label _status;
        private readonly Label _icon;
        private JobRow _row;

        public JobCard(JobRow j)
        {
            _row = j;
            AutoSize = true;
            AutoSizeMode = AutoSizeMode.GrowAndShrink;
            Margin = new Padding(0, 0, 0, 12);
            Cursor = Cursors.Hand;
            MinimumSize = new Size(320, 64);
            Click += (_, _) => Open();

            var row = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                WrapContents = true,
                FlowDirection = FlowDirection.LeftToRight,
                BackColor = Color.Transparent,
            };

            _icon = LayoutHelpers.Icon(AppIcons.Check, Theme.Success, 16f);
            _icon.Margin = new Padding(0, 6, 10, 6);
            _time = LayoutHelpers.Text("", Theme.FontBodySemibold, Theme.TextPrimary);
            _time.Margin = new Padding(0, 6, 12, 6);

            var mid = new FlowLayoutPanel
            {
                AutoSize = true,
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                BackColor = Color.Transparent,
                Margin = new Padding(0, 2, 12, 2),
                MinimumSize = new Size(180, 0),
            };
            _doc = LayoutHelpers.Wrap("", Theme.FontBodySemibold, Theme.TextPrimary, 480);
            _printer = LayoutHelpers.Wrap("", Theme.FontCaption, Theme.TextMuted, 480);
            mid.Controls.Add(_doc);
            mid.Controls.Add(_printer);

            _status = LayoutHelpers.Text("", Theme.FontCaptionBold, Theme.Success);
            _status.Margin = new Padding(8, 6, 0, 6);

            row.Controls.Add(_icon);
            row.Controls.Add(_time);
            row.Controls.Add(mid);
            row.Controls.Add(_status);
            Controls.Add(row);
            foreach (Control c in row.Controls)
            {
                c.Click += (_, _) => Open();
                if (c is FlowLayoutPanel fp)
                    foreach (Control x in fp.Controls) x.Click += (_, _) => Open();
            }
            Update(j);
        }

        public void Update(JobRow j)
        {
            _row = j;
            var ok = j.Status.Contains("Wydruk", StringComparison.OrdinalIgnoreCase);
            _icon.Text = ok ? AppIcons.Check : AppIcons.Error;
            UiBuffering.SetColorIfChanged(_icon, ok ? Theme.Success : Theme.Danger);
            UiBuffering.SetTextIfChanged(_time, j.At.ToLocalTime().ToString("HH:mm"));
            UiBuffering.SetTextIfChanged(_doc, string.IsNullOrWhiteSpace(j.Id) ? "Wydruk" : $"Zadanie {j.Id}");
            UiBuffering.SetTextIfChanged(_printer, j.Printer);
            UiBuffering.SetTextIfChanged(_status, j.Status);
            UiBuffering.SetColorIfChanged(_status, ok ? Theme.Success : Theme.Danger);
        }

        private void Open()
        {
            MessageBox.Show(
                $"Czas: {_row.At.ToLocalTime():dd.MM.yyyy HH:mm:ss}\nDrukarka: {_row.Printer}\nStatus: {_row.Status}\nId: {_row.Id}" +
                (string.IsNullOrWhiteSpace(_row.Error) ? "" : $"\nBłąd: {_row.Error}"),
                "Szczegóły wydruku", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }
}
