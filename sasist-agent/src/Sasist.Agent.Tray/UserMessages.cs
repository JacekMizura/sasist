using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sasist.Agent.Core.Config;

namespace Sasist.Agent.Tray;

internal static class UserMessages
{
    public const string NetworkUnavailable = "Połączenie internetowe jest niedostępne.";
    public const string CannotReachSasist = "Nie udało się połączyć z serwerem Sasist.";
    public const string InvalidPairingCode = "Kod parowania jest nieprawidłowy.";
    public const string PairingExpired = "Kod parowania wygasł lub został unieważniony. Wygeneruj nowy w panelu Sasist.";
    public const string CannotSaveConfig = "Nie można zapisać konfiguracji. Uruchom aplikację jako administrator.";
    public const string EnterPairingCode = "Wklej kod parowania skopiowany z panelu Sasist.";
    public const string Connecting = "Łączenie z Sasist…";
    public const string Connected = "Połączono. Sasist Agent działa w tle.";
    public const string ServiceStartHint = "Połączono. Jeśli status pozostaje Offline, zrestartuj komputer lub uruchom Sasist Agent jako administrator.";
    public const string RestartFailed = "Nie udało się zrestartować usługi. Uruchom Sasist Agent jako administrator.";
    public const string DiagnosticsFailed = "Nie udało się uruchomić diagnostyki.";
    public const string UnpairConfirm = "Odłączyć to urządzenie od konta Sasist?\n\nBędziesz mógł ponownie sparować je kodem z panelu.";
    public const string UpdatesSoon = "Sprawdzanie aktualizacji będzie dostępne w kolejnej wersji.";

    public static string FromException(Exception ex)
    {
        try
        {
            File.AppendAllText(
                Path.Combine(AgentPaths.LogsDir, "tray-errors.log"),
                $"[{DateTimeOffset.Now:O}] {ex}\n\n");
        }
        catch
        {
            // ignore log failures
        }

        return ex switch
        {
            UnauthorizedAccessException => CannotSaveConfig,
            DirectoryNotFoundException => CannotSaveConfig,
            IOException when ex.Message.Contains("access", StringComparison.OrdinalIgnoreCase) => CannotSaveConfig,
            HttpRequestException => NetworkUnavailable,
            TaskCanceledException => CannotReachSasist,
            PairingException pe => pe.UserMessage,
            _ => CannotReachSasist,
        };
    }
}

internal sealed class PairingException : Exception
{
    public string UserMessage { get; }

    public PairingException(string userMessage)
        : base(userMessage)
    {
        UserMessage = userMessage;
    }
}

internal static class PairingClient
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static async Task<PairingResult> PairAsync(AgentConfig config, string pairingCode, CancellationToken ct)
    {
        config.EnsureCloudUrl();
        using var http = new HttpClient
        {
            BaseAddress = new Uri(config.ServerUrl.TrimEnd('/') + "/api/printing/"),
            Timeout = TimeSpan.FromSeconds(30),
        };

        var body = new
        {
            machine_id = config.MachineId,
            name = string.IsNullOrWhiteSpace(config.ComputerName) ? config.MachineId : config.ComputerName,
            version = AgentConfig.AgentVersion,
            printers = Array.Empty<object>(),
        };

        using var req = new HttpRequestMessage(HttpMethod.Post, "agents/register");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", pairingCode);
        req.Content = JsonContent.Create(body, options: JsonOptions);

        HttpResponseMessage res;
        try
        {
            res = await http.SendAsync(req, ct);
        }
        catch (HttpRequestException)
        {
            throw new PairingException(UserMessages.NetworkUnavailable);
        }
        catch (TaskCanceledException)
        {
            throw new PairingException(UserMessages.CannotReachSasist);
        }

        var json = await res.Content.ReadAsStringAsync(ct);
        if (res.StatusCode is System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden)
            throw new PairingException(UserMessages.InvalidPairingCode);
        if ((int)res.StatusCode == 429)
            throw new PairingException(UserMessages.PairingExpired);
        if (!res.IsSuccessStatusCode)
            throw new PairingException(UserMessages.CannotReachSasist);

        var payload = JsonSerializer.Deserialize<RegisterResponse>(json, JsonOptions);
        if (payload is null || string.IsNullOrWhiteSpace(payload.Token))
            throw new PairingException(UserMessages.CannotReachSasist);

        var org = !string.IsNullOrWhiteSpace(payload.CompanyName)
            ? payload.CompanyName!
            : payload.WarehouseName ?? "";

        return new PairingResult(payload.AgentId, payload.Token, payload.WarehouseId, org);
    }

    private sealed class RegisterResponse
    {
        public int AgentId { get; set; }
        public string Token { get; set; } = "";
        public int? WarehouseId { get; set; }
        public string? CompanyName { get; set; }
        public string? WarehouseName { get; set; }
    }
}

internal readonly record struct PairingResult(int AgentId, string Token, int? WarehouseId, string OrganizationName);
