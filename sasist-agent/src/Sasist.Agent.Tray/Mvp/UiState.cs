using System.Reflection;
using System.ServiceProcess;
using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray.Mvp;

/// <summary>Immutable UI snapshot — presenters push values; views never poll stores directly on timer.</summary>
internal sealed record UiState(
    bool NeedsSetup,
    bool Online,
    string ConnPill,
    Color ConnPillColor,
    string Company,
    string Computer,
    string Version,
    string TrayTip,
    string DevicesSummary,
    string LastPrintValue,
    string LastPrintHint,
    string SyncValue,
    string ServiceStatus,
    string Endpoint,
    string AgentId,
    string TokenMasked,
    string Heartbeat,
    string PollInterval,
    string UpdateChannel,
    string MachineId,
    IReadOnlyList<PrinterRow> Printers,
    IReadOnlyList<JobRow> Jobs)
{
    public static UiState Capture(ConfigStore store)
    {
        var cfg = store.Load();
        var connection = ConnectionState.Capture(
            cfg,
            ServiceHelper.IsRunning(TrayApplicationContext.ServiceName));
        var printers = LocalPrinters.List();
        var devices = connection.DeviceCount > 0 ? connection.DeviceCount : printers.Count;
        var last = JobHistoryStore.Read().FirstOrDefault();
        string service;
        try
        {
            using var sc = new ServiceController(TrayApplicationContext.ServiceName);
            service = sc.Status == ServiceControllerStatus.Running ? "Uruchomiona" : sc.Status.ToString();
        }
        catch { service = "Niedostępna"; }

        var online = connection.Online;
        var snap = AgentStatusStore.Read();
        return new UiState(
            NeedsSetup: connection.NeedsSetup,
            Online: online,
            ConnPill: online ? "●  Połączono" : "●  Brak połączenia",
            ConnPillColor: online ? Theme.Success : Theme.Danger,
            Company: UiCopy.CompanyName(cfg, snap),
            Computer: string.IsNullOrWhiteSpace(cfg.ComputerName) ? Environment.MachineName : cfg.ComputerName,
            Version: $"v{AgentConfig.AgentVersion}",
            TrayTip: online ? "Sasist Agent — Połączono" : "Sasist Agent — Brak połączenia",
            DevicesSummary: UiCopy.DevicesReadySummary(devices),
            LastPrintValue: last is null ? "Brak" : last.At.ToLocalTime().ToString("HH:mm"),
            LastPrintHint: last is null ? "Historia jest pusta" : $"{last.Printer} · {last.Status}",
            SyncValue: UiCopy.RelativeSync(connection.LastSyncAt),
            ServiceStatus: service,
            Endpoint: string.IsNullOrWhiteSpace(connection.Endpoint) ? cfg.ServerUrl : connection.Endpoint,
            AgentId: connection.AgentId > 0 ? connection.AgentId.ToString() : "—",
            TokenMasked: UiCopy.MaskSecret(cfg.Token),
            Heartbeat: $"co {cfg.HeartbeatIntervalSec} s",
            PollInterval: $"co {cfg.PollIntervalSec} s",
            UpdateChannel: cfg.UpdateChannel,
            MachineId: cfg.MachineId,
            Printers: printers.Select(p => new PrinterRow(p.Name, p.Status, p.IsDefault)).ToList(),
            Jobs: JobHistoryStore.Read().Select(j => new JobRow(j.Id, j.Printer, j.Status, j.At, j.Error)).ToList());
    }

    public bool ChromeEquals(UiState? o) =>
        o is not null
        && NeedsSetup == o.NeedsSetup
        && ConnPill == o.ConnPill
        && Company == o.Company
        && Version == o.Version
        && TrayTip == o.TrayTip;
}

internal readonly record struct PrinterRow(string Name, string Status, bool IsDefault);
internal readonly record struct JobRow(string Id, string Printer, string Status, DateTimeOffset At, string? Error);

/// <summary>Page view: structure built once; ApplyValues mutates labels only.</summary>
internal interface IPageView
{
    void ApplyValues(UiState state);
    /// <summary>User-initiated full sync (e.g. Odśwież). May rebuild structure if membership changed.</summary>
    void ForceSync(UiState state);
}

internal interface IShellView
{
    void SetChrome(UiState state);
    void SetPairingVisible(bool visible);
    IPageView? CurrentPage { get; }
}

/// <summary>Counts structural rebuilds — must stay 0 during heartbeat/polling.</summary>
internal static class UiMetrics
{
    private static long _rebuilds;
    private static long _valueUpdates;
    public static long Rebuilds => Interlocked.Read(ref _rebuilds);
    public static long ValueUpdates => Interlocked.Read(ref _valueUpdates);
    public static void NoteRebuild(string reason)
    {
        Interlocked.Increment(ref _rebuilds);
        System.Diagnostics.Debug.WriteLine($"[UiRebuild] {reason}");
    }
    public static void NoteValueUpdate() => Interlocked.Increment(ref _valueUpdates);
    public static void Reset()
    {
        Interlocked.Exchange(ref _rebuilds, 0);
        Interlocked.Exchange(ref _valueUpdates, 0);
    }
}

internal sealed class ShellPresenter
{
    private readonly ConfigStore _store;
    private readonly IShellView _view;
    private UiState? _last;

    public ShellPresenter(ConfigStore store, IShellView view)
    {
        _store = store;
        _view = view;
    }

    public UiState Current => _last ?? UiState.Capture(_store);

    /// <summary>Polling tick — chrome + current page values only. Never rebuilds layout.</summary>
    public void Tick()
    {
        var next = UiState.Capture(_store);
        if (_last is null || !_last.ChromeEquals(next))
        {
            _view.SetChrome(next);
            _view.SetPairingVisible(next.NeedsSetup);
        }
        _view.CurrentPage?.ApplyValues(next);
        _last = next;
    }

    public void SyncCurrentPage()
    {
        var next = UiState.Capture(_store);
        _view.SetChrome(next);
        _view.SetPairingVisible(next.NeedsSetup);
        _view.CurrentPage?.ForceSync(next);
        _last = next;
    }
}

internal static class UiBuffering
{
    private static readonly PropertyInfo? DoubleBufferedProp =
        typeof(Control).GetProperty("DoubleBuffered", BindingFlags.Instance | BindingFlags.NonPublic);

    public static void Enable(Control control)
    {
        DoubleBufferedProp?.SetValue(control, true);
        control.SetStyleSafe();
        foreach (Control child in control.Controls)
            Enable(child);
    }

    private static void SetStyleSafe(this Control c)
    {
        try
        {
            typeof(Control).GetMethod("SetStyle", BindingFlags.Instance | BindingFlags.NonPublic)
                ?.Invoke(c, [ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true]);
        }
        catch { /* ignore */ }
    }

    public static void SetTextIfChanged(Label label, string text)
    {
        if (label.Text == text) return;
        label.Text = text;
        UiMetrics.NoteValueUpdate();
    }

    public static void SetColorIfChanged(Label label, Color color)
    {
        if (label.ForeColor == color) return;
        label.ForeColor = color;
        UiMetrics.NoteValueUpdate();
    }
}
