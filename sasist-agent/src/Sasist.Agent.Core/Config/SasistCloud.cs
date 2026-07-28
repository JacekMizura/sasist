namespace Sasist.Agent.Core.Config;

/// <summary>Sasist Cloud endpoints — Agent pairs with the Sasist API.</summary>
public static class SasistCloud
{
    /// <summary>Canonical production API host (no trailing /api — Agent appends /api/...).</summary>
    public const string ProductionApiUrl = "https://sasist-production.up.railway.app";
    public const string ProductionAppUrl = "https://app.sasist.pl";
    public const string DevicesPanelPath = "/settings/wms/workstations";

    /// <summary>
    /// Resolve API base URL: SASIST_API_URL env → appsettings override → Production.
    /// </summary>
    public static string ResolveApiBaseUrl()
    {
        var env = Environment.GetEnvironmentVariable("SASIST_API_URL");
        if (!string.IsNullOrWhiteSpace(env))
            return NormalizeApiBase(env);

        var fromFile = TryReadDevelopmentOverride();
        if (!string.IsNullOrWhiteSpace(fromFile))
            return NormalizeApiBase(fromFile!);

        return ProductionApiUrl;
    }

    public static string ResolveAppBaseUrl()
    {
        var env = Environment.GetEnvironmentVariable("SASIST_APP_URL");
        if (!string.IsNullOrWhiteSpace(env))
            return env.Trim().TrimEnd('/');
        return ProductionAppUrl;
    }

    public static string DevicesPanelUrl =>
        ResolveAppBaseUrl().TrimEnd('/') + DevicesPanelPath;

    /// <summary>
    /// True when stored URL is a known dead/legacy endpoint that must be replaced.
    /// </summary>
    public static bool IsStaleOrUnreachableHost(string? serverUrl)
    {
        if (string.IsNullOrWhiteSpace(serverUrl)) return true;
        try
        {
            var u = new Uri(serverUrl.Trim());
            var host = u.Host.ToLowerInvariant();
            if (host is "api.sasist.pl" or "sasist.pl") return true;
            if (host is "127.0.0.1" or "localhost" or "::1")
            {
                // Legacy local ports that are not the current FastAPI default.
                if (u.Port is 8080 or 80 or 443) return true;
            }
            return false;
        }
        catch
        {
            return true;
        }
    }

    /// <summary>Strip trailing /api so Agent can append /api/printing/… safely.</summary>
    public static string NormalizeApiBase(string url)
    {
        var s = url.Trim().TrimEnd('/');
        if (s.EndsWith("/api", StringComparison.OrdinalIgnoreCase))
            s = s[..^4].TrimEnd('/');
        return s;
    }

    private static string? TryReadDevelopmentOverride()
    {
        try
        {
            var candidates = new[]
            {
                Path.Combine(AppContext.BaseDirectory, "appsettings.Development.json"),
                Path.Combine(AgentPaths.ProgramDataRoot, "appsettings.Development.json"),
            };
            foreach (var path in candidates)
            {
                if (!File.Exists(path))
                    continue;
                var json = File.ReadAllText(path);
                using var doc = System.Text.Json.JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("SasistApiUrl", out var p) &&
                    p.ValueKind == System.Text.Json.JsonValueKind.String)
                {
                    var v = p.GetString();
                    if (!string.IsNullOrWhiteSpace(v))
                        return v;
                }
                if (doc.RootElement.TryGetProperty("ApiUrl", out var p2) &&
                    p2.ValueKind == System.Text.Json.JsonValueKind.String)
                {
                    var v = p2.GetString();
                    if (!string.IsNullOrWhiteSpace(v))
                        return v;
                }
            }
        }
        catch
        {
            // ignore
        }
        return null;
    }
}
