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
    private readonly System.Windows.Forms.Timer _timer;
    private bool _showingPairing;
    private StatusForm? _statusForm;
    private DevicesForm? _devicesForm;
    private DiagnosticsForm? _diagnosticsForm;

    public TrayApplicationContext(ConfigStore store)
    {
        _store = store;

        _headerItem = new ToolStripMenuItem("Sasist Agent")
        {
            Enabled = false,
            Font = new Font("Segoe UI Semibold", 9f),
        };
        _statusItem = new ToolStripMenuItem(UiCopy.TrayConnection(false)) { Enabled = false };
        _orgItem = new ToolStripMenuItem("Połączono z: —") { Enabled = false };

        _menu = new ContextMenuStrip();
        _menu.Items.Add(_headerItem);
        _menu.Items.Add(_statusItem);
        _menu.Items.Add(_orgItem);
        _menu.Items.Add(new ToolStripSeparator());
        _menu.Items.Add("Status", null, (_, _) => ShowStatus());
        _menu.Items.Add("Urządzenia", null, (_, _) => ShowDevices());
        _menu.Items.Add("Diagnostyka", null, (_, _) => ShowDiagnostics());
        _menu.Items.Add("Logi", null, (_, _) => OpenLogs());
        _menu.Items.Add("Sprawdź aktualizacje", null, (_, _) => ShowUpdates());
        _menu.Items.Add("Odłącz urządzenie", null, (_, _) => Unpair());
        _menu.Items.Add("Uruchom ponownie usługę", null, (_, _) => RestartService());
        _menu.Items.Add(new ToolStripSeparator());
        _menu.Items.Add("Zamknij", null, (_, _) => ExitThread());

        _icon = new NotifyIcon
        {
            Text = "Sasist Agent",
            Icon = Branding.AppIcon,
            Visible = true,
            ContextMenuStrip = _menu,
        };
        _icon.DoubleClick += (_, _) => ShowStatus();

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

        var serviceRunning = ServiceHelper.IsRunning(ServiceName);
        var snap = AgentStatusStore.Read();
        var connected = serviceRunning && (snap?.Online ?? false);
        var org = UiCopy.CompanyName(cfg, snap);

        _statusItem.Text = UiCopy.TrayConnection(connected);
        _statusItem.ForeColor = connected
            ? Color.FromArgb(30, 140, 60)
            : Color.FromArgb(160, 60, 60);
        _orgItem.Text = $"Połączono z: {org}";
        _icon.Text = connected ? "Sasist Agent — Połączono" : "Sasist Agent — Brak połączenia";
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

    private void ShowStatus()
    {
        if (_statusForm is { IsDisposed: false })
        {
            _statusForm.BringToFront();
            _statusForm.Activate();
            return;
        }

        _statusForm = new StatusForm(_store, ShowDevices);
        _statusForm.FormClosed += (_, _) => _statusForm = null;
        _statusForm.Show();
    }

    private void ShowDevices()
    {
        if (_devicesForm is { IsDisposed: false })
        {
            _devicesForm.BringToFront();
            _devicesForm.Activate();
            return;
        }

        _devicesForm = new DevicesForm(_store);
        _devicesForm.FormClosed += (_, _) => _devicesForm = null;
        _devicesForm.Show();
    }

    private void ShowDiagnostics()
    {
        if (_diagnosticsForm is { IsDisposed: false })
        {
            _diagnosticsForm.BringToFront();
            _diagnosticsForm.Activate();
            return;
        }

        _diagnosticsForm = new DiagnosticsForm(_store);
        _diagnosticsForm.FormClosed += (_, _) => _diagnosticsForm = null;
        _diagnosticsForm.Show();
    }

    private static void ShowUpdates()
    {
        MessageBox.Show(
            UserMessages.UpToDate,
            "Aktualizacje — Sasist Agent",
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
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

    private void RestartService()
    {
        try
        {
            ServiceHelper.Restart(ServiceName);
            RefreshStatus();
            MessageBox.Show(
                UserMessages.ServiceRestarted,
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
                // ignore — still clear pairing
            }

            _store.ClearPairing();
            _statusForm?.Close();
            _devicesForm?.Close();
            _diagnosticsForm?.Close();
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
            _statusForm?.Dispose();
            _devicesForm?.Dispose();
            _diagnosticsForm?.Dispose();
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
