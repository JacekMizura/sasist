using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

/// <summary>Customer-facing copy helpers — never expose technical jargon.</summary>
internal static class UiCopy
{
    public static string ConnectionHeadline(bool connected) =>
        connected ? "● Połączono z Sasist" : "● Brak połączenia z Sasist";

    public static string TrayConnection(bool connected) =>
        connected ? "● Połączono" : "● Brak połączenia";

    public static string ReadyStatus(bool connected, bool serviceRunning, int deviceCount)
    {
        if (!serviceRunning)
            return "Oczekiwanie na uruchomienie";
        if (!connected)
            return "Oczekiwanie na połączenie";
        if (deviceCount > 0)
            return "Gotowy do drukowania";
        return "Połączono — wykrywanie urządzeń…";
    }

    public static string DevicesReadySummary(int count)
    {
        if (count <= 0)
            return "Brak urządzeń";
        return count switch
        {
            1 => "1 urządzenie gotowe",
            _ when count is >= 2 and <= 4 => $"{count} urządzenia gotowe",
            _ => $"{count} urządzeń gotowych",
        };
    }

    public static string PrintersReady(int count)
    {
        if (count <= 0)
            return "Brak drukarek";
        return count switch
        {
            1 => "1 gotowa",
            _ when count is >= 2 and <= 4 => $"{count} gotowe",
            _ => $"{count} gotowych",
        };
    }

    public static string RelativeSync(DateTimeOffset? updatedAtUtc)
    {
        if (updatedAtUtc is null)
            return "Jeszcze nie";

        var local = updatedAtUtc.Value.ToLocalTime();
        var ago = DateTimeOffset.Now - local;
        if (ago < TimeSpan.Zero)
            ago = TimeSpan.Zero;

        if (ago.TotalSeconds < 45)
            return "Kilka sekund temu";
        if (ago.TotalMinutes < 2)
            return "Około minuty temu";
        if (ago.TotalMinutes < 60)
        {
            var m = (int)ago.TotalMinutes;
            return m == 1 ? "1 minutę temu" : $"{m} min temu";
        }

        if (ago.TotalHours < 24)
        {
            var h = (int)ago.TotalHours;
            return h == 1 ? "1 godzinę temu" : $"{h} godz. temu";
        }

        return local.ToString("dd.MM.yyyy HH:mm");
    }

    public static string CompanyName(AgentConfig cfg, AgentStatusSnapshot? snap)
    {
        if (!string.IsNullOrWhiteSpace(snap?.OrganizationName))
            return snap!.OrganizationName!;
        if (!string.IsNullOrWhiteSpace(cfg.OrganizationName))
            return cfg.OrganizationName;
        return "—";
    }

    public static string MaskSecret(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return "Brak";
        var v = value.Trim();
        if (v.Length <= 8)
            return new string('•', Math.Min(8, v.Length));
        return $"{v[..4]}…{v[^4..]}";
    }
}
