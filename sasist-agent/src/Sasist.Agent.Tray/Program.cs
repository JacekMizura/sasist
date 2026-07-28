using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using Sasist.Agent.Core.Config;
using Sasist.Agent.Tray.Mvp;

namespace Sasist.Agent.Tray;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        AgentPaths.EnsureDirectories();
        UiPreferences.Load();

        if (args.Any(a => string.Equals(a, "--layout-smoke", StringComparison.OrdinalIgnoreCase)))
        {
            RunLayoutSmoke(args);
            return;
        }
        if (args.Any(a => string.Equals(a, "--stability-test", StringComparison.OrdinalIgnoreCase)))
        {
            RunStabilityTest(args);
            return;
        }

        using var mutex = new Mutex(true, @"Global\Sasist.Agent.Tray", out var created);
        if (!created)
        {
            MessageBox.Show(
                "Sasist Agent jest już otwarty.\n\nKliknij dwukrotnie ikonę przy zegarze.",
                "Sasist Agent",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        var store = new ConfigStore();
        var config = store.Load();
        config.EnsureCloudUrl();
        try { store.Save(config); } catch { }

        Application.Run(new MainForm(store));
    }

    private static void RunLayoutSmoke(string[] args)
    {
        var outRoot = args.SkipWhile(a => !a.Equals("--layout-smoke", StringComparison.OrdinalIgnoreCase))
            .Skip(1).FirstOrDefault()
            ?? Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "dist", "layout-smoke");
        outRoot = Path.GetFullPath(outRoot);
        Directory.CreateDirectory(outRoot);

        var store = new ConfigStore();
        var pages = new[] { "status", "devices", "jobs", "logs", "diagnostics", "test", "settings", "updates" };
        var scales = new (string Name, float Factor)[]
        {
            ("100", 1.00f),
            ("125", 1.25f),
            ("150", 1.50f),
            ("175", 1.75f),
            ("200", 2.00f),
        };

        var allOk = true;
        var report = new System.Text.StringBuilder();
        report.AppendLine($"Layout smoke {DateTime.Now:O}");
        report.AppendLine("AutoScaleMode=None; HighDpi=PerMonitorV2; MVP value-only poll");
        report.AppendLine();

        foreach (var (name, factor) in scales)
        {
            var dir = Path.Combine(outRoot, name);
            Directory.CreateDirectory(dir);
            report.AppendLine($"=== scale {name}% (×{factor:0.00}) ===");

            using var form = new MainForm(store, smokeMode: true);
            form.StartPosition = FormStartPosition.Manual;
            form.Location = new Point(40, 40);
            form.ClientSize = new Size(1200, 780);
            form.Show();
            for (var i = 0; i < 20; i++) { Application.DoEvents(); Thread.Sleep(25); }

            if (Math.Abs(factor - 1f) > 0.01f)
            {
                form.Scale(new SizeF(factor, factor));
                form.PerformLayout();
                Application.DoEvents();
                Thread.Sleep(100);
            }

            foreach (var page in pages)
            {
                form.Navigate(page);
                Application.DoEvents();
                Thread.Sleep(120);
                form.PerformLayout();
                Application.DoEvents();

                var issues = form.AuditCurrentPage()
                    .Where(x => x.Kind is "clip-width" or "clip-height" or "clip-parent" or "overlap")
                    .Where(i => !i.Path.Contains("ScrollBar", StringComparison.OrdinalIgnoreCase))
                    .ToList();

                var ok = issues.Count == 0;
                allOk &= ok;
                report.AppendLine($"{(ok ? "PASS" : "FAIL")}  {page}  issues={issues.Count}");
                if (!ok)
                    report.AppendLine(LayoutAuditor.FormatReport(issues));

                CaptureForm(form, Path.Combine(dir, $"{page}.png"));
            }

            form.Close();
            report.AppendLine();
        }

        var reportPath = Path.Combine(outRoot, "report.txt");
        File.WriteAllText(reportPath, report.ToString());
        Console.WriteLine(report.ToString());
        Console.WriteLine($"Report: {reportPath}");
        Environment.ExitCode = allOk ? 0 : 2;
    }

    /// <summary>
    /// Accelerated stability: many poll ticks must not rebuild layout.
    /// Default duration 60s (override: --stability-test 600 for 10 min).
    /// </summary>
    private static void RunStabilityTest(string[] args)
    {
        var rest = args.SkipWhile(a => !a.Equals("--stability-test", StringComparison.OrdinalIgnoreCase)).Skip(1).ToList();
        var seconds = 60;
        if (rest.Count > 0 && int.TryParse(rest[0], out var s) && s > 0) seconds = s;

        var store = new ConfigStore();
        using var form = new MainForm(store, smokeMode: true);
        form.Show();
        for (var i = 0; i < 30; i++) { Application.DoEvents(); Thread.Sleep(30); }

        foreach (var page in new[] { "status", "devices", "jobs", "diagnostics", "settings", "updates" })
        {
            form.Navigate(page);
            Application.DoEvents();
        }
        form.Navigate("status");
        Application.DoEvents();

        UiMetrics.Reset();
        var rebuildAtStart = form.RebuildCount;
        var end = DateTime.UtcNow.AddSeconds(seconds);
        var ticks = 0;
        while (DateTime.UtcNow < end)
        {
            // Simulate presenter poll without waiting real 2s
            typeof(MainForm).GetMethod("Navigate", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Public);
            // Drive Tick via reflection on presenter — use public Sync through navigating stay + Apply
            form.GetType(); // keep form alive
            // Call presenter tick by forcing chrome update path: expose via Navigate stay
            var presenterField = typeof(MainForm).GetField("_presenter", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic);
            if (presenterField?.GetValue(form) is ShellPresenter presenter)
                presenter.Tick();
            ticks++;
            Application.DoEvents();
            Thread.Sleep(50);
        }

        var rebuilds = form.RebuildCount - rebuildAtStart;
        var values = form.ValueUpdateCount;
        Console.WriteLine($"Stability {seconds}s: ticks={ticks}, rebuilds={rebuilds}, valueUpdates={values}");
        if (rebuilds != 0)
        {
            Console.WriteLine("FAIL — layout rebuilt during polling");
            Environment.ExitCode = 3;
        }
        else
        {
            Console.WriteLine("PASS — no layout rebuild during polling");
            Environment.ExitCode = 0;
        }
    }

    [DllImport("user32.dll")] private static extern bool PrintWindow(IntPtr hwnd, IntPtr hdcBlt, uint nFlags);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hwnd, out RECT r);
    [StructLayout(LayoutKind.Sequential)] private struct RECT { public int L, T, R, B; }

    private static void CaptureForm(Form form, string path)
    {
        var hwnd = form.Handle;
        GetWindowRect(hwnd, out var r);
        var w = Math.Max(100, r.R - r.L);
        var h = Math.Max(100, r.B - r.T);
        using var bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bmp);
        var hdc = g.GetHdc();
        PrintWindow(hwnd, hdc, 2);
        g.ReleaseHdc(hdc);
        bmp.Save(path, ImageFormat.Png);
    }
}
