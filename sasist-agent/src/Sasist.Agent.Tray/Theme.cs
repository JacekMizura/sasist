using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

/// <summary>
/// Sasist product design tokens — mirrored from frontend/src/design-system (Tailwind slate/orange kit).
/// Single source of visual truth for the desktop shell.
/// </summary>
internal static class Theme
{
    // Brand (orange-500 / 600 / 700)
    public static readonly Color Accent = Color.FromArgb(0xF9, 0x73, 0x16);
    public static readonly Color AccentHover = Color.FromArgb(0xEA, 0x58, 0x0C);
    public static readonly Color AccentActive = Color.FromArgb(0xC2, 0x41, 0x0C);
    public static readonly Color AccentSoft = Color.FromArgb(0xFF, 0xF7, 0xED);      // orange-50
    public static readonly Color AccentSoftBorder = Color.FromArgb(0xFE, 0xD7, 0xAA); // orange-200
    public static readonly Color AccentText = Color.FromArgb(0xEA, 0x58, 0x0C);      // orange-600

    // Surfaces
    public static readonly Color Canvas = Color.FromArgb(0xF8, 0xFA, 0xFC);          // slate-50
    public static readonly Color Surface = Color.White;
    public static readonly Color SurfaceMuted = Color.FromArgb(0xF1, 0xF5, 0xF9);    // slate-100
    public static readonly Color Border = Color.FromArgb(0xE2, 0xE8, 0xF0);           // slate-200
    public static readonly Color BorderStrong = Color.FromArgb(0xCB, 0xD5, 0xE1);     // slate-300

    // Text
    public static readonly Color TextPrimary = Color.FromArgb(0x0F, 0x17, 0x2A);     // slate-900
    public static readonly Color TextSecondary = Color.FromArgb(0x33, 0x41, 0x55);   // slate-700
    public static readonly Color TextMuted = Color.FromArgb(0x64, 0x74, 0x8B);        // slate-500
    public static readonly Color TextFaint = Color.FromArgb(0x94, 0xA3, 0xB8);        // slate-400
    public static readonly Color TextDesc = Color.FromArgb(0x47, 0x55, 0x69);         // slate-600

    // Semantic
    public static readonly Color Success = Color.FromArgb(0x05, 0x96, 0x69);          // emerald-600
    public static readonly Color SuccessSoft = Color.FromArgb(0xEC, 0xFD, 0xF5);
    public static readonly Color Warning = Color.FromArgb(0xD9, 0x77, 0x06);          // amber-600
    public static readonly Color WarningSoft = Color.FromArgb(0xFF, 0xFB, 0xEB);
    public static readonly Color Danger = Color.FromArgb(0xE1, 0x1D, 0x48);           // rose-600
    public static readonly Color DangerSoft = Color.FromArgb(0xFF, 0xF1, 0xF2);
    public static readonly Color Info = Color.FromArgb(0x02, 0x84, 0xC7);             // sky-600
    public static readonly Color InfoSoft = Color.FromArgb(0xF0, 0xF9, 0xFF);

    // Layout (px — FE scale 4/8/12/16/20/24/32/48)
    // Layout (design DIPs — PerMonitorV2 maps to physical px; do not also AutoScaleMode.Dpi)
    public const int SidebarMinWidth = 200; // absolute floor; real width from longest nav label
    public const int TopBarHeight = 56;
    public const int PagePad = 28;
    public const int CardPad = 20;
    public const int CardRadius = 12;
    public const int ControlRadius = 8;
    public const int NavRadius = 12;
    public const int ButtonHeight = 40;
    public const int Gap = 16;
    public const int SectionGap = 24;

    private static FontFamily? _uiFamily;

    public static FontFamily UiFamily
    {
        get
        {
            if (_uiFamily is not null) return _uiFamily;
            foreach (var name in new[] { "Inter", "Segoe UI Variable Text", "Segoe UI" })
            {
                try
                {
                    var f = new FontFamily(name);
                    _uiFamily = f;
                    return f;
                }
                catch { /* next */ }
            }
            _uiFamily = FontFamily.GenericSansSerif;
            return _uiFamily;
        }
    }

    public static Font FontPageTitle => new(UiFamily, 18f, FontStyle.Bold);      // FE text-lg semibold ~18
    public static Font FontSection => new(UiFamily, 16f, FontStyle.Bold);        // text-base
    public static Font FontBody => new(UiFamily, 14f, FontStyle.Regular);        // text-sm
    public static Font FontBodySemibold => new(UiFamily, 14f, FontStyle.Bold);
    public static Font FontCaption => new(UiFamily, 12f, FontStyle.Regular);     // text-xs
    public static Font FontCaptionBold => new(UiFamily, 12f, FontStyle.Bold);
    public static Font FontMeta => new(UiFamily, 11f, FontStyle.Regular);
    public static Font FontMetric => new(UiFamily, 20f, FontStyle.Bold);         // text-xl
    public static Font FontNav => new(UiFamily, 14f, FontStyle.Bold);            // sidebar 14–15
    public static Font FontMono => CreateMono();

    private static Font CreateMono()
    {
        foreach (var n in new[] { "Cascadia Mono", "Consolas", "Courier New" })
        {
            try
            {
                var f = new Font(n, 12f);
                if (string.Equals(f.Name, n, StringComparison.OrdinalIgnoreCase)) return f;
                f.Dispose();
            }
            catch { }
        }
        return new Font(FontFamily.GenericMonospace, 12f);
    }

    public static GraphicsPath RoundRect(Rectangle r, int radius)
    {
        var d = Math.Max(2, radius * 2);
        var path = new GraphicsPath();
        path.AddArc(r.X, r.Y, d, d, 180, 90);
        path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    public static void DrawCard(Graphics g, Rectangle bounds, bool elevated = false)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
        var r = bounds;
        r.Inflate(-1, -1);
        if (elevated)
        {
            var sh = r;
            sh.Offset(0, 2);
            using var sp = RoundRect(sh, CardRadius);
            using var sb = new SolidBrush(Color.FromArgb(18, 15, 23, 42));
            g.FillPath(sb, sp);
        }
        using var path = RoundRect(r, CardRadius);
        using var fill = new SolidBrush(Surface);
        using var pen = new Pen(Border);
        g.FillPath(fill, path);
        g.DrawPath(pen, path);
    }
}

/// <summary>Fluent / MDL2 glyphs — one icon set.</summary>
internal static class AppIcons
{
    private static Font? _f;
    public static Font Font => _f ??= Create(16f);
    public static Font Lg => Create(20f);
    public static Font Xl => Create(22f);

    public const string Status = "\uE80F";
    public const string Devices = "\uE749";
    public const string History = "\uE81C";
    public const string Logs = "\uE8A5";
    public const string Diagnostics = "\uE9D9";
    public const string Test = "\uE73E";
    public const string Settings = "\uE713";
    public const string Updates = "\uE895";
    public const string Company = "\uE77B";
    public const string Computer = "\uE7F8";
    public const string Sync = "\uE895";
    public const string Print = "\uE749";
    public const string Check = "\uE73E";
    public const string Warn = "\uE7BA";
    public const string Error = "\uE783";
    public const string Info = "\uE946";
    public const string Search = "\uE721";
    public const string Connected = "\uE701";

    public static Font Create(float size)
    {
        foreach (var n in new[] { "Segoe Fluent Icons", "Segoe MDL2 Assets" })
        {
            try
            {
                var f = new Font(n, size);
                if (string.Equals(f.Name, n, StringComparison.OrdinalIgnoreCase)) return f;
                f.Dispose();
            }
            catch { }
        }
        return new Font("Segoe UI Symbol", size);
    }
}

internal sealed class UiPreferences
{
    public bool StartWithWindows { get; set; } = true;
    public bool RunInBackground { get; set; } = true;
    public bool Notifications { get; set; } = true;
    public bool AutoUpdates { get; set; } = true;
    public static UiPreferences Current { get; private set; } = new();
    private static string PathFile => Path.Combine(AgentPaths.ProgramDataRoot, "ui-preferences.json");

    public static void Load()
    {
        try
        {
            AgentPaths.EnsureDirectories();
            if (!File.Exists(PathFile)) return;
            Current = JsonSerializer.Deserialize<UiPreferences>(File.ReadAllText(PathFile)) ?? new();
        }
        catch { Current = new(); }
    }

    public static void Save()
    {
        try
        {
            AgentPaths.EnsureDirectories();
            File.WriteAllText(PathFile, JsonSerializer.Serialize(Current, new JsonSerializerOptions
            {
                WriteIndented = true,
                PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
                DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
            }));
        }
        catch { }
    }
}

internal interface IPageHost { }

// Prefer IPageView (Mvp) — structure once, ApplyValues on poll.
