using System.Runtime.Versioning;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sasist.Agent.Core.Config;

public sealed class AgentConfig
{
    public const int ProtocolVersion = 1;
    public const string AgentVersion = "1.1.0";

    public string ServerUrl { get; set; } = "";
    /// <summary>Non-secret machine identity — stored in config.json.</summary>
    public string MachineId { get; set; } = "";
    public int AgentId { get; set; }
    public string ComputerName { get; set; } = Environment.MachineName;
    public string UpdateChannel { get; set; } = "stable";
    public int HeartbeatIntervalSec { get; set; } = 30;
    public int PollIntervalSec { get; set; } = 5;
    public int? WarehouseId { get; set; }

    /// <summary>Company / tenant display name from Sasist (shown in Tray).</summary>
    public string OrganizationName { get; set; } = "";

    /// <summary>Loaded from DPAPI secret store — never persisted in config.json. Pairing code (spa_…).</summary>
    [JsonIgnore]
    public string ApiKey { get; set; } = "";

    /// <summary>Loaded from DPAPI secret store — never persisted in config.json.</summary>
    [JsonIgnore]
    public string Token { get; set; } = "";

    /// <summary>Optional refresh token (DPAPI) — Planned for short-lived access tokens.</summary>
    [JsonIgnore]
    public string RefreshToken { get; set; } = "";

    [JsonIgnore]
    public bool HasToken => !string.IsNullOrWhiteSpace(Token);

    [JsonIgnore]
    public bool HasApiKey => !string.IsNullOrWhiteSpace(ApiKey);

    /// <summary>True until paired (token present). Pairing code alone is not enough.</summary>
    [JsonIgnore]
    public bool NeedsSetup => !HasToken;

    public bool IsReadyToRun()
    {
        EnsureCloudUrl();
        return !string.IsNullOrWhiteSpace(ServerUrl) && (HasToken || HasApiKey);
    }

    /// <summary>Fill ServerUrl from built-in Sasist Cloud when empty.</summary>
    public void EnsureCloudUrl()
    {
        if (string.IsNullOrWhiteSpace(ServerUrl))
            ServerUrl = SasistCloud.ResolveApiBaseUrl();
    }
}

public static class AgentPaths
{
    public static string ProgramDataRoot =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "Sasist",
            "Agent");

    public static string ConfigPath => Path.Combine(ProgramDataRoot, "config.json");
    public static string LogsDir => Path.Combine(ProgramDataRoot, "logs");
    public static string TempDir => Path.Combine(ProgramDataRoot, "temp");
    public static string SecretsDir => Path.Combine(ProgramDataRoot, "secrets");
    public static string PluginsDir => Path.Combine(ProgramDataRoot, "plugins");

    public static void EnsureDirectories()
    {
        Directory.CreateDirectory(ProgramDataRoot);
        Directory.CreateDirectory(LogsDir);
        Directory.CreateDirectory(TempDir);
        Directory.CreateDirectory(SecretsDir);
        Directory.CreateDirectory(PluginsDir);
        TryGrantUsersModify(ProgramDataRoot);
        TryGrantUsersModify(LogsDir);
        TryGrantUsersModify(TempDir);
        TryGrantUsersModify(SecretsDir);
        TryGrantUsersModify(PluginsDir);
    }

    /// <summary>Allow interactive users (Tray) to write config/secrets created by LocalSystem service.</summary>
    private static void TryGrantUsersModify(string path)
    {
        try
        {
            var info = new DirectoryInfo(path);
            var security = info.GetAccessControl();
            var users = new System.Security.Principal.SecurityIdentifier(
                System.Security.Principal.WellKnownSidType.BuiltinUsersSid, null);
            security.AddAccessRule(new System.Security.AccessControl.FileSystemAccessRule(
                users,
                System.Security.AccessControl.FileSystemRights.Modify,
                System.Security.AccessControl.InheritanceFlags.ContainerInherit |
                System.Security.AccessControl.InheritanceFlags.ObjectInherit,
                System.Security.AccessControl.PropagationFlags.None,
                System.Security.AccessControl.AccessControlType.Allow));
            info.SetAccessControl(security);
        }
        catch
        {
            // Best-effort — installer should also set ACLs.
        }
    }
}

/// <summary>DPAPI-protected local secret storage (Windows LocalMachine scope).</summary>
[SupportedOSPlatform("windows")]
public sealed class DpapiSecretStore
{
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("Sasist.Agent.v1");

    public void Save(string name, string? value)
    {
        AgentPaths.EnsureDirectories();
        var path = Path.Combine(AgentPaths.SecretsDir, Sanitize(name) + ".dpapi");
        if (string.IsNullOrEmpty(value))
        {
            if (File.Exists(path))
                File.Delete(path);
            return;
        }

        var plain = Encoding.UTF8.GetBytes(value);
        var protectedBytes = ProtectedData.Protect(plain, Entropy, DataProtectionScope.LocalMachine);
        File.WriteAllBytes(path, protectedBytes);
    }

    public string? Load(string name)
    {
        var path = Path.Combine(AgentPaths.SecretsDir, Sanitize(name) + ".dpapi");
        if (!File.Exists(path))
            return null;
        try
        {
            var protectedBytes = File.ReadAllBytes(path);
            var plain = ProtectedData.Unprotect(protectedBytes, Entropy, DataProtectionScope.LocalMachine);
            return Encoding.UTF8.GetString(plain);
        }
        catch (CryptographicException)
        {
            return null;
        }
    }

    private static string Sanitize(string name) =>
        string.Concat(name.Select(c => char.IsLetterOrDigit(c) || c is '-' or '_' ? c : '_'));
}

public sealed class ConfigStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly DpapiSecretStore _secrets = new();

    public AgentConfig Load()
    {
        AgentPaths.EnsureDirectories();
        AgentConfig cfg;
        if (!File.Exists(AgentPaths.ConfigPath))
        {
            cfg = new AgentConfig
            {
                MachineId = BuildMachineId(),
                ComputerName = Environment.MachineName,
            };
            Save(cfg);
        }
        else
        {
            var json = File.ReadAllText(AgentPaths.ConfigPath);
            cfg = JsonSerializer.Deserialize<AgentConfig>(json, JsonOptions) ?? new AgentConfig();
            // Migrate legacy plaintext secrets out of config.json if present
            MigrateLegacyPlaintext(json, cfg);
        }

        if (string.IsNullOrWhiteSpace(cfg.MachineId))
            cfg.MachineId = BuildMachineId();
        if (string.IsNullOrWhiteSpace(cfg.ComputerName))
            cfg.ComputerName = Environment.MachineName;

        cfg.ApiKey = _secrets.Load("agent_api_key") ?? "";
        cfg.Token = _secrets.Load("agent_token") ?? "";
        cfg.RefreshToken = _secrets.Load("refresh_token") ?? "";
        cfg.EnsureCloudUrl();
        return cfg;
    }

    public void Save(AgentConfig config)
    {
        AgentPaths.EnsureDirectories();
        config.EnsureCloudUrl();
        _secrets.Save("agent_api_key", string.IsNullOrWhiteSpace(config.ApiKey) ? null : config.ApiKey);
        _secrets.Save("agent_token", string.IsNullOrWhiteSpace(config.Token) ? null : config.Token);
        _secrets.Save("refresh_token", string.IsNullOrWhiteSpace(config.RefreshToken) ? null : config.RefreshToken);

        // Persist non-secret fields only
        var publicCfg = new
        {
            server_url = config.ServerUrl,
            machine_id = config.MachineId,
            agent_id = config.AgentId,
            computer_name = config.ComputerName,
            organization_name = config.OrganizationName,
            update_channel = config.UpdateChannel,
            heartbeat_interval_sec = config.HeartbeatIntervalSec,
            poll_interval_sec = config.PollIntervalSec,
            warehouse_id = config.WarehouseId,
        };
        File.WriteAllText(AgentPaths.ConfigPath, JsonSerializer.Serialize(publicCfg, JsonOptions));
    }

    /// <summary>Unpair: clear secrets + identity binding. Next launch shows pairing screen.</summary>
    public void ClearPairing()
    {
        AgentPaths.EnsureDirectories();
        _secrets.Save("agent_api_key", null);
        _secrets.Save("agent_token", null);
        _secrets.Save("refresh_token", null);
        AgentStatusStore.Clear();

        var cfg = Load();
        cfg.ApiKey = "";
        cfg.Token = "";
        cfg.RefreshToken = "";
        cfg.AgentId = 0;
        cfg.OrganizationName = "";
        cfg.WarehouseId = null;
        cfg.ServerUrl = SasistCloud.ResolveApiBaseUrl();
        Save(cfg);
    }

    private void MigrateLegacyPlaintext(string json, AgentConfig cfg)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.TryGetProperty("api_key", out var ak) && ak.ValueKind == JsonValueKind.String)
            {
                var v = ak.GetString();
                if (!string.IsNullOrWhiteSpace(v) && string.IsNullOrWhiteSpace(_secrets.Load("agent_api_key")))
                    _secrets.Save("agent_api_key", v);
            }
            if (root.TryGetProperty("token", out var tok) && tok.ValueKind == JsonValueKind.String)
            {
                var v = tok.GetString();
                if (!string.IsNullOrWhiteSpace(v) && string.IsNullOrWhiteSpace(_secrets.Load("agent_token")))
                    _secrets.Save("agent_token", v);
            }
        }
        catch
        {
            // ignore migrate errors
        }
    }

    private static string BuildMachineId()
    {
        var name = Environment.MachineName;
        var user = Environment.UserName;
        return $"{name}-{Math.Abs((name + "|" + user).GetHashCode()):X8}";
    }
}
