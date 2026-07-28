// Capture utility — navigates via ui-navigate.request; PrintWindow (not screen).
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

internal static class Program
{
    private const uint SwRestore = 9;
    private const uint SwShow = 5;
    private static readonly IntPtr HwndTopmost = new(-1);
    private static readonly IntPtr HwndNotopmost = new(-2);
    private const uint SwpNosize = 0x0001;
    private const uint SwpNomove = 0x0002;
    private const uint SwpShowwindow = 0x0040;

    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr hwnd, int nCmdShow);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hwnd, out RECT r);
    [DllImport("user32.dll")] private static extern bool MoveWindow(IntPtr hwnd, int x, int y, int w, int h, bool repaint);
    [DllImport("user32.dll")] private static extern bool PrintWindow(IntPtr hwnd, IntPtr hdcBlt, uint nFlags);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr hwnd, IntPtr insertAfter, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] private static extern bool BringWindowToTop(IntPtr hwnd);

    [StructLayout(LayoutKind.Sequential)] private struct RECT { public int L, T, R, B; }

    private static void Main(string[] args)
    {
        var outDir = args.Length > 0 ? args[0] : @"c:\Users\jacek_bbbkzut\Desktop\Analiza magazynowa\sasist-agent\dist\ui-shots";
        Directory.CreateDirectory(outDir);

        var proc = System.Diagnostics.Process.GetProcessesByName("Sasist.Agent.Tray")
            .FirstOrDefault(p => p.MainWindowHandle != IntPtr.Zero)
            ?? throw new Exception("Sasist.Agent.Tray not running");

        var hwnd = proc.MainWindowHandle;
        ShowWindow(hwnd, (int)SwRestore);
        SetWindowPos(hwnd, HwndTopmost, 0, 0, 0, 0, SwpNomove | SwpNosize | SwpShowwindow);
        BringWindowToTop(hwnd);
        SetForegroundWindow(hwnd);
        Thread.Sleep(400);

        GetWindowRect(hwnd, out var cur);
        if (cur.R - cur.L < 1280 || cur.B - cur.T < 840)
        {
            MoveWindow(hwnd, Math.Max(40, cur.L), Math.Max(40, cur.T), 1280, 860, true);
            Thread.Sleep(250);
        }

        GetWindowRect(hwnd, out var rect);
        Console.WriteLine($"rect {rect.L},{rect.T} {rect.R - rect.L}x{rect.B - rect.T} hwnd=0x{hwnd.ToInt64():X}");

        var navDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "Sasist", "Agent");
        Directory.CreateDirectory(navDir);
        var navFile = Path.Combine(navDir, "ui-navigate.request");

        var pages = new (string File, string Id)[]
        {
            ("01-status.png", "status"),
            ("02-devices.png", "devices"),
            ("03-history.png", "jobs"),
            ("04-logs.png", "logs"),
            ("05-diagnostics.png", "diagnostics"),
            ("06-test.png", "test"),
            ("07-settings.png", "settings"),
            ("08-updates.png", "updates"),
        };

        foreach (var (file, id) in pages)
        {
            File.WriteAllText(navFile, id);
            for (var i = 0; i < 25 && File.Exists(navFile); i++)
                Thread.Sleep(80);
            Thread.Sleep(600);
            SetForegroundWindow(hwnd);
            Thread.Sleep(120);
            using var bmp = Capture(hwnd);
            var path = Path.Combine(outDir, file);
            bmp.Save(path, ImageFormat.Png);
            Console.WriteLine($"saved {path} ({bmp.Width}x{bmp.Height}, {new FileInfo(path).Length} bytes)");
        }

        SetWindowPos(hwnd, HwndNotopmost, 0, 0, 0, 0, SwpNomove | SwpNosize | SwpShowwindow);
    }

    private static Bitmap Capture(IntPtr hwnd)
    {
        GetWindowRect(hwnd, out var r);
        var w = Math.Max(100, r.R - r.L);
        var h = Math.Max(100, r.B - r.T);
        var bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bmp);
        g.Clear(Color.Magenta); // fail color if PrintWindow blank
        var hdc = g.GetHdc();
        var ok = PrintWindow(hwnd, hdc, 2); // PW_RENDERFULLCONTENT
        g.ReleaseHdc(hdc);
        if (!ok)
        {
            // fallback
            g.CopyFromScreen(r.L, r.T, 0, 0, new Size(w, h));
        }
        return bmp;
    }
}
