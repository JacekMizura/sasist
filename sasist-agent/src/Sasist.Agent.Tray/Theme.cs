using System.Drawing.Drawing2D;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

internal enum AppThemeMode
{
    Light,
    Dark,
}

internal static class Theme
{
    public static AppThemeMode Mode { get; private set; } = AppThemeMode.Light;
    public static event Action? Changed;

    // Sasist brand
    public static readonly Color Accent = Color.FromArgb(249, 115, 22);
    public static readonly Color AccentHover = Color.FromArgb(234, 88, 12);
    public static readonly Color AccentSoft = Color.FromArgb(255, 237, 213);
    public static readonly Color Success = Color.FromArgb(22, 163, 74);
    public static readonly Color Warning = Color.FromArgb(217, 119, 6);
    public static readonly Color Danger = Color.FromArgb(220, 38, 38);
    public static readonly Color Info = Color.FromArgb(37, 99, 235);

    public static Color WindowBg => Mode == AppThemeMode.Dark ? Color.FromArgb(18, 18, 20) : Color.FromArgb(243, 244, 246);
    public static Color SidebarBg => Mode == AppThemeMode.Dark ? Color.FromArgb(24, 24, 27) : Color.FromArgb(255, 255, 255);
    public static Color SidebarBorder => Mode == AppThemeMode.Dark ? Color.FromArgb(39, 39, 42) : Color.FromArgb(229, 231, 235);
    public static Color CardBg => Mode == AppThemeMode.Dark ? Color.FromArgb(32, 32, 36) : Color.White;
    public static Color CardBorder => Mode == AppThemeMode.Dark ? Color.FromArgb(55, 55, 60) : Color.FromArgb(229, 231, 235);
    public static Color TextPrimary => Mode == AppThemeMode.Dark ? Color.FromArgb(250, 250, 250) : Color.FromArgb(24, 24, 27);
    public static Color TextSecondary => Mode == AppThemeMode.Dark ? Color.FromArgb(161, 161, 170) : Color.FromArgb(113, 113, 122);
    public static Color TextMuted => Mode == AppThemeMode.Dark ? Color.FromArgb(113, 113, 122) : Color.FromArgb(161, 161, 170);
    public static Color NavHover => Mode == AppThemeMode.Dark ? Color.FromArgb(39, 39, 42) : Color.FromArgb(244, 244, 245);
    public static Color NavActiveBg => Mode == AppThemeMode.Dark ? Color.FromArgb(67, 40, 20) : Color.FromArgb(255, 247, 237);
    public static Color InputBg => Mode == AppThemeMode.Dark ? Color.FromArgb(39, 39, 42) : Color.FromArgb(250, 250, 250);
    public static Color Separator => Mode == AppThemeMode.Dark ? Color.FromArgb(55, 55, 60) : Color.FromArgb(228, 228, 231);

    public static Font FontUi => new("Segoe UI", 9.75f);
    public static Font FontUiSemibold => new("Segoe UI Semibold", 9.75f);
    public static Font FontTitle => new("Segoe UI Semibold", 20f);
    public static Font FontSection => new("Segoe UI Semibold", 12f);
    public static Font FontCaption => new("Segoe UI", 8.5f);
    public static Font FontMono { get; } = CreateMono();

    private static Font CreateMono()
    {
        foreach (var name in new[] { "Cascadia Mono", "Consolas", "Courier New" })
        {
            try
            {
                var f = new Font(name, 9f);
                if (string.Equals(f.Name, name, StringComparison.OrdinalIgnoreCase))
                    return f;
                f.Dispose();
            }
            catch { /* next */ }
        }
        return new Font("Segoe UI", 9f);
    }

    public static Font Icon(float size)
    {
        try { return new Font(AppIcons.Font.FontFamily, size); }
        catch { return AppIcons.Font; }
    }

    public static void SetMode(AppThemeMode mode)
    {
        if (Mode == mode) return;
        Mode = mode;
        UiPreferences.Current.Theme = mode.ToString();
        UiPreferences.Save();
        Changed?.Invoke();
    }

    public static void Toggle() =>
        SetMode(Mode == AppThemeMode.Dark ? AppThemeMode.Light : AppThemeMode.Dark);

    public static void LoadFromPreferences()
    {
        Mode = string.Equals(UiPreferences.Current.Theme, "Dark", StringComparison.OrdinalIgnoreCase)
            ? AppThemeMode.Dark
            : AppThemeMode.Light;
    }

    public static GraphicsPath RoundRect(Rectangle bounds, int radius)
    {
        var path = new GraphicsPath();
        var d = radius * 2;
        path.AddArc(bounds.X, bounds.Y, d, d, 180, 90);
        path.AddArc(bounds.Right - d, bounds.Y, d, d, 270, 90);
        path.AddArc(bounds.Right - d, bounds.Bottom - d, d, d, 0, 90);
        path.AddArc(bounds.X, bounds.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }
}

/// <summary>Local UI preferences only — not part of agent protocol.</summary>
internal sealed class UiPreferences
{
    public string Theme { get; set; } = "Light";
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
        catch
        {
            Current = new();
        }
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
        catch
        {
            // ignore
        }
    }
}

/// <summary>Single icon set — Segoe Fluent Icons / MDL2.</summary>
internal static class AppIcons
{
    private static Font? _iconFont;

    public static Font Font => _iconFont ??= CreateIconFont(14f);
    public static Font FontLg => CreateIconFont(18f);
    public static Font FontSm => CreateIconFont(12f);

    public const string Status = "\uE80F";
    public const string Devices = "\uE749";
    public const string History = "\uE81C";
    public const string Logs = "\uE8A5";
    public const string Diagnostics = "\uE9D9";
    public const string Test = "\uE73E";
    public const string Settings = "\uE713";
    public const string Updates = "\uE895";
    public const string Printer = "\uE749";
    public const string Company = "\uE77B";
    public const string Computer = "\uE7F8";
    public const string Sync = "\uE895";
    public const string Check = "\uE73E";
    public const string Warn = "\uE7BA";
    public const string Error = "\uE783";
    public const string Info = "\uE946";
    public const string Search = "\uE721";
    public const string Copy = "\uE8C8";
    public const string Save = "\uE74E";
    public const string Clear = "\uE74D";
    public const string Theme = "\uE706";
    public const string Connected = "\uE701";
    public const string Ready = "\uE930";

    private static Font CreateIconFont(float size)
    {
        foreach (var name in new[] { "Segoe Fluent Icons", "Segoe MDL2 Assets" })
        {
            try
            {
                using var test = new Font(name, size);
                if (string.Equals(test.Name, name, StringComparison.OrdinalIgnoreCase))
                    return new Font(name, size);
            }
            catch
            {
                // try next
            }
        }
        return new Font("Segoe UI Symbol", size);
    }
}
