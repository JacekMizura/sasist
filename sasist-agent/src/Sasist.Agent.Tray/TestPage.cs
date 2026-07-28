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
    private readonly SasistHeading _result;
    private readonly SasistButton _run;
    private readonly List<(SasistIcon Icon, SasistCaption Detail, SasistBody Title)> _rows = new();
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

        var bar = new SasistToolbar();
        _run = bar.AddButton("Uruchom test", SasistButtonKind.Primary);
        _run.Click += async (_, _) => await RunAsync();

        _result = new SasistHeading
        {
            Dock = DockStyle.Top,
            Text = "Uruchom test, aby sprawdzić system.",
            Padding = new Padding(0, 0, 0, Theme.Space.Lg),
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
                Margin = new Padding(0, 0, 0, Theme.Space.Md),
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

            var icon = new SasistIcon();
            icon.Set(AppIcons.Info, Theme.FaintText, 14f);
            icon.Margin = new Padding(0, Theme.Space.Xs, Theme.Space.Md, Theme.Space.Xs);
            var title = new SasistBody { Text = name, Font = Theme.BodySemibold, MaximumSize = new Size(400, 0) };
            var detail = new SasistCaption { Text = "Oczekuje…", MaximumSize = new Size(400, 0) };
            grid.Controls.Add(icon, 0, 0);
            grid.SetRowSpan(icon, 2);
            grid.Controls.Add(title, 1, 0);
            grid.Controls.Add(detail, 1, 1);
            card.Controls.Add(grid);
            _list.Controls.Add(card);
            _rows.Add((icon, detail, title));
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
        var w = Math.Max(280, _shell.Body.ClientSize.Width - Theme.Space.Lg);
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

    public void ApplyValues(UiState state) { }
    public void ForceSync(UiState state) => Relayout();

    private async Task RunAsync()
    {
        _run.Enabled = false;
        _result.Text = "Trwa sprawdzanie…";
        _result.ForeColor = Theme.MutedText;
        Motion.StartPulse(_result);
        var oks = new List<bool>();
        for (var i = 0; i < Names.Length; i++)
        {
            Set(i, null, "Sprawdzanie…");
            await Task.Delay(100);
            var (ok, detail) = await CheckAsync(Names[i]);
            Set(i, ok, detail);
            oks.Add(ok);
        }
        Motion.StopPulse(_result);
        var all = oks.All(x => x);
        _result.Text = all ? "System gotowy do pracy." : "Wymaga naprawy.";
        _result.ForeColor = all ? Theme.Success : Theme.Danger;
        _run.Enabled = true;
        Relayout();
    }

    private void Set(int i, bool? ok, string detail)
    {
        var (icon, d, _) = _rows[i];
        if (ok is null) icon.Set(AppIcons.Sync, Theme.Primary, 14f);
        else if (ok.Value) icon.Set(AppIcons.Check, Theme.Success, 14f);
        else icon.Set(AppIcons.Error, Theme.Danger, 14f);
        d.Text = detail;
        d.ForeColor = ok is null ? Theme.MutedText : ok.Value ? Theme.Success : Theme.Danger;
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
