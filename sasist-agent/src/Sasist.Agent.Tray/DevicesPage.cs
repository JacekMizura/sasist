using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

internal sealed class DevicesPage : UserControl, IRefreshablePage
{
    private readonly FlowLayoutPanel _flow;
    private readonly Label _summary;

    public DevicesPage()
    {
        Dock = DockStyle.Fill;
        BackColor = Color.Transparent;

        Controls.Add(new PageHeader("Urządzenia", "Drukarki wykryte na tym komputerze"));

        var toolbar = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 48,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            Padding = new Padding(0, 4, 0, 8),
            BackColor = Color.Transparent,
        };
        var refresh = new ModernButton { Text = "Odśwież", Width = 110 };
        refresh.Click += (_, _) => RefreshData();
        toolbar.Controls.Add(refresh);

        _summary = new Label
        {
            Dock = DockStyle.Top,
            Height = 28,
            Font = Theme.FontUi,
            ForeColor = Theme.TextSecondary,
            BackColor = Color.Transparent,
        };

        _flow = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            WrapContents = true,
            FlowDirection = FlowDirection.LeftToRight,
            Padding = new Padding(0, 8, 0, 8),
            BackColor = Color.Transparent,
        };

        Controls.Add(_flow);
        Controls.Add(toolbar);
        Controls.Add(_summary);
        Theme.Changed += () => { _summary.ForeColor = Theme.TextSecondary; RefreshData(); };
    }

    public void RefreshData()
    {
        var printers = LocalPrinters.List();
        _summary.Text = UiCopy.DevicesReadySummary(printers.Count(p => p.Status == "Gotowa"));
        _flow.SuspendLayout();
        _flow.Controls.Clear();
        foreach (var p in printers)
            _flow.Controls.Add(BuildCard(p));
        _flow.ResumeLayout();
    }

    private Control BuildCard(LocalPrinterInfo p)
    {
        var card = new RoundedCard
        {
            Width = 320,
            Height = 168,
            Margin = new Padding(0, 0, 16, 16),
        };

        var icon = new Label
        {
            Text = AppIcons.Printer,
            Font = Theme.Icon(20f),
            ForeColor = Theme.Accent,
            Left = 20,
            Top = 18,
            Width = 32,
            Height = 28,
            BackColor = Color.Transparent,
        };
        var name = new Label
        {
            Text = p.Name,
            Left = 56,
            Top = 16,
            Width = 240,
            Height = 28,
            Font = new Font("Segoe UI Semibold", 11f),
            ForeColor = Theme.TextPrimary,
            BackColor = Color.Transparent,
        };
        var badge = new Label
        {
            Text = p.IsDefault ? "Domyślna" : "",
            Left = 56,
            Top = 42,
            Width = 120,
            Height = 18,
            Font = Theme.FontCaption,
            ForeColor = Theme.Accent,
            BackColor = Color.Transparent,
        };
        var status = new Label
        {
            Text = p.Status == "Gotowa" ? "●  Gotowa" : "●  Niedostępna",
            Left = 20,
            Top = 72,
            Width = 260,
            Height = 22,
            Font = Theme.FontUiSemibold,
            ForeColor = p.Status == "Gotowa" ? Theme.Success : Theme.Danger,
            BackColor = Color.Transparent,
        };

        var test = new ModernButton
        {
            Text = "Druk testowy",
            Primary = true,
            Left = 20,
            Top = 110,
            Width = 130,
            Height = 34,
        };
        test.Click += (_, _) => RunTest(p.Name);

        var details = new ModernButton
        {
            Text = "Szczegóły",
            Left = 160,
            Top = 110,
            Width = 120,
            Height = 34,
        };
        details.Click += (_, _) =>
            MessageBox.Show(
                $"Drukarka: {p.Name}\nStatus: {p.Status}\n{(p.IsDefault ? "Drukarka domyślna systemu Windows" : "Drukarka dodatkowa")}",
                "Szczegóły drukarki",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);

        card.Controls.AddRange([icon, name, badge, status, test, details]);
        return card;
    }

    private static void RunTest(string name)
    {
        try
        {
            LocalPrinters.PrintTestPage(name);
            JobHistoryStore.Append($"test-{DateTime.Now:HHmmss}", name, "Wydrukowano", null);
            MessageBox.Show("Wysłano wydruk testowy.", "Druk testowy", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            JobHistoryStore.Append($"test-{DateTime.Now:HHmmss}", name, "Błąd", ex.Message);
            MessageBox.Show(UserMessages.PrintFailed, "Druk testowy", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            try
            {
                File.AppendAllText(Path.Combine(AgentPaths.LogsDir, "tray-errors.log"), $"[{DateTimeOffset.Now:O}] {ex}\n\n");
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
