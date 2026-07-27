using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

internal sealed class JobsPage : UserControl, IRefreshablePage
{
    private readonly FlowLayoutPanel _list;

    public JobsPage()
    {
        Dock = DockStyle.Fill;
        BackColor = Color.Transparent;
        Controls.Add(new PageHeader("Historia wydruków", "Ostatnie zadania z tego komputera"));

        var toolbar = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 48,
            Padding = new Padding(0, 4, 0, 8),
            BackColor = Color.Transparent,
        };
        var refresh = new ModernButton { Text = "Odśwież", Width = 110 };
        refresh.Click += (_, _) => RefreshData();
        var clear = new ModernButton { Text = "Wyczyść", Width = 110 };
        clear.Click += (_, _) => { JobHistoryStore.Clear(); RefreshData(); };
        toolbar.Controls.Add(refresh);
        toolbar.Controls.Add(clear);

        _list = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Color.Transparent,
            Padding = new Padding(0, 4, 0, 8),
        };

        Controls.Add(_list);
        Controls.Add(toolbar);
        Theme.Changed += () => RefreshData();
    }

    public void RefreshData()
    {
        var rows = JobHistoryStore.Read();
        _list.SuspendLayout();
        _list.Controls.Clear();
        if (rows.Count == 0)
        {
            var empty = new Label
            {
                Text = "Brak historii wydruków.",
                AutoSize = true,
                ForeColor = Theme.TextSecondary,
                Font = Theme.FontUi,
                Margin = new Padding(4, 12, 0, 0),
            };
            _list.Controls.Add(empty);
        }
        else
        {
            foreach (var j in rows)
                _list.Controls.Add(BuildRow(j));
        }
        _list.ResumeLayout();
    }

    private Control BuildRow(JobHistoryEntry j)
    {
        var ok = j.Status.Contains("Wydruk", StringComparison.OrdinalIgnoreCase);
        var card = new RoundedCard
        {
            Width = Math.Max(640, Parent?.ClientSize.Width - 40 ?? 640),
            Height = 72,
            Margin = new Padding(0, 0, 0, 10),
            Cursor = Cursors.Hand,
        };
        card.Click += (_, _) => ShowDetails(j);
        foreach (Control c in card.Controls) { /* none yet */ }

        var dot = new Label
        {
            Text = ok ? AppIcons.Check : AppIcons.Error,
            Font = Theme.Icon(14f),
            ForeColor = ok ? Theme.Success : Theme.Danger,
            Left = 18,
            Top = 24,
            Width = 28,
            Height = 24,
            BackColor = Color.Transparent,
        };
        var time = new Label
        {
            Text = j.At.ToLocalTime().ToString("HH:mm"),
            Left = 52,
            Top = 14,
            Width = 70,
            Height = 22,
            Font = Theme.FontUiSemibold,
            ForeColor = Theme.TextPrimary,
            BackColor = Color.Transparent,
        };
        var title = new Label
        {
            Text = string.IsNullOrWhiteSpace(j.Id) ? "Wydruk" : $"Zadanie {j.Id}",
            Left = 130,
            Top = 12,
            Width = 360,
            Height = 22,
            Font = Theme.FontUiSemibold,
            ForeColor = Theme.TextPrimary,
            BackColor = Color.Transparent,
        };
        var printer = new Label
        {
            Text = j.Printer,
            Left = 130,
            Top = 36,
            Width = 360,
            Height = 20,
            Font = Theme.FontCaption,
            ForeColor = Theme.TextSecondary,
            BackColor = Color.Transparent,
        };
        var status = new Label
        {
            Text = j.Status,
            Left = 500,
            Top = 24,
            Width = 140,
            Height = 22,
            Font = Theme.FontUiSemibold,
            ForeColor = ok ? Theme.Success : Theme.Danger,
            BackColor = Color.Transparent,
            TextAlign = ContentAlignment.MiddleRight,
        };

        void bubble(object? s, EventArgs e) => ShowDetails(j);
        foreach (var ctrl in new Control[] { card, dot, time, title, printer, status })
            ctrl.Click += bubble;

        card.Controls.AddRange([dot, time, title, printer, status]);
        card.Resize += (_, _) => status.Left = Math.Max(400, card.Width - 160);
        return card;
    }

    private void ShowDetails(JobHistoryEntry j)
    {
        MessageBox.Show(
            $"Czas: {j.At.ToLocalTime():dd.MM.yyyy HH:mm:ss}\n" +
            $"Drukarka: {j.Printer}\n" +
            $"Status: {j.Status}\n" +
            $"Id: {j.Id}\n" +
            (string.IsNullOrWhiteSpace(j.Error) ? "" : $"Błąd: {j.Error}"),
            "Szczegóły wydruku",
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
    }

    public override void Refresh()
    {
        base.Refresh();
        RefreshData();
    }
}
