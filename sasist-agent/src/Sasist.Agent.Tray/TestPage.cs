using System.Net.NetworkInformation;
using System.Security.Cryptography;
using System.ServiceProcess;
using System.Text;
using Sasist.Agent.Core.Config;
using Sasist.Agent.Tray.Mvp;

namespace Sasist.Agent.Tray;

internal sealed class TestPage : UserControl, IPageView
{
    private readonly ConfigStore _store;
    private readonly FlowLayoutPanel _list;
    private readonly Label _result;
    private readonly SasistButton _run;
    private readonly List<(Label Icon, Label Detail)> _rows = new();
    private PageShell? _shell;

    private static readonly string[] Names =
    [
        "Internet", "Sasist", "Backend", "Agent", "Usługa",
        "Drukarki", "Synchronizacja", "Uprawnienia", "Folder logów", "DPAPI",
    ];

    public TestPage(ConfigStore store)
    {
        _store = store;
        Dock = DockStyle.Fill;
        UiBuffering.Enable(this);
        _shell = new PageShell("Test", "Automatyczne sprawdzenie gotowości komputera do pracy z Sasist");

        var bar = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            WrapContents = true,
            BackColor = Color.Transparent,
            Padding = new Padding(0, 0, 0, 12),
        };
        _run = new SasistButton { Text = "Uruchom test", Primary = true };
        _run.Click += async (_, _) => await RunAsync();
        bar.Controls.Add(_run);

        _result = new Label
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            Font = Theme.FontSection,
            ForeColor = Theme.TextPrimary,
            Text = "Uruchom test, aby sprawdzić system.",
            BackColor = Color.Transparent,
            Padding = new Padding(0, 0, 0, 16),
        };

        _list = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Color.Transparent,
        };

        foreach (var name in Names)
        {
            var card = new SasistCard
            {
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Margin = new Padding(0, 0, 0, 10),
                MinimumSize = new Size(280, 56),
            };
            var grid = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                ColumnCount = 2,
                RowCount = 2,
                BackColor = Color.Transparent,
            };
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            grid.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            grid.RowStyles.Add(new RowStyle(SizeType.AutoSize));

            var icon = LayoutHelpers.Icon(AppIcons.Info, Theme.TextFaint, 14f);
            icon.Margin = new Padding(0, 4, 10, 4);
            var title = LayoutHelpers.Wrap(name, Theme.FontBodySemibold, Theme.TextPrimary, 400);
            var detail = LayoutHelpers.Wrap("Oczekuje…", Theme.FontCaption, Theme.TextMuted, 400);
            grid.Controls.Add(icon, 0, 0);
            grid.SetRowSpan(icon, 2);
            grid.Controls.Add(title, 1, 0);
            grid.Controls.Add(detail, 1, 1);
            card.Controls.Add(grid);
            _list.Controls.Add(card);
            _rows.Add((icon, detail));
        }

        _shell.Body.Controls.Add(_list);
        _shell.Body.Controls.Add(_result);
        _shell.Body.Controls.Add(bar);
        Controls.Add(_shell);
        _shell.Body.Resize += (_, _) => Relayout();
    }

    private void Relayout()
    {
        if (_shell is null) return;
        var w = Math.Max(280, _shell.Body.ClientSize.Width - 16);
        foreach (Control c in _list.Controls)
        {
            c.MaximumSize = new Size(w, 0);
            c.MinimumSize = new Size(Math.Min(280, w), 0);
            foreach (Control inner in c.Controls)
            {
                if (inner is TableLayoutPanel grid)
                {
                    foreach (Control cell in grid.Controls)
                        LayoutHelpers.SetMaxWidth(cell, w - 64);
                }
            }
        }
        _result.MaximumSize = new Size(w, 0);
    }

    public void ApplyValues(UiState state) { /* test results are user-driven */ }
    public void ForceSync(UiState state) => Relayout();

    public void RefreshData() { Relayout(); }

    private async Task RunAsync()
    {
        _run.Enabled = false;
        _result.Text = "Trwa sprawdzanie…";
        _result.ForeColor = Theme.TextMuted;
        var oks = new List<bool>();
        for (var i = 0; i < Names.Length; i++)
        {
            Set(i, null, "Sprawdzanie…");
            await Task.Delay(100);
            var (ok, detail) = await CheckAsync(Names[i]);
            Set(i, ok, detail);
            oks.Add(ok);
        }
        var all = oks.All(x => x);
        _result.Text = all ? "System gotowy do pracy." : "Wymaga naprawy.";
        _result.ForeColor = all ? Theme.Success : Theme.Danger;
        _run.Enabled = true;
        Relayout();
    }

    private void Set(int i, bool? ok, string detail)
    {
        var (icon, d) = _rows[i];
        if (ok is null) { icon.Text = AppIcons.Sync; icon.ForeColor = Theme.Accent; }
        else if (ok.Value) { icon.Text = AppIcons.Check; icon.ForeColor = Theme.Success; }
        else { icon.Text = AppIcons.Error; icon.ForeColor = Theme.Danger; }
        d.Text = detail;
    }

    private async Task<(bool, string)> CheckAsync(string name) => name switch
    {
        "Internet" => (NetworkInterface.GetIsNetworkAvailable(), NetworkInterface.GetIsNetworkAvailable() ? "Sieć dostępna" : "Brak sieci"),
        "Sasist" => await Probe(SasistCloud.ResolveApiBaseUrl() + "/health"),
        "Backend" => await Probe(SasistCloud.ResolveApiBaseUrl().TrimEnd('/') + "/"),
        "Agent" => Agent(),
        "Usługa" => Service(),
        "Drukarki" => Printers(),
        "Synchronizacja" => Sync(),
        "Uprawnienia" => Perms(),
        "Folder logów" => Logs(),
        "DPAPI" => Dpapi(),
        _ => (true, "OK"),
    };

    private static async Task<(bool, string)> Probe(string url)
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };
            using var res = await http.GetAsync(url);
            return (true, $"HTTP {(int)res.StatusCode}");
        }
        catch { return (false, "Brak połączenia z Sasist"); }
    }

    private (bool, string) Agent()
    {
        var cfg = _store.Load();
        return cfg.NeedsSetup ? (false, "Brak połączenia — wpisz kod") : (true, $"Agent ID {cfg.AgentId}");
    }

    private static (bool, string) Service()
    {
        try
        {
            using var sc = new ServiceController(TrayApplicationContext.ServiceName);
            return sc.Status == ServiceControllerStatus.Running ? (true, "Uruchomiona") : (false, sc.Status.ToString());
        }
        catch { return (false, "Niedostępna"); }
    }

    private static (bool, string) Printers()
    {
        var n = LocalPrinters.List().Count;
        return n > 0 ? (true, $"{n} drukarek") : (false, "Brak drukarek");
    }

    private static (bool, string) Sync()
    {
        var snap = AgentStatusStore.Read();
        if (snap is null) return (false, "Brak synchronizacji");
        return DateTimeOffset.UtcNow - snap.UpdatedAt.ToUniversalTime() < TimeSpan.FromMinutes(5)
            ? (true, UiCopy.RelativeSync(snap.UpdatedAt))
            : (false, "Synchronizacja przestarzała");
    }

    private static (bool, string) Perms()
    {
        try
        {
            AgentPaths.EnsureDirectories();
            var p = Path.Combine(AgentPaths.ProgramDataRoot, ".ui-perm");
            File.WriteAllText(p, "ok"); File.Delete(p);
            return (true, "Zapis OK");
        }
        catch { return (false, "Brak uprawnień"); }
    }

    private static (bool, string) Logs()
    {
        AgentPaths.EnsureDirectories();
        return Directory.Exists(AgentPaths.LogsDir) ? (true, "Folder dostępny") : (false, "Brak folderu");
    }

    private static (bool, string) Dpapi()
    {
        try
        {
            var plain = Encoding.UTF8.GetBytes("sasist");
            var enc = ProtectedData.Protect(plain, null, DataProtectionScope.LocalMachine);
            var dec = ProtectedData.Unprotect(enc, null, DataProtectionScope.LocalMachine);
            return Encoding.UTF8.GetString(dec) == "sasist" ? (true, "Ochrona działa") : (false, "Błąd DPAPI");
        }
        catch { return (false, "DPAPI niedostępne"); }
    }
}
