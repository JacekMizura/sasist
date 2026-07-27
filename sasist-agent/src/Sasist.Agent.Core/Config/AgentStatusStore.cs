using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sasist.Agent.Core.Config;

/// <summary>Lightweight runtime snapshot for Tray (no technical jargon).</summary>
public sealed class AgentStatusSnapshot
{
    public bool Online { get; set; }
    public int DeviceCount { get; set; }
    public string OrganizationName { get; set; } = "";
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public static class AgentStatusStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static string StatusPath => Path.Combine(AgentPaths.ProgramDataRoot, "status.json");

    public static void Write(AgentStatusSnapshot snapshot)
    {
        try
        {
            AgentPaths.EnsureDirectories();
            snapshot.UpdatedAt = DateTimeOffset.UtcNow;
            File.WriteAllText(StatusPath, JsonSerializer.Serialize(snapshot, JsonOptions));
        }
        catch
        {
            // best-effort for Tray
        }
    }

    public static AgentStatusSnapshot? Read()
    {
        try
        {
            if (!File.Exists(StatusPath))
                return null;
            return JsonSerializer.Deserialize<AgentStatusSnapshot>(File.ReadAllText(StatusPath), JsonOptions);
        }
        catch
        {
            return null;
        }
    }

    public static void Clear()
    {
        try
        {
            if (File.Exists(StatusPath))
                File.Delete(StatusPath);
        }
        catch
        {
            // ignore
        }
    }
}
