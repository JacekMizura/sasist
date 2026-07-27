using System.Net.NetworkInformation;
using System.Security.Cryptography;
using System.ServiceProcess;
using System.Text;
using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

internal sealed class TestPage : UserControl, IRefreshablePage
{
    private readonly ConfigStore _store;
    private readonly FlowLayoutPanel _list;
    private readonly Label _summary;
    private readonly ModernButton _run;
    private readonly List<(Label Icon, Label Text, Label Detail)> _rows = new();

    private static readonly string[] Checks =
    [
        "Internet",
        "Połączenie z Sasist",
        "Backend",
        "Agent",
        "Usługa Windows",
        "Drukarki",
        "Uprawnienia",
        "Folder logów",
        "DPAPI",
        "Synchronizacja",
    ];

    public TestPage(ConfigStore store)
    {
        _store = store;
        Dock = DockStyle.Fill;
        BackColor = Color.Transparent;
        Controls.Add(new PageHeader("Test", "Automatyczne sprawdzenie gotowości komputera"));

        var toolbar = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 48,
            Padding = new Padding(0, 4, 0, 8),
            BackColor = Color.Transparent,
        };
        _run = new ModernButton { Text = "Uruchom test", Primary = true, Width = 150 };
        _run.Click += async (_, _) => await RunAsync();
        toolbar.Controls.Add(_run);

        _summary = new Label
        {
            Dock = DockStyle.Top,
            Height = 36,
            Font = new Font("Segoe UI Semibold", 12f),
            ForeColor = Theme.TextPrimary,
            BackColor = Color.Transparent,
            Text = "Kliknij „Uruchom test”, aby sprawdzić system.",
        };

        _list = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Color.Transparent,
        };

        foreach (var name in Checks)
        {
            var card = new RoundedCard { Width = 680, Height = 56, Margin = new Padding(0, 0, 0, 8) };
            var icon = new Label
            {
                Text = AppIcons.Info,
                Font = Theme.Icon(14f),
                ForeColor = Theme.TextMuted,
                Left = 18,
                Top = 16,
                Width = 28,
                Height = 24,
                BackColor = Color.Transparent,
            };
            var title = new Label
            {
                Text = name,
                Left = 52,
                Top = 10,
                Width = 400,
                Height = 20,
                Font = Theme.FontUiSemibold,
                ForeColor = Theme.TextPrimary,
                BackColor = Color.Transparent,
            };
            var detail = new Label
            {
                Text = "Oczekuje…",
                Left = 52,
                Top = 30,
                Width = 580,
                Height = 18,
                Font = Theme.FontCaption,
                ForeColor = Theme.TextSecondary,
                BackColor = Color.Transparent,
            };
            card.Controls.AddRange([icon, title, detail]);
            _list.Controls.Add(card);
            _rows.Add((icon, title, detail));
        }

        Controls.Add(_list);
        Controls.Add(_summary);
        Controls.Add(toolbar);
        Theme.Changed += () => _summary.ForeColor = Theme.TextPrimary;
    }

    public void RefreshData() { /* static checklist until run */ }

    private async Task RunAsync()
    {
        _run.Enabled = false;
        _summary.Text = "Trwa sprawdzanie…";
        _summary.ForeColor = Theme.TextSecondary;
        var results = new List<bool>();

        for (var i = 0; i < Checks.Length; i++)
        {
            SetRow(i, null, "Sprawdzanie…");
            await Task.Delay(120);
            var (ok, detail) = await RunCheckAsync(Checks[i]);
            SetRow(i, ok, detail);
            results.Add(ok);
        }

        var allOk = results.All(x => x);
        _summary.Text = allOk ? "Wszystko działa poprawnie." : "Wymaga naprawy.";
        _summary.ForeColor = allOk ? Theme.Success : Theme.Danger;
        _run.Enabled = true;
    }

    private void SetRow(int i, bool? ok, string detail)
    {
        var (icon, _, d) = _rows[i];
        if (ok is null)
        {
            icon.Text = AppIcons.Sync;
            icon.ForeColor = Theme.Accent;
        }
        else if (ok.Value)
        {
            icon.Text = AppIcons.Check;
            icon.ForeColor = Theme.Success;
        }
        else
        {
            icon.Text = AppIcons.Error;
            icon.ForeColor = Theme.Danger;
        }
        d.Text = detail;
        d.ForeColor = Theme.TextSecondary;
    }

    private async Task<(bool Ok, string Detail)> RunCheckAsync(string name)
    {
        try
        {
            return name switch
            {
                "Internet" => (NetworkInterface.GetIsNetworkAvailable(), NetworkInterface.GetIsNetworkAvailable() ? "Sieć dostępna" : "Brak sieci"),
                "Połączenie z Sasist" => await ProbeHttpAsync(SasistCloud.ResolveApiBaseUrl() + "/health"),
                "Backend" => await ProbeHttpAsync(SasistCloud.ResolveApiBaseUrl().TrimEnd('/') + "/"),
                "Agent" => AgentReady(),
                "Usługa Windows" => ServiceCheck(),
                "Drukarki" => PrintersCheck(),
                "Uprawnienia" => PermissionsCheck(),
                "Folder logów" => LogsFolderCheck(),
                "DPAPI" => DpapiCheck(),
                "Synchronizacja" => SyncCheck(),
                _ => (true, "OK"),
            };
        }
        catch (Exception ex)
        {
            return (false, UserMessages.FromException(ex));
        }
    }

    private static async Task<(bool, string)> ProbeHttpAsync(string url)
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };
            using var res = await http.GetAsync(url);
            // any response (even 404) means host reachable
            return (true, $"Odpowiedź HTTP {(int)res.StatusCode}");
        }
        catch
        {
            return (false, "Nie udało się połączyć z Sasist");
        }
    }

    private (bool, string) AgentReady()
    {
        var cfg = _store.Load();
        if (cfg.NeedsSetup) return (false, "Brak połączenia — wpisz kod");
        return (true, $"Agent ID {cfg.AgentId}");
    }

    private static (bool, string) ServiceCheck()
    {
        try
        {
            using var sc = new ServiceController(TrayApplicationContext.ServiceName);
            return sc.Status == ServiceControllerStatus.Running
                ? (true, "Usługa uruchomiona")
                : (false, $"Stan: {sc.Status}");
        }
        catch
        {
            return (false, "Usługa niedostępna");
        }
    }

    private static (bool, string) PrintersCheck()
    {
        var n = LocalPrinters.List().Count;
        return n > 0 ? (true, $"{n} drukarek") : (false, "Brak drukarek");
    }

    private static (bool, string) PermissionsCheck()
    {
        try
        {
            AgentPaths.EnsureDirectories();
            var probe = Path.Combine(AgentPaths.ProgramDataRoot, ".ui-perm-probe");
            File.WriteAllText(probe, "ok");
            File.Delete(probe);
            return (true, "Zapis do ProgramData OK");
        }
        catch
        {
            return (false, "Brak uprawnień do zapisu");
        }
    }

    private static (bool, string) LogsFolderCheck()
    {
        try
        {
            AgentPaths.EnsureDirectories();
            return Directory.Exists(AgentPaths.LogsDir)
                ? (true, AgentPaths.LogsDir)
                : (false, "Brak folderu logów");
        }
        catch
        {
            return (false, "Folder logów niedostępny");
        }
    }

    private static (bool, string) DpapiCheck()
    {
        try
        {
            var plain = Encoding.UTF8.GetBytes("sasist-ui-probe");
            var protectedBytes = ProtectedData.Protect(plain, null, DataProtectionScope.LocalMachine);
            var round = ProtectedData.Unprotect(protectedBytes, null, DataProtectionScope.LocalMachine);
            return Encoding.UTF8.GetString(round) == "sasist-ui-probe"
                ? (true, "Ochrona danych działa")
                : (false, "DPAPI nie zwróciło danych");
        }
        catch
        {
            return (false, "DPAPI niedostępne");
        }
    }

    private static (bool, string) SyncCheck()
    {
        var snap = AgentStatusStore.Read();
        if (snap is null) return (false, "Brak synchronizacji");
        var age = DateTimeOffset.UtcNow - snap.UpdatedAt.ToUniversalTime();
        return age < TimeSpan.FromMinutes(5)
            ? (true, UiCopy.RelativeSync(snap.UpdatedAt))
            : (false, "Ostatnia synchronizacja była dawno");
    }

    public override void Refresh()
    {
        base.Refresh();
        RefreshData();
    }
}
