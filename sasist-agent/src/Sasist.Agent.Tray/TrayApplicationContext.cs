using System.Diagnostics;
using System.ServiceProcess;
using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

internal sealed class TrayApplicationContext : ApplicationContext
{
    public const string ServiceName = "SasistAgent";

    private readonly ConfigStore _store;
    private readonly NotifyIcon _icon;
    private readonly ContextMenuStrip _menu;
    private readonly ToolStripMenuItem _headerItem;
    private readonly ToolStripMenuItem _statusItem;
    private readonly ToolStripMenuItem _orgItem;
    private readonly ToolStripMenuItem _devicesItem;
    private readonly System.Windows.Forms.Timer _timer;
    private bool _showingPairing;

    public TrayApplicationContext(ConfigStore store)
    {
        _store = store;

        _headerItem = new ToolStripMenuItem("Sasist Agent") { Enabled = false, Font = new Font("Segoe UI Semibold", 9f) };
        _statusItem = new ToolStripMenuItem("● Offline") { Enabled = false };
        _orgItem = new ToolStripMenuItem("Połączono z: —") { Enabled = false };
        _devicesItem = new ToolStripMenuItem("Urządzenia: —") { Enabled = false };

        _menu = new ContextMenuStrip();
        _menu.Items.Add(_headerItem);
        _menu.Items.Add(_statusItem);
        _menu.Items.Add(_orgItem);
        _menu.Items.Add(_devicesItem);
        _menu.Items.Add(new ToolStripSeparator());
        _menu.Items.Add("Otwórz panel urządzeń", null, (_, _) => OpenDevicesPanel());
        _menu.Items.Add("Diagnostyka", null, async (_, _) => await RunDiagnosticsAsync());
        _menu.Items.Add("Logi", null, (_, _) => OpenLogs());
        _menu.Items.Add("Restart usługi", null, (_, _) => RestartService());
        _menu.Items.Add("Odłącz urządzenie", null, (_, _) => Unpair());
        _menu.Items.Add("Sprawdź aktualizacje", null, (_, _) =>
            MessageBox.Show(UserMessages.UpdatesSoon, "Sasist Agent", MessageBoxButtons.OK, MessageBoxIcon.Information));
        _menu.Items.Add(new ToolStripSeparator());
        _menu.Items.Add("Zamknij Tray", null, (_, _) => ExitThread());

        _icon = new NotifyIcon
        {
            Text = "Sasist Agent",
            Icon = Branding.AppIcon,
            Visible = true,
            ContextMenuStrip = _menu,
        };
        _icon.DoubleClick += (_, _) => OpenDevicesPanel();

        _timer = new System.Windows.Forms.Timer { Interval = 4000 };
        _timer.Tick += (_, _) => RefreshStatus();
        _timer.Start();
        RefreshStatus();
    }

    private void RefreshStatus()
    {
        var cfg = _store.Load();
        if (cfg.NeedsSetup)
        {
            if (!_showingPairing)
                BeginPairingFlow();
            return;
        }

        var online = ServiceHelper.IsRunning(ServiceName);
        var snap = AgentStatusStore.Read();
        var org = !string.IsNullOrWhiteSpace(snap?.OrganizationName)
            ? snap!.OrganizationName
            : (!string.IsNullOrWhiteSpace(cfg.OrganizationName) ? cfg.OrganizationName : "Sasist");
        var devices = snap?.DeviceCount ?? 0;
        if (online && snap is not null)
            online = snap.Online || online;

        _statusItem.Text = online ? "● Online" : "● Offline";
        _statusItem.ForeColor = online ? Color.FromArgb(30, 140, 60) : Color.FromArgb(160, 60, 60);
        _orgItem.Text = $"Połączono z: {org}";
        _devicesItem.Text = $"Urządzenia: {devices}";
        _icon.Text = online ? $"Sasist Agent — Online ({devices})" : "Sasist Agent — Offline";
    }

    private void BeginPairingFlow()
    {
        if (_showingPairing)
            return;
        _showingPairing = true;
        try
        {
            using var form = new PairingForm(_store);
            if (form.ShowDialog() != DialogResult.OK)
            {
                // User cancelled unpair re-pair — stay in tray offline or exit if never paired
                var cfg = _store.Load();
                if (cfg.NeedsSetup)
                    ExitThread();
            }
        }
        finally
        {
            _showingPairing = false;
            RefreshStatus();
        }
    }

    private static void OpenDevicesPanel()
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = SasistCloud.DevicesPanelUrl,
                UseShellExecute = true,
            });
        }
        catch (Exception ex)
        {
            MessageBox.Show(UserMessages.FromException(ex), "Sasist Agent", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private static void OpenLogs()
    {
        AgentPaths.EnsureDirectories();
        Process.Start(new ProcessStartInfo
        {
            FileName = "explorer.exe",
            Arguments = $"\"{AgentPaths.LogsDir}\"",
            UseShellExecute = true,
        });
    }

    private async Task RunDiagnosticsAsync()
    {
        try
        {
            var hostExe = LocateHostExe();
            if (hostExe is null)
            {
                MessageBox.Show(UserMessages.DiagnosticsFailed, "Sasist Agent", MessageBoxButtons.OK, MessageBoxIcon.Warning);
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
                MessageBox.Show(UserMessages.DiagnosticsFailed, "Sasist Agent", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            var stdout = await proc.StandardOutput.ReadToEndAsync();
            var stderr = await proc.StandardError.ReadToEndAsync();
            await proc.WaitForExitAsync();

            // User-facing summary only — strip stack traces / technical noise
            var lines = (stdout + "\n" + stderr)
                .Split('\n')
                .Select(l => l.Trim())
                .Where(l => l.StartsWith("[pass]", StringComparison.OrdinalIgnoreCase)
                            || l.StartsWith("[fail]", StringComparison.OrdinalIgnoreCase)
                            || l.StartsWith("[warn]", StringComparison.OrdinalIgnoreCase)
                            || l.StartsWith("Ready:", StringComparison.OrdinalIgnoreCase)
                            || l.StartsWith("Sasist Agent", StringComparison.OrdinalIgnoreCase))
                .ToList();

            var summary = lines.Count > 0
                ? string.Join(Environment.NewLine, lines)
                : (proc.ExitCode == 0
                    ? "Diagnostyka zakończona pomyślnie."
                    : "Diagnostyka wykryła problemy. Sprawdź Logi.");

            MessageBox.Show(summary, "Diagnostyka — Sasist Agent", MessageBoxButtons.OK,
                proc.ExitCode == 0 ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        }
        catch (Exception ex)
        {
            MessageBox.Show(UserMessages.FromException(ex), "Sasist Agent", MessageBoxButtons.OK, MessageBoxIcon.Error);
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

    private void RestartService()
    {
        try
        {
            ServiceHelper.Restart(ServiceName);
            RefreshStatus();
            MessageBox.Show(
                "Usługa Sasist Agent została zrestartowana.",
                "Sasist Agent",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception)
        {
            MessageBox.Show(UserMessages.RestartFailed, "Sasist Agent", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void Unpair()
    {
        var confirm = MessageBox.Show(
            UserMessages.UnpairConfirm,
            "Sasist Agent",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Question,
            MessageBoxDefaultButton.Button2);
        if (confirm != DialogResult.Yes)
            return;

        try
        {
            try { ServiceHelper.Restart(ServiceName); } catch { /* may fail without admin — ok */ }
            // Stop is better than restart with empty config — Host waits for pairing
            try
            {
                using var sc = new ServiceController(ServiceName);
                if (sc.Status is ServiceControllerStatus.Running or ServiceControllerStatus.StartPending)
                {
                    sc.Stop();
                    sc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(20));
                }
            }
            catch
            {
                // ignore
            }

            _store.ClearPairing();
            RefreshStatus();
            BeginPairingFlow();
        }
        catch (Exception ex)
        {
            MessageBox.Show(UserMessages.FromException(ex), "Sasist Agent", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _timer.Stop();
            _timer.Dispose();
            _icon.Visible = false;
            _icon.Dispose();
            _menu.Dispose();
        }
        base.Dispose(disposing);
    }
}

internal static class ServiceHelper
{
    public static bool IsRunning(string serviceName)
    {
        try
        {
            using var sc = new ServiceController(serviceName);
            return sc.Status is ServiceControllerStatus.Running or ServiceControllerStatus.StartPending;
        }
        catch
        {
            return false;
        }
    }

    public static void Restart(string serviceName)
    {
        using var sc = new ServiceController(serviceName);
        if (sc.Status is ServiceControllerStatus.Running or ServiceControllerStatus.StartPending)
        {
            sc.Stop();
            sc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(30));
        }
        sc.Start();
        sc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(30));
    }

    public static void StartIfNeeded(string serviceName)
    {
        using var sc = new ServiceController(serviceName);
        if (sc.Status is ServiceControllerStatus.Running or ServiceControllerStatus.StartPending)
            return;
        sc.Start();
        sc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(30));
    }
}
