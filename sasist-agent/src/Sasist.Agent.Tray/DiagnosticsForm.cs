using System.Diagnostics;
using System.ServiceProcess;
using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

/// <summary>Technical details for support — never shown on the main Status screen.</summary>
internal sealed class DiagnosticsForm : Form
{
    private readonly ConfigStore _store;
    private readonly TextBox _details;
    private readonly Button _runChecks;

    public DiagnosticsForm(ConfigStore store)
    {
        _store = store;

        Text = "Diagnostyka — Sasist Agent";
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        MinimizeBox = true;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(520, 520);
        BackColor = Color.FromArgb(250, 250, 252);
        Font = new Font("Segoe UI", 9.5f);
        Icon = Branding.AppIcon;

        var intro = new Label
        {
            Left = 20,
            Top = 16,
            Width = 480,
            Height = 36,
            ForeColor = Color.FromArgb(90, 90, 98),
            Text = "Te informacje są przeznaczone dla pomocy technicznej Sasist.\nZwykle nie są potrzebne do codziennej pracy.",
        };

        _details = new TextBox
        {
            Left = 20,
            Top = 60,
            Width = 480,
            Height = 380,
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            Font = new Font("Consolas", 9f),
            BorderStyle = BorderStyle.FixedSingle,
            BackColor = Color.White,
        };

        _runChecks = new Button
        {
            Text = "Uruchom sprawdzenie",
            Left = 20,
            Top = 456,
            Width = 200,
            Height = 36,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(249, 115, 22),
            ForeColor = Color.White,
            Font = new Font("Segoe UI Semibold", 10f),
            Cursor = Cursors.Hand,
        };
        _runChecks.FlatAppearance.BorderSize = 0;
        _runChecks.Click += async (_, _) => await RunHostChecksAsync();

        var openLogs = new Button
        {
            Text = "Otwórz logi",
            Left = 232,
            Top = 456,
            Width = 140,
            Height = 36,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(240, 240, 244),
            ForeColor = Color.FromArgb(40, 40, 45),
            Cursor = Cursors.Hand,
        };
        openLogs.FlatAppearance.BorderSize = 0;
        openLogs.Click += (_, _) =>
        {
            AgentPaths.EnsureDirectories();
            Process.Start(new ProcessStartInfo
            {
                FileName = "explorer.exe",
                Arguments = $"\"{AgentPaths.LogsDir}\"",
                UseShellExecute = true,
            });
        };

        Controls.AddRange([intro, _details, _runChecks, openLogs]);
        Shown += (_, _) => RefreshDetails();
    }

    private void RefreshDetails()
    {
        var cfg = _store.Load();
        var snap = AgentStatusStore.Read();
        var service = DescribeService();

        var lines = new List<string>
        {
            "— Połączenie —",
            $"Status usługi:        {service}",
            $"Połączenie z Sasist:  {(snap?.Online == true ? "Tak" : "Nie / nieznane")}",
            $"Firma:                {UiCopy.CompanyName(cfg, snap)}",
            $"Komputer:             {cfg.ComputerName}",
            $"Ostatnia synchronizacja: {UiCopy.RelativeSync(snap?.UpdatedAt)}",
            "",
            "— Identyfikatory (wsparcie) —",
            $"ID Agenta:            {(cfg.AgentId > 0 ? cfg.AgentId.ToString() : "—")}",
            $"Identyfikator maszyny: {cfg.MachineId}",
            $"Token Agenta:          {UiCopy.MaskSecret(cfg.Token)}",
            "",
            "— Szczegóły połączenia —",
            $"Endpoint:              {cfg.ServerUrl}",
            $"Sygnatura życia:       co {cfg.HeartbeatIntervalSec} s",
            $"Odpytywanie:           co {cfg.PollIntervalSec} s",
            $"Wersja protokołu:      {AgentConfig.ProtocolVersion}",
            $"Wersja Agenta:         {AgentConfig.AgentVersion}",
            "",
            "— Ścieżki —",
            $"Konfiguracja:         {AgentPaths.ConfigPath}",
            $"Logi:                 {AgentPaths.LogsDir}",
            $"Urządzenia (licznik): {snap?.DeviceCount ?? 0}",
        };

        _details.Text = string.Join(Environment.NewLine, lines);
    }

    private static string DescribeService()
    {
        try
        {
            using var sc = new ServiceController(TrayApplicationContext.ServiceName);
            return sc.Status switch
            {
                ServiceControllerStatus.Running => "Uruchomiona",
                ServiceControllerStatus.Stopped => "Zatrzymana",
                ServiceControllerStatus.StartPending => "Uruchamianie…",
                ServiceControllerStatus.StopPending => "Zatrzymywanie…",
                _ => sc.Status.ToString(),
            };
        }
        catch
        {
            return "Niedostępna";
        }
    }

    private async Task RunHostChecksAsync()
    {
        _runChecks.Enabled = false;
        try
        {
            var hostExe = LocateHostExe();
            if (hostExe is null)
            {
                MessageBox.Show(
                    UserMessages.DiagnosticsFailed,
                    "Diagnostyka",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }

            var psi = new ProcessStartInfo
            {
                FileName = hostExe,
                Arguments = "diagnostics",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
            };
            using var proc = Process.Start(psi);
            if (proc is null)
            {
                MessageBox.Show(UserMessages.DiagnosticsFailed, "Diagnostyka", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            var stdout = await proc.StandardOutput.ReadToEndAsync();
            var stderr = await proc.StandardError.ReadToEndAsync();
            await proc.WaitForExitAsync();

            var checks = (stdout + "\n" + stderr)
                .Split('\n')
                .Select(l => l.Trim())
                .Where(l => !string.IsNullOrWhiteSpace(l))
                .ToList();

            RefreshDetails();
            _details.AppendText(Environment.NewLine + Environment.NewLine + "— Wynik sprawdzenia —" + Environment.NewLine);
            _details.AppendText(checks.Count > 0
                ? string.Join(Environment.NewLine, checks)
                : (proc.ExitCode == 0
                    ? "Sprawdzenie zakończone pomyślnie."
                    : "Sprawdzenie wykryło problemy. Szczegóły znajdują się w logach."));
        }
        catch (Exception ex)
        {
            MessageBox.Show(UserMessages.FromException(ex), "Diagnostyka", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            _runChecks.Enabled = true;
        }
    }

    private static string? LocateHostExe()
    {
        var beside = Path.Combine(AppContext.BaseDirectory, "Sasist.Agent.Host.exe");
        if (File.Exists(beside))
            return beside;

        var pf = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "Sasist",
            "Agent",
            "Sasist.Agent.Host.exe");
        return File.Exists(pf) ? pf : null;
    }
}
