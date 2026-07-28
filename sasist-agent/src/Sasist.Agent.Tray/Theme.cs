using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

/// <summary>
/// Sasist Design System — single visual source of truth.
/// Screens must not invent colors, fonts, or spacing locally.
/// </summary>
internal static class Theme
{
    // ── Colors (canonical names) ──────────────────────────────────────────
    public static readonly Color Primary = Color.FromArgb(0xF9, 0x73, 0x16);
    public static readonly Color PrimaryHover = Color.FromArgb(0xEA, 0x58, 0x0C);
    public static readonly Color PrimaryActive = Color.FromArgb(0xC2, 0x41, 0x0C);
    public static readonly Color PrimarySoft = Color.FromArgb(0xFF, 0xF7, 0xED);
    public static readonly Color PrimarySoftBorder = Color.FromArgb(0xFE, 0xD7, 0xAA);
    public static readonly Color PrimaryText = Color.FromArgb(0xC2, 0x41, 0x0C);

    public static readonly Color Success = Color.FromArgb(0x05, 0x96, 0x69);
    public static readonly Color SuccessSoft = Color.FromArgb(0xEC, 0xFD, 0xF5);
    public static readonly Color Warning = Color.FromArgb(0xD9, 0x77, 0x06);
    public static readonly Color WarningSoft = Color.FromArgb(0xFF, 0xFB, 0xEB);
    public static readonly Color Danger = Color.FromArgb(0xE1, 0x1D, 0x48);
    public static readonly Color DangerHover = Color.FromArgb(0xBE, 0x12, 0x3C);
    public static readonly Color DangerSoft = Color.FromArgb(0xFF, 0xF1, 0xF2);

    public static readonly Color Background = Color.FromArgb(0xF1, 0xF5, 0xF9);   // page canvas
    public static readonly Color Surface = Color.White;                            // cards / chrome
    public static readonly Color SurfaceMuted = Color.FromArgb(0xF8, 0xFA, 0xFC);
    public static readonly Color Border = Color.FromArgb(0xE2, 0xE8, 0xF0);
    public static readonly Color BorderStrong = Color.FromArgb(0xCB, 0xD5, 0xE1);

    public static readonly Color Text = Color.FromArgb(0x0F, 0x17, 0x2A);
    public static readonly Color SecondaryText = Color.FromArgb(0x47, 0x55, 0x69);
    public static readonly Color MutedText = Color.FromArgb(0x64, 0x74, 0x8B);
    public static readonly Color FaintText = Color.FromArgb(0x94, 0xA3, 0xB8);

    public static readonly Color Hover = Color.FromArgb(0xF1, 0xF5, 0xF9);
    public static readonly Color Selected = Color.FromArgb(0xFF, 0xF7, 0xED);

    // Aliases kept for existing call sites (map to canonical)
    public static Color Accent => Primary;
    public static Color AccentHover => PrimaryHover;
    public static Color AccentActive => PrimaryActive;
    public static Color AccentSoft => PrimarySoft;
    public static Color AccentSoftBorder => PrimarySoftBorder;
    public static Color AccentText => PrimaryText;
    public static Color Canvas => Background;
    public static Color TextPrimary => Text;
    public static Color TextSecondary => SecondaryText;
    public static Color TextMuted => MutedText;
    public static Color TextFaint => FaintText;
    public static Color TextDesc => SecondaryText;
    public static Color Info => Color.FromArgb(0x02, 0x84, 0xC7);
    public static Color InfoSoft => Color.FromArgb(0xF0, 0xF9, 0xFF);

    // ── Spacing scale (only allowed gaps) ─────────────────────────────────
    public static class Space
    {
        public const int Xs = 4;
        public const int Sm = 8;
        public const int Md = 12;
        public const int Lg = 16;
        public const int Xl = 24;
        public const int Xxl = 32;
        public const int Xxxl = 48;
    }

    // ── Radii / chrome ────────────────────────────────────────────────────
    public const int CardRadius = 12;
    public const int ControlRadius = 8;
    public const int NavRadius = 10;
    public const int BadgeRadius = 6;
    public const int CardPad = Space.Lg;
    public const int PagePad = Space.Xl;
    public const int Gap = Space.Lg;
    public const int SectionGap = Space.Xl;
    public const int ButtonHeight = 44;
    public const int IconButtonSize = 36;
    public const int SidebarMinWidth = 200;
    public const int TopBarHeight = 60;

    // ── Typography scale (never Font= locally) ────────────────────────────
    private static FontFamily? _uiFamily;

    public static FontFamily UiFamily
    {
        get
        {
            if (_uiFamily is not null) return _uiFamily;
            foreach (var name in new[] { "Segoe UI Variable Text", "Segoe UI", "Inter" })
            {
                try
                {
                    _uiFamily = new FontFamily(name);
                    return _uiFamily;
                }
                catch { /* next */ }
            }
            _uiFamily = FontFamily.GenericSansSerif;
            return _uiFamily;
        }
    }

    public static Font Display => new(UiFamily, 28f, FontStyle.Bold);
    public static Font Title => new(UiFamily, 20f, FontStyle.Bold);
    public static Font Heading => new(UiFamily, 16f, FontStyle.Bold);
    public static Font Body => new(UiFamily, 14f, FontStyle.Regular);
    public static Font BodySemibold => new(UiFamily, 14f, FontStyle.Bold);
    public static Font Caption => new(UiFamily, 12f, FontStyle.Regular);
    public static Font CaptionBold => new(UiFamily, 12f, FontStyle.Bold);
    public static Font Hint => new(UiFamily, 11f, FontStyle.Regular);
    public static Font Nav => new(UiFamily, 14f, FontStyle.Bold);
    public static Font Mono => CreateMono();

    // Legacy aliases
    public static Font FontPageTitle => Title;
    public static Font FontSection => Heading;
    public static Font FontBody => Body;
    public static Font FontBodySemibold => BodySemibold;
    public static Font FontCaption => Caption;
    public static Font FontCaptionBold => CaptionBold;
    public static Font FontMeta => Hint;
    public static Font FontMetric => Display;
    public static Font FontNav => Nav;
    public static Font FontMono => Mono;

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

    public static void DrawCard(Graphics g, Rectangle bounds, bool elevated = true, bool selected = false)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
        var r = bounds;
        r.Inflate(-1, -1);
        if (elevated)
        {
            var sh = r;
            sh.Offset(0, 3);
            using var sp = RoundRect(sh, CardRadius);
            using var sb = new SolidBrush(Color.FromArgb(22, 15, 23, 42));
            g.FillPath(sb, sp);
        }
        using var path = RoundRect(r, CardRadius);
        using var fill = new SolidBrush(Surface);
        using var pen = new Pen(selected ? PrimarySoftBorder : Border);
        g.FillPath(fill, path);
        g.DrawPath(pen, path);
    }
}

/// <summary>One icon set — Segoe Fluent / MDL2. No mixing.</summary>
internal static class AppIcons
{
    private static Font? _f;
    public static Font Font => _f ??= Create(16f);
    public static Font Sm => Create(14f);
    public static Font Lg => Create(20f);
    public static Font Xl => Create(28f);
    public static Font Empty => Create(40f);

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
    public const string EmptyBox = "\uE8B7";
    public const string Close = "\uE711";
    public const string Refresh = "\uE72C";
    public const string Copy = "\uE8C8";
    public const string Folder = "\uE8B7";
    public const string Chevron = "\uE76C";

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
