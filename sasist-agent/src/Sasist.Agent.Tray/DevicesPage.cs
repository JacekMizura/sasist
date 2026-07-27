using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

internal sealed class DevicesPage : UserControl
{
    private readonly ListView _list;
    private readonly Label _summary;

    public DevicesPage()
    {
        Dock = DockStyle.Fill;
        BackColor = Color.FromArgb(245, 246, 248);

        var title = new Label
        {
            Text = "Urządzenia",
            Dock = DockStyle.Top,
            Height = 40,
            Font = new Font("Segoe UI Semibold", 18f),
            ForeColor = Color.FromArgb(28, 28, 30),
        };

        _summary = new Label
        {
            Dock = DockStyle.Top,
            Height = 28,
            ForeColor = Color.FromArgb(90, 90, 98),
        };

        var toolbar = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 44,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            Padding = new Padding(0, 4, 0, 4),
        };

        var testBtn = new Button
        {
            Text = "Druk testowy",
            Width = 140,
            Height = 34,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(249, 115, 22),
            ForeColor = Color.White,
            Font = new Font("Segoe UI Semibold", 10f),
            Cursor = Cursors.Hand,
        };
        testBtn.FlatAppearance.BorderSize = 0;
        testBtn.Click += (_, _) => RunTestPrint();

        var refreshBtn = new Button
        {
            Text = "Odśwież",
            Width = 100,
            Height = 34,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.White,
            Cursor = Cursors.Hand,
        };
        refreshBtn.Click += (_, _) => RefreshData();

        toolbar.Controls.Add(testBtn);
        toolbar.Controls.Add(refreshBtn);

        _list = new ListView
        {
            Dock = DockStyle.Fill,
            View = View.Details,
            FullRowSelect = true,
            MultiSelect = false,
            HideSelection = false,
            Font = new Font("Segoe UI", 10f),
            BorderStyle = BorderStyle.FixedSingle,
        };
        _list.Columns.Add("Drukarka", 360);
        _list.Columns.Add("Status", 140);
        _list.Columns.Add("Uwagi", 180);

        Controls.Add(_list);
        Controls.Add(toolbar);
        Controls.Add(_summary);
        Controls.Add(title);
    }

    public void RefreshData()
    {
        var printers = LocalPrinters.List();
        _summary.Text = UiCopy.DevicesReadySummary(printers.Count(p => p.Status == "Gotowa"));
        _list.BeginUpdate();
        _list.Items.Clear();
        foreach (var p in printers)
        {
            var item = new ListViewItem(p.Name);
            item.SubItems.Add(p.Status);
            item.SubItems.Add(p.IsDefault ? "Domyślna" : "");
            item.Tag = p.Name;
            if (p.Status != "Gotowa")
                item.ForeColor = Color.FromArgb(160, 60, 60);
            _list.Items.Add(item);
        }
        _list.EndUpdate();
    }

    private void RunTestPrint()
    {
        if (_list.SelectedItems.Count == 0)
        {
            MessageBox.Show("Wybierz drukarkę z listy.", "Druk testowy", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        var name = _list.SelectedItems[0].Tag as string ?? _list.SelectedItems[0].Text;
        try
        {
            LocalPrinters.PrintTestPage(name);
            JobHistoryStore.Append($"test-{DateTime.Now:HHmmss}", name, "Wydrukowano", null);
            MessageBox.Show("Wysłano wydruk testowy.", "Druk testowy", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            JobHistoryStore.Append($"test-{DateTime.Now:HHmmss}", name, "Błąd", ex.Message);
            MessageBox.Show(
                UserMessages.PrintFailed,
                "Druk testowy",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            try
            {
                File.AppendAllText(
                    Path.Combine(AgentPaths.LogsDir, "tray-errors.log"),
                    $"[{DateTimeOffset.Now:O}] test print: {ex}\n\n");
            }
            catch { /* ignore */ }
        }
    }

    public override void Refresh()
    {
        base.Refresh();
        RefreshData();
    }
}
