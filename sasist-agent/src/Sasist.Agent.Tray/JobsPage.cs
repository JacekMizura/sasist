using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

internal sealed class JobsPage : UserControl
{
    private readonly ListView _list;

    public JobsPage()
    {
        Dock = DockStyle.Fill;
        BackColor = Color.FromArgb(245, 246, 248);

        var title = new Label
        {
            Text = "Zadania",
            Dock = DockStyle.Top,
            Height = 40,
            Font = new Font("Segoe UI Semibold", 18f),
        };

        var hint = new Label
        {
            Text = "Ostatnie zadania drukowania z tego komputera.",
            Dock = DockStyle.Top,
            Height = 24,
            ForeColor = Color.FromArgb(90, 90, 98),
        };

        var toolbar = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 44,
            Padding = new Padding(0, 4, 0, 4),
        };
        var refresh = new Button { Text = "Odśwież", Width = 100, Height = 34, FlatStyle = FlatStyle.Flat, BackColor = Color.White };
        refresh.Click += (_, _) => RefreshData();
        var clear = new Button { Text = "Wyczyść listę", Width = 120, Height = 34, FlatStyle = FlatStyle.Flat, BackColor = Color.White };
        clear.Click += (_, _) =>
        {
            JobHistoryStore.Clear();
            RefreshData();
        };
        toolbar.Controls.Add(refresh);
        toolbar.Controls.Add(clear);

        _list = new ListView
        {
            Dock = DockStyle.Fill,
            View = View.Details,
            FullRowSelect = true,
            Font = new Font("Segoe UI", 10f),
            BorderStyle = BorderStyle.FixedSingle,
        };
        _list.Columns.Add("Data", 150);
        _list.Columns.Add("Drukarka", 220);
        _list.Columns.Add("Status", 120);
        _list.Columns.Add("Błąd", 280);

        Controls.Add(_list);
        Controls.Add(toolbar);
        Controls.Add(hint);
        Controls.Add(title);
    }

    public void RefreshData()
    {
        var rows = JobHistoryStore.Read();
        _list.BeginUpdate();
        _list.Items.Clear();
        foreach (var j in rows)
        {
            var item = new ListViewItem(j.At.ToLocalTime().ToString("dd.MM.yyyy HH:mm:ss"));
            item.SubItems.Add(j.Printer);
            item.SubItems.Add(j.Status);
            item.SubItems.Add(j.Error ?? "");
            if (j.Status.Contains("Błąd", StringComparison.OrdinalIgnoreCase))
                item.ForeColor = Color.FromArgb(160, 60, 60);
            _list.Items.Add(item);
        }
        _list.EndUpdate();
    }

    public override void Refresh()
    {
        base.Refresh();
        RefreshData();
    }
}
