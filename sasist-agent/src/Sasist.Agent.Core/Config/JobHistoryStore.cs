using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sasist.Agent.Core.Config;

public sealed class JobHistoryEntry
{
    public string Id { get; set; } = "";
    public string Printer { get; set; } = "";
    public string Status { get; set; } = "";
    public string? Error { get; set; }
    public DateTimeOffset At { get; set; } = DateTimeOffset.Now;
}

/// <summary>Local recent print jobs for the desktop UI (ProgramData).</summary>
public static class JobHistoryStore
{
    private const int MaxEntries = 100;
    private static readonly object Gate = new();
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static string PathFile => Path.Combine(AgentPaths.ProgramDataRoot, "jobs-history.json");

    public static void Append(string id, string printer, string status, string? error = null)
    {
        lock (Gate)
        {
            try
            {
                AgentPaths.EnsureDirectories();
                var list = ReadUnlocked();
                list.Insert(0, new JobHistoryEntry
                {
                    Id = id,
                    Printer = printer,
                    Status = status,
                    Error = error,
                    At = DateTimeOffset.Now,
                });
                if (list.Count > MaxEntries)
                    list.RemoveRange(MaxEntries, list.Count - MaxEntries);
                File.WriteAllText(PathFile, JsonSerializer.Serialize(list, JsonOptions));
            }
            catch
            {
                // best-effort for UI
            }
        }
    }

    public static IReadOnlyList<JobHistoryEntry> Read()
    {
        lock (Gate)
            return ReadUnlocked();
    }

    public static void Clear()
    {
        lock (Gate)
        {
            try
            {
                if (File.Exists(PathFile))
                    File.Delete(PathFile);
            }
            catch
            {
                // ignore
            }
        }
    }

    private static List<JobHistoryEntry> ReadUnlocked()
    {
        try
        {
            if (!File.Exists(PathFile))
                return [];
            return JsonSerializer.Deserialize<List<JobHistoryEntry>>(File.ReadAllText(PathFile), JsonOptions) ?? [];
        }
        catch
        {
            return [];
        }
    }
}
