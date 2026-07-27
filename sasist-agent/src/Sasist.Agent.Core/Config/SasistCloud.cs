namespace Sasist.Agent.Core.Config;

/// <summary>Sasist Cloud endpoints — Agent pairs only with Sasist (not multi-ERP).</summary>
public static class SasistCloud
{
    public const string ProductionApiUrl = "https://api.sasist.pl";
    public const string ProductionAppUrl = "https://app.sasist.pl";
    public const string DevicesPanelPath = "/settings/devices";

    /// <summary>
    /// Resolve API base URL: SASIST_API_URL env → appsettings override file → Production.
    /// </summary>
    public static string ResolveApiBaseUrl()
    {
        var env = Environment.GetEnvironmentVariable("SASIST_API_URL");
        if (!string.IsNullOrWhiteSpace(env))
            return env.Trim().TrimEnd('/');

        var fromFile = TryReadDevelopmentOverride();
        if (!string.IsNullOrWhiteSpace(fromFile))
            return fromFile.Trim().TrimEnd('/');

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
