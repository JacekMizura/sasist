using Sasist.Agent.Core.Config;
using Sasist.Agent.Tray.Mvp;

namespace Sasist.Agent.Tray;

internal sealed class JobsPage : UserControl, IPageView
{
    private readonly ConfigStore _store;
    private readonly FlowLayoutPanel _list;
    private readonly Dictionary<string, JobCard> _cards = new(StringComparer.Ordinal);
    private readonly SasistEmptyState _empty;
    private PageShell? _shell;
    private string? _membershipKey;

    public JobsPage(ConfigStore store)
    {
        _store = store;
        Dock = DockStyle.Fill;
        UiBuffering.Enable(this);
        _shell = new PageShell("Historia wydruków", "Ostatnie zadania wykonane na tym komputerze");

        var bar = new SasistToolbar();
        bar.AddButton("Odśwież", SasistButtonKind.Secondary, (_, _) => ForceSync(UiState.Capture(_store)));
        bar.AddButton("Wyczyść", SasistButtonKind.Ghost, (_, _) =>
        {
            JobHistoryStore.Clear();
            ForceSync(UiState.Capture(_store));
        });

        _list = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Color.Transparent,
        };
        _empty = new SasistEmptyState(
            "Brak historii wydruków",
            "Pierwszy wydruk pojawi się tutaj.",
            AppIcons.History);
        _list.Controls.Add(_empty);

        _shell.Body.Controls.Add(_list);
        _shell.Body.Controls.Add(bar);
        Controls.Add(_shell);
        _shell.Body.Resize += (_, _) => FitWidths();
        UiBuffering.Enable(_shell);
    }

    public void ApplyValues(UiState state)
    {
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
        var w = Math.Max(320, _list.ClientSize.Width - Theme.Space.Xl);
        foreach (Control c in _list.Controls)
        {
            c.MaximumSize = new Size(w, 0);
            if (c is JobCard)
                c.MinimumSize = new Size(Math.Min(320, w), 0);
        }
    }

    private sealed class JobCard : SasistCard
    {
        private readonly SasistBody _time;
        private readonly SasistBody _doc;
        private readonly SasistCaption _printer;
        private readonly SasistStatusBadge _status;
        private readonly SasistIcon _icon;
        private JobRow _row;

        public JobCard(JobRow j)
        {
            _row = j;
            AutoSize = true;
            AutoSizeMode = AutoSizeMode.GrowAndShrink;
            Margin = new Padding(0, 0, 0, Theme.Space.Md);
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

            _icon = new SasistIcon { Margin = new Padding(0, Theme.Space.Sm, Theme.Space.Md, Theme.Space.Sm) };
            _time = new SasistBody { Font = Theme.BodySemibold, Margin = new Padding(0, Theme.Space.Sm, Theme.Space.Md, Theme.Space.Sm) };

            var mid = new FlowLayoutPanel
            {
                AutoSize = true,
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                BackColor = Color.Transparent,
                Margin = new Padding(0, Theme.Space.Xs, Theme.Space.Md, Theme.Space.Xs),
                MinimumSize = new Size(180, 0),
            };
            _doc = new SasistBody { Font = Theme.BodySemibold, MaximumSize = new Size(480, 0) };
            _printer = new SasistCaption { MaximumSize = new Size(480, 0) };
            mid.Controls.Add(_doc);
            mid.Controls.Add(_printer);

            _status = new SasistStatusBadge { Margin = new Padding(Theme.Space.Sm, Theme.Space.Sm, 0, Theme.Space.Sm) };

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
            _icon.Set(ok ? AppIcons.Check : AppIcons.Error, ok ? Theme.Success : Theme.Danger, 16f);
            UiBuffering.SetTextIfChanged(_time, j.At.ToLocalTime().ToString("HH:mm"));
            UiBuffering.SetTextIfChanged(_doc, string.IsNullOrWhiteSpace(j.Id) ? "Wydruk" : $"Zadanie {j.Id}");
            UiBuffering.SetTextIfChanged(_printer, j.Printer);
            _status.SetStatus(j.Status, ok);
        }

        private void Open()
        {
            SasistDialog.Info(FindForm()!,
                $"Czas: {_row.At.ToLocalTime():dd.MM.yyyy HH:mm:ss}\nDrukarka: {_row.Printer}\nStatus: {_row.Status}\nId: {_row.Id}" +
                (string.IsNullOrWhiteSpace(_row.Error) ? "" : $"\nBłąd: {_row.Error}"),
                "Szczegóły wydruku");
        }
    }
}
